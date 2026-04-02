import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, '.env.local');
const currentPublicUrlPath = path.resolve(projectRoot, '.current-public-url');
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const gistUpdaterScript = path.resolve(projectRoot, 'scripts/update-gist-latest-url.mjs');
const publicTunnelScript = path.resolve(projectRoot, 'scripts/start-public-tunnel.mjs');
const statusWindowScript = path.resolve(projectRoot, 'scripts/ops-status-window.py');
const statusWindowStatePath = path.resolve(projectRoot, '.ops-deploy-status.json');

const readEnvFile = () => {
  if (!fs.existsSync(envFile)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, '')];
      })
  );
};

const env = { ...readEnvFile(), ...process.env };

const previewServiceName = env.AIRO_PREVIEW_SYSTEMD_SERVICE || env.AIRO_SYSTEMD_SERVICE || 'airo';
const tunnelServiceName = env.AIRO_TUNNEL_SYSTEMD_SERVICE || `${previewServiceName}-tunnel`;
const restartCommand = env.AIRO_RESTART_COMMAND || '';
const autoInstall = String(env.AIRO_AUTO_INSTALL ?? '1') !== '0';
const updateGist = String(env.AIRO_UPDATE_GIST ?? '1') !== '0';
const waitForUrlMs = Number(env.AIRO_WAIT_FOR_URL_MS ?? 45000);
const pollIntervalMs = Number(env.AIRO_URL_POLL_INTERVAL_MS ?? 1000);
const serviceUser = env.AIRO_SERVICE_USER || env.USER || 'pi';
const serviceWorkdir = env.AIRO_SERVICE_WORKDIR || projectRoot;
const previewExecStart =
  env.AIRO_PREVIEW_EXEC_START ||
  env.AIRO_SERVICE_EXEC_START ||
  '/usr/bin/npm run preview -- --host 0.0.0.0 --port 3000';
const tunnelExecStart = env.AIRO_TUNNEL_EXEC_START || `/usr/bin/node ${publicTunnelScript}`;
const cloudflaredBin =
  env.CLOUDFLARED_BIN ||
  env.AIRO_CLOUDFLARED_BIN ||
  '/usr/bin/cloudflared';
const localOrigin =
  env.AIRO_TUNNEL_TARGET_URL ||
  env.AIRO_LOCAL_ORIGIN ||
  'http://127.0.0.1:3000';
const showOpsStatusWindow = String(env.AIRO_SHOW_STATUS_WINDOW ?? '1') !== '0';

const readUrl = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
};

const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });
};

const capture = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let statusWindowChild = null;

const writeStatusWindow = (step, detail = '', done = false, closeAfterMs = 0) => {
  try {
    fs.writeFileSync(
      statusWindowStatePath,
      JSON.stringify(
        {
          title: 'Airo OPS',
          step,
          detail,
          done,
          closeAfterMs,
        },
        null,
        2
      )
    );
  } catch {}
};

const startStatusWindow = () => {
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!showOpsStatusWindow || !hasDisplay || !fs.existsSync(statusWindowScript)) return;
  try {
    writeStatusWindow('Starting...', 'Opening OPS deploy window...');
    statusWindowChild = spawn('python3', [statusWindowScript, statusWindowStatePath], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    });
    statusWindowChild.unref();
  } catch {}
};

const readActiveUrl = () => readUrl(currentPublicUrlPath) || readUrl(currentServerUrlPath);

const isValidPublicUrl = (value) => /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(String(value || '').trim());

const waitForValidUrlChange = async (previousUrl) => {
  const deadline = Date.now() + waitForUrlMs;
  while (Date.now() < deadline) {
    const nextUrl = readActiveUrl();
    if (isValidPublicUrl(nextUrl) && nextUrl !== previousUrl) return nextUrl;
    await wait(pollIntervalMs);
  }
  const fallback = readActiveUrl();
  return isValidPublicUrl(fallback) ? fallback : '';
};

const serviceUnitExists = (name) => {
  try {
    const output = capture('systemctl', ['list-unit-files', '--type=service', '--no-legend', `${name}.service`]);
    return output
      .split('\n')
      .some((line) => line.trim().startsWith(`${name}.service`));
  } catch {
    return false;
  }
};

const escapeSystemdValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const writeServiceUnit = (name, unit) => {
  const tmpPath = path.join(os.tmpdir(), `${name}.service`);
  fs.writeFileSync(tmpPath, unit, 'utf8');
  run('sudo', ['cp', tmpPath, `/etc/systemd/system/${name}.service`]);
  fs.unlinkSync(tmpPath);
};

const ensureService = (name, unit) => {
  const exists = serviceUnitExists(name);
  if (!exists) {
    console.log(`Creating systemd service ${name}.service...`);
  } else {
    console.log(`Updating systemd service ${name}.service...`);
  }
  writeServiceUnit(name, unit);
  run('sudo', ['systemctl', 'daemon-reload']);
  run('sudo', ['systemctl', 'enable', name]);
};

const buildPreviewUnit = () => `[Unit]
Description=Airo OPS HTTPS Preview Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${escapeSystemdValue(serviceUser)}
WorkingDirectory=${escapeSystemdValue(serviceWorkdir)}
Environment=NODE_ENV=production
Environment=CLOUDFLARED_BIN=${escapeSystemdValue(cloudflaredBin)}
Environment=AIRO_TUNNEL_TARGET_URL=${escapeSystemdValue(localOrigin)}
ExecStart=${previewExecStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

const buildTunnelUnit = () => `[Unit]
Description=Airo OPS Cloudflare Tunnel
After=network-online.target ${previewServiceName}.service
Wants=network-online.target
Requires=${previewServiceName}.service

