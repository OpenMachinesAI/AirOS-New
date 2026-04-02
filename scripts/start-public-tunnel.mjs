import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const cloudflaredBinary =
  process.env.CLOUDFLARED_BIN ||
  process.env.AIRO_CLOUDFLARED_BIN ||
  '/usr/bin/cloudflared';
const tunnelTargetUrl =
  process.env.AIRO_TUNNEL_TARGET_URL ||
  process.env.AIRO_LOCAL_ORIGIN ||
  'https://127.0.0.1:3000';
const publicUrlPath = path.resolve(projectRoot, '.current-public-url');
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const gistUpdaterScript = path.resolve(projectRoot, 'scripts/update-gist-latest-url.mjs');

let lastPublishedUrl = '';

const runGistUpdater = (url) => {
  if (!fs.existsSync(gistUpdaterScript)) return;
  const updater = spawn('node', [gistUpdaterScript, url], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  updater.stdout.on('data', (chunk) => process.stdout.write(`[gist-updater] ${chunk.toString()}`));
  updater.stderr.on('data', (chunk) => process.stderr.write(`[gist-updater] ${chunk.toString()}`));
  updater.on('exit', (code) => {
    if ((code ?? 0) !== 0) {
      console.error(`[gist-updater] exited with code ${code}`);
    }
  });
};

const child = spawn(
  cloudflaredBinary,
  ['tunnel', '--url', tunnelTargetUrl, ...(tunnelTargetUrl.startsWith('https://') ? ['--no-tls-verify'] : [])],
  {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

const handleOutput = (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    const nextUrl = match[0];
    fs.writeFileSync(publicUrlPath, `${nextUrl}\n`);
    fs.writeFileSync(currentServerUrlPath, `${nextUrl}\n`);
    console.log(`Saved public URL to ${publicUrlPath}`);
    console.log(`Saved current server URL to ${currentServerUrlPath}`);
    if (nextUrl !== lastPublishedUrl) {
      lastPublishedUrl = nextUrl;
      runGistUpdater(nextUrl);
    }
  }
};

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
