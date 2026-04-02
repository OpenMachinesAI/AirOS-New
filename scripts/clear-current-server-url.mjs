import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const currentServerUrlPath = path.resolve(projectRoot, '.current-server-url');

if (fs.existsSync(currentServerUrlPath)) {
  fs.unlinkSync(currentServerUrlPath);
  console.log(`Cleared current server URL at ${currentServerUrlPath}`);
} else {
  console.log('No current server URL was set.');
}
