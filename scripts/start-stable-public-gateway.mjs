import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';

const projectRoot = process.cwd();
const currentPublicUrlPath = path.resolve(projectRoot, '.current-public-url');
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const stableUrlPath = path.resolve(projectRoot, '.current-stable-url');
const gatewayPort = Number(process.env.STABLE_GATEWAY_PORT || 8787);
const stablePublicUrl = String(process.env.AIRO_STABLE_PUBLIC_URL || '').trim();
const cloudflareToken = String(process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
const reconnectMs = Number(process.env.AIRO_STABLE_RECONNECT_MS || 3000);

const readCurrentTarget = () => {
  const fromPublic = fs.existsSync(currentPublicUrlPath)
    ? fs.readFileSync(currentPublicUrlPath, 'utf8').trim()
    : '';
  const fromServer = fs.existsSync(currentServerUrlPath)
    ? fs.readFileSync(currentServerUrlPath, 'utf8').trim()
    : '';
  const value = fromPublic || fromServer;
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.toString();
  } catch {
    return '';
  }
};

const server = http.createServer((req, res) => {
  const target = readCurrentTarget();
  if (req?.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, target }));
    return;
  }
  if (req?.url === '/latest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ url: target, latestUrl: target, updatedAt: new Date().toISOString() }));
    return;
  }
  if (!target) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('No active tunnel URL found in .current-public-url or .current-server-url');
    return;
  }
  res.writeHead(302, {
    Location: target,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end();
});

server.listen(gatewayPort, '127.0.0.1', () => {
  console.log(`Stable gateway local server running on http://127.0.0.1:${gatewayPort}`);
  console.log('It redirects to the latest URL from .current-public-url');
  if (!cloudflareToken) {
    console.log('CLOUDFLARE_TUNNEL_TOKEN is not set; cloudflared will use a temporary trycloudflare URL.');
  }
  if (stablePublicUrl) {
    fs.writeFileSync(stableUrlPath, `${stablePublicUrl}\n`);
    console.log(`Configured stable public URL: ${stablePublicUrl}`);
    console.log(`Saved stable public URL to ${stableUrlPath}`);
  }
});

let stopping = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startCloudflareTunnel = () => {
  const args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${gatewayPort}`];
  if (cloudflareToken) {
    args.push('--token', cloudflareToken);
  }
  return spawn('/Users/alexrose/.homebrew/opt/cloudflared/bin/cloudflared', args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
};

const parseTunnelUrl = (text) => {
  const quick = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
  if (quick) return quick;
  return '';
};

const connectTunnelLoop = async () => {
  while (!stopping) {
    let proc = null;
    try {
      proc = startCloudflareTunnel();
      let savedUrl = false;
      await new Promise((resolve) => {
        const onOutput = (chunk) => {
          const text = chunk.toString();
          process.stdout.write(text);
          const url = parseTunnelUrl(text);
          if (url && !savedUrl) {
            fs.writeFileSync(stableUrlPath, `${url}\n`);
            console.log(`Stable public URL: ${url}`);
            console.log(`Saved stable public URL to ${stableUrlPath}`);
            savedUrl = true;
          }
        };
        proc.stdout.on('data', onOutput);
        proc.stderr.on('data', onOutput);
        proc.on('exit', resolve);
      });
      if (!stopping) {
        console.log(`cloudflared closed; reconnecting in ${reconnectMs}ms...`);
        await sleep(reconnectMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`cloudflared start failed: ${message}`);
      if (!stopping) {
        await sleep(reconnectMs);
      }
    } finally {
      try {
        proc?.kill('SIGTERM');
      } catch {}
    }
  }
};

process.on('SIGINT', async () => {
  stopping = true;
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopping = true;
  server.close();
  process.exit(0);
});

connectTunnelLoop().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Stable gateway failed: ${message}`);
  server.close();
  process.exit(1);
});
