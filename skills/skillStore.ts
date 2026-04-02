import type { AirSkillScript } from './airSkillScript';

export const BUILDER_SKILL_STORAGE_KEY = 'airo.skillStore.builderSkill';
export const INSTALLED_SKILL_IDS_STORAGE_KEY = 'airo.installedSkillIds';
export const SKILL_STORE_PATH = '/skill-store.json';

export type InstalledAiroSkill = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  toolName: string;
  generatedCode: string;
  script?: AirSkillScript | null;
  packageData: Record<string, unknown>;
  emoji?: string;
  color?: string;
  author?: string;
  source?: 'bundled' | 'builder' | 'store';
};

export type AiroSkillPackage = {
  format: string;
  version: string;
  exportedAt: string;
  skill: {
    id: string;
    name: string;
    description: string;
    trigger: string;
    workspaceState: unknown;
  } & Record<string, unknown>;
  generatedCode: string;
  script?: AirSkillScript | null;
  runtime?: Record<string, unknown>;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const createToolName = (name: string, id: string) => {
  const slug = slugify(name || id || 'airo_skill');
  return `run_${slug || 'airo_skill'}`;
};

export const skillPackageToInstalledSkill = (
  pkg: AiroSkillPackage,
  overrides: Partial<InstalledAiroSkill> = {}
): InstalledAiroSkill => ({
  id: pkg.skill.id,
  name: pkg.skill.name,
  description: pkg.skill.description,
  trigger: pkg.skill.trigger,
  toolName: createToolName(pkg.skill.name, pkg.skill.id),
  generatedCode: pkg.generatedCode,
  script: pkg.script || null,
  packageData: {
    format: pkg.format,
    version: pkg.version,
    exportedAt: pkg.exportedAt,
    skill: pkg.skill,
    runtime: pkg.runtime || {},
  },
  emoji: overrides.emoji || '🧩',
  color: overrides.color || '#60a5fa',
  author: overrides.author || 'Alex Rose',
  source: overrides.source || 'store',
});

const makeRoundShape = () => ({
  points: [
    { x: 0.5, y: 0.08, inX: -0.22, inY: 0, outX: 0.22, outY: 0 },
    { x: 0.92, y: 0.5, inX: 0, inY: -0.22, outX: 0, outY: 0.22 },
    { x: 0.5, y: 0.92, inX: 0.22, inY: 0, outX: -0.22, outY: 0 },
    { x: 0.08, y: 0.5, inX: 0, inY: 0.22, outX: 0, outY: -0.22 },
  ],
});

const WEATHER_EYE_ANIMATIONS = [
  {
    id: 'weather-default',
    name: 'Weather Default',
    durationMs: 1400,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#f8fafc', roundness: 999, rotateDeg: 0, fillMode: 'color', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#f8fafc', roundness: 999, rotateDeg: 0, fillMode: 'color', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#f8fafc', roundness: 999, rotateDeg: 0, fillMode: 'color', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#f8fafc', roundness: 999, rotateDeg: 0, fillMode: 'color', shape: makeRoundShape() },
      },
    ],
  },
  {
    id: 'weather-clear',
    name: 'Weather Sun',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#facc15', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2600.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#facc15', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2600.png', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#facc15', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2600.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#facc15', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2600.png', shape: makeRoundShape() },
      },
    ],
  },
  {
    id: 'weather-clouds',
    name: 'Weather Clouds',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#cbd5e1', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2601.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#cbd5e1', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2601.png', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#cbd5e1', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2601.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#cbd5e1', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2601.png', shape: makeRoundShape() },
      },
    ],
  },
  {
    id: 'weather-fog',
    name: 'Weather Fog',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#94a3b8', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f32b.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#94a3b8', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f32b.png', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#94a3b8', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f32b.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#94a3b8', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f32b.png', shape: makeRoundShape() },
      },
    ],
  },
  {
    id: 'weather-rain',
    name: 'Weather Rain Drop',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: {
          x: 35, y: 55, width: 150, height: 170, color: '#38bdf8', roundness: 0, rotateDeg: 0, fillMode: 'color',
          shape: {
            points: [
              { x: 0.5, y: 0.03, inX: -0.08, inY: 0.04, outX: 0.08, outY: 0.04 },
              { x: 0.9, y: 0.42, inX: -0.08, inY: -0.16, outX: 0.04, outY: 0.12 },
              { x: 0.5, y: 0.97, inX: 0.22, inY: -0.06, outX: -0.22, outY: -0.06 },
              { x: 0.1, y: 0.42, inX: -0.04, inY: 0.12, outX: 0.08, outY: -0.16 },
            ],
          },
        },
        right: {
          x: 65, y: 55, width: 150, height: 170, color: '#38bdf8', roundness: 0, rotateDeg: 0, fillMode: 'color',
          shape: {
            points: [
              { x: 0.5, y: 0.03, inX: -0.08, inY: 0.04, outX: 0.08, outY: 0.04 },
              { x: 0.9, y: 0.42, inX: -0.08, inY: -0.16, outX: 0.04, outY: 0.12 },
              { x: 0.5, y: 0.97, inX: 0.22, inY: -0.06, outX: -0.22, outY: -0.06 },
              { x: 0.1, y: 0.42, inX: -0.04, inY: 0.12, outX: 0.08, outY: -0.16 },
            ],
          },
        },
      },
      {
        at: 1,
        left: {
          x: 35, y: 55, width: 150, height: 170, color: '#38bdf8', roundness: 0, rotateDeg: 0, fillMode: 'color',
          shape: {
            points: [
              { x: 0.5, y: 0.03, inX: -0.08, inY: 0.04, outX: 0.08, outY: 0.04 },
              { x: 0.9, y: 0.42, inX: -0.08, inY: -0.16, outX: 0.04, outY: 0.12 },
              { x: 0.5, y: 0.97, inX: 0.22, inY: -0.06, outX: -0.22, outY: -0.06 },
              { x: 0.1, y: 0.42, inX: -0.04, inY: 0.12, outX: 0.08, outY: -0.16 },
            ],
          },
        },
        right: {
          x: 65, y: 55, width: 150, height: 170, color: '#38bdf8', roundness: 0, rotateDeg: 0, fillMode: 'color',
          shape: {
            points: [
              { x: 0.5, y: 0.03, inX: -0.08, inY: 0.04, outX: 0.08, outY: 0.04 },
              { x: 0.9, y: 0.42, inX: -0.08, inY: -0.16, outX: 0.04, outY: 0.12 },
              { x: 0.5, y: 0.97, inX: 0.22, inY: -0.06, outX: -0.22, outY: -0.06 },
              { x: 0.1, y: 0.42, inX: -0.04, inY: 0.12, outX: 0.08, outY: -0.16 },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'weather-snow',
    name: 'Weather Snow',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#e2e8f0', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2744.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#e2e8f0', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2744.png', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#e2e8f0', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2744.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#e2e8f0', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2744.png', shape: makeRoundShape() },
      },
    ],
  },
  {
    id: 'weather-storm',
    name: 'Weather Storm',
    durationMs: 1800,
    loop: false,
    keyframes: [
      {
        at: 0,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#fde047', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26c8.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#fde047', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26c8.png', shape: makeRoundShape() },
      },
      {
        at: 1,
        left: { x: 35, y: 55, width: 150, height: 150, color: '#fde047', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26c8.png', shape: makeRoundShape() },
        right: { x: 65, y: 55, width: 150, height: 150, color: '#fde047', roundness: 999, rotateDeg: 0, fillMode: 'media', mediaUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26c8.png', shape: makeRoundShape() },
      },
    ],
  },
];

export const BUNDLED_AIRO_SKILLS: InstalledAiroSkill[] = [
  {
    id: 'skill-open-weather-cute',
    name: 'Open Weather',
    description: 'Reads weather for the location you ask and shows a cute weather overlay in front of the eyes.',
    trigger: 'voice',
    toolName: 'run_open_weather',
    generatedCode: `const prompt = String(runtime.userPrompt || "").trim();
const locationMatch = prompt.match(/(?:\\bin\\b|\\bfor\\b|\\bat\\b)\\s+([a-zA-Z][a-zA-Z0-9\\s,.-]{1,60})/i);
const requestedLocation = locationMatch?.[1]?.trim() || "";

let latitude = null;
let longitude = null;
let label = "";

if (requestedLocation) {
  const geocodeUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(requestedLocation) + "&count=1&language=en&format=json";
  const geocode = await runtime.webRequest({
    url: geocodeUrl,
    method: "GET",
    headers: { accept: "application/json" },
    timeoutMs: 10000,
    responseType: "json"
  });
  const place = geocode?.data?.results?.[0] || null;
  if (place) {
    latitude = Number(place.latitude);
    longitude = Number(place.longitude);
    label = String(place.name || requestedLocation);
  }
}

if (latitude == null || longitude == null) {
  const loc = await runtime.getCurrentLocation();
  latitude = Number(loc?.latitude);
  longitude = Number(loc?.longitude);
  label = label || "your location";
}

if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  await runtime.say("I could not find a valid location for weather yet.");
  await runtime.showUiCard({
    title: "Open Weather",
    subtitle: "Location unavailable",
    body: "Try asking: weather in Vancouver",
    theme: "warning",
    durationMs: 5000
  });
  return;
}

const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + latitude + "&longitude=" + longitude + "&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto";
const weather = await runtime.webRequest({
  url: weatherUrl,
  method: "GET",
  headers: { accept: "application/json" },
  timeoutMs: 12000,
  responseType: "json"
});

if (!weather || weather.ok === false) {
  await runtime.say("Weather request failed.");
  await runtime.showUiCard({
    title: "Open Weather",
    subtitle: "Request failed",
    body: String(weather?.error || "Unknown weather API error"),
    theme: "danger",
    durationMs: 6000
  });
  return;
}

const current = weather?.data?.current || {};
const code = Number(current.weather_code);
const temp = current.temperature_2m;
const wind = current.wind_speed_10m;

let line = "Weather updated";
let weatherGlyph = "🌤️";
let eyeAnim = "weather-default";

if (code === 0) {
  line = "Clear skies in " + label;
  weatherGlyph = "☀️";
  eyeAnim = "weather-clear";
} else if ([1,2,3].includes(code)) {
  line = "Cloudy in " + label;
  weatherGlyph = "☁️";
  eyeAnim = "weather-clouds";
} else if ([45,48].includes(code)) {
  line = "Fog in " + label;
  weatherGlyph = "🌫️";
  eyeAnim = "weather-fog";
} else if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) {
  line = "Rain in " + label;
  weatherGlyph = "🌧️";
  eyeAnim = "weather-rain";
} else if ([71,73,75,77,85,86].includes(code)) {
  line = "Snow in " + label;
  weatherGlyph = "❄️";
  eyeAnim = "weather-snow";
} else if ([95,96,99].includes(code)) {
  line = "Storm in " + label;
  weatherGlyph = "⛈️";
  eyeAnim = "weather-storm";
}

await runtime.runEyes({ animationId: eyeAnim, durationMs: 2600, continueExecution: true });
await runtime.showUiCard({
  title: "Open Weather",
  subtitle: weatherGlyph + " " + line,
  body: "Temp " + temp + " C  Wind " + wind + " km/h",
  theme: "info",
  chips: ["weather", String(code)],
  durationMs: 7000
});

await runtime.say(line + ". It is " + temp + " degrees with wind " + wind + " kilometers per hour.");
await runtime.runEyes({ animationId: "weather-default", durationMs: 900, continueExecution: false });
`,
    script: null,
    packageData: {
      format: 'airskill',
      version: '2.0.0',
      exportedAt: '2026-03-26T01:35:00.000Z',
      skill: {
        id: 'skill-open-weather-cute',
        name: 'Open Weather',
        description: 'Reads weather for the location you ask and shows weather eye visuals.',
        trigger: 'voice',
        workspaceState: null,
        eyeAnimations: WEATHER_EYE_ANIMATIONS,
      },
    },
    emoji: '🌦️',
    color: '#22d3ee',
    author: 'Alex Rose',
    source: 'bundled',
  },
  {
    id: 'skill-1774228974968',
    name: 'My First Airo Skill',
    description: 'A custom AirOS block skill.',
    trigger: 'voice',
    toolName: 'run_my_first_airo_skill',
    generatedCode: '',
    script: {
      language: 'airscript-1',
      entry: [
        { action: 'say_random', lines: ['Hello from my Airo skill.', 'Skill check, I am awake and ready.'] },
        { action: 'display_text', title: 'Skill Screen', body: 'This came from the new AirSkill script runtime.' },
        { action: 'set_status', text: 'Running scripted skill' },
        { action: 'turn_waypoint', direction: 'front' },
      ],
    },
    packageData: {
      format: 'airskill',
      version: '2.0.0',
      exportedAt: '2026-03-23T01:23:18.900Z',
    },
    emoji: '✨',
    color: '#8b5cf6',
    author: 'Alex Rose',
    source: 'bundled',
  },
];

export const mergeSkillLists = (...lists: InstalledAiroSkill[][]) => {
  const merged = new Map<string, InstalledAiroSkill>();
  for (const list of lists) {
    for (const skill of list) {
      if (!skill?.id) continue;
      merged.set(skill.id, skill);
    }
  }
  return Array.from(merged.values());
};
