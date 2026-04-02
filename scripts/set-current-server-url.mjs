import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');
const input = process.argv[2]?.trim();

if (!input) {
  console.error('Usage: node scripts/set-current-server-url.mjs <https-url>');
  process.exit(1);
}

try {
  const target = new URL(input);
  if (target.protocol !== 'https:') {
    throw new Error('Current server URL must use https.');
  }
  fs.writeFileSync(currentServerUrlPath, `${target.toString()}\n`);
  console.log(`Saved current server URL to ${currentServerUrlPath}`);
} catch (error) {
  console.error(`Invalid URL: ${input}`);
  process.exit(1);
}
