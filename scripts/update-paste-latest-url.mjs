import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, '.env.local');
const pasteKeyPath = path.resolve(projectRoot, '.current-paste-key');
const latestEndpointPath = path.resolve(projectRoot, '.current-latest-endpoint');

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
const apiDevKey = env.PASTEBIN_API_KEY || '';
const apiUserKey = env.PASTEBIN_USER_KEY || '';

const currentUrl = String(process.argv[2] || '').trim();
if (!currentUrl) {
  console.error('Missing URL argument');
  process.exit(1);
}
if (!apiDevKey) {
  console.error('PASTEBIN_API_KEY is missing');
  process.exit(1);
}

const existingPasteKey = fs.existsSync(pasteKeyPath) ? fs.readFileSync(pasteKeyPath, 'utf8').trim() : '';

const postPastebin = (params) => {
  const args = ['-sS', 'https://pastebin.com/api/api_post.php'];
  for (const [key, value] of Object.entries(params)) {
    args.push('-d', `${key}=${encodeURIComponent(String(value))}`);
  }
  const text = execFileSync('curl', args, { encoding: 'utf8' }).trim();
  if (/^Bad API request/i.test(text)) {
    throw new Error(text);
  }
  return text;
};

const createPaste = () => {
  return postPastebin({
    api_option: 'paste',
    api_dev_key: apiDevKey,
    ...(apiUserKey ? { api_user_key: apiUserKey } : {}),
    api_paste_code: currentUrl,
    api_paste_name: 'Airo Current Tunnel URL',
    api_paste_private: '1',
    api_paste_expire_date: 'N',
    api_paste_format: 'text',
  });
};

const editPaste = (pasteKey) => {
  return postPastebin({
    api_option: 'edit',
    api_dev_key: apiDevKey,
    ...(apiUserKey ? { api_user_key: apiUserKey } : {}),
    api_paste_key: pasteKey,
    api_paste_code: currentUrl,
    api_paste_name: 'Airo Current Tunnel URL',
    api_paste_private: '1',
    api_paste_expire_date: 'N',
    api_paste_format: 'text',
  });
};

const toRawUrl = (pasteUrl) => {
  const match = pasteUrl.match(/pastebin\.com\/([A-Za-z0-9]+)/i);
  if (!match?.[1]) return '';
  return `https://pastebin.com/raw/${match[1]}`;
};

const run = () => {
  let pasteUrl = '';

  if (existingPasteKey) {
    try {
      pasteUrl = editPaste(existingPasteKey);
      console.log(`Updated existing Pastebin: ${pasteUrl}`);
    } catch (error) {
      console.warn(`Edit failed, creating new paste: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!pasteUrl) {
    pasteUrl = createPaste();
    console.log(`Created new Pastebin: ${pasteUrl}`);
  }

  const keyMatch = pasteUrl.match(/pastebin\.com\/([A-Za-z0-9]+)/i);
  if (keyMatch?.[1]) {
    fs.writeFileSync(pasteKeyPath, `${keyMatch[1]}\n`);
  }
  const rawUrl = toRawUrl(pasteUrl);
  if (rawUrl) {
    fs.writeFileSync(latestEndpointPath, `${rawUrl}\n`);
    console.log(`Saved latest endpoint to ${latestEndpointPath}`);
    console.log(`Raw endpoint: ${rawUrl}`);
  } else {
    throw new Error(`Could not parse paste URL: ${pasteUrl}`);
  }
};

try {
  run();
} catch (error) {
  console.error(`Pastebin update failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
