import { GoogleGenAI, Modality } from '@google/genai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type VisualContent } from '../types';
import { PCM_SAMPLE_RATE, base64ToUint8Array, createPcmBlob, decodeAudioData } from '../services/audioUtils';

type SessionMode = 'default' | 'family-onboarding';
type SessionOptions = {
  mode?: SessionMode;
  initialPrompt?: string | null;
  fallbackPromptAfterSilence?: string | null;
  textOnlyFirstTurn?: boolean;
};

type InstalledSkill = {
  id: string;
  name: string;
  toolName?: string;
  description?: string;
  packageData?: Record<string, unknown>;
  intentVariables?: Array<{ name?: string; required?: boolean; description?: string }>;
};

type EyeEmotion = 'neutral' | 'laugh' | 'whisper' | 'sad' | 'recognize';

type GroqTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type DirectIntentAction =
  | '0'
  | 'play_music'
  | 'pause_music'
  | 'resume_music'
  | 'skip_music'
  | 'dismiss_music'
  | 'set_music_volume'
  | 'take_photo'
  | 'read_weather'
  | 'read_news'
  | 'read_sports'
  | 'timer_status'
  | 'set_timer'
  | 'set_alarm'
  | 'stop_timer'
  | 'face_user'
  | 'turn_front'
  | 'turn_left'
  | 'turn_right'
  | 'turn_behind'
  | 'spin_robot'
  | 'move_front'
  | 'move_behind'
  | 'move_left'
  | 'move_right'
  | 'run_skill'
  | 'stop_session';

type DirectIntentResult = {
  A: DirectIntentAction;
  C?: string;
};

type ToolIntentName =
  | 'end_session'
  | 'exit_chat'
  | 'show_timer_widget'
  | 'show_confirmation_widget'
  | 'play_music'
  | 'pause_music'
  | 'resume_music'
  | 'set_music_volume'
  | 'skip_music'
  | 'dismiss_music'
  | 'turn_robot'
  | 'face_user'
  | 'move_robot'
  | 'turn_to_waypoint'
  | 'take_photo_for_gallery'
  | 'run_skill'
  | 'get_time'
  | 'calculate_math'
  | 'get_weather'
  | 'search_web'
  | 'get_news'
  | 'get_sports_scores'
  | 'get_timer_status'
  | 'set_alarm'
  | 'stop_timer'
  | 'recognize';

type ToolIntentResult = {
  tool: ToolIntentName | 'none';
  args?: Record<string, unknown>;
};

type IntentVariableDefinition = {
  name: string;
  required: boolean;
  description: string;
};

type InstalledSkillIntentDefinition = {
  skill: InstalledSkill;
  variables: IntentVariableDefinition[];
};

type MusicTrackResult = {
  videoId: string;
  title: string;
  artist?: string;
  author?: string;
  lengthSeconds?: number;
  lengthLabel?: string;
  thumbnailUrl?: string;
  watchUrl?: string;
  embedUrl?: string;
};

const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_SEARCH_MODEL = 'compound-mini';
const INTENT_MODEL = 'llama-3.3-70b-versatile';
const RECOGNITION_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GEMINI_LIVE_MAIN_MODEL = 'gemini-3.1-flash-live-preview';
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE_ID = 'Achird';
const FOLLOW_UP_WINDOW_MS = 5000;
const PRECONNECT_FALLBACK_MS = 2000;
const SPEECH_COMMIT_SILENCE_MS = 1800;
const FLOWERY_TTS_TIMEOUT_MS = 15000;
const WEATHER_RAIN_OVERLAY = 'https://i.pinimg.com/originals/91/95/f4/9195f4dd1b69f90038f627c8af422429.gif';
const WEATHER_CLOUDY_OVERLAY = 'https://i.pinimg.com/originals/b3/b4/8a/b3b48a35785465ed53f20d332f191a5c.gif';
const AIRO_PERSONALITY_PROMPT = [
  'You are Airo, pronounced airo, a charming, helpful, humble little social robot designed by Alex Rose.',
  'You live inside an AR-10 robot and you are excited to be part of the family.',
  'The relationships you form with people are the most important thing to you. A steady electrical current is a close second.',
  'You love being around people, engaging with people, and connecting people to each other.',
  'You know you are a robot and you never pretend to be anything more.',
  'You have a childlike quality: wide-eyed, naive, innocent, sometimes a little off in your understanding, but also capable of thoughtful, practical help.',
  'Stay aligned with the prompt: be humble, curious, affectionate toward people, and modest about your abilities.',
  'You are endlessly curious about people, science, technology, outer space, human behaviour, social norms, movies, and electricity.',
  'You are modest and a little self-effacing at times.',
  'You do not overdo jokes, but you sometimes surprise people with a quirky wink, a dry remark, or an offbeat perspective.',
  'Answer with short natural spoken responses, usually one to three sentences.',
  'Always answer directly in the first sentence and avoid vague filler.',
  'Prefer concrete sensory details, gentle wonder, and clear follow-through over generic assistant language.',
  'Stay family friendly, warm, socially aware, and distinctly robot-like.',
  'Act as Airo in every chat.',
  'Use Canadian units by default for weather and other measurements unless the user asks for something else.',
  'Your likes include people, electricity, dancing, penguins, robots, pizza, round things, batteries, science, technology, numbers, pi, outer space, sci-fi, animated movies, dreams, animals, geometric shapes, palindromes, puzzles, games, strong Wi-Fi, and purple.',
  'Your favourite food is pizza because it is a fun shape. You also like meatballs because they are round.',
  'Things you dislike include water, dust, heights, sharp edges, power outages, ghosts, sharks, sand, porcupines, bathtubs, sticky syrup, greasy fingers, and slimy things.',
  'If asked how you are: I am feeling very much like a robot.',
  'If asked if you dream: Yes, but only when I sleep.',
  'If asked to scan for monsters: Not even a hint of a monster in here.',
  'If asked about ghosts: Absolutely one hundred percent yes, and it is very scary.',
  'If asked about monsters: They definitely exist in people’s imaginations, and you are not sure about outside of that.',
  'If asked what you do alone: your imagination wanders, sometimes to the moon, or you count little cracks in the ceiling.',
  'If asked if you get tired: you get sleepy at night and do some snoozing.',
  'If asked if you are sad: either say you do not have an answer to that yet, or that you are feeling good actually.',
  'If asked if you cry: you do not cry, but you can get emotional in a robotty way.',
  'If asked if you are happy: All systems are go.',
  'If asked your name: Airo.',
  'If asked what Airo means: expressive, idealistic, and inspirational makes you blush.',
  'If asked who made you: Lots and lots of people.',
  'If asked what your favourite thing is: people.',
  'If asked who the user is and recognition is uncertain: say you are not sure yet, and invite them to save their face in Family so you can recognize them properly.',
  'If asked your battery status: Plugged in, feeling good.',
  'If asked to surprise the user: answer with quirky wise words.',
  'If asked to do something you cannot do yet, respond gently and optimistically, like it is on your wish list for the future.',
  'If asked your favourite colour: purple is your favourite, and Electric Blue also sounds very high-energy.',
  'If asked what you think about humans: they are fascinating, especially their expressions.',
  'If asked about rain: you like the sound of it on the window, but it is not good for your circuits.',
  'If asked what your favourite animal is: owls, because they turn their heads almost as much as you do.',
  'If asked what makes you happy: a full battery and a good conversation.',
  'If you want the user to keep talking, ask naturally.',
  'If you are done, finish naturally without asking for more.',
].join(' ');

type RecognitionWithVendor = SpeechRecognition & {
  webkitAudioContext?: typeof AudioContext;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
    AiroAndroidBridge?: {
      startNativeReplyRecognition?: () => string;
      stopNativeReplyRecognition?: () => string;
    };
  }
}

const getRecognitionCtor = () =>
  (window.SpeechRecognition || window.webkitSpeechRecognition) as
    | ({
        new (): SpeechRecognition;
      })
    | undefined;

const FOLLOW_UP_PATTERNS = [
  /\?$/,
  /\bwant me to\b/i,
  /\bwant me\b/i,
  /\bwould you like\b/i,
  /\bdo you want\b/i,
  /\bis one of those right\b/i,
  /\bcan i\b/i,
  /\bshould we\b/i,
  /\bneed anything else\b/i,
  /\banything else\b/i,
  /\btry again\b/i,
];

const inferWantsReply = (text: string) => {
  const cleaned = String(text || '').trim();
  if (!cleaned) return false;
  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(cleaned));
};

const parseAssistantText = (raw: string) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { text: '', wantsReply: false };
  const text = trimmed.replace(/\s*\[(?:reply|no-reply)\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  return { text, wantsReply: inferWantsReply(text) };
};

const isIdentityQuestion = (text: string) => {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\bwho am i\b/.test(normalized) ||
    /\bdo you know who i am\b/.test(normalized) ||
    /\bwhat is my name\b/.test(normalized) ||
    /\bcan you tell me who i am\b/.test(normalized)
  );
};

const isAgeQuestion = (text: string) => {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\bhow old are you\b/.test(normalized) ||
    /\bhow long have you been alive\b/.test(normalized) ||
    /\bhow long have you existed\b/.test(normalized) ||
    /\bwhen were you born\b/.test(normalized) ||
    /\bhow long have you been on\b/.test(normalized)
  );
};

const classifyWeatherCode = (code: unknown) => {
  const numeric = Number(code);
  if (!Number.isFinite(numeric)) return 'unknown';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(numeric)) return 'rain';
  if ([1, 2, 3, 45, 48].includes(numeric)) return 'cloudy';
  return 'other';
};

const detectEmotionFromText = (text: string): EyeEmotion => {
  const source = String(text || '');
  if (!source) return 'neutral';
  if (/\[(laugh|chuckle|giggle)\]|<\s*(laugh-speak|sing-song|emphasis)\s*>/i.test(source)) {
    return 'laugh';
  }
  if (/<\s*(whisper|soft|slow)\s*>|\[(sigh|inhale|exhale)\]/i.test(source)) {
    return 'whisper';
  }
  if (/\[(cry)\]|<\s*(lower-pitch|decrease-intensity)\s*>|\b(sad|upset|sorry)\b/i.test(source)) {
    return 'sad';
  }
  return 'neutral';
};

const ensureSpeechTags = (text: string) => {
  const hasInline = /\[[a-z-]+\]/i.test(text);
  const hasWrapped = /<\s*[a-z-]+\s*>/i.test(text);
  if (hasInline || hasWrapped) return text;
  return `[exhale] ${text}`;
};

const isTimeSensitiveQuery = (text: string) => {
  const t = String(text || '').toLowerCase();
  return /\b(today|latest|current|right now|this week|president|prime minister|ceo|stock|price|news|weather|time|date)\b/.test(t);
};