[Service]
Type=simple
User=${escapeSystemdValue(serviceUser)}
WorkingDirectory=${escapeSystemdValue(serviceWorkdir)}
Environment=NODE_ENV=production
Environment=CLOUDFLARED_BIN=${escapeSystemdValue(cloudflaredBin)}
Environment=AIRO_TUNNEL_TARGET_URL=${escapeSystemdValue(localOrigin)}
ExecStart=${tunnelExecStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

const getServiceState = (name) => {
  try {
    return capture('systemctl', ['is-active', `${name}.service`]);
  } catch {
    return 'unknown';
  }
};

const localServerHealthy = () => {
  try {
    execFileSync(
      'curl',
      ['-sk', '--max-time', '8', 'https://127.0.0.1:3000/'],
      { cwd: projectRoot, stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  startStatusWindow();
  const beforeUrl = readActiveUrl();
  const beforeHead = capture('git', ['rev-parse', 'HEAD']);

  writeStatusWindow('Checking Git...', `Current commit ${beforeHead.slice(0, 7)}`);
  console.log(`Current commit: ${beforeHead}`);
  console.log('Fetching latest git changes...');
  run('git', ['fetch', '--all', '--prune']);
  run('git', ['pull', '--ff-only']);

  const afterHead = capture('git', ['rev-parse', 'HEAD']);
  writeStatusWindow('Git Updated', beforeHead !== afterHead ? `Updated to ${afterHead.slice(0, 7)}` : 'Already up to date.');
  console.log(beforeHead !== afterHead ? `Updated to commit: ${afterHead}` : 'Already up to date.');

  if (autoInstall && fs.existsSync(path.resolve(projectRoot, 'package.json'))) {
    writeStatusWindow('Installing AirOS Update...', 'Installing dependencies on OPS...');
    console.log('Installing dependencies...');
    if (fs.existsSync(path.resolve(projectRoot, 'package-lock.json'))) {
      run('npm', ['ci']);
    } else {
      run('npm', ['install']);
    }
  }

  if (fs.existsSync(path.resolve(projectRoot, 'package.json'))) {
    writeStatusWindow('Building AirOS...', 'Creating the production web bundle for OPS...');
    console.log('Building AirOS...');
    run('npm', ['run', 'build']);
  }

  if (restartCommand) {
    writeStatusWindow('Restarting OPS...', 'Running custom OPS restart command...');
    console.log(`Restarting with custom command: ${restartCommand}`);
    run('sh', ['-lc', restartCommand]);
  } else {
    writeStatusWindow('Configuring OPS Services...', 'Ensuring preview and tunnel services exist...');
    ensureService(previewServiceName, buildPreviewUnit());
    ensureService(tunnelServiceName, buildTunnelUnit());

    writeStatusWindow('Restarting AirOS Server...', `Restarting ${previewServiceName}.service...`);
    console.log(`Restarting OPS preview service: ${previewServiceName}`);
    run('sudo', ['systemctl', 'restart', previewServiceName]);
    writeStatusWindow('Running Cloudflare Tunnel...', `Restarting ${tunnelServiceName}.service...`);
    console.log(`Restarting OPS tunnel service: ${tunnelServiceName}`);
    run('sudo', ['systemctl', 'restart', tunnelServiceName]);
  }

  writeStatusWindow('Waiting For Public URL...', 'Watching for a fresh trycloudflare address...');
  const afterUrl = await waitForValidUrlChange(beforeUrl);
  if (updateGist && afterUrl && afterUrl !== beforeUrl && fs.existsSync(gistUpdaterScript)) {
    writeStatusWindow('Updating Gist...', afterUrl);
    console.log(`Cloudflare URL changed, updating Gist: ${afterUrl}`);
    run('node', [gistUpdaterScript, afterUrl]);
  } else if (afterUrl && afterUrl === beforeUrl) {
    console.log('Cloudflare URL unchanged, skipping Gist update.');
  } else {
    console.log('No valid Cloudflare URL found after restart.');
  }

  writeStatusWindow('Verifying AirOS...', 'Checking server health and service status...');
  const previewState = getServiceState(previewServiceName);
  const tunnelState = getServiceState(tunnelServiceName);
  const serverHealthy = localServerHealthy();
  const summaryLines = [
    `AirOS service: ${previewState}`,
    `Tunnel service: ${tunnelState}`,
    `Local server: ${serverHealthy ? 'healthy' : 'unreachable'}`,
    `Public URL: ${afterUrl || readActiveUrl() || 'not available'}`,
  ];

  if (previewState === 'active' && tunnelState === 'active' && serverHealthy) {
    writeStatusWindow('AirOS Running', summaryLines.join('\n'), true, 8000);
  } else {
    writeStatusWindow('OPS Deploy Finished With Issues', summaryLines.join('\n'), true, 12000);
  }
  console.log('OPS deploy cycle complete.');
};

main().catch((error) => {
  writeStatusWindow('OPS Deploy Failed', error instanceof Error ? error.message : String(error), true, 15000);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
