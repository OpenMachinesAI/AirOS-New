import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, '.env.local');
const gistIdPath = path.resolve(projectRoot, '.current-gist-id');
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
const githubToken = env.GITHUB_TOKEN || env.GH_TOKEN || '';
const configuredGistId = env.GITHUB_GIST_ID || '';
const gistFileName = env.GITHUB_GIST_FILENAME || 'airo-latest-url.txt';

const currentUrl = String(process.argv[2] || '').trim();
if (!currentUrl) {
  console.error('Missing URL argument');
  process.exit(1);
}
if (!githubToken) {
  console.error('GITHUB_TOKEN or GH_TOKEN is missing');
  process.exit(1);
}

const existingGistId = configuredGistId || (fs.existsSync(gistIdPath) ? fs.readFileSync(gistIdPath, 'utf8').trim() : '');

const request = (url, method, body) => {
  const args = [
    '-sS',
    '-X',
    method,
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    `Authorization: Bearer ${githubToken}`,
    '-H',
    'X-GitHub-Api-Version: 2022-11-28',
    '-H',
    'Content-Type: application/json',
    url,
  ];
  if (body) {
    args.splice(args.length - 1, 0, '-d', JSON.stringify(body));
  }
  const text = execFileSync('curl', args, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(text || '{}');
  if (parsed?.message && !parsed?.id && !parsed?.html_url) {
    throw new Error(`GitHub API failed: ${parsed.message}`);
  }
  return parsed;
};

const createGist = () => {
  return request('https://api.github.com/gists', 'POST', {
      description: 'Airo current tunnel URL',
      public: false,
      files: {
        [gistFileName]: {
          content: `${currentUrl}\n`,
        },
      },
  });
};

const updateGist = (gistId) => {
  return request(`https://api.github.com/gists/${gistId}`, 'PATCH', {
      files: {
        [gistFileName]: {
          content: `${currentUrl}\n`,
        },
      },
  });
};

const toStableRawUrl = (gist) => {
  const owner = gist?.owner?.login;
  const gistId = gist?.id;
  if (!owner || !gistId) return '';
  return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${gistFileName}`;
};

const run = async () => {
  let gist = null;

  if (existingGistId) {
    try {
      gist = updateGist(existingGistId);
      console.log(`Updated existing Gist: ${gist.html_url}`);
    } catch (error) {
      console.warn(`Gist update failed, creating new one: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!gist) {
    gist = createGist();
    console.log(`Created new Gist: ${gist.html_url}`);
  }

  if (!gist?.id) {
    throw new Error('GitHub Gist response missing id');
  }

  fs.writeFileSync(gistIdPath, `${gist.id}\n`);
  const rawUrl = toStableRawUrl(gist);
  if (!rawUrl) {
    throw new Error('Could not determine stable raw Gist URL');
  }
  fs.writeFileSync(latestEndpointPath, `${rawUrl}\n`);
  console.log(`Saved Gist id to ${gistIdPath}`);
  console.log(`Saved latest endpoint to ${latestEndpointPath}`);
  console.log(`Raw endpoint: ${rawUrl}`);
};

run().catch((error) => {
  console.error(`Gist update failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
