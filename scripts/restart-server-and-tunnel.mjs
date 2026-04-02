import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const logsDir = path.resolve(projectRoot, '.runtime-logs');
const previewLogPath = path.resolve(logsDir, 'https-preview.log');
const tunnelLogPath = path.resolve(logsDir, 'public-tunnel.log');
const publicUrlPath = path.resolve(projectRoot, '.current-public-url');
const latestEndpointPath = path.resolve(projectRoot, '.current-latest-endpoint');

fs.mkdirSync(logsDir, { recursive: true });

const killMatching = (pattern) => {
  try {
    execFileSync('pkill', ['-f', pattern], { stdio: 'ignore' });
  } catch {}
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readIfExists = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
};

const startDetached = (command, args, logPath) => {
  const out = fs.openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
};

const main = async () => {
  killMatching('node scripts/https-preview.mjs');
  killMatching('node scripts/start-public-tunnel.mjs');
  killMatching('cloudflared tunnel --url https://127.0.0.1:3000 --no-tls-verify');

  await wait(1200);

  startDetached('npm', ['run', 'preview:https'], previewLogPath);
  await wait(2500);
  startDetached('node', ['scripts/start-public-tunnel.mjs'], tunnelLogPath);

  let publicUrl = '';
  for (let i = 0; i < 20; i += 1) {
    await wait(1000);
    publicUrl = readIfExists(publicUrlPath);
    if (publicUrl.startsWith('https://')) break;
  }

  const latestEndpoint = readIfExists(latestEndpointPath);

  const summary = {
    ok: publicUrl.startsWith('https://'),
    publicUrl,
    latestEndpoint,
    previewLogPath,
    tunnelLogPath,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
