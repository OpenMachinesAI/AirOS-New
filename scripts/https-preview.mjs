import fs from 'fs';
import https from 'https';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const root = path.resolve(process.cwd(), 'dist');
const envPath = path.resolve(process.cwd(), '.env.local');
const certPath = path.resolve(process.cwd(), 'certs/dev-cert.pem');
const keyPath = path.resolve(process.cwd(), 'certs/dev-key.pem');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const publicUrlPath = path.resolve(process.cwd(), '.current-public-url');
const currentServerUrlPath = path.resolve(process.cwd(), '.current-server-url');
const skillStorePath = path.resolve(process.cwd(), 'data/skill-store.json');
const connectedUnits = new Map();
const pendingCommands = new Map();
const unitLogs = new Map();
const invidiousInstances = [
  'https://yewtu.be',
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
];

const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx), line.slice(idx + 1)];
        })
    )
  : {};

if (!fs.existsSync(root)) {
  console.error('dist folder is missing. Run npm run build first.');
  process.exit(1);
}

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('HTTPS certificate files are missing in certs/.');
  process.exit(1);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const normalizeMusicResult = (item, instance) => {
  const videoId = String(item?.videoId || '').trim();
  if (!videoId) return null;
  const thumbnails = Array.isArray(item?.videoThumbnails) ? item.videoThumbnails : [];
  const bestThumb =
    thumbnails.find((thumb) => String(thumb?.quality || '').toLowerCase().includes('max')) ||
    thumbnails.find((thumb) => Number(thumb?.width || 0) >= 320) ||
    thumbnails[0] ||
    null;
  const rawThumb = String(bestThumb?.url || '').trim();
  const thumbnailUrl = rawThumb
    ? rawThumb.startsWith('//')
      ? `https:${rawThumb}`
      : rawThumb.startsWith('/')
        ? `${instance}${rawThumb}`
        : rawThumb
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const lengthSeconds = Math.max(0, Number(item?.lengthSeconds || 0));
  const minutes = Math.floor(lengthSeconds / 60);
  const seconds = lengthSeconds % 60;
  return {
    videoId,
    title: String(item?.title || 'Unknown track'),
    artist: String(item?.author || ''),
    author: String(item?.author || ''),
    lengthSeconds,
    lengthLabel: lengthSeconds ? `${minutes}:${String(seconds).padStart(2, '0')}` : '',
    thumbnailUrl,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
  };
};

