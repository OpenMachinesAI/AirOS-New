import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, '.env.local');
const currentPublicUrlPath = path.resolve(projectRoot, '.current-public-url');
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const gistUpdaterScript = path.resolve(projectRoot, 'scripts/update-gist-latest-url.mjs');
const publicTunnelScript = path.resolve(projectRoot, 'scripts/start-public-tunnel.mjs');

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
const previewExecStart = env.AIRO_PREVIEW_EXEC_START || env.AIRO_SERVICE_EXEC_START || '/usr/bin/npm run preview:https';
const tunnelExecStart = env.AIRO_TUNNEL_EXEC_START || `/usr/bin/node ${publicTunnelScript}`;
const cloudflaredBin =
  env.CLOUDFLARED_BIN ||
  env.AIRO_CLOUDFLARED_BIN ||
  '/usr/bin/cloudflared';

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
ExecStart=${tunnelExecStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

const main = async () => {
  const beforeUrl = readActiveUrl();
  const beforeHead = capture('git', ['rev-parse', 'HEAD']);

  console.log(`Current commit: ${beforeHead}`);
  console.log('Fetching latest git changes...');
  run('git', ['fetch', '--all', '--prune']);
  run('git', ['pull', '--ff-only']);

  const afterHead = capture('git', ['rev-parse', 'HEAD']);
  console.log(beforeHead !== afterHead ? `Updated to commit: ${afterHead}` : 'Already up to date.');

  if (autoInstall && fs.existsSync(path.resolve(projectRoot, 'package.json'))) {
    console.log('Installing dependencies...');
    if (fs.existsSync(path.resolve(projectRoot, 'package-lock.json'))) {
      run('npm', ['ci']);
    } else {
      run('npm', ['install']);
    }
  }

  if (restartCommand) {
    console.log(`Restarting with custom command: ${restartCommand}`);
    run('sh', ['-lc', restartCommand]);
  } else {
    ensureService(previewServiceName, buildPreviewUnit());
    ensureService(tunnelServiceName, buildTunnelUnit());

    console.log(`Restarting OPS preview service: ${previewServiceName}`);
    run('sudo', ['systemctl', 'restart', previewServiceName]);
    console.log(`Restarting OPS tunnel service: ${tunnelServiceName}`);
    run('sudo', ['systemctl', 'restart', tunnelServiceName]);
  }

  const afterUrl = await waitForValidUrlChange(beforeUrl);
  if (updateGist && afterUrl && afterUrl !== beforeUrl && fs.existsSync(gistUpdaterScript)) {
    console.log(`Cloudflare URL changed, updating Gist: ${afterUrl}`);
    run('node', [gistUpdaterScript, afterUrl]);
  } else if (afterUrl && afterUrl === beforeUrl) {
    console.log('Cloudflare URL unchanged, skipping Gist update.');
  } else {
    console.log('No valid Cloudflare URL found after restart.');
  }

  console.log('OPS deploy cycle complete.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