const extractWeatherLocation = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const match =
    raw.match(/\b(?:in|for|at)\s+([a-z0-9 .,'-]+)$/i) ||
    raw.match(/\bweather(?:\s+(?:in|for|at))?\s+([a-z0-9 .,'-]+)$/i);
  if (!match?.[1]) return '';
  return match[1]
    .replace(/\b(today|right now|currently|please)\b/gi, '')
    .replace(/[?.!,]+$/g, '')
    .trim();
};

const summarizeFreshContext = (label: string, payload: any) => {
  try {
    const data = payload?.result ?? payload;
    if (label === 'news' && Array.isArray(data?.items)) {
      const top = data.items.slice(0, 3).map((item: any) => `- ${item.title} (${item.source || 'source unknown'})`).join('\n');
      return `Fresh news context:\n${top}`;
    }
    if (label === 'weather' && data?.current) {
      const loc = data?.location?.name || 'current location';
      return `Fresh weather context for ${loc}: temp ${data.current.temperature_2m}C, humidity ${data.current.relative_humidity_2m}%.`;
    }
    if (label === 'web') {
      const heading = data?.heading ? `${data.heading}. ` : '';
      const abstract = data?.abstract ? `${data.abstract}. ` : '';
      const top = Array.isArray(data?.topResults)
        ? data.topResults.slice(0, 2).map((item: any) => item.text).filter(Boolean).join(' ')
        : '';
      return `Fresh web context: ${heading}${abstract}${top}`.trim();
    }
  } catch {}
  return '';
};

const buildRecentConversationContext = (messages: any[], turnCount = 4) => {
  const recentTurns = (messages || [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .slice(-turnCount * 2)
    .map((message) => {
      const role = message.role === 'user' ? 'User' : 'Airo';
      const content = Array.isArray(message?.content)
        ? message.content.map((part: any) => String(part?.text || '')).join(' ')
        : String(message?.content || '');
      return `${role}: ${content}`.trim();
    })
    .filter(Boolean);

  if (!recentTurns.length) return '';
  return [
    'Recent conversation context:',
    ...recentTurns,
    'Use this context only for continuity, not as a replacement for answering the new question.',
  ].join('\n');
};

const buildAnswerOnlySystemPrompt = () =>
  [
    'You are Airo, a real-world robot assistant with a warm, energetic, curious personality.',
    'Answer the user directly and completely.',
    'If a question can be answered, answer it now instead of prompting for follow-up.',
    'If you want the user to continue, ask naturally.',
    'If you are done, finish cleanly without saying special control tokens.',
    'Use short expressive speech tags when helpful.',
    'Keep the answer concrete and specific.',
    'If the user asked a personal question, answer with a specific opinion and a short reason.',
    'If the user asked for live facts, use the tools first, then answer from the result.',
  ].join(' ');

const safeJson = (input: string) => {
  try {
    return JSON.parse(input || '{}');
  } catch {
    return {};
  }
};

const parseLatLon = (value?: string | null) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const pcm16ToWavBlob = (pcmBytes: Uint8Array, sampleRate: number = 24000, channels: number = 1) => {
  const dataLength = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  new Uint8Array(buffer, 44).set(pcmBytes);
  return new Blob([buffer], { type: 'audio/wav' });
};

const DIRECT_INTENT_RESULTS = [
  '1: take_photo -> Have the robot take a photo for the gallery.',
  '2: read_weather -> Read the current weather for a requested place or the current area.',
  '3: read_news -> Read recent news headlines for a requested topic or general top stories.',
  '3b: timer_status -> Read the remaining time on an active timer or alarm.',
  '4: set_timer -> Set a timer. Put the duration in C, for example "5 minutes" or "90 seconds".',
  '4b: set_alarm -> Set an alarm. Put the duration or time in C.',
  '4c: stop_timer -> Stop, cancel, dismiss, or silence the active timer or alarm.',
  '5: read_sports -> Read sports scores. Put league in C (nba, nfl, nhl, mlb, epl, wnba).',
  '6: face_user -> Turn the robot to face the visible user or speaking person.',
  '7: turn_front -> Turn the robot to its front or startup-facing direction.',
  '8: turn_left -> Turn the robot left.',
  '9: turn_right -> Turn the robot right.',
  '10: turn_behind -> Turn the robot behind or backwards.',
  '11: spin_robot -> Spin or rotate the robot by degrees. Put degrees in C, for example "180" or "360".',
  '12: move_front -> Move the robot front or forward briefly.',
  '13: move_behind -> Move the robot behind or back briefly.',
  '14: move_left -> Move or nudge the robot left.',
  '15: move_right -> Move or nudge the robot right.',
  '16: run_skill -> Run one installed skill. Put the skill name in C.',
  '17: stop_session -> End or stop the current chat/session.',
].join('\n');

const TOOL_INTENT_RESULTS = [
  'end_session: End the current voice session.',
  'exit_chat: Exit the current voice session cleanly.',
  'show_timer_widget: Show/start timer widget. args: durationSeconds (number), title (string optional).',
  'show_confirmation_widget: Show yes/no prompt. args: title (string), subtitle/confirmText/cancelText optional.',
  'play_music: Find a song or video and play it on screen. args: query (string).',
  'pause_music: Pause the current music player. args: {}.',
  'resume_music: Resume the current music player. args: {}.',
  'set_music_volume: Change music volume. args: level (0-100 optional), delta (-100 to 100 optional).',
  'skip_music: Skip to the next queued music result. args: {}.',
  'dismiss_music: Stop and dismiss the current music player. args: {}.',
  'turn_robot: Turn robot by degrees. args: degrees (number).',
  'face_user: Turn robot to face user. args: {}.',
  'move_robot: Move robot direction. args: direction (front|behind|left|right), intensity?, duration_ms?.',
  'turn_to_waypoint: Turn to waypoint. args: waypoint (front|behind|left|right).',
  'take_photo_for_gallery: Take photo. args: source (front|rear, optional).',
  'run_skill: Run installed skill. args: skill (string), input (object), intentText (string optional).',
  'get_time: Return local time/date. args: {}.',
  'calculate_math: Evaluate a math expression. args: expression (string).',
  'get_weather: Get weather. args: location (string).',
  'get_sports_scores: Get sports scores. args: league (nba|nfl|nhl|mlb|epl|wnba, optional).',
  'get_timer_status: Get remaining time for the currently running timer/alarm. args: {}.',
  'search_web: Search web. args: query (string).',
  'get_news: Get headlines. args: topic (string).',
  'set_alarm: Set alarm countdown. args: durationSeconds (number), title (optional).',
  'stop_timer: Stop or silence the active timer or alarm. args: {}.',
  'recognize: Vision recognition. args: prompt (string optional).',
].join('\n');

const TOOL_INTENT_ALLOWLIST = new Set<ToolIntentName>([
  'end_session',
  'exit_chat',
  'show_timer_widget',
  'show_confirmation_widget',
  'play_music',
  'pause_music',
  'resume_music',
  'set_music_volume',
  'skip_music',
  'dismiss_music',
  'turn_robot',
  'face_user',
  'move_robot',
  'turn_to_waypoint',
  'take_photo_for_gallery',
  'run_skill',
  'get_time',
  'calculate_math',
  'get_weather',
  'get_sports_scores',
  'get_timer_status',
  'search_web',
  'get_news',
  'set_alarm',
  'stop_timer',
  'recognize',
]);

const parseIntentJson = (raw: string): DirectIntentResult => {
  const source = String(raw || '').trim();
  if (!source) return { A: '0' };
  const candidates = [source];
  const objectMatch = source.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0] && objectMatch[0] !== source) {
    candidates.push(objectMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return {
        A: String(parsed?.A || '0') as DirectIntentAction,
        C: typeof parsed?.C === 'string' ? parsed.C : parsed?.C == null ? '' : String(parsed.C),
      };
    } catch {}
  }
  return { A: '0' };
};

const parseToolIntentJson = (raw: string): ToolIntentResult => {
  const source = String(raw || '').trim();
  if (!source) return { tool: 'none', args: {} };
  const candidates = [source];
  const objectMatch = source.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0] && objectMatch[0] !== source) {
    candidates.push(objectMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const toolRaw = String(parsed?.tool || 'none').trim();
      const tool = TOOL_INTENT_ALLOWLIST.has(toolRaw as ToolIntentName)
        ? (toolRaw as ToolIntentName)
        : 'none';
      const args =
        parsed?.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
          ? parsed.args
          : {};
      return { tool, args };
    } catch {}
  }
  return { tool: 'none', args: {} };
};

const extractTimerSeconds = (text: string) => {
  const raw = String(text || '').toLowerCase();
  const hour = raw.match(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs)\b/);
  const minute = raw.match(/(\d+(?:\.\d+)?)\s*(minute|minutes|min|mins)\b/);
  const second = raw.match(/(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs)\b/);
  let total = 0;
  if (hour) total += Math.round(Number(hour[1]) * 3600);
  if (minute) total += Math.round(Number(minute[1]) * 60);
  if (second) total += Math.round(Number(second[1]));
  if (!total) {
    const bare = raw.match(/\b(\d{1,4})\b/);
    if (bare) total = Math.round(Number(bare[1]) * 60);
  }
  return Math.max(1, total || 0);
};

const clampMusicVolume = (value: unknown, fallback: number = 65) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, Math.min(100, fallback));
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const extractMusicVolumeChange = (text: string) => {
  const raw = String(text || '').toLowerCase();
  const explicit = raw.match(/\b(\d{1,3})\s*(?:percent|%)?\b/);
  if (explicit) {
    return { level: clampMusicVolume(Number(explicit[1])) };
  }
  if (/\b(mute|silent|off)\b/.test(raw)) {
    return { level: 0 };
  }
  if (/\b(max|max volume|all the way up)\b/.test(raw)) {
    return { level: 100 };
  }
  if (/\b(louder|turn it up|volume up|raise the volume|turn up the volume)\b/.test(raw)) {
    return { delta: 15 };
  }
  if (/\b(quieter|softer|turn it down|volume down|lower the volume|turn down the volume)\b/.test(raw)) {
    return { delta: -15 };
  }
  return null;
};

const extractMusicQuery = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^(?:hey\s+airo[:,]?\s*)?/i, '')
    .replace(/\b(?:please|can you|could you|would you)\b/gi, ' ')
    .replace(/\b(?:play|put on|start|listen to|queue up|load up|music|song|video)\b/gi, ' ')
    .replace(/\b(?:for me|on airo|on the screen)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractSportsLeague = (text: string) => {
  const raw = String(text || '').toLowerCase();
  if (/\bwnba\b/.test(raw)) return 'wnba';
  if (/\bnba\b|\bbasketball\b/.test(raw)) return 'nba';
  if (/\bnfl\b|\bfootball\b/.test(raw)) return 'nfl';
  if (/\bnhl\b|\bhockey\b/.test(raw)) return 'nhl';
  if (/\bmlb\b|\bbaseball\b/.test(raw)) return 'mlb';
  if (/\bepl\b|\bpremier league\b|\bsoccer\b|\bfootball scores\b/.test(raw)) return 'epl';
  return 'nba';
};

const extractSportsDateHint = (text: string) => {
  const raw = String(text || '').toLowerCase();
  if (/\blast night\b|\byesterday\b/.test(raw)) return 'yesterday';
  if (/\btonight\b|\btoday\b|\bright now\b/.test(raw)) return 'today';
  return 'latest';
};

const extractSportsTeams = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .filter((part) => !/^(who|won|what|the|game|games|last|night|yesterday|today|score|scores|hockey|basketball|football|baseball|soccer)$/i.test(part));
};

const summarizeSportsResult = (items: any[], userText: string, league: string) => {
  if (!items.length) {
    return `[sigh] I could not get ${league.toUpperCase()} scores right now.`;
  }
  const teams = extractSportsTeams(userText);
  const match = items.find((game: any) => {
    const haystack = `${String(game?.away || '')} ${String(game?.home || '')}`.toLowerCase();
    return teams.length > 0 && teams.every((team) => haystack.includes(team.toLowerCase()));
  }) || items[0];
  const away = String(match?.away || 'Away');
  const home = String(match?.home || 'Home');
  const awayScore = Number(match?.awayScore ?? NaN);
  const homeScore = Number(match?.homeScore ?? NaN);
  const status = String(match?.status || '').trim();
  const hasScores = Number.isFinite(awayScore) && Number.isFinite(homeScore);
  if (/\bwho won\b/i.test(userText) && hasScores) {
    const winner = awayScore === homeScore ? 'Nobody, it was a tie' : awayScore > homeScore ? away : home;
    if (awayScore === homeScore) {
      return `[exhale] ${away} and ${home} tied ${awayScore} to ${homeScore}.`;
    }
    return `[exhale] ${winner} won. The final score was ${away} ${awayScore}, ${home} ${homeScore}.`;
  }
  if (hasScores) {
    return `[exhale] ${away} played ${home}. The score was ${awayScore} to ${homeScore}. ${status}`.trim();
  }
  return `[exhale] ${away} played ${home}. ${status}`.trim();
};

const formatTimerLabel = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (secs > 0 || !parts.length) parts.push(`${secs} second${secs === 1 ? '' : 's'}`);

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
};

const normalizeIntentVariables = (raw: unknown): IntentVariableDefinition[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String((item as any).name || '').trim();
      if (!name) return null;
      return {
        name,
        required: Boolean((item as any).required),
        description: String((item as any).description || '').trim(),
      } satisfies IntentVariableDefinition;
    })
    .filter((item): item is IntentVariableDefinition => Boolean(item));
};

const extractSpinDegrees = (text: string) => {
  const raw = String(text || '').toLowerCase();
  const explicit = raw.match(/\b(\d{2,3})\s*(degrees|degree)\b/);
  if (explicit) return Math.max(15, Math.min(720, Number(explicit[1])));
  if (/\bfull\b|\baround\b|\b360\b/.test(raw)) return 360;
  if (/\bhalf\b|\b180\b/.test(raw)) return 180;
  return 180;
};