const cleanMusicQuery = (value) =>
  String(value || '')
    .replace(/^(?:hey\s+airo[:,]?\s*)?/i, '')
    .replace(/\b(?:please|can you|could you|would you)\b/gi, ' ')
    .replace(/\b(?:play|put on|start|listen to|queue up|load up|music|song|video)\b/gi, ' ')
    .replace(/\b(?:for me|on airo|on the screen)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const server = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  },
  (req, res) => {
    const requestHost = (req.headers.host || '').toLowerCase();
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const search = new URL(req.url || '/', `https://${requestHost || 'localhost'}`).searchParams;

    const pruneUnits = () => {
      const now = Date.now();
      for (const [clientId, unit] of connectedUnits.entries()) {
        if (!unit?.updatedAt || now - unit.updatedAt > 15000) {
          connectedUnits.delete(clientId);
          pendingCommands.delete(clientId);
          unitLogs.delete(clientId);
        }
      }
    };

    if (req.method === 'POST' && urlPath === '/xai/session') {
      const apiKey = env.XAI_API_KEY || process.env.XAI_API_KEY;
      if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'XAI_API_KEY missing on server' }));
        return;
      }

      const curl = spawn('curl', [
        '-sS',
        'https://api.x.ai/v1/realtime/client_secrets',
        '-X',
        'POST',
        '-H',
        'Content-Type: application/json',
        '-H',
        `Authorization: Bearer ${apiKey}`,
        '-d',
        JSON.stringify({ expires_after: { seconds: 300 } }),
      ]);

      let stdout = '';
      let stderr = '';
      curl.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      curl.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      curl.on('close', (code) => {
        if (code === 0) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(stdout);
          return;
        }
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: stderr || stdout || `curl exited ${code}` }));
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/xai/tts') {
      const apiKey = env.XAI_API_KEY || process.env.XAI_API_KEY;
      if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'XAI_API_KEY missing on server' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const curl = spawn('curl', [
          '-sS',
          'https://api.x.ai/v1/tts',
          '-X',
          'POST',
          '-H',
          'Content-Type: application/json',
          '-H',
          `Authorization: Bearer ${apiKey}`,
          '-d',
          body || JSON.stringify({ text: '', voice_id: 'rex', language: 'en' }),
        ]);

        const chunks = [];
        let stderr = '';
        curl.stdout.on('data', (chunk) => chunks.push(chunk));
        curl.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        curl.on('close', (code) => {
          if (code === 0) {
            res.writeHead(200, {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'no-store',
            });
            res.end(Buffer.concat(chunks));
            return;
          }
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: stderr || `curl exited ${code}` }));
        });
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/flowery/tts') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const params = new URLSearchParams();
          params.set('text', String(payload?.text || '').slice(0, 2048));
          params.set('voice', String(payload?.voice || '4ba7bd1b-cb5f-5c3f-9e1c-9ee8be2b0bdd'));
          params.set('audio_format', String(payload?.audio_format || 'mp3'));
          params.set('speed', String(payload?.speed || '0.95'));
          params.set('silence', String(payload?.silence || '0'));
          if (payload?.translate === true) {
            params.set('translate', 'true');
          }

          const curl = spawn('curl', [
            '-sS',
            '-L',
            '-G',
            'https://api.flowery.pw/v1/tts',
            '-H',
            'User-Agent: Airo/0.0.44 (alexrose local dev)',
            '--data-urlencode',
            `text=${params.get('text') || ''}`,
            '--data-urlencode',
            `voice=${params.get('voice') || ''}`,
            '--data-urlencode',
            `audio_format=${params.get('audio_format') || 'mp3'}`,
            '--data-urlencode',
            `speed=${params.get('speed') || '0.95'}`,
            '--data-urlencode',
            `silence=${params.get('silence') || '0'}`,
            ...(params.get('translate') ? ['--data-urlencode', 'translate=true'] : []),
          ]);

          const chunks = [];
          let stderr = '';
          curl.stdout.on('data', (chunk) => chunks.push(chunk));
          curl.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });
          curl.on('close', (code) => {
            if (code === 0) {
              res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-store',
              });
              res.end(Buffer.concat(chunks));
              return;
            }
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: stderr || `curl exited ${code}` }));
          });
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/tools/search-web') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const query = cleanMusicQuery(payload?.query) || String(payload?.query || '').trim();
          if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'query is required' }));
            return;
          }
          const target = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          const curl = spawn('curl', ['-sS', target]);
          let stdout = '';
          let stderr = '';
          curl.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
          });
          curl.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });
          curl.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: stderr || `curl exited ${code}` }));
              return;
            }
            try {
              const data = JSON.parse(stdout || '{}');
              const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
              const topResults = related
                .flatMap((item) => (Array.isArray(item?.Topics) ? item.Topics : [item]))
                .slice(0, 8)
                .map((item) => ({
                  text: item?.Text || '',
                  url: item?.FirstURL || '',
                }))
                .filter((item) => item.text || item.url);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({
                query,
                heading: data?.Heading || '',
                abstract: data?.AbstractText || '',
                abstractSource: data?.AbstractSource || '',
                topResults,
              }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/tools/music-search') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const query = String(payload?.query || '').trim();
          if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'query is required' }));
            return;
          }

          let lastError = 'music search failed';
          for (const instance of invidiousInstances) {
            try {
              const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance&region=CA`;
              const stdout = await new Promise((resolve, reject) => {
                const curl = spawn('curl', [
                  '-sS',
                  '-L',
                  '--connect-timeout',
                  '8',
                  '--max-time',
                  '14',
                  '-H',
                  'accept: application/json',
                  '-H',
                  'user-agent: Airo/0.0.44 (alexrose local dev music search)',
                  url,
                ]);
                let output = '';
                let stderr = '';
                curl.stdout.on('data', (chunk) => {
                  output += chunk.toString();
                });
                curl.stderr.on('data', (chunk) => {
                  stderr += chunk.toString();
                });
                curl.on('close', (code) => {
                  if (code === 0) {
                    resolve(output);
                    return;
                  }
                  reject(new Error(stderr || `curl exited ${code}`));
                });
              });
              const parsed = JSON.parse(String(stdout || '[]'));
              const items = (Array.isArray(parsed) ? parsed : [])
                .filter((item) => String(item?.type || 'video') === 'video')
                .map((item) => normalizeMusicResult(item, instance))
                .filter(Boolean)
                .filter((item) => {
                  const title = String(item?.title || '').toLowerCase();
                  return !/\b(lesson|tutorial|karaoke|8d audio|slowed|reverb|nightcore)\b/.test(title);
                })
                .slice(0, 6);
              if (!items.length) {
                lastError = `no music results on ${instance}`;
                continue;
              }
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ query, items, instance }));
              return;
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
            }
          }

          try {
            const searchHtml = await new Promise((resolve, reject) => {
              const curl = spawn('curl', [
                '-sS',
                '-L',
                '--connect-timeout',
                '8',
                '--max-time',
                '14',
                'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
              ]);
              let output = '';
              let stderr = '';
              curl.stdout.on('data', (chunk) => {
                output += chunk.toString();
              });
              curl.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
              });
              curl.on('close', (code) => {
                if (code === 0) {
                  resolve(output);
                  return;
                }
                reject(new Error(stderr || `curl exited ${code}`));
              });
            });
            const html = String(searchHtml || '');
            const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
            const uniqueVideoIds = [...new Set(matches.map((match) => String(match?.[1] || '').trim()).filter(Boolean))].slice(0, 5);
            const items = [];
            for (const videoId of uniqueVideoIds) {
              try {
                const oembedRaw = await new Promise((resolve, reject) => {
                  const curl = spawn('curl', [
                    '-sS',
                    '-L',
                    '--connect-timeout',
                    '8',
                    '--max-time',
                    '14',
                    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
                  ]);
                  let output = '';
                  let stderr = '';
                  curl.stdout.on('data', (chunk) => {
                    output += chunk.toString();
                  });
                  curl.stderr.on('data', (chunk) => {
                    stderr += chunk.toString();
                  });
                  curl.on('close', (code) => {
                    if (code === 0) {
                      resolve(output);
                      return;
                    }
                    reject(new Error(stderr || `curl exited ${code}`));
                  });
                });
                const oembed = JSON.parse(String(oembedRaw || '{}'));
                const candidate = {
                  videoId,
                  title: String(oembed?.title || query),
                  artist: String(oembed?.author_name || ''),
                  author: String(oembed?.author_name || ''),
                  lengthSeconds: 0,
                  lengthLabel: '',
                  thumbnailUrl: String(oembed?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
                  watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
                  embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
                };
                const lowered = `${candidate.title} ${candidate.artist}`.toLowerCase();
                if (/\b(lesson|tutorial|karaoke|8d audio|slowed|reverb|nightcore)\b/.test(lowered)) {
                  continue;
                }
                items.push(candidate);
              } catch {}
            }
            if (items.length) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ query, items, instance: 'youtube-html-fallback' }));
              return;
            }
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ query, items: [], error: lastError }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/tools/get-news') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const topic = String(payload?.topic || 'top stories').trim();
          const query = topic === 'top stories' ? 'news' : topic;
          const gdeltUrl =
            `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=10&sort=HybridRel`;
          fetch(gdeltUrl, { headers: { 'accept': 'application/json' } })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error(`GDELT request failed (${response.status})`);
              }
              return response.json();
            })
            .then((parsed) => {
              const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];
              const decode = (value) =>
                String(value || '')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'");
              const items = articles.slice(0, 10).map((article) => ({
                title: decode(article?.title || article?.seendate || 'Untitled'),
                link: String(article?.url || ''),
                pubDate: String(article?.seendate || article?.datetime || ''),
                source: decode(article?.sourceCountry || article?.domain || 'GDELT'),
                summary: decode(article?.summary || article?.snippet || article?.title || ''),
              }));
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ topic, items }));
            })
            .catch((error) => {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            });
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/tools/get-sports') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const leagueRaw = String(payload?.league || 'nba').trim().toLowerCase();
          const query = String(payload?.query || '').trim();
          const dateHint = String(payload?.dateHint || 'latest').trim().toLowerCase();
          const requestedTeams = Array.isArray(payload?.teams)
            ? payload.teams.map((team) => String(team || '').trim().toLowerCase()).filter(Boolean)
            : [];
          const leagueMap = {
            nba: { sport: 'basketball', league: 'nba' },
            wnba: { sport: 'basketball', league: 'wnba' },
            nfl: { sport: 'football', league: 'nfl' },
            nhl: { sport: 'hockey', league: 'nhl' },
            mlb: { sport: 'baseball', league: 'mlb' },
            epl: { sport: 'soccer', league: 'eng.1' },
          };
          const mapped = leagueMap[leagueRaw] || leagueMap.nba;
          const baseDate = new Date();
          if (dateHint === 'yesterday') {
            baseDate.setDate(baseDate.getDate() - 1);
          }
          const dateToken = `${baseDate.getFullYear()}${String(baseDate.getMonth() + 1).padStart(2, '0')}${String(baseDate.getDate()).padStart(2, '0')}`;
          const scoreboardUrl =
            dateHint === 'latest'
              ? `https://site.api.espn.com/apis/site/v2/sports/${mapped.sport}/${mapped.league}/scoreboard`
              : `https://site.api.espn.com/apis/site/v2/sports/${mapped.sport}/${mapped.league}/scoreboard?dates=${dateToken}`;
          const curl = spawn('curl', ['-sS', scoreboardUrl]);
          let stdout = '';
          let stderr = '';
          curl.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
          });
          curl.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });
          curl.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: stderr || `curl exited ${code}` }));
              return;
            }
            try {
              const data = JSON.parse(stdout || '{}');
              const events = Array.isArray(data?.events) ? data.events : [];
              const mappedItems = events.slice(0, 20).map((event) => {
                const comp = Array.isArray(event?.competitions) ? event.competitions[0] : null;
                const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
                const home = competitors.find((team) => team?.homeAway === 'home') || competitors[1] || {};
                const away = competitors.find((team) => team?.homeAway === 'away') || competitors[0] || {};
                return {
                  id: String(event?.id || ''),
                  away: String(away?.team?.displayName || away?.team?.shortDisplayName || 'Away'),
                  home: String(home?.team?.displayName || home?.team?.shortDisplayName || 'Home'),
                  score: `${String(away?.score ?? '-')} - ${String(home?.score ?? '-')}`,
                  awayScore: Number(away?.score ?? NaN),
                  homeScore: Number(home?.score ?? NaN),
                  status: String(comp?.status?.type?.shortDetail || comp?.status?.type?.description || 'Scheduled'),
                };
              });
              const items = requestedTeams.length
                ? mappedItems.filter((item) => {
                    const haystack = `${item.away} ${item.home}`.toLowerCase();
                    return requestedTeams.every((team) => haystack.includes(team));
                  })
                : mappedItems;
              const titleParts = [];
              if (dateHint === 'yesterday') titleParts.push('Last Night');
              if (query) titleParts.push(query);
              const title = titleParts.length ? titleParts.join(' ') : `${leagueRaw.toUpperCase()} Scores`;
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ league: leagueRaw, items, title }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/backend/api/web-request') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const targetUrl = String(payload?.url || '').trim();
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'url is required' }));
            return;
          }

          let parsedUrl;
          try {
            parsedUrl = new URL(targetUrl);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'invalid url' }));
            return;
          }

          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'only http/https urls are allowed' }));
            return;
          }

          const method = String(payload?.method || 'GET').toUpperCase();
          const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
          if (!allowedMethods.has(method)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: `unsupported method ${method}` }));
            return;
          }

          const timeoutMs = Math.min(30000, Math.max(1000, Number(payload?.timeoutMs) || 12000));
          const responseType = String(payload?.responseType || 'json').toLowerCase();
          const rawHeaders =
            payload?.headers && typeof payload.headers === 'object' && !Array.isArray(payload.headers)
              ? payload.headers
              : {};
          const headers = {};
          for (const [key, value] of Object.entries(rawHeaders)) {
            if (!key) continue;
            const lower = String(key).toLowerCase();
            if (['host', 'content-length'].includes(lower)) continue;
            headers[String(key)] = String(value ?? '');
          }

          const requestBody =
            method === 'GET' || method === 'HEAD'
              ? undefined
              : (typeof payload?.body === 'string' ? payload.body : payload?.body != null ? JSON.stringify(payload.body) : undefined);

          const markerStatus = '__AIRO_STATUS__';
          const markerFinalUrl = '__AIRO_FINAL_URL__';
          const curlArgs = [
            '-sS',
            '-L',
            '--max-time',
            String(Math.max(1, Math.round(timeoutMs / 1000))),
            '-X',
            method,
            ...Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]),
            ...(requestBody != null ? ['--data', requestBody] : []),
            '-w',
            `\n${markerStatus}:%{http_code}\n${markerFinalUrl}:%{url_effective}\n`,
            parsedUrl.toString(),
          ];

          const curl = spawn('curl', curlArgs);
          let stdout = '';
          let stderr = '';
          curl.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
          });
          curl.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
          });

          curl.on('close', (code) => {
            if (code !== 0) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false, error: stderr || `curl exited ${code}` }));
              return;
            }

            const statusMatch = stdout.match(new RegExp(`${markerStatus}:(\\d{3})`));
            const finalUrlMatch = stdout.match(new RegExp(`${markerFinalUrl}:(.+)`));
            const status = statusMatch ? Number(statusMatch[1]) : 0;
            const finalUrl = (finalUrlMatch ? finalUrlMatch[1] : parsedUrl.toString()).trim();
            const bodyText = stdout
              .replace(new RegExp(`\\n${markerStatus}:\\d{3}\\n${markerFinalUrl}:.+\\n?$`), '')
              .slice(0, 120000);

            let data = bodyText;
            if (responseType === 'json') {
              try {
                data = JSON.parse(bodyText || '{}');
              } catch {
                data = bodyText;
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(
              JSON.stringify({
                ok: true,
                status,
                statusText: status >= 200 && status < 400 ? 'ok' : 'error',
                finalUrl,
                headers: {},
                data,
              })
            );
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/skill-store.json') {
      if (!fs.existsSync(skillStorePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ skills: [] }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(skillStorePath).pipe(res);
      return;
    }

    if (req.method === 'POST' && urlPath === '/skill-store/update') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const pkg = JSON.parse(body || '{}');
          const existing = fs.existsSync(skillStorePath)
            ? JSON.parse(fs.readFileSync(skillStorePath, 'utf8'))
            : { skills: [] };
          const nextSkill = {
            id: pkg?.skill?.id || `skill-${randomUUID()}`,
            name: pkg?.skill?.name || 'Untitled Skill',
            description: pkg?.skill?.description || 'Uploaded from the desktop builder.',
            trigger: pkg?.skill?.trigger || 'voice',
            toolName: `run_${String(pkg?.skill?.name || 'airo_skill').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'airo_skill'}`,
            generatedCode: pkg?.generatedCode || '',
            script: pkg?.script || null,
            packageData: {
              format: pkg?.format || 'airskill',
              version: pkg?.version || '2.0.0',
              exportedAt: pkg?.exportedAt || new Date().toISOString(),
              runtime: pkg?.runtime || {},
            },
            emoji: '🛠️',
            color: '#22c55e',
            author: 'Desktop Builder',
            source: 'store',
          };

          const currentSkills = Array.isArray(existing.skills) ? existing.skills : [];
          const updatedSkills = currentSkills.some((skill) => skill.id === nextSkill.id)
            ? currentSkills.map((skill) => (skill.id === nextSkill.id ? { ...skill, ...nextSkill } : skill))
            : [...currentSkills, nextSkill];

          fs.writeFileSync(skillStorePath, `${JSON.stringify({ skills: updatedSkills }, null, 2)}\n`);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ ok: true, skill: nextSkill }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/backend/api/heartbeat') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload?.clientId) {
            throw new Error('clientId missing');
          }
          connectedUnits.set(payload.clientId, {
            clientId: payload.clientId,
            label: payload.label || 'Airo Unit',
            pairCode: String(payload.pairCode || '').trim(),
            statusText: payload.statusText || '',
            connectionState: payload.connectionState || 'IDLE',
            hasStarted: Boolean(payload.hasStarted),
            ollieConnected: Boolean(payload.ollieConnected),
            assistantMuted: Boolean(payload.assistantMuted),
            movementEnabled: Boolean(payload.movementEnabled),
            cameraState: payload.cameraState || 'idle',
            cameraMode: payload.cameraMode || 'unknown',
            opencvState: payload.opencvState || 'idle',
            recognizedFamilyName: payload.recognizedFamilyName || '',
            recognizedFamilyNotes: payload.recognizedFamilyNotes || '',
            visionTarget: payload.visionTarget || null,
            rearTarget: payload.rearTarget || null,
            frontPreview: payload.frontPreview || '',
            rearPreview: payload.rearPreview || '',
            updatedAt: Date.now(),
          });
          pruneUnits();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/backend/api/pair/verify') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          pruneUnits();
          const payload = JSON.parse(body || '{}');
          const code = String(payload?.code || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          if (!code || code.length < 4) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'invalid code' }));
            return;
          }
          const match = Array.from(connectedUnits.values()).find((unit) => String(unit?.pairCode || '').toUpperCase() === code);
          if (!match) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'code not found or robot offline' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              ok: true,
              device: {
                clientId: match.clientId,
                label: match.label,
                pairCode: match.pairCode || '',
              },
            })
          );
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/backend/api/device') {
      pruneUnits();
      const clientId = String(search.get('clientId') || '').trim();
      const device = clientId ? connectedUnits.get(clientId) || null : null;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, device }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/backend/api/devices') {
      pruneUnits();
      const devices = Array.from(connectedUnits.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ devices }));
      return;
    }

    if (req.method === 'POST' && urlPath === '/backend/api/log') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const clientId = payload?.clientId || '';
          if (!clientId) {
            throw new Error('clientId missing');
          }
          const existing = unitLogs.get(clientId) || [];
          const nextEntry = {
            id: randomUUID(),
            level: payload?.level || 'info',
            scope: payload?.scope || 'runtime',
            message: payload?.message || '',
            detail: payload?.detail || '',
            timestamp: Date.now(),
          };
          unitLogs.set(clientId, [...existing, nextEntry].slice(-120));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/backend/api/logs') {
      pruneUnits();
      const clientId = search.get('clientId') || 'all';
      if (clientId === 'all') {
        const logs = Array.from(unitLogs.entries())
          .flatMap(([unitClientId, entries]) => (entries || []).map((entry) => ({ clientId: unitClientId, ...entry })))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .slice(0, 200);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ logs }));
        return;
      }
      const logs = (unitLogs.get(clientId) || []).slice().reverse();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ logs }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/backend/api/commands') {
      const clientId = search.get('clientId') || '';
      const commands = clientId ? pendingCommands.get(clientId) || [] : [];
      pendingCommands.set(clientId, []);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ commands }));
      return;
    }

    if (req.method === 'POST' && urlPath === '/backend/api/trigger') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const targetClientId = payload?.clientId || 'all';
          const pairCode = String(payload?.pairCode || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          const command = {
            id: randomUUID(),
            type: payload?.type || 'voice_mode',
            prompt: typeof payload?.prompt === 'string' ? payload.prompt : null,
            package: payload?.package && typeof payload.package === 'object' ? payload.package : null,
            action: typeof payload?.action === 'string' ? payload.action : null,
            payload: payload?.payload && typeof payload.payload === 'object' ? payload.payload : null,
            createdAt: Date.now(),
          };
          pruneUnits();
          let targets = targetClientId === 'all'
            ? Array.from(connectedUnits.keys())
            : [targetClientId];

          // Pair-code targeting is authoritative for mobile app control.
          if (pairCode) {
            const byCode = Array.from(connectedUnits.values())
              .filter((unit) => String(unit?.pairCode || '').toUpperCase() === pairCode)
              .map((unit) => unit.clientId);
            if (!byCode.length) {
              res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              res.end(JSON.stringify({ ok: false, error: 'no live robot matched this pair code', deliveredTo: 0 }));
              return;
            }
            targets = byCode;
          } else if (targetClientId !== 'all' && !connectedUnits.has(targetClientId)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ ok: false, error: 'target robot is offline', deliveredTo: 0 }));
            return;
          }

          for (const clientId of targets) {
            const existing = pendingCommands.get(clientId) || [];
            existing.push(command);
            pendingCommands.set(clientId, existing.slice(-8));
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, deliveredTo: targets.length }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      return;
    }

    if (requestHost.includes('.local')) {
      const currentServerUrl = fs.existsSync(currentServerUrlPath)
        ? fs.readFileSync(currentServerUrlPath, 'utf8').trim()
        : '';
      const fallbackPublicUrl = fs.existsSync(publicUrlPath)
        ? fs.readFileSync(publicUrlPath, 'utf8').trim()
        : '';
      const redirectBase = currentServerUrl || fallbackPublicUrl;

      if (redirectBase) {
        try {
          const targetUrl = new URL(redirectBase);
          if (!requestHost.includes(targetUrl.host.toLowerCase())) {
            targetUrl.pathname = urlPath;
            targetUrl.search = (req.url || '').includes('?')
              ? `?${(req.url || '').split('?').slice(1).join('?')}`
              : '';
            res.writeHead(302, {
              Location: targetUrl.toString(),
              'Cache-Control': 'no-store',
            });
            res.end();
            return;
          }
        } catch {}
      }
    }

    const aliasPathMap = new Map([
      ['/loading%20dips.mp3', '/loading-dips.wav'],
      ['/loading dips.mp3', '/loading-dips.wav'],
      ['/loading-dips.mp3', '/loading-dips.wav'],
      ['/loading_dips.mp3', '/loading-dips.wav'],
      ['/loading_dips.wav', '/loading-dips.wav'],
    ]);
    const normalizedPath = aliasPathMap.get(urlPath.toLowerCase()) || urlPath;

    const relativePath = normalizedPath === '/'
      ? '/index.html'
      : normalizedPath === '/backend'
        ? '/backend.html'
        : normalizedPath;
    const filePath = path.resolve(root, `.${relativePath}`);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const fileExists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    const requestedExt = path.extname(relativePath).toLowerCase();
    const isAssetRequest = Boolean(requestedExt);

    if (!fileExists && isAssetRequest) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end('Not Found');
      return;
    }

    const targetPath = fileExists ? filePath : path.join(root, 'index.html');

    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(targetPath).pipe(res);
  }
);

server.listen(port, host, () => {
  console.log(`HTTPS preview server running at https://localhost:${port}/`);
});
