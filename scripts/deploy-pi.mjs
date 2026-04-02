import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, '.env.local');
const currentPublicUrlPath = path.resolve(projectRoot, '.current-public-url');
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const gistUpdaterScript = path.resolve(projectRoot, 'scripts/update-gist-latest-url.mjs');

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
const serviceName = env.AIRO_SYSTEMD_SERVICE || 'airo';
const restartCommand = env.AIRO_RESTART_COMMAND || '';
const autoInstall = String(env.AIRO_AUTO_INSTALL ?? '1') !== '0';
const updateGist = String(env.AIRO_UPDATE_GIST ?? '1') !== '0';
const waitForUrlMs = Number(env.AIRO_WAIT_FOR_URL_MS ?? 30000);
const pollIntervalMs = Number(env.AIRO_URL_POLL_INTERVAL_MS ?? 1000);
const serviceUser = env.AIRO_SERVICE_USER || env.USER || 'pi';
const serviceWorkdir = env.AIRO_SERVICE_WORKDIR || projectRoot;
const serviceExecStart = env.AIRO_SERVICE_EXEC_START || '/usr/bin/npm run dev -- --host 0.0.0.0';

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readActiveUrl = () => readUrl(currentPublicUrlPath) || readUrl(currentServerUrlPath);

const waitForUrlChange = async (previousUrl) => {
  const deadline = Date.now() + waitForUrlMs;
  while (Date.now() < deadline) {
    const nextUrl = readActiveUrl();
    if (nextUrl && nextUrl !== previousUrl) return nextUrl;
    await wait(pollIntervalMs);
  }
  return readActiveUrl();
};

const serviceExists = () => {
  try {
    execFileSync('systemctl', ['status', `${serviceName}.service`], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

const ensureService = () => {
  if (serviceExists()) {
    console.log(`systemd service ${serviceName}.service already exists.`);
    return;
  }

  const unit = `[Unit]
Description=Airo Server
After=network.target

[Service]
Type=simple
User=${serviceUser}
WorkingDirectory=${serviceWorkdir}
Environment=NODE_ENV=production
ExecStart=${serviceExecStart}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

  console.log(`Creating systemd service ${serviceName}.service...`);
  execFileSync('sh', ['-lc', `printf '%s' "${unit.replace(/"/g, '\\"')}" | sudo tee /etc/systemd/system/${serviceName}.service >/dev/null`], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  run('sudo', ['systemctl', 'daemon-reload']);
  run('sudo', ['systemctl', 'enable', serviceName]);
  run('sudo', ['systemctl', 'start', serviceName]);
  console.log(`Created and started ${serviceName}.service`);
};

const main = async () => {
  const beforeUrl = readActiveUrl();
  const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();

  console.log(`Current commit: ${beforeHead}`);
  console.log('Fetching latest git changes...');
  run('git', ['fetch', '--all', '--prune']);
  run('git', ['pull', '--ff-only']);

  const afterHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  const changed = beforeHead !== afterHead;
  console.log(changed ? `Updated to commit: ${afterHead}` : 'Already up to date.');

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
    ensureService();
    console.log(`Restarting systemd service: ${serviceName}`);
    run('sudo', ['systemctl', 'restart', serviceName]);
  }

  const afterUrl = await waitForUrlChange(beforeUrl);
  if (updateGist && afterUrl && afterUrl !== beforeUrl && fs.existsSync(gistUpdaterScript)) {
    console.log(`Cloudflare URL changed, updating Gist: ${afterUrl}`);
    run('node', [gistUpdaterScript, afterUrl]);
  } else if (afterUrl && afterUrl === beforeUrl) {
    console.log('Cloudflare URL unchanged, skipping Gist update.');
  } else {
    console.log('No Cloudflare URL found after restart.');
  }

  console.log('Deploy cycle complete.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