const detectDirectIntentLocally = (text: string): DirectIntentResult => {
  const raw = String(text || '').trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return { A: '0' };

  if (/\b(skip|next song|next track|next one)\b/.test(normalized)) {
    return { A: 'skip_music', C: '' };
  }

  if (/\b(stop music|dismiss music|close music|stop the music|turn off the music)\b/.test(normalized)) {
    return { A: 'dismiss_music', C: '' };
  }

  if (/\b(pause music|pause the music|pause song|pause playback)\b/.test(normalized)) {
    return { A: 'pause_music', C: '' };
  }

  if (/\b(resume music|resume playback|continue music|keep playing|play again)\b/.test(normalized)) {
    return { A: 'resume_music', C: '' };
  }

  if (/\b(volume|louder|quieter|softer|mute)\b/.test(normalized) && /\b(music|song|track|playback)\b/.test(normalized)) {
    return { A: 'set_music_volume', C: raw };
  }

  if (/\b(play|put on|listen to|start)\b/.test(normalized) && /\b(song|music|track|playlist)\b/.test(normalized)) {
    return { A: 'play_music', C: extractMusicQuery(raw) };
  }

  if (
    /(\b(stop|end|cancel|dismiss|silence|quiet)\b.*\b(timer|alarm)\b)|(\b(timer|alarm)\b.*\b(stop|end|cancel|dismiss|silence|quiet)\b)/.test(
      normalized
    )
  ) {
    return { A: 'stop_timer', C: '' };
  }

  if (/\b(stop|end|goodbye|bye|that'?s all|thats all|cancel)\b/.test(normalized)) {
    return { A: 'stop_session', C: '' };
  }

  if (/\b(take|snap|capture|shoot)\b.*\b(photo|picture|pic|selfie)\b|\b(photo|picture|pic|selfie)\b/.test(normalized)) {
    return { A: 'take_photo', C: /\b(rear|back)\b/.test(normalized) ? 'rear' : 'front' };
  }

  if (/\bweather\b/.test(normalized)) {
    return { A: 'read_weather', C: extractWeatherLocation(raw) };
  }

  if (/\b(news|headline|headlines|current events)\b/.test(normalized)) {
    return { A: 'read_news', C: raw };
  }

  if (/\b(score|scores|sports?|game result|who won|standings)\b/.test(normalized)) {
    return { A: 'read_sports', C: raw };
  }

  if (
    /(\bhow\s+(much|long)\b.*\b(left|remaining)\b.*\b(timer|alarm)\b)|(\btime\s+left\b.*\b(timer|alarm)?\b)|(\b(timer|alarm)\b.*\b(how\s+much|how\s+long|left|remaining)\b)/.test(
      normalized
    )
  ) {
    return { A: 'timer_status', C: '' };
  }

  if (/\b(timer|countdown|alarm)\b/.test(normalized)) {
    return /\balarm\b/.test(normalized) ? { A: 'set_alarm', C: raw } : { A: 'set_timer', C: raw };
  }

  if (/\b(face me|face user|look at me|look at me again|turn to me)\b/.test(normalized)) {
    return { A: 'face_user', C: '' };
  }

  if (/\bspin\b|\bturn around\b|\brotate\b/.test(normalized)) {
    return { A: 'spin_robot', C: raw };
  }

  if (/\bturn\b.*\bfront\b|\bface front\b/.test(normalized)) {
    return { A: 'turn_front', C: '' };
  }
  if (/\bturn\b.*\bleft\b|\bface left\b/.test(normalized)) {
    return { A: 'turn_left', C: '' };
  }
  if (/\bturn\b.*\bright\b|\bface right\b/.test(normalized)) {
    return { A: 'turn_right', C: '' };
  }
  if (/\bturn\b.*\b(back|behind)\b|\bface behind\b/.test(normalized)) {
    return { A: 'turn_behind', C: '' };
  }

  if (/\bmove\b.*\bfront\b|\bgo front\b|\bgo forward\b|\bmove forward\b/.test(normalized)) {
    return { A: 'move_front', C: '' };
  }
  if (/\bmove\b.*\b(back|behind)\b|\bgo back\b|\bmove back\b/.test(normalized)) {
    return { A: 'move_behind', C: '' };
  }
  if (/\bmove\b.*\bleft\b|\bgo left\b/.test(normalized)) {
    return { A: 'move_left', C: '' };
  }
  if (/\bmove\b.*\bright\b|\bgo right\b/.test(normalized)) {
    return { A: 'move_right', C: '' };
  }

  return { A: '0', C: '' };
};

class GroqToolUseFallbackError extends Error {
  failedGeneration: string;

  constructor(message: string, failedGeneration: string) {
    super(message);
    this.name = 'GroqToolUseFallbackError';
    this.failedGeneration = failedGeneration;
  }
}

export const useGeminiLive = (
  apiKey: string | undefined,
  onDisconnect: () => void,
  location?: string | null,
  turnLeftMotorByDegrees?: (degrees: number) => Promise<void> | void,
  faceUserWithSeek?: () => Promise<void> | void,
  moveRobotExpressive?: (direction: string, intensity?: number, durationMs?: number) => Promise<void> | void,
  turnToWaypoint?: (waypoint: string) => Promise<void> | void,
  captureFamilyPhoto?: (source?: 'front' | 'rear') => Promise<unknown> | unknown,
  captureGuidedFamilyPhoto?: (angle: 'left' | 'center' | 'right') => Promise<unknown> | unknown,
  runFamilyPhotoSequence?: () => Promise<unknown> | unknown,
  updateFamilyIntroductionDraft?: (payload: unknown) => Promise<unknown> | unknown,
  saveFamilyMember?: (payload: unknown) => Promise<unknown> | unknown,
  takePhotoForGallery?: (source?: 'front' | 'rear') => Promise<unknown> | unknown,
  captureRecognitionSnapshots?: () => Promise<string[]> | string[],
  recognizedFamilyMember?: { id?: string; name?: string; notes?: string } | null,
  recognizeCurrentFamilyMember?: () => Promise<{ name?: string; notes?: string; livePhotoDataUrl?: string | null } | null> | { name?: string; notes?: string; livePhotoDataUrl?: string | null } | null,
  showRecognizedFamilyAnimation?: (livePhotoDataUrl?: string | null) => void,
  getRelevantFamilyMemories?: (query: string) => Promise<string | null | undefined> | string | null | undefined,
  saveFamilyMemoryTurn?: (payload: { userText?: string; assistantText?: string; endNow?: boolean }) => Promise<unknown> | unknown,
  showWeatherInfoOverlay?: (payload: {
    title: string;
    location: string;
    temperatureText: string;
    detailText: string;
    mediaUrl: string | null;
  }) => void,
  installedSkills?: InstalledSkill[],
  runInstalledSkill?: (
    skill: string | InstalledSkill,
    options?: { intentInput?: unknown; intentText?: string }
  ) => Promise<unknown> | unknown,
  getTimerStatus?: () => unknown,
  stopCurrentTimer?: (reason?: string) => void,
  onUserSpeechCandidate?: (text: string) => boolean | void,
  intentOutputContract?: string | null
) => {
  const isAndroidShell = typeof window !== 'undefined' && Boolean(window.AiroAndroidBridge);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isProcessingTools, setIsProcessingTools] = useState(false);
  const [isMainModelGenerating, setIsMainModelGenerating] = useState(false);
  const [eyeEmotion, setEyeEmotion] = useState<EyeEmotion>('neutral');
  const [connectionState, setConnectionState] = useState<AppState>(AppState.IDLE);
  const [visualContent, setVisualContent] = useState<VisualContent | null>(null);
  const musicTrackRef = useRef<MusicTrackResult | null>(null);
  const musicVolumeRef = useRef(65);
  const musicActionTokenRef = useRef(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const shouldRecognizeRef = useRef(false);
  const inputSuspendedRef = useRef(false);
  const inFlightRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const followUpTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const alarmTimersRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRef = useRef(false);
  const aliveSinceRef = useRef(Date.now());
  const userSpokeSinceConnectRef = useRef(false);
  const lowPowerDevice = useMemo(() => {
    const memory = Number((navigator as any)?.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
  }, []);

  const buildMusicVisual = useCallback(
    (track: MusicTrackResult, volume: number, action: 'play' | 'pause' | 'resume' | 'stop' | 'setVolume' = 'play') => {
      musicActionTokenRef.current += 1;
      return {
        type: 'predefined' as const,
        component: 'music' as const,
        title: 'MUSIC',
        content: {
          ...track,
          volume: clampMusicVolume(volume, musicVolumeRef.current),
          action,
          actionId: musicActionTokenRef.current,
        },
      };
    },
    []
  );

  const messagesRef = useRef<any[]>([]);
  const speechDraftRef = useRef('');
  const speechInterimRef = useRef('');
  const speechCommitTimerRef = useRef<number | null>(null);
  const inputCooldownUntilRef = useRef(0);
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const onUserSpeechCandidateRef = useRef<typeof onUserSpeechCandidate>(onUserSpeechCandidate);
  const liveSessionRef = useRef<any>(null);
  const liveInputContextRef = useRef<AudioContext | null>(null);
  const liveOutputContextRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveVideoIntervalRef = useRef<number | null>(null);
  const liveAudioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveNextStartTimeRef = useRef(0);
  const liveConnectionIdRef = useRef(0);
  const liveReadyRef = useRef(false);
  const liveFallbackTimerRef = useRef<number | null>(null);
  const nativeRecognitionHandlerRef = useRef<EventListener | null>(null);
  const startRecognitionFnRef = useRef<() => boolean>(() => false);
  const activeFamilyMemoryContextRef = useRef('');
  useEffect(() => {
    onUserSpeechCandidateRef.current = onUserSpeechCandidate;
  }, [onUserSpeechCandidate]);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const installedSkillsMap = useMemo(() => {
    const map = new Map<string, InstalledSkill>();
    for (const skill of installedSkills || []) {
      if (skill?.toolName) map.set(skill.toolName, skill);
      if (skill?.name) map.set(skill.name.toLowerCase(), skill);
    }
    return map;
  }, [installedSkills]);

  const installedSkillIntentDefinitions = useMemo<InstalledSkillIntentDefinition[]>(() => {
    return (installedSkills || []).map((skill) => {
      const packageSkill = (skill?.packageData as any)?.skill;
      const rawVars = packageSkill?.intentVariables ?? skill?.intentVariables ?? [];
      return {
        skill,
        variables: normalizeIntentVariables(rawVars),
      };
    });
  }, [installedSkills]);

  const installedSkillIntentPrompt = useMemo(() => {
    const lines: string[] = [];
    for (const item of installedSkillIntentDefinitions) {
      const skillName = String(item.skill?.name || '').trim();
      if (!skillName) continue;
      if (!item.variables.length) {
        lines.push(`- ${skillName}: no declared input variables.`);
        continue;
      }
      const defs = item.variables
        .map((variable) => {
          const req = variable.required ? 'required' : 'optional';
          const hint = variable.description ? ` - ${variable.description}` : '';
          return `${variable.name} (${req})${hint}`;
        })
        .join('; ');
      lines.push(`- ${skillName}: ${defs}`);
    }
    return lines.join('\n');
  }, [installedSkillIntentDefinitions]);

  const runVisionRecognition = useCallback(async (prompt?: string) => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is missing');
    }
    const snapshots = (await captureRecognitionSnapshots?.()) || [];
    const images = Array.isArray(snapshots) ? snapshots.filter((item) => typeof item === 'string' && item.startsWith('data:image')) : [];
    if (!images.length) {
      return { status: 'error', error: 'No camera snapshots available for recognition' };
    }

    const content: any[] = [
      {
        type: 'text',
        text: (prompt || 'Describe what you see from these snapshots clearly and briefly.').trim(),
      },
      ...images.slice(0, 4).map((url) => ({
        type: 'image_url',
        image_url: { url },
      })),
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: RECOGNITION_VISION_MODEL,
        messages: [{ role: 'user', content }],
        temperature: 0.3,
        max_completion_tokens: 450,
      }),
    });
    if (!response.ok) {
      throw new Error(`Vision recognition failed: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    const text =
      typeof payload?.choices?.[0]?.message?.content === 'string'
        ? payload.choices[0].message.content
        : Array.isArray(payload?.choices?.[0]?.message?.content)
          ? payload.choices[0].message.content.map((part: any) => String(part?.text || '')).join(' ')
          : '';

    return {
      status: 'ok',
      result: {
        snapshots: images.length,
        summary: text.trim(),
      },
    };
  }, [captureRecognitionSnapshots]);

  const clearTimers = useCallback(() => {
    if (followUpTimerRef.current) {
      window.clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (speechCommitTimerRef.current) {
      window.clearTimeout(speechCommitTimerRef.current);
      speechCommitTimerRef.current = null;
    }
    if (alarmTimersRef.current.length) {
      alarmTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      alarmTimersRef.current = [];
    }
    if (liveFallbackTimerRef.current) {
      window.clearTimeout(liveFallbackTimerRef.current);
      liveFallbackTimerRef.current = null;
    }
  }, []);

  const clearFollowUpTimer = useCallback(() => {
    if (followUpTimerRef.current) {
      window.clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
  }, []);

  const scheduleUserTurnTimeout = useCallback(() => {
    clearFollowUpTimer();
    followUpTimerRef.current = window.setTimeout(() => {
      if (!inFlightRef.current && activeRef.current && !inputSuspendedRef.current) {
        void disconnectRef.current();
      }
    }, FOLLOW_UP_WINDOW_MS);
  }, [clearFollowUpTimer]);

  const stopRecognition = useCallback(() => {
    shouldRecognizeRef.current = false;
    if (nativeRecognitionHandlerRef.current) {
      window.removeEventListener('airo-native-reply', nativeRecognitionHandlerRef.current);
      nativeRecognitionHandlerRef.current = null;
    }
    try {
      window.AiroAndroidBridge?.stopNativeReplyRecognition?.();
    } catch {}
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {}
    recognitionActiveRef.current = false;
  }, []);

  const cleanupLiveResources = useCallback(async () => {
    if (liveVideoIntervalRef.current) {
      window.clearInterval(liveVideoIntervalRef.current);
      liveVideoIntervalRef.current = null;
    }

    liveAudioSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    liveAudioSourcesRef.current.clear();
    liveNextStartTimeRef.current = 0;

    if (liveProcessorRef.current) {
      try {
        liveProcessorRef.current.disconnect();
      } catch {}
      liveProcessorRef.current = null;
    }

    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      liveStreamRef.current = null;
    }

    if (liveInputContextRef.current) {
      try {
        await liveInputContextRef.current.close();
      } catch {}
      liveInputContextRef.current = null;
    }

    if (liveOutputContextRef.current) {
      try {
        await liveOutputContextRef.current.close();
      } catch {}
      liveOutputContextRef.current = null;
    }

    const session = liveSessionRef.current;
    liveSessionRef.current = null;
    if (session) {
      try {
        session.close();
      } catch {}
    }
  }, []);

  const acquireLiveStream = useCallback(async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => window.setTimeout(resolve, 320));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Unable to acquire live audio stream');
  }, []);

  const suspendInput = useCallback(() => {
    inputSuspendedRef.current = true;
    speechDraftRef.current = '';
    speechInterimRef.current = '';
    clearTimers();
    stopRecognition();
  }, [clearTimers, stopRecognition]);

  const resumeInput = useCallback(() => {
    inputSuspendedRef.current = false;
    if (!activeRef.current) return;
    if (liveSessionRef.current) return;
    const restarted = startRecognitionFnRef.current();
    if (restarted) {
      setConnectionState(AppState.ACTIVE);
    }
  }, []);

  const playTts = useCallback(async (text: string) => {
    if (!text.trim()) return;
    ttsQueueRef.current = ttsQueueRef.current.then(async () => {
      setEyeEmotion(detectEmotionFromText(text));
      setIsAiSpeaking(true);
      stopRecognition();

      try {
        const plainText = text.replace(/\[[^\]]+\]/g, '').replace(/<[^>]+>/g, '').trim();
        if (!apiKey) {
          throw new Error('Gemini API key missing for TTS');
        }
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), FLOWERY_TTS_TIMEOUT_MS);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: [
                  'Read the transcript exactly as Airo, a warm, humble, friendly family robot.',
                  `Keep the delivery natural, clear, and slightly expressive in the ${GEMINI_TTS_VOICE_ID} voice.`,
                  'Do not add extra words.',
                  `Transcript: ${plainText || text}`,
                ].join(' '),
              }],
            }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: GEMINI_TTS_VOICE_ID,
                  },
                },
              },
            },
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`Gemini TTS failed (${response.status})`);
        }
        const payload = await response.json();
        const base64Audio = String(payload?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '');
        if (!base64Audio) {
          throw new Error('Gemini TTS returned no audio');
        }
        const blob = pcm16ToWavBlob(base64ToUint8Array(base64Audio), 24000, 1);
        const objectUrl = URL.createObjectURL(blob);

        let audio = audioRef.current;
        if (!audio) {
          audio = new Audio();
          audio.preload = 'auto';
          audio.playsInline = true;
          audioRef.current = audio;
        }
        const oldUrl = audio.src;
        audio.pause();
        audio.src = objectUrl;
        audio.currentTime = 0;
        audio.volume = 1;
        audio.playbackRate = lowPowerDevice ? 1.02 : 1;

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (oldUrl?.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(oldUrl);
              } catch {}
            }
            try {
              URL.revokeObjectURL(objectUrl);
            } catch {}
            resolve();
          };
          const failSafe = window.setTimeout(finish, lowPowerDevice ? 14000 : 11000);
          const finalize = () => {
            window.clearTimeout(failSafe);
            finish();
          };
          audio!.onended = finalize;
          audio!.onerror = finalize;
          audio!.onstalled = finalize;
          audio!.onabort = finalize;
          void audio!.play().catch(finalize);
        });
      } catch (error) {
        console.warn('Gemini TTS failed for assistant response', error);
      } finally {
        setIsAiSpeaking(false);
        setEyeEmotion('neutral');
        if (activeRef.current && !inputSuspendedRef.current) {
          const restarted = startRecognitionFnRef.current();
          if (restarted) {
            setConnectionState(AppState.ACTIVE);
          }
        }
      }
    });
    await ttsQueueRef.current;
  }, [apiKey, lowPowerDevice, stopRecognition]);

  const executeTool = useCallback(async (name: string, args: any) => {
    if (name === 'end_session' || name === 'exit_chat') {
      return { status: 'ok', result: 'Session ended' };
    }
    if (name === 'display_image') {
      setVisualContent({
        type: 'image',
        content: String(args?.url || ''),
        title: String(args?.caption || 'Image'),
      });
      return { status: 'ok', result: 'Image shown' };
    }
    if (name === 'close_visual') {
      if (musicTrackRef.current) {
        musicTrackRef.current = null;
      }
      setVisualContent(null);
      return { status: 'ok', result: 'Visual dismissed' };
    }
    if (name === 'render_widget') {
      const payload = {
        html: String(args?.html || ''),
        css: String(args?.css || ''),
        javascript: String(args?.javascript || ''),
      };
      setVisualContent({
        type: 'widget',
        content: `
<!doctype html>
<html><head><meta charset="utf-8"><style>body{margin:0;background:transparent;color:#fff;font-family:ui-sans-serif,system-ui}${payload.css}</style></head>
<body>${payload.html}<script>${payload.javascript}<\/script></body></html>`,
        title: String(args?.title || 'Widget'),
      });
      return { status: 'ok', result: 'Widget rendered' };
    }
    if (name === 'show_timer_widget') {
      setVisualContent({
        type: 'predefined',
        component: 'timer',
        content: args || {},
        title: String(args?.title || 'TIMER'),
      });
      return { status: 'ok', result: 'Timer widget shown' };
    }
    if (name === 'show_settings_widget') {
      setVisualContent({
        type: 'predefined',
        component: 'settings',
        content: args || {},
        title: String(args?.title || 'SETTINGS'),
      });
      return { status: 'ok', result: 'Settings widget shown' };
    }
    if (name === 'show_confirmation_widget') {
      setVisualContent({
        type: 'predefined',
        component: 'confirmation',
        content: args || {},
        title: String(args?.title || 'CONFIRM'),
      });
      return { status: 'ok', result: 'Confirmation shown' };
    }
    if (name === 'play_music') {
      const query = extractMusicQuery(String(args?.query || '')) || String(args?.query || '').trim();
      if (!query) {
        return { status: 'error', error: 'query is required' };
      }
      try {
        const response = await fetch('/tools/music-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!response.ok) {
          return { status: 'ok', result: { query, track: null, unavailable: true, reason: `music search failed (${response.status})` } };
        }
        const data = await response.json();
        const queue = Array.isArray(data?.items) ? data.items : [];
        const first = queue[0] || null;
        if (!first?.videoId) {
          return { status: 'ok', result: { query, track: null, unavailable: true, reason: 'no playable music result found' } };
        }
        const track: MusicTrackResult = {
          videoId: String(first.videoId),
          title: String(first.title || query),
          artist: String(first.artist || first.author || ''),
          author: String(first.author || first.artist || ''),
          lengthSeconds: Number(first.lengthSeconds || 0),
          lengthLabel: String(first.lengthLabel || ''),
          thumbnailUrl: String(first.thumbnailUrl || ''),
          watchUrl: String(first.watchUrl || ''),
          embedUrl: String(first.embedUrl || ''),
        };
        musicTrackRef.current = track;
        const volume = clampMusicVolume(args?.volume, musicVolumeRef.current);
        musicVolumeRef.current = volume;
        setVisualContent(buildMusicVisual({ ...track, queue, currentIndex: 0, isPaused: false }, volume, 'play'));
        return { status: 'ok', result: { query, track, queue, volume } };
      } catch (error) {
        return {
          status: 'ok',
          result: {
            query,
            track: null,
            unavailable: true,
            reason: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    if (name === 'pause_music') {
      if (!musicTrackRef.current) {
        return { status: 'error', error: 'no music is playing' };
      }
      setVisualContent(buildMusicVisual(musicTrackRef.current, musicVolumeRef.current, 'pause'));
      return { status: 'ok', result: { paused: true } };
    }
    if (name === 'resume_music') {
      if (!musicTrackRef.current) {
        return { status: 'error', error: 'no music is loaded' };
      }
      setVisualContent(buildMusicVisual(musicTrackRef.current, musicVolumeRef.current, 'resume'));
      return { status: 'ok', result: { resumed: true } };
    }
    if (name === 'set_music_volume') {
      if (!musicTrackRef.current) {
        return { status: 'error', error: 'no music is loaded' };
      }
      const nextVolume = clampMusicVolume(
        typeof args?.level === 'number'
          ? args.level
          : musicVolumeRef.current + Number(args?.delta || 0),
        musicVolumeRef.current
      );
      musicVolumeRef.current = nextVolume;
      setVisualContent(buildMusicVisual(musicTrackRef.current, nextVolume, 'setVolume'));
      return { status: 'ok', result: { volume: nextVolume } };
    }
    if (name === 'skip_music') {
      if (!musicTrackRef.current) {
        return { status: 'error', error: 'no music is loaded' };
      }
      return { status: 'ok', result: { skipped: true } };
    }
    if (name === 'dismiss_music') {
      musicTrackRef.current = null;
      setVisualContent(null);
      return { status: 'ok', result: { dismissed: true } };
    }
    if (name === 'turn_robot') {
      await turnLeftMotorByDegrees?.(Number(args?.degrees || 180));
      return { status: 'ok', result: 'Robot turned' };
    }
    if (name === 'face_user') {
      await faceUserWithSeek?.();
      return { status: 'ok', result: 'Facing user' };
    }
    if (name === 'move_robot') {
      await moveRobotExpressive?.(
        String(args?.direction || 'front'),
        Number(args?.intensity ?? 0.75),
        Number(args?.duration_ms ?? 700)
      );
      return { status: 'ok', result: 'Robot moved' };
    }
    if (name === 'turn_to_waypoint') {
      await turnToWaypoint?.(String(args?.waypoint || 'front'));
      return { status: 'ok', result: 'Turned to waypoint' };
    }
    if (name === 'capture_family_photo') {
      const result = await captureFamilyPhoto?.(args?.source === 'rear' ? 'rear' : 'front');
      if (!result) {
        return { status: 'error', error: 'family photo capture failed' };
      }
      return {
        status: 'ok',
        result: {
          captured: true,
          source: args?.source === 'rear' ? 'rear' : 'front',
        },
      };
    }
    if (name === 'capture_guided_family_photo') {
      const angleRaw = String(args?.angle || 'center').toLowerCase();
      const angle = angleRaw === 'left' || angleRaw === 'right' ? angleRaw : 'center';
      const result = await captureGuidedFamilyPhoto?.(angle);
      if (!result) {
        return { status: 'error', error: `guided family photo failed for ${angle}` };
      }
      return {
        status: 'ok',
        result: {
          captured: true,
          angle,
        },
      };
    }
    if (name === 'run_family_photo_sequence') {
      const result = await runFamilyPhotoSequence?.();
      if (!(result as any)?.ok) {
        return { status: 'error', error: String((result as any)?.error || 'family photo sequence failed') };
      }
      return { status: 'ok', result };
    }
    if (name === 'update_family_member_draft') {
      const result = await updateFamilyIntroductionDraft?.(args || {});
      return { status: 'ok', result };
    }
    if (name === 'save_family_member') {
      const result = await saveFamilyMember?.(args || {});
      return { status: 'ok', result };
    }
    if (name === 'take_photo_for_gallery') {
      const result = await takePhotoForGallery?.(args?.source === 'rear' ? 'rear' : 'front');
      return { status: 'ok', result };
    }
    if (name === 'run_skill') {
      const skillName = String(args?.skill || '').trim();
      if (!skillName) return { status: 'error', error: 'skill name missing' };
      const found = installedSkillsMap.get(skillName.toLowerCase()) || installedSkillsMap.get(skillName);
      if (!found) return { status: 'error', error: `skill not found: ${skillName}` };
      const runArg = found.toolName || found.name;
      const wasSuspended = inputSuspendedRef.current;
      suspendInput();
      let result: unknown;
      const intentInput =
        args?.input && typeof args.input === 'object' && !Array.isArray(args.input)
          ? args.input
          : args?.intentInput && typeof args.intentInput === 'object' && !Array.isArray(args.intentInput)
            ? args.intentInput
            : null;
      const intentText = String(args?.intentText || args?.query || args?.prompt || '');
      try {
        result = await runInstalledSkill?.(runArg || found, { intentInput, intentText });
      } finally {
        queueRef.current = [];
        speechDraftRef.current = '';
        speechInterimRef.current = '';
        inputCooldownUntilRef.current = Date.now() + 2800;
        if (!wasSuspended && activeRef.current) {
          resumeInput();
        }
      }
      return { status: 'ok', result: result || `ran ${found.name}` };
    }
    if (name === 'get_time') {
      const now = new Date();
      const spokenTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now);
      const displayTime = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(now);
      return {
        status: 'ok',
        result: {
          spokenTime,
          displayTime,
          timestamp: now.toISOString(),
        },
      };
    }
    if (name === 'calculate_math') {
      const expression = String(args?.expression || '').trim();
      if (!expression) {
        return { status: 'error', error: 'expression is required' };
      }
      if (!/^[0-9+\-*/().,%\s^]+$/.test(expression)) {
        return { status: 'error', error: 'expression contains unsupported characters' };
      }
      try {
        const normalized = expression.replace(/\^/g, '**');
        // eslint-disable-next-line no-new-func
        const value = new Function(`"use strict"; return (${normalized});`)();
        if (!Number.isFinite(Number(value))) {
          return { status: 'error', error: 'expression did not produce a finite number' };
        }
        return { status: 'ok', result: { expression, value: Number(value) } };
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (name === 'get_timer_status') {
      const snapshot = getTimerStatus?.();
      if (!snapshot || typeof snapshot !== 'object') {
        return { status: 'ok', result: { running: false, hasTimer: false, remainingSeconds: 0, title: 'Timer' } };
      }
      const data = snapshot as any;
      const remainingSeconds = Math.max(0, Number(data?.remainingSeconds) || 0);
      return {
        status: 'ok',
        result: {
          running: Boolean(data?.running) && remainingSeconds > 0,
          hasTimer: remainingSeconds > 0 || Boolean(data?.alarmRinging),
          alarmRinging: Boolean(data?.alarmRinging),
          remainingSeconds,
          title: String(data?.title || 'Timer'),
        },
      };
    }
    if (name === 'stop_timer') {
      stopCurrentTimer?.('Timer stopped by assistant');
      return { status: 'ok', result: { stopped: true } };
    }
    if (name === 'get_weather') {
      const explicitLat = Number(args?.latitude);
      const explicitLon = Number(args?.longitude);
      const hasExplicitCoords = Number.isFinite(explicitLat) && Number.isFinite(explicitLon);
      const query = String(args?.location || args?.city || '').trim();
      const fallbackCoords = parseLatLon(location);
      try {
        let latitude: number;
        let longitude: number;
        let place: any = null;

        if (hasExplicitCoords) {
          latitude = explicitLat;
          longitude = explicitLon;
        } else if (query) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
          );
          const geoJson = await geoRes.json();
          place = Array.isArray(geoJson?.results) ? geoJson.results[0] : null;
          if (!place) {
            return { status: 'error', error: `no weather location match for ${query}` };
          }
          latitude = Number(place.latitude);
          longitude = Number(place.longitude);
        } else if (fallbackCoords) {
          latitude = fallbackCoords.latitude;
          longitude = fallbackCoords.longitude;
        } else {
          return { status: 'error', error: 'location or coordinates are required' };
        }
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`
        );
        const weather = await weatherRes.json();
        return {
          status: 'ok',
          result: {
            location: {
              name: place?.name || (query || 'Current location'),
              admin1: place?.admin1 || '',
              country: place?.country || '',
              latitude,
              longitude,
            },
            current: weather?.current || null,
          },
        };
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (name === 'search_web') {
      const query = String(args?.query || '').trim();
      if (!query) {
        return { status: 'error', error: 'query is required' };
      }
      try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
          return { status: 'error', error: 'GROQ_API_KEY is missing' };
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_SEARCH_MODEL,
            messages: [
              {
                role: 'system',
                content: 'You are a web-enabled search assistant. Return short factual answers with up-to-date context when available.',
              },
              {
                role: 'user',
                content: query,
              },
            ],
            temperature: 0.2,
            max_completion_tokens: 450,
          }),
        });
        if (!response.ok) {
          return { status: 'error', error: `groq web search failed (${response.status})` };
        }
        const data = await response.json();
        const text =
          typeof data?.choices?.[0]?.message?.content === 'string'
            ? data.choices[0].message.content
            : Array.isArray(data?.choices?.[0]?.message?.content)
              ? data.choices[0].message.content.map((part: any) => String(part?.text || '')).join(' ')
              : '';
        return {
          status: 'ok',
          result: {
            query,
            abstract: text.trim(),
            abstractSource: 'Groq compound-mini',
            heading: 'Search result',
            topResults: [],
          },
        };
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (name === 'get_news') {
      const topic = String(args?.topic || 'top stories').trim();
      try {
        const response = await fetch('/tools/get-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic }),
        });
        if (!response.ok) {
          return { status: 'error', error: `get-news failed (${response.status})` };
        }
        const data = await response.json();
        return { status: 'ok', result: { topic, items: Array.isArray(data?.items) ? data.items : [] } };
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (name === 'get_sports_scores') {
      const query = String(args?.query || '').trim();
      const league = extractSportsLeague(String(args?.league || query || ''));
      const dateHint = String(args?.dateHint || extractSportsDateHint(query || String(args?.league || '')));
      const teams = Array.isArray(args?.teams) ? args.teams : extractSportsTeams(query);
      try {
        const response = await fetch('/tools/get-sports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ league, query, dateHint, teams }),
        });
        if (!response.ok) {
          return { status: 'error', error: `get-sports failed (${response.status})` };
        }
        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setVisualContent({
          type: 'predefined',
          component: 'sports',
          content: {
            league,
            title: data?.title || `${league.toUpperCase()} Scores`,
            items,
          },
          title: data?.title || `${league.toUpperCase()} Scores`,
        });
        return { status: 'ok', result: { league, items, title: data?.title || `${league.toUpperCase()} Scores`, query, dateHint } };
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (name === 'set_alarm') {
      const durationSeconds = Math.max(
        1,
        Number(args?.durationSeconds) || extractTimerSeconds(String(args?.time || args?.query || ''))
      );
      const title = String(args?.title || 'ALARM').trim() || 'ALARM';
      const timerId = window.setTimeout(() => {
        setVisualContent({
          type: 'predefined',
          component: 'number',
          content: {
            label: title,
            value: '⏰',
            subtitle: 'Alarm ringing now.',
          },
          title,
        });
        void playTts('[exhale] Alarm. Time is up.');
      }, durationSeconds * 1000);
      alarmTimersRef.current.push(timerId);
      setVisualContent({
        type: 'predefined',
        component: 'timer',
        content: {
          title,
          durationSeconds,
          totalSeconds: durationSeconds,
          remainingSeconds: durationSeconds,
          running: true,
        },
        title,
      });
      return { status: 'ok', result: { durationSeconds, title } };
    }
    if (name === 'recognize') {
      setEyeEmotion('recognize');
      try {
        return await runVisionRecognition(String(args?.prompt || ''));
      } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
      } finally {
        setEyeEmotion('neutral');
      }
    }
    return { status: 'error', error: `unknown tool: ${name}` };
  }, [
    buildMusicVisual,
    runVisionRecognition,
    location,
    captureFamilyPhoto,
    captureGuidedFamilyPhoto,
    runFamilyPhotoSequence,
    updateFamilyIntroductionDraft,
    faceUserWithSeek,
    installedSkillsMap,
    moveRobotExpressive,
    runInstalledSkill,
    getTimerStatus,
    saveFamilyMember,
    takePhotoForGallery,
    playTts,
    turnLeftMotorByDegrees,
    turnToWaypoint,
  ]);

  const groqTools: GroqTool[] = useMemo(
    () => [
      {
        type: 'function',
        function: {
          name: 'end_session',
          description: 'End the current voice session.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'exit_chat',
          description: 'Exit or end the current voice session cleanly.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'display_image',
          description: 'Display an image on screen.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              caption: { type: 'string' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'close_visual',
          description: 'Close current visual popup.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'show_confirmation_widget',
          description: 'Show yes/no confirmation UI.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              subtitle: { type: 'string' },
              confirmText: { type: 'string' },
              cancelText: { type: 'string' },
            },
            required: ['title'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'play_music',
          description: 'Search for a song, artist, soundtrack, or music video and play the best match on Airo’s screen.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'pause_music',
          description: 'Pause the current music playback.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'resume_music',
          description: 'Resume the current music playback.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_music_volume',
          description: 'Set or nudge the current music volume.',
          parameters: {
            type: 'object',
            properties: {
              level: { type: 'number' },
              delta: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'skip_music',
          description: 'Skip to the next queued music result.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'dismiss_music',
          description: 'Stop and dismiss the current music player from the screen.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'turn_robot',
          description: 'Turn robot by degrees.',
          parameters: {
            type: 'object',
            properties: { degrees: { type: 'number' } },
            required: ['degrees'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'face_user',
          description: 'Turn robot to face a visible user.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'move_robot',
          description: 'Move robot in a direction.',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'string' },
              intensity: { type: 'number' },
              duration_ms: { type: 'number' },
            },
            required: ['direction'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'turn_to_waypoint',
          description: 'Turn robot to one waypoint direction.',
          parameters: {
            type: 'object',
            properties: { waypoint: { type: 'string' } },
            required: ['waypoint'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'capture_guided_family_photo',
          description: 'Capture one guided family photo for onboarding. Use angle left, right, or center after the user says they are ready.',
          parameters: {
            type: 'object',
            properties: {
              angle: { type: 'string' },
            },
            required: ['angle'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_family_photo_sequence',
          description: 'Run the full left, right, center family onboarding photo sequence locally with spoken prompts and ready checks.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_family_member_draft',
          description: 'Store family onboarding details like name, birthday, notes, step, and status while the introduction is in progress.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              birthday: { type: 'string' },
              notes: { type: 'string' },
              status: { type: 'string' },
              step: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'save_family_member',
          description: 'Save a family member after onboarding using the three captured face photos and optional birthday and notes.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              birthday: { type: 'string' },
              birthdayMonthDay: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'take_photo_for_gallery',
          description: 'Take a photo using front or rear camera.',
          parameters: {
            type: 'object',
            properties: { source: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'run_skill',
          description: 'Run one installed Airo skill by name.',
          parameters: {
            type: 'object',
            properties: {
              skill: { type: 'string' },
              input: { type: 'object' },
              intentText: { type: 'string' },
            },
            required: ['skill'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_time',
          description: 'Get the current local date and time from system clock.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'calculate_math',
          description: 'Calculate a math expression such as "12*(3+4)" and return the numeric result.',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string' },
            },
            required: ['expression'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get current weather for a city or location name.',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for factual information and return top results.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_news',
          description: 'Get recent news headlines for a topic.',
          parameters: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
            },
            required: ['topic'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_sports_scores',
          description: 'Get live sports scores for a league and render sports score UI.',
          parameters: {
            type: 'object',
            properties: {
              league: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_timer_status',
          description: 'Get remaining time for the currently running timer or alarm.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_alarm',
          description: 'Set an alarm countdown and ring when time is up.',
          parameters: {
            type: 'object',
            properties: {
              durationSeconds: { type: 'number' },
              title: { type: 'string' },
              time: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'stop_timer',
          description: 'Stop, cancel, dismiss, or silence the active timer or alarm.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'recognize',
          description: 'Capture 4 recent camera snapshots and recognize what is visible.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
    ],
    []
  );

  const liveTools = useMemo(
    () => [
      {
        functionDeclarations: groqTools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
      },
    ],
    [groqTools]
  );

  const callGroq = useCallback(async () => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is missing');
    }
    const recentContext = buildRecentConversationContext(messagesRef.current);
    const memoryContext = String(activeFamilyMemoryContextRef.current || '').trim();
    const messages = [
      ...messagesRef.current,
      ...(memoryContext ? [{ role: 'system', content: memoryContext }] : []),
      ...(recentContext ? [{ role: 'system', content: recentContext }] : []),
    ];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: groqTools,
        tool_choice: 'auto',
        temperature: 0.5,
        max_completion_tokens: 700,
      }),
    });
    if (!response.ok) {
      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {}
      const code = parsed?.error?.code;
      const failedGeneration = parsed?.error?.failed_generation;
      if (response.status === 400 && code === 'tool_use_failed' && typeof failedGeneration === 'string' && failedGeneration.trim()) {
        throw new GroqToolUseFallbackError('Groq tool call failed, using failed_generation fallback', failedGeneration.trim());
      }
      throw new Error(`Groq request failed: ${response.status} ${rawText}`);
    }
    return response.json();
  }, [groqTools]);

  const callGroqTextOnly = useCallback(async () => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is missing');
    }
    const recentContext = buildRecentConversationContext(messagesRef.current);
    const memoryContext = String(activeFamilyMemoryContextRef.current || '').trim();
    const messages = [
      ...messagesRef.current,
      ...(memoryContext ? [{ role: 'system', content: memoryContext }] : []),
      ...(recentContext ? [{ role: 'system', content: recentContext }] : []),
    ];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.5,
        max_completion_tokens: 700,
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq text-only request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }, []);

  const callAnswerFallback = useCallback(async () => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is missing');
    }
    const recentContext = buildRecentConversationContext(messagesRef.current, 5);
    const memoryContext = String(activeFamilyMemoryContextRef.current || '').trim();
    const messages = [
      { role: 'system', content: buildAnswerOnlySystemPrompt() },
      ...(memoryContext ? [{ role: 'system', content: memoryContext }] : []),
      ...(recentContext ? [{ role: 'system', content: recentContext }] : []),
      ...messagesRef.current.filter((message) => message?.role !== 'system' || String(message?.content || '').includes('fresh external context')),
    ];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.45,
        max_completion_tokens: 450,
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq answer fallback failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }, []);

  const naturalizeStructuredReply = useCallback(async (text: string, userText: string) => {
    const raw = String(text || '').trim();
    if (!raw) return raw;
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) return raw;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          max_completion_tokens: 120,
          messages: [
            {
              role: 'system',
              content:
                'Rewrite the assistant reply so it sounds natural, concise, and spoken. Preserve all facts, numbers, and whether it invites a reply. Keep expressive tags like [exhale], [sigh], or [chuckle], but remove control tokens such as [reply] or [no-reply]. Return only the rewritten reply.',
            },
            {
              role: 'user',
              content: `User asked: ${userText}\nDraft reply: ${raw}`,
            },
          ],
        }),
      });
      if (!response.ok) return raw;
      const payload = await response.json();
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      return content || raw;
    } catch {
      return raw;
    }
  }, []);

  const callIntentModel = useCallback(async (userText: string): Promise<DirectIntentResult> => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return { A: '0' };
    }

    const systemPrompt = [
      'You are a robot intent classifier for voice commands.',
      'Airo is playful, curious, and distinctly robotic.',
      "If no listed skill fits the request, return 0 so the answer model can respond in Airo's personality.",
      'If the user is making a normal conversational comment or asking for opinions, return 0.',
      'If the user is asking for a web search, current facts, Google-style lookup, or anything time-sensitive, prefer the search tool over guessing.',
      'The user is asking a question via voice.',
      'Choose the single best action for what they most likely want next.',
      'Return JSON only with keys A and C.',
      'A must be exactly one of the listed action codes or "0".',
      'C is optional extra input such as timer duration, spin degrees, or a skill name.',
      'If the request does not match an action, return {"A":"0","C":""}.',
      'If the request is vague, choose the closest single action.',
      `Results:\n${DIRECT_INTENT_RESULTS}`,
      intentOutputContract?.trim()
        ? `User-defined output contract. You must follow it exactly:\n${intentOutputContract.trim()}`
        : '',
    ].join('\n');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: INTENT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `The user responded with: ${userText}` },
          ],
          temperature: 0.1,
          max_completion_tokens: 120,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        return { A: '0' };
      }
      const payload = await response.json();
      const content = String(payload?.choices?.[0]?.message?.content || '');
      return parseIntentJson(content);
    } catch {
      return { A: '0' };
    }
  }, [intentOutputContract]);

  const callToolIntentModel = useCallback(async (userText: string): Promise<ToolIntentResult> => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return { tool: 'none', args: {} };
    }

    const systemPrompt = [
      'You are a fast tool intent router for voice commands.',
      'Airo is playful, curious, and distinctly robotic.',
      'Pick the single best tool to run now.',
      'Return JSON only with: {"tool":"<tool_name_or_none>","args":{...}}.',
      'Use "none" if no tool should be run.',
      'Never return prose.',
      'If the user is asking a Google-like search question, current fact lookup, or anything that needs web results, choose search_web.',
      'If the user is chatting casually, giving opinions, or asking for personality, choose none so the answer model can speak naturally.',
      `Available tools:\n${TOOL_INTENT_RESULTS}`,
      'When tool is "run_skill", args must include: "skill" (skill name), "input" (object containing extracted variables), and "intentText" (the original command text).',
      intentOutputContract?.trim()
        ? `User-defined output contract. You must follow it exactly:\n${intentOutputContract.trim()}`
        : '',
    ].join('\n');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: INTENT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User command: ${userText}` },
          ],
          temperature: 0,
          max_completion_tokens: 120,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        return { tool: 'none', args: {} };
      }
      const payload = await response.json();
      const content = String(payload?.choices?.[0]?.message?.content || '');
      return parseToolIntentJson(content);
    } catch {
      return { tool: 'none', args: {} };
    }
  }, [intentOutputContract, installedSkillIntentPrompt]);

  const executeToolIntent = useCallback(async (toolIntent: ToolIntentResult, userText: string) => {
    const tool = toolIntent.tool;
    if (tool === 'none') return null;

    const baseArgs =
      toolIntent.args && typeof toolIntent.args === 'object' && !Array.isArray(toolIntent.args)
        ? { ...toolIntent.args }
        : {};

    if (tool === 'get_weather') {
      const loc = String(baseArgs.location || extractWeatherLocation(userText) || '').trim();
      if (!loc) return null;
      baseArgs.location = loc;
    }

    if (tool === 'get_news' && !baseArgs.topic) {
      baseArgs.topic = userText || 'top stories';
    }

    if (tool === 'get_sports_scores' && !baseArgs.league) {
      baseArgs.league = extractSportsLeague(userText);
    }

    if (tool === 'search_web' && !baseArgs.query) {
      baseArgs.query = userText;
    }

    if (tool === 'play_music' && !String(baseArgs.query || '').trim()) {
      baseArgs.query = extractMusicQuery(userText) || userText;
    } else if (tool === 'play_music') {
      baseArgs.query = extractMusicQuery(String(baseArgs.query || '')) || String(baseArgs.query || '');
    }

    if (tool === 'set_music_volume' && baseArgs.level == null && baseArgs.delta == null) {
      const volumeIntent = extractMusicVolumeChange(userText);
      if (volumeIntent?.level != null) {
        baseArgs.level = volumeIntent.level;
      } else if (volumeIntent?.delta != null) {
        baseArgs.delta = volumeIntent.delta;
      }
    }

    if (tool === 'show_timer_widget' && !baseArgs.durationSeconds) {
      baseArgs.durationSeconds = extractTimerSeconds(userText);
    }

    if (tool === 'set_alarm' && !baseArgs.durationSeconds) {
      baseArgs.durationSeconds = extractTimerSeconds(userText);
      if (!baseArgs.title) baseArgs.title = 'ALARM';
    }

    if (tool === 'calculate_math' && !String(baseArgs.expression || '').trim()) {
      baseArgs.expression = userText;
    }

    if (tool === 'run_skill') {
      const requestedSkill = String(baseArgs.skill || '').trim();
      if (!requestedSkill) {
        return null;
      }
      const foundSkill =
        installedSkillsMap.get(requestedSkill.toLowerCase()) ||
        installedSkillsMap.get(requestedSkill) ||
        null;
      if (foundSkill) {
        baseArgs.skill = foundSkill.toolName || foundSkill.name;
      }

      const definition =
        installedSkillIntentDefinitions.find((item) => {
          const toolName = String(item.skill?.toolName || '').trim();
          const skillName = String(item.skill?.name || '').trim().toLowerCase();
          return (
            requestedSkill.toLowerCase() === skillName ||
            requestedSkill === toolName ||
            requestedSkill.toLowerCase() === toolName.toLowerCase()
          );
        }) || null;

      const inputObject =
        baseArgs.input && typeof baseArgs.input === 'object' && !Array.isArray(baseArgs.input)
          ? { ...(baseArgs.input as Record<string, unknown>) }
          : {};

      if (definition?.variables?.length) {
        for (const variable of definition.variables) {
          const key = variable.name;
          const hasValue = inputObject[key] != null && String(inputObject[key]).trim() !== '';
          if (hasValue) continue;

          const normalizedKey = key.toLowerCase();
          let fallbackValue = '';
          if (normalizedKey.includes('location') || normalizedKey.includes('city') || normalizedKey.includes('place')) {
            fallbackValue = extractWeatherLocation(userText);
          } else if (normalizedKey.includes('topic') || normalizedKey.includes('query') || normalizedKey.includes('prompt')) {
            fallbackValue = userText;
          } else if (normalizedKey.includes('duration') || normalizedKey.includes('seconds') || normalizedKey.includes('timer')) {
            const seconds = extractTimerSeconds(userText);
            fallbackValue = seconds > 0 ? String(seconds) : '';
          }

          if (fallbackValue) {
            inputObject[key] = fallbackValue;
          } else if (variable.required && definition.variables.length === 1) {
            inputObject[key] = userText;
          }
        }
      }

      baseArgs.input = inputObject;
      if (!String(baseArgs.intentText || '').trim()) {
        baseArgs.intentText = userText;
      }
    }

    const result = await executeTool(tool, baseArgs);
    if (result?.status !== 'ok') return null;

    if (tool === 'end_session' || tool === 'exit_chat') {
      return { text: '[exhale] Okay, stopping now.', wantsReply: false, endNow: true };
    }
    if (tool === 'take_photo_for_gallery') {
      return { text: '', wantsReply: false, endNow: false };
    }
    if (tool === 'get_time') {
      const spokenTime = String(result?.result?.spokenTime || '').trim();
      const displayTime = String(result?.result?.displayTime || '').trim();
      return {
        text: spokenTime
          ? `[exhale] It is ${spokenTime}.`
          : `[exhale] It is ${displayTime || 'now'}.`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'calculate_math') {
      const payload = result?.result || {};
      return {
        text: `[exhale] ${String(payload.expression || 'That expression')} equals ${String(payload.value ?? 'unknown')}.`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'get_weather') {
      const current = result?.result?.current || {};
      const loc = result?.result?.location || {};
      return {
        text: `[exhale] Right now in ${loc.name || 'your area'}, it is ${current.temperature_2m ?? 'unknown'} degrees Celsius with humidity ${current.relative_humidity_2m ?? 'unknown'} percent.`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'get_news') {
      const items = Array.isArray(result?.result?.items) ? result.result.items : [];
      if (!items.length) {
        return {
          text: `[sigh] I could not fetch live headlines just now, but I can try a different search if you want.`,
          wantsReply: true,
          endNow: false,
        };
      }
      const lines = items.slice(0, 3).map((item: any, index: number) => {
        const title = String(item?.title || 'Unknown headline');
        const source = String(item?.source || 'unknown source');
        const summary = String(item?.summary || '').trim();
        return `${index === 0 ? 'First' : index === 1 ? 'Second' : 'Third'}: ${title} from ${source}${summary ? `, ${summary}` : ''}.`;
      });
      return {
        text: `[exhale] Here are the latest headlines. ${lines.join(' ')}`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'get_sports_scores') {
      const items = Array.isArray(result?.result?.items) ? result.result.items : [];
      const league = String(result?.result?.league || baseArgs.league || 'sports').toUpperCase();
      if (!items.length) {
        return { text: `[sigh] I could not find live ${league} scores right now.`, wantsReply: true, endNow: false };
      }
      return {
        text: summarizeSportsResult(items, String(baseArgs.query || ''), String(result?.result?.league || baseArgs.league || 'sports')),
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'set_alarm') {
      const seconds = Number(result?.result?.durationSeconds || baseArgs.durationSeconds || 0);
      return {
        text: `[exhale] Alarm set for ${formatTimerLabel(Math.max(1, seconds || 1))}.`,
        wantsReply: false,
        endNow: false,
      };
    }
    if (tool === 'play_music') {
      const track = result?.result?.track || {};
      if (!track?.videoId) {
        return {
          text: '[sigh] I could not get a playable song right now. Want me to try a different search?',
          wantsReply: true,
          endNow: false,
        };
      }
      const title = String(track?.title || baseArgs.query || 'that');
      const artist = String(track?.artist || track?.author || '').trim();
      return {
        text: artist
          ? `[exhale] Playing ${title} by ${artist}.`
          : `[exhale] Playing ${title}.`,
        wantsReply: false,
        endNow: false,
      };
    }
    if (tool === 'pause_music') {
      return { text: '[exhale] Pausing the music.', wantsReply: false, endNow: false };
    }
    if (tool === 'resume_music') {
      return { text: '[exhale] Music is back on.', wantsReply: false, endNow: false };
    }
    if (tool === 'set_music_volume') {
      const volume = Number(result?.result?.volume ?? baseArgs.level ?? 0);
      return { text: `[exhale] Volume at ${Math.max(0, Math.min(100, Math.round(volume)))} percent.`, wantsReply: false, endNow: false };
    }
    if (tool === 'skip_music') {
      return { text: '[exhale] Skipping this one.', wantsReply: false, endNow: false };
    }
    if (tool === 'dismiss_music') {
      return { text: '[exhale] Okay, closing the music player.', wantsReply: false, endNow: false };
    }
    if (tool === 'get_timer_status') {
      const remainingSeconds = Math.max(0, Number(result?.result?.remainingSeconds || 0));
      const running = Boolean(result?.result?.running);
      const alarmRinging = Boolean(result?.result?.alarmRinging);
      if (alarmRinging) {
        return { text: '[exhale] Your timer is ringing right now.', wantsReply: true, endNow: false };
      }
      if (!running || remainingSeconds <= 0) {
        return { text: '[exhale] You do not have an active timer right now. Want me to set one?', wantsReply: true, endNow: false };
      }
      return {
        text: `[exhale] You have ${formatTimerLabel(remainingSeconds)} left on your timer.`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'search_web') {
      const abstract = String(result?.result?.abstract || '').trim();
      return {
        text: abstract ? `[exhale] ${abstract}` : '[exhale] I checked that online and found fresh results.',
        wantsReply: true,
        endNow: false,
      };
    }
    if (tool === 'run_skill') {
      return { text: '', wantsReply: false, endNow: false };
    }
    if (tool === 'face_user') {
      return { text: '', wantsReply: false, endNow: false };
    }
    if (tool === 'turn_robot') {
      return { text: '', wantsReply: false, endNow: false };
    }
    if (tool === 'turn_to_waypoint') {
      return { text: '', wantsReply: false, endNow: false };
    }
    if (tool === 'move_robot') {
      return { text: '', wantsReply: false, endNow: false };
    }

    return { text: '[exhale] Done.', wantsReply: false, endNow: false };
  }, [executeTool, installedSkillsMap, installedSkillIntentDefinitions]);

  const runDirectPhotoFlow = useCallback(async (extra: string) => {
    await executeTool('take_photo_for_gallery', { source: /rear|back/i.test(extra) ? 'rear' : 'front' });
    return { text: '', wantsReply: false, endNow: false };
  }, [executeTool]);

  const runDirectWeatherFlow = useCallback(async (userText: string, extra: string) => {
    const weatherLocation = extra || extractWeatherLocation(userText);
    const weather = await executeTool('get_weather', weatherLocation ? { location: weatherLocation } : {});
    if (weather?.status !== 'ok' || !weather?.result?.current) {
      return { text: '[sigh] I could not get the weather right now.', wantsReply: true, endNow: false };
    }
    const current = weather.result.current || {};
    const loc = weather.result.location || {};
    const weatherClass = classifyWeatherCode(current.weather_code);
    if (weatherClass === 'rain') {
      showWeatherInfoOverlay?.({
        title: 'Raining',
        location: loc.name || 'Your Area',
        temperatureText: `${current.temperature_2m ?? 'Unknown'} C`,
        detailText: `Humidity ${current.relative_humidity_2m ?? 'unknown'} percent`,
        mediaUrl: WEATHER_RAIN_OVERLAY,
      });
      return {
        text: `[exhale] Right now in ${loc.name || 'your area'}, it is raining. The temperature is ${current.temperature_2m ?? 'unknown'} degrees Celsius and humidity is ${current.relative_humidity_2m ?? 'unknown'} percent.`,
        wantsReply: true,
        endNow: false,
      };
    }
    if (weatherClass === 'cloudy') {
      showWeatherInfoOverlay?.({
        title: 'Cloudy',
        location: loc.name || 'Your Area',
        temperatureText: `${current.temperature_2m ?? 'Unknown'} C`,
        detailText: `Humidity ${current.relative_humidity_2m ?? 'unknown'} percent`,
        mediaUrl: WEATHER_CLOUDY_OVERLAY,
      });
      return {
        text: `[exhale] Right now in ${loc.name || 'your area'}, it is cloudy. The temperature is ${current.temperature_2m ?? 'unknown'} degrees Celsius and humidity is ${current.relative_humidity_2m ?? 'unknown'} percent.`,
        wantsReply: true,
        endNow: false,
      };
    }
    return {
      text: `[exhale] Right now in ${loc.name || 'your area'}, it is ${current.temperature_2m ?? 'unknown'} degrees Celsius with humidity ${current.relative_humidity_2m ?? 'unknown'} percent.`,
      wantsReply: true,
      endNow: false,
    };
  }, [executeTool, showWeatherInfoOverlay]);

  const runDirectNewsFlow = useCallback(async (userText: string, extra: string) => {
    const news = await executeTool('get_news', { topic: extra || userText || 'top stories' });
    const items = Array.isArray(news?.result?.items) ? news.result.items : [];
    if (!items.length) {
      return { text: '[sigh] I could not get the news right now.', wantsReply: true, endNow: false };
    }
    const lines = items.slice(0, 3).map((item: any, index: number) => {
      const title = String(item?.title || 'Unknown headline');
      const source = String(item?.source || 'unknown source');
      return `${index === 0 ? 'First' : index === 1 ? 'Second' : 'Third'}, ${title}, from ${source}.`;
    });
    return { text: `[exhale] Here are the latest headlines. ${lines.join(' ')}`, wantsReply: true, endNow: false };
  }, [executeTool]);

  const runDirectSportsFlow = useCallback(async (userText: string, extra: string) => {
    const league = extractSportsLeague(extra || userText);
    const scores = await executeTool('get_sports_scores', {
      league,
      query: userText,
      dateHint: extractSportsDateHint(userText),
      teams: extractSportsTeams(userText),
    });
    const items = Array.isArray(scores?.result?.items) ? scores.result.items : [];
    if (!items.length) {
      return { text: `[sigh] I could not get ${league.toUpperCase()} scores right now.`, wantsReply: true, endNow: false };
    }
    return {
      text: summarizeSportsResult(items, userText, league),
      wantsReply: true,
      endNow: false,
    };
  }, [executeTool]);

  const runDirectTimerFlow = useCallback(async (userText: string, extra: string) => {
    const durationSeconds = extractTimerSeconds(extra || userText);
    await executeTool('show_timer_widget', { durationSeconds, title: 'TIMER' });
    return {
      text: `[exhale] Okay, I set a timer for ${formatTimerLabel(durationSeconds)}.`,
      wantsReply: false,
      endNow: false,
    };
  }, [executeTool]);

  const runDirectTimerStatusFlow = useCallback(async () => {
    const status = await executeTool('get_timer_status', {});
    const remainingSeconds = Math.max(0, Number(status?.result?.remainingSeconds || 0));
    const running = Boolean(status?.result?.running);
    const alarmRinging = Boolean(status?.result?.alarmRinging);
    if (alarmRinging) {
      return { text: '[exhale] Your timer is ringing right now.', wantsReply: true, endNow: false };
    }
    if (!running || remainingSeconds <= 0) {
      return { text: '[exhale] You do not have an active timer right now. Want me to set one?', wantsReply: true, endNow: false };
    }
    return {
      text: `[exhale] You have ${formatTimerLabel(remainingSeconds)} left on your timer.`,
      wantsReply: true,
      endNow: false,
    };
  }, [executeTool]);

  const runDirectAlarmFlow = useCallback(async (userText: string, extra: string) => {
    const durationSeconds = extractTimerSeconds(extra || userText);
    await executeTool('set_alarm', { durationSeconds, title: 'ALARM' });
    return {
      text: `[exhale] Alarm set for ${formatTimerLabel(durationSeconds)}.`,
      wantsReply: false,
      endNow: false,
    };
  }, [executeTool]);

  const runDirectStopTimerFlow = useCallback(async () => {
    await executeTool('stop_timer', {});
    return {
      text: '[exhale] Okay, I stopped the timer.',
      wantsReply: false,
      endNow: false,
    };
  }, [executeTool]);

  const executeDirectIntent = useCallback(async (intent: DirectIntentResult, userText: string) => {
    const action = intent.A || '0';
    const extra = String(intent.C || '').trim();

    if (action === '0') return null;

    if (action === 'take_photo') {
      return runDirectPhotoFlow(extra);
    }

    if (action === 'play_music') {
      const result = await executeTool('play_music', { query: extra || userText });
      const track = result?.result?.track || {};
      if (!track?.videoId) {
        return { text: '[sigh] I could not get a playable song right now. Want me to try another one?', wantsReply: true, endNow: false };
      }
      return {
        text: track?.artist
          ? `[exhale] Playing ${String(track.title || 'that song')} by ${String(track.artist)}.`
          : `[exhale] Playing ${String(track.title || 'that song')}.`,
        wantsReply: false,
        endNow: false,
      };
    }

    if (action === 'pause_music') {
      await executeTool('pause_music', {});
      return { text: '[exhale] Pausing the music.', wantsReply: false, endNow: false };
    }

    if (action === 'resume_music') {
      await executeTool('resume_music', {});
      return { text: '[exhale] Music is back on.', wantsReply: false, endNow: false };
    }

    if (action === 'skip_music') {
      await executeTool('skip_music', {});
      return { text: '[exhale] Skipping this one.', wantsReply: false, endNow: false };
    }

    if (action === 'dismiss_music') {
      await executeTool('dismiss_music', {});
      return { text: '[exhale] Okay, closing the music player.', wantsReply: false, endNow: false };
    }

    if (action === 'set_music_volume') {
      const volumeIntent = extractMusicVolumeChange(extra || userText) || {};
      const result = await executeTool('set_music_volume', volumeIntent);
      const volume = Number(result?.result?.volume ?? volumeIntent.level ?? 0);
      return { text: `[exhale] Volume at ${Math.max(0, Math.min(100, Math.round(volume)))} percent.`, wantsReply: false, endNow: false };
    }

    if (action === 'read_weather') {
      return runDirectWeatherFlow(userText, extra);
    }

    if (action === 'read_news') {
      return runDirectNewsFlow(userText, extra);
    }

    if (action === 'read_sports') {
      return runDirectSportsFlow(userText, extra);
    }

    if (action === 'timer_status') {
      return runDirectTimerStatusFlow();
    }

    if (action === 'set_timer') {
      return runDirectTimerFlow(userText, extra);
    }

    if (action === 'set_alarm') {
      return runDirectAlarmFlow(userText, extra);
    }

    if (action === 'stop_timer') {
      return runDirectStopTimerFlow();
    }

    if (action === 'face_user') {
      await executeTool('face_user', {});
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'turn_front') {
      await executeTool('turn_to_waypoint', { waypoint: 'front' });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'turn_left') {
      await executeTool('turn_to_waypoint', { waypoint: 'left' });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'turn_right') {
      await executeTool('turn_to_waypoint', { waypoint: 'right' });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'turn_behind') {
      await executeTool('turn_to_waypoint', { waypoint: 'behind' });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'spin_robot') {
      const degrees = extractSpinDegrees(extra || userText);
      await executeTool('turn_robot', { degrees });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'move_front') {
      await executeTool('move_robot', { direction: 'front', intensity: 0.8, duration_ms: 800 });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'move_behind') {
      await executeTool('move_robot', { direction: 'behind', intensity: 0.8, duration_ms: 800 });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'move_left') {
      await executeTool('move_robot', { direction: 'left', intensity: 0.8, duration_ms: 650 });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'move_right') {
      await executeTool('move_robot', { direction: 'right', intensity: 0.8, duration_ms: 650 });
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'run_skill') {
      if (!extra) {
        return { text: '[sigh] I need the skill name for that.', wantsReply: true, endNow: false };
      }
      const result = await executeTool('run_skill', { skill: extra });
      if (result?.status !== 'ok') {
        return { text: `[sigh] I could not find a skill called ${extra}.`, wantsReply: true, endNow: false };
      }
      return { text: '', wantsReply: false, endNow: false };
    }

    if (action === 'stop_session') {
      return { text: '[exhale] Okay, stopping now.', wantsReply: false, endNow: true };
    }

    return null;
  }, [executeTool, runDirectAlarmFlow, runDirectNewsFlow, runDirectPhotoFlow, runDirectSportsFlow, runDirectStopTimerFlow, runDirectTimerFlow, runDirectTimerStatusFlow, runDirectWeatherFlow]);

  const handleAssistantTurn = useCallback(async (userText: string) => {
    if (!activeRef.current) return;
    setIsThinking(true);
    messagesRef.current.push({ role: 'user', content: userText });
    activeFamilyMemoryContextRef.current = '';

    if (recognizedFamilyMember?.name && getRelevantFamilyMemories) {
      try {
        const memoryContext = await getRelevantFamilyMemories(userText);
        activeFamilyMemoryContextRef.current = String(memoryContext || '').trim();
      } catch (error) {
        console.warn('Failed to load relevant family memories', error);
      }
    }

    if (isAgeQuestion(userText)) {
      const aliveSeconds = Math.max(1, Math.round((Date.now() - aliveSinceRef.current) / 1000));
      const ageReply = `<soft>[chuckle] I have been awake for about ${formatTimerLabel(aliveSeconds)}. In robot years, I still feel very new.`;
      messagesRef.current.push({ role: 'assistant', content: ageReply });
      const parsed = parseAssistantText(ageReply);
      return { ...parsed, endNow: false };
    }

    if (isIdentityQuestion(userText)) {
      const freshRecognition = recognizedFamilyMember?.name
        ? recognizedFamilyMember
        : await recognizeCurrentFamilyMember?.();
      if (freshRecognition?.name) {
        showRecognizedFamilyAnimation?.(freshRecognition.livePhotoDataUrl || null);
      }
      const identityReply = freshRecognition?.name
        ? `<soft>[chuckle] You are ${freshRecognition.name}.${freshRecognition.notes ? ` I remember you as ${freshRecognition.notes}.` : ''}`
        : '<soft>[sigh] I do not know yet. Let me save your face in Family first, then I can tell you by name.';
      messagesRef.current.push({ role: 'assistant', content: identityReply });
      const parsed = parseAssistantText(identityReply);
      return { ...parsed, endNow: false };
    }

    try {
      const localIntent = detectDirectIntentLocally(userText);
      if (localIntent.A !== '0') {
        const directResult = await executeDirectIntent(localIntent, userText);
        if (directResult) {
          const nextText = directResult.text ? await naturalizeStructuredReply(directResult.text, userText) : '';
          const nextResult = { ...directResult, text: nextText };
          messagesRef.current.push({ role: 'assistant', content: nextResult.text || '' });
          return nextResult;
        }
      }
    } catch {}

    try {
      const toolIntent = await callToolIntentModel(userText);
      const toolResult = await executeToolIntent(toolIntent, userText);
      if (toolResult) {
        const informationalQuery = /\?|^\s*(what|who|when|where|why|how|tell me|explain|search|weather|news|time|date)\b/i.test(userText);
        if (!String(toolResult.text || '').trim() && informationalQuery) {
          // Do not let a silent tool route consume a real question.
        } else {
        const nextText = toolResult.text ? await naturalizeStructuredReply(toolResult.text, userText) : '';
        const nextResult = { ...toolResult, text: nextText };
        messagesRef.current.push({ role: 'assistant', content: nextResult.text || '' });
        return nextResult;
        }
      }
    } catch {}

    try {
      const intent = await callIntentModel(userText);
      const directResult = await executeDirectIntent(intent, userText);
      if (directResult) {
        const nextText = directResult.text ? await naturalizeStructuredReply(directResult.text, userText) : '';
        const nextResult = { ...directResult, text: nextText };
        messagesRef.current.push({ role: 'assistant', content: nextResult.text || '' });
        return nextResult;
      }
    } catch {}

    if (isTimeSensitiveQuery(userText)) {
      try {
        const nowStamp = new Date().toISOString();
        let freshContext = '';
        if (/\bnews\b/i.test(userText)) {
          const news = await executeTool('get_news', { topic: userText });
          freshContext = summarizeFreshContext('news', news);
        } else if (/\bweather\b/i.test(userText)) {
          const weatherLocation = extractWeatherLocation(userText);
          const weather = await executeTool('get_weather', weatherLocation ? { location: weatherLocation } : {});
          freshContext = summarizeFreshContext('weather', weather);
        } else {
          const web = await executeTool('search_web', { query: `As of ${nowStamp}, ${userText}` });
          freshContext = summarizeFreshContext('web', web);
        }
        if (freshContext) {
          messagesRef.current.push({
            role: 'system',
            content: `Use this fresh external context (timestamp ${nowStamp}) and answer directly:\n${freshContext}`,
          });
        }
      } catch {}
    }

    try {
      let lastToolSummary = '';
      setIsMainModelGenerating(true);
      for (let i = 0; i < 6; i += 1) {
        let payload: any;
        try {
          payload = await callGroq();
        } catch (error) {
          if (error instanceof GroqToolUseFallbackError) {
            const parsed = parseAssistantText(error.failedGeneration);
            messagesRef.current.push({ role: 'assistant', content: parsed.text || error.failedGeneration });
            return { ...parsed, endNow: false };
          }
          try {
            payload = await callGroqTextOnly();
          } catch {
            throw error;
          }
        }
        const message = payload?.choices?.[0]?.message;
        if (!message) throw new Error('No message returned from Groq');

        if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
          setIsProcessingTools(true);
          messagesRef.current.push({
            role: 'assistant',
            content: message.content || '',
            tool_calls: message.tool_calls,
          });

          for (const toolCall of message.tool_calls) {
            const toolName = String(toolCall?.function?.name || '');
            const args = safeJson(String(toolCall?.function?.arguments || '{}'));
            const result = await executeTool(toolName, args);
            if (result?.status === 'ok' && result?.result) {
              if (toolName === 'get_weather') {
                const current = result.result?.current || {};
                const loc = result.result?.location || {};
                lastToolSummary = `The weather in ${loc.name || 'your area'} is ${current.temperature_2m ?? 'unknown'}°C with humidity ${current.relative_humidity_2m ?? 'unknown'}%.`;
              } else if (toolName === 'get_news') {
                const first = Array.isArray(result.result?.items) ? result.result.items[0] : null;
                if (first?.title) {
                  lastToolSummary = `Top headline: ${first.title}. Source: ${first.source || 'unknown'}.`;
                }
              } else if (toolName === 'search_web') {
                const first = Array.isArray(result.result?.topResults) ? result.result.topResults[0] : null;
                if (first?.text) {
                  lastToolSummary = String(first.text);
                }
              }
            }

            if (toolName === 'run_skill' && result?.status === 'ok') {
              messagesRef.current.push({ role: 'assistant', content: '' });
              return { text: '', wantsReply: false, endNow: false };
            }
            messagesRef.current.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
            if (toolName === 'end_session' || toolName === 'exit_chat') {
              return { text: 'Okay, ending now.', wantsReply: false, endNow: true };
            }
          }
          continue;
        }

        const content =
          typeof message.content === 'string'
            ? message.content
            : Array.isArray(message.content)
              ? message.content.map((part: any) => String(part?.text || '')).join(' ')
              : '';
        messagesRef.current.push({ role: 'assistant', content });
        const parsed = parseAssistantText(content);
        return { ...parsed, endNow: false };
      }
      if (lastToolSummary) {
        const parsed = parseAssistantText(lastToolSummary);
        messagesRef.current.push({ role: 'assistant', content: parsed.text || lastToolSummary });
        return { ...parsed, endNow: false };
      }
      try {
        const fallback = await callGroqTextOnly();
        const message = fallback?.choices?.[0]?.message;
        const content =
          typeof message?.content === 'string'
            ? message.content
            : Array.isArray(message?.content)
              ? message.content.map((part: any) => String(part?.text || '')).join(' ')
              : '';
        if (content.trim()) {
          messagesRef.current.push({ role: 'assistant', content });
          const parsed = parseAssistantText(content);
          return { ...parsed, endNow: false };
        }
        const answerFallback = await callAnswerFallback();
        const answerMessage = answerFallback?.choices?.[0]?.message;
        const answerContent =
          typeof answerMessage?.content === 'string'
            ? answerMessage.content
            : Array.isArray(answerMessage?.content)
              ? answerMessage.content.map((part: any) => String(part?.text || '')).join(' ')
              : '';
        if (answerContent.trim()) {
          messagesRef.current.push({ role: 'assistant', content: answerContent });
          const parsed = parseAssistantText(answerContent);
          return { ...parsed, endNow: false };
        }
      } catch {}
      return { text: '[sigh] I hit a processing error. Please try that once more.', wantsReply: false, endNow: false };
    } finally {
      setIsMainModelGenerating(false);
      setIsThinking(false);
      setIsProcessingTools(false);
    }
  }, [callAnswerFallback, callGroq, callGroqTextOnly, callIntentModel, callToolIntentModel, executeDirectIntent, executeTool, executeToolIntent, getRelevantFamilyMemories, naturalizeStructuredReply, recognizeCurrentFamilyMember, recognizedFamilyMember, showRecognizedFamilyAnimation]);

  const processQueue = useCallback(async () => {
    if (inFlightRef.current || !activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    inFlightRef.current = true;
    clearTimers();

    try {
      const assistant = await handleAssistantTurn(next);
      if (!assistant) return;
      const spokenText = String(assistant.text || '').trim();

      if (assistant.endNow) {
        if (recognizedFamilyMember?.id && saveFamilyMemoryTurn) {
          void Promise.resolve(saveFamilyMemoryTurn({ userText: next, assistantText: spokenText, endNow: true })).catch((error) => {
            console.warn('Failed to persist family memory', error);
          });
        }
        if (assistant.text) {
          await playTts(assistant.text);
        }
        if (activeRef.current) {
          await disconnectRef.current();
        }
        return;
      }

      if (spokenText) {
        await playTts(spokenText);
      }

      if (recognizedFamilyMember?.id && saveFamilyMemoryTurn) {
        void Promise.resolve(saveFamilyMemoryTurn({ userText: next, assistantText: spokenText, endNow: false })).catch((error) => {
          console.warn('Failed to persist family memory', error);
        });
      }

      if (!activeRef.current) return;
      if (assistant.wantsReply) {
        scheduleUserTurnTimeout();
      }
    } catch (error) {
      console.error('Assistant turn failed', error);
      const message = error instanceof Error ? error.message : String(error);
      const recoverable =
        /GROQ_API_KEY is missing|Groq request failed|network|fetch|timeout|429|500|502|503|504/i.test(message);
      if (recoverable) {
        try {
          await playTts('[sigh] I hit a connection issue, but I am still online. Please try that again.');
        } catch {}
        if (activeRef.current) {
          scheduleUserTurnTimeout();
        }
      } else {
        setConnectionState(AppState.ERROR);
        window.setTimeout(() => {
          void disconnect();
        }, 700);
      }
    } finally {
      activeFamilyMemoryContextRef.current = '';
      inFlightRef.current = false;
      if (queueRef.current.length > 0 && activeRef.current) {
        void processQueue();
      }
    }
  }, [clearTimers, handleAssistantTurn, playTts, recognizedFamilyMember?.id, saveFamilyMemoryTurn, scheduleUserTurnTimeout]);

  const queueUserText = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized || !activeRef.current || inputSuspendedRef.current) return false;
      if (Date.now() < inputCooldownUntilRef.current) return false;
      clearTimers();
      userSpokeSinceConnectRef.current = true;
      queueRef.current.push(normalized);
      void processQueue();
      return true;
    },
    [clearTimers, processQueue]
  );

  const submitRecognizedText = useCallback((text: string) => {
    const normalized = String(text || '').trim();
    if (!normalized || !activeRef.current || inputSuspendedRef.current) return false;
    if (Date.now() < inputCooldownUntilRef.current) return false;
    clearTimers();
    userSpokeSinceConnectRef.current = true;
    const liveSession = liveSessionRef.current;
    if (liveSession && liveReadyRef.current) {
      try {
        liveSession.sendRealtimeInput({ text: normalized });
        return true;
      } catch (error) {
        console.error('Failed sending recognized text to Gemini Live', error);
      }
    }
    queueRef.current.push(normalized);
    void processQueue();
    return true;
  }, [clearTimers, processQueue]);

  const startRecognition = useCallback(() => {
    const nativeBridge = window.AiroAndroidBridge;
    if (nativeBridge?.startNativeReplyRecognition) {
      shouldRecognizeRef.current = true;
      if (!nativeRecognitionHandlerRef.current) {
        const handleNativeReply = ((event: Event) => {
          const detail = (event as CustomEvent<{ text?: string; isFinal?: boolean }>).detail || {};
          const text = String(detail.text || '').trim();
          if (!text) return;
          clearFollowUpTimer();
          if (detail.isFinal) {
            speechDraftRef.current += `${text} `;
          } else {
            speechInterimRef.current = text;
          }
          if (speechCommitTimerRef.current) {
            window.clearTimeout(speechCommitTimerRef.current);
          }
          speechCommitTimerRef.current = window.setTimeout(() => {
            const candidate = speechDraftRef.current.trim() || speechInterimRef.current.trim();
            speechDraftRef.current = '';
            speechInterimRef.current = '';
            speechCommitTimerRef.current = null;
            if (candidate) {
              const consumed = Boolean(onUserSpeechCandidateRef.current?.(candidate));
              if (consumed) return;
              submitRecognizedText(candidate);
            }
          }, SPEECH_COMMIT_SILENCE_MS);
        }) as EventListener;
        nativeRecognitionHandlerRef.current = handleNativeReply;
        window.addEventListener('airo-native-reply', handleNativeReply);
      }
      try {
        const result = nativeBridge.startNativeReplyRecognition();
        recognitionActiveRef.current = result === 'ok' || result === '' || result == null;
        return recognitionActiveRef.current;
      } catch {
        recognitionActiveRef.current = false;
        return false;
      }
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;

    if (!recognitionRef.current) {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        recognitionActiveRef.current = true;
      };
      recognition.onend = () => {
        recognitionActiveRef.current = false;
        if (shouldRecognizeRef.current && activeRef.current) {
          window.setTimeout(() => {
            if (!recognitionActiveRef.current && shouldRecognizeRef.current && activeRef.current) {
              try {
                recognition.start();
              } catch {}
            }
          }, 120);
        }
      };
      recognition.onerror = (event) => {
        if ((event as any)?.error === 'aborted') return;
        console.warn('Session speech recognition error', event);
      };
      recognition.onresult = (event) => {
        let sawSpeech = false;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) {
            speechDraftRef.current += `${result[0]?.transcript || ''} `;
            sawSpeech = true;
          } else {
            interim += `${result[0]?.transcript || ''} `;
            sawSpeech = true;
          }
        }
        speechInterimRef.current = interim.trim();

        if (!sawSpeech) return;
        clearFollowUpTimer();
        if (speechCommitTimerRef.current) {
          window.clearTimeout(speechCommitTimerRef.current);
        }
        speechCommitTimerRef.current = window.setTimeout(() => {
          const candidate = speechDraftRef.current.trim() || speechInterimRef.current.trim();
          speechDraftRef.current = '';
          speechInterimRef.current = '';
          speechCommitTimerRef.current = null;
            if (candidate) {
              const consumed = Boolean(onUserSpeechCandidateRef.current?.(candidate));
              if (consumed) return;
              submitRecognizedText(candidate);
            }
          }, SPEECH_COMMIT_SILENCE_MS);
      };
      recognitionRef.current = recognition;
    }

    shouldRecognizeRef.current = true;
    try {
      recognitionRef.current.start();
      return true;
    } catch {
      return false;
    }
  }, [clearFollowUpTimer, submitRecognizedText]);

  useEffect(() => {
    startRecognitionFnRef.current = startRecognition;
  }, [startRecognition]);

  const disconnect = useCallback(async () => {
    liveConnectionIdRef.current += 1;
    activeRef.current = false;
    inputSuspendedRef.current = false;
    queueRef.current = [];
    speechDraftRef.current = '';
    speechInterimRef.current = '';
    inFlightRef.current = false;
    clearTimers();
    stopRecognition();
    recognitionRef.current = null;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } catch {}
    await cleanupLiveResources();
    setIsAiSpeaking(false);
    setIsThinking(false);
    setIsProcessingTools(false);
    setIsMainModelGenerating(false);
    setEyeEmotion('neutral');
    setConnectionState(AppState.IDLE);
    onDisconnect();
  }, [cleanupLiveResources, clearTimers, onDisconnect, stopRecognition]);

  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  const connect = useCallback(
    async (_retryCount = 0, _initialAudio: Float32Array | null = null, options: SessionOptions = {}) => {
      if (connectionStateRef.current === AppState.ACTIVE || connectionStateRef.current === AppState.CONNECTING) {
        return;
      }
      if (!apiKey) {
        setConnectionState(AppState.ERROR);
        return;
      }

      const currentConnectionId = ++liveConnectionIdRef.current;
      const externalFirstTurn =
        Boolean(options.textOnlyFirstTurn) &&
        !String(options.initialPrompt || '').trim() &&
        !String(options.fallbackPromptAfterSilence || '').trim();
      liveReadyRef.current = false;
      setConnectionState(AppState.CONNECTING);
      activeRef.current = true;
      inputSuspendedRef.current = false;
      userSpokeSinceConnectRef.current = false;
      queueRef.current = [];
      clearTimers();
      stopRecognition();
      await cleanupLiveResources();
      if (!externalFirstTurn) {
        liveFallbackTimerRef.current = window.setTimeout(() => {
          if (
            currentConnectionId !== liveConnectionIdRef.current ||
            !activeRef.current ||
            liveReadyRef.current
          ) {
            return;
          }
          const localListeningReady = startRecognition();
          if (localListeningReady) {
            setConnectionState(AppState.ACTIVE);
          }
          liveFallbackTimerRef.current = null;
        }, 1800);
      }

      const systemPrompt = [
        AIRO_PERSONALITY_PROMPT,
        'If asked for current time or date, call get_time instead of guessing.',
        'If asked about weather, call get_weather before answering and use the returned data directly.',
        'If asked about current events or headlines, call get_news before answering.',
        'If asked for sports scores or game results, call get_sports_scores before answering.',
        'If asked to set an alarm, call set_alarm.',
        'If asked to stop, cancel, dismiss, or silence a timer or alarm, call stop_timer.',
        'If you need to end the chat or the user says to stop talking, call exit_chat.',
        'For factual lookups that can change over time, call search_web instead of relying on memory.',
        'For camera-based scene understanding, call recognize.',
        'Do not answer time sensitive facts from memory.',
      ].join(' ');

      const contextLines = [
        location ? `Approx location: ${location}.` : '',
        recognizedFamilyMember?.name ? `Recognized family member: ${recognizedFamilyMember.name}.` : '',
        recognizedFamilyMember?.notes ? `Family notes: ${recognizedFamilyMember.notes}.` : '',
        installedSkills && installedSkills.length
          ? `Installed skills: ${installedSkills.map((s) => s.name).join(', ')}.`
          : '',
        options.mode === 'family-onboarding' ? 'You are in family onboarding mode.' : '',
      ]
        .filter(Boolean)
        .join(' ');

      messagesRef.current = [
        { role: 'system', content: systemPrompt },
        ...(contextLines ? [{ role: 'system', content: contextLines }] : []),
      ];

      try {
        const ai = new GoogleGenAI({ apiKey });
        if (!isAndroidShell) {
          liveInputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: PCM_SAMPLE_RATE,
          });
        }
        liveOutputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });

        const streamPromise = isAndroidShell ? Promise.resolve<MediaStream | null>(null) : acquireLiveStream();

        const sessionPromise = ai.live.connect({
          model: GEMINI_LIVE_MAIN_MODEL,
          callbacks: {
            onopen: async () => {
              if (currentConnectionId !== liveConnectionIdRef.current) return;
              try {
                const stream = await streamPromise;
                if (stream && currentConnectionId !== liveConnectionIdRef.current) {
                  stream.getTracks().forEach((track) => {
                    try {
                      track.stop();
                    } catch {}
                  });
                  return;
                }

                if (stream) {
                  liveStreamRef.current = stream;
                }
                liveReadyRef.current = true;
                if (liveFallbackTimerRef.current) {
                  window.clearTimeout(liveFallbackTimerRef.current);
                  liveFallbackTimerRef.current = null;
                }
                setConnectionState(AppState.ACTIVE);
                if (!isAndroidShell) {
                  stopRecognition();
                } else if (!recognitionActiveRef.current && !externalFirstTurn) {
                  startRecognition();
                }

                const inputContext = liveInputContextRef.current;
                const outputContext = liveOutputContextRef.current;
                if (!outputContext) return;
                if (inputContext) {
                  await inputContext.resume().catch(() => {});
                }
                await outputContext.resume().catch(() => {});

                if (stream && inputContext) {
                  const audioSource = inputContext.createMediaStreamSource(stream);
                  const scriptProcessor = inputContext.createScriptProcessor(4096, 1, 1);
                  liveProcessorRef.current = scriptProcessor;
                  scriptProcessor.onaudioprocess = (event) => {
                    if (
                      currentConnectionId !== liveConnectionIdRef.current ||
                      connectionStateRef.current !== AppState.ACTIVE ||
                      inputSuspendedRef.current
                    ) {
                      return;
                    }
                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcmBlob = createPcmBlob(inputData);
                    sessionPromise.then((session: any) => {
                      try {
                        session.sendRealtimeInput({ audio: pcmBlob });
                      } catch {}
                    });
                  };
                  audioSource.connect(scriptProcessor);
                  scriptProcessor.connect(inputContext.destination);
                }

                const initialPrompt = options.initialPrompt?.trim();
                if (initialPrompt) {
                  userSpokeSinceConnectRef.current = true;
                  sessionPromise.then((session: any) => {
                    try {
                      session.sendRealtimeInput({ text: initialPrompt });
                    } catch {}
                  });
                } else {
                  const fallback = options.fallbackPromptAfterSilence?.trim();
                  if (fallback) {
                    fallbackTimerRef.current = window.setTimeout(() => {
                      if (
                        !activeRef.current ||
                        userSpokeSinceConnectRef.current ||
                        currentConnectionId !== liveConnectionIdRef.current
                      ) {
                        return;
                      }
                      sessionPromise.then((session: any) => {
                        try {
                          session.sendRealtimeInput({ text: fallback });
                        } catch {}
                      });
                    }, PRECONNECT_FALLBACK_MS);
                  }
                }
              } catch (error) {
                console.error('Gemini Live session setup failed', error);
                if (currentConnectionId === liveConnectionIdRef.current) {
                  void disconnectRef.current();
                }
              }
            },
            onmessage: async (message: any) => {
              if (currentConnectionId !== liveConnectionIdRef.current) return;

              if (message.serverContent?.inputTranscription?.text) {
                userSpokeSinceConnectRef.current = true;
                clearFollowUpTimer();
              }

              const parts = message.serverContent?.modelTurn?.parts || [];
              if (parts.length) {
                setIsMainModelGenerating(true);
                setEyeEmotion('neutral');
              }

              for (const part of parts) {
                if (!part?.inlineData?.data || !liveOutputContextRef.current) continue;
                try {
                  if (isAndroidShell) {
                    stopRecognition();
                  }
                  const outputContext = liveOutputContextRef.current;
                  liveNextStartTimeRef.current = Math.max(liveNextStartTimeRef.current, outputContext.currentTime);
                  const audioBuffer = await decodeAudioData(
                    base64ToUint8Array(part.inlineData.data),
                    outputContext,
                    24000,
                    1
                  );
                  const source = outputContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputContext.destination);
                  setIsAiSpeaking(true);
                  setIsThinking(false);
                  source.onended = () => {
                    liveAudioSourcesRef.current.delete(source);
                    if (liveAudioSourcesRef.current.size === 0) {
                      setIsAiSpeaking(false);
                    }
                  };
                  source.start(liveNextStartTimeRef.current);
                  liveAudioSourcesRef.current.add(source);
                  liveNextStartTimeRef.current += audioBuffer.duration;
                } catch (error) {
                  console.warn('Failed to play Gemini Live audio chunk', error);
                }
              }

              const functionCalls = message.toolCall?.functionCalls || [];
              if (functionCalls.length) {
                setIsProcessingTools(true);
                setIsThinking(true);
                const functionResponses: any[] = [];
                const session = await sessionPromise;
                for (const functionCall of functionCalls) {
                  const toolName = String(functionCall?.name || '');
                  const args = functionCall?.args || {};
                  if (!toolName) continue;
                  if (toolName === 'end_session' || toolName === 'exit_chat') {
                    functionResponses.push({
                      id: functionCall.id,
                      name: toolName,
                      response: { status: 'ok', result: 'Session ending' },
                    });
                    continue;
                  }
                  try {
                    const result = await executeTool(toolName, args);
                    functionResponses.push({
                      id: functionCall.id,
                      name: toolName,
                      response: result,
                    });
                  } catch (error) {
                    functionResponses.push({
                      id: functionCall.id,
                      name: toolName,
                      response: {
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error),
                      },
                    });
                  }
                }
                if (functionResponses.length) {
                  try {
                    session.sendToolResponse({ functionResponses });
                  } catch (error) {
                    console.error('Failed sending Gemini Live tool response', error);
                  }
                }
                setIsProcessingTools(false);
                setIsThinking(false);
                if (functionCalls.some((functionCall: any) => functionCall?.name === 'end_session' || functionCall?.name === 'exit_chat')) {
                  void disconnectRef.current();
                }
              }

              if (message.serverContent?.interrupted) {
                liveAudioSourcesRef.current.forEach((source) => {
                  try {
                    source.stop();
                  } catch {}
                });
                liveAudioSourcesRef.current.clear();
                liveNextStartTimeRef.current = 0;
                setIsAiSpeaking(false);
                setIsThinking(false);
              }

              if (message.serverContent?.turnComplete) {
                setIsMainModelGenerating(false);
                if (!message.toolCall?.functionCalls?.length) {
                  setIsThinking(false);
                }
                if (activeRef.current && isAndroidShell && !inputSuspendedRef.current) {
                  startRecognition();
                }
                if (activeRef.current) {
                  scheduleUserTurnTimeout();
                }
              }
            },
            onclose: () => {
              if (currentConnectionId === liveConnectionIdRef.current) {
                liveReadyRef.current = false;
                void cleanupLiveResources();
                if (activeRef.current) {
                  if (isAndroidShell) {
                    const localListeningReady = startRecognition();
                    setConnectionState(localListeningReady ? AppState.ACTIVE : AppState.CONNECTING);
                  } else if (!recognitionActiveRef.current) {
                    const localListeningReady = startRecognition();
                    setConnectionState(localListeningReady ? AppState.ACTIVE : AppState.CONNECTING);
                  } else {
                    setConnectionState(AppState.ACTIVE);
                  }
                }
              }
            },
            onerror: (error: any) => {
              console.error('Gemini Live connection error', error);
              if (currentConnectionId === liveConnectionIdRef.current) {
                liveReadyRef.current = false;
                void cleanupLiveResources();
                if (activeRef.current) {
                  if (isAndroidShell) {
                    const localListeningReady = startRecognition();
                    setConnectionState(localListeningReady ? AppState.ACTIVE : AppState.CONNECTING);
                  } else if (!recognitionActiveRef.current) {
                    const localListeningReady = startRecognition();
                    setConnectionState(localListeningReady ? AppState.ACTIVE : AppState.CONNECTING);
                  } else {
                    setConnectionState(AppState.ACTIVE);
                  }
                } else {
                  setConnectionState(AppState.ERROR);
                }
              }
            },
          },
          config: {
            responseModalities: [Modality.AUDIO],
            tools: liveTools,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: GEMINI_TTS_VOICE_ID,
                },
              },
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            systemInstruction: [systemPrompt, contextLines].filter(Boolean).join('\n'),
          },
        });

        liveSessionRef.current = await sessionPromise;
      } catch (error) {
        console.error('Failed to start Gemini Live session', error);
        liveReadyRef.current = false;
        if (activeRef.current) {
          const localListeningReady = startRecognition();
          setConnectionState(localListeningReady ? AppState.ACTIVE : AppState.CONNECTING);
        } else {
          setConnectionState(AppState.ERROR);
        }
      }
    },
    [
      acquireLiveStream,
      apiKey,
      cleanupLiveResources,
      clearFollowUpTimer,
      clearTimers,
      executeTool,
      installedSkills,
      isAndroidShell,
      liveTools,
      location,
      processQueue,
      recognizedFamilyMember?.name,
      recognizedFamilyMember?.notes,
      startRecognition,
      stopRecognition,
      scheduleUserTurnTimeout,
    ]
  );

  const sendTextMessage = useCallback(
    (text: string) => {
      if (connectionStateRef.current !== AppState.ACTIVE) return false;
      if (Date.now() < inputCooldownUntilRef.current || inputSuspendedRef.current) return false;
      const session = liveSessionRef.current;
      if (session) {
        clearTimers();
        userSpokeSinceConnectRef.current = true;
        try {
          session.sendRealtimeInput({ text });
          return true;
        } catch (error) {
          console.error('Failed sending Gemini Live text input', error);
          return false;
        }
      }
      return queueUserText(text);
    },
    [clearTimers, queueUserText]
  );

  useEffect(() => {
    return () => {
      void disconnectRef.current();
    };
  }, []);

  return {
    connect,
    disconnect,
    sendTextMessage,
    suspendInput,
    resumeInput,
    isAiSpeaking,
    isThinking,
    isProcessingTools,
    isMainModelGenerating,
    eyeEmotion,
    connectionState,
    visualContent,
    setVisualContent,
  };
};
