import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Info, QrCode, RefreshCw, Settings, Check, X } from 'lucide-react';

export const TimerWidget = ({ data }: { data: any }) => {
  const duration = data.durationSeconds || 300;
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>Bubbly Robot Timer</title>
  <style>
    :root{
      --bg:#000000;
      --text:#ffffff;
      --sub:rgba(255,255,255,0.78);

      --c1:#4de3ff;
      --c2:#8b7bff;
      --c3:#ff69c7;
      --c4:#7dff9b;
      --c5:#ffd84d;

      --glass:rgba(255,255,255,0.08);
      --glass-2:rgba(255,255,255,0.12);
      --stroke:rgba(255,255,255,0.10);
      --shadow:rgba(0,0,0,0.45);
    }

    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      font-family: "Arial", "Helvetica Neue", sans-serif;
      color: var(--text);
    }

    body {
      display: grid;
      place-items: center;
    }

    .screen {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: transparent;
    }

    .wrap {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 3vh;
    }

    .timer-shell {
      position: relative;
      width: min(82vw, 82vh);
      height: min(82vw, 82vh);
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 50% 30%, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 42%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.45) 78%),
        rgba(255,255,255,0.02);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,0.06),
        inset 0 18px 45px rgba(255,255,255,0.04),
        0 0 30px rgba(77,227,255,0.08),
        0 0 60px rgba(255,105,199,0.05);
      backdrop-filter: blur(14px);
      animation: shellPulse 5s ease-in-out infinite;
    }

    @keyframes shellPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.01); }
    }

    .inner {
      position: absolute;
      inset: 12%;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 8%;
      background:
        radial-gradient(circle at 50% 28%, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 38%, rgba(0,0,0,0.45) 76%),
        rgba(255,255,255,0.03);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,0.06),
        inset 0 16px 34px rgba(255,255,255,0.05);
      overflow: hidden;
    }

    .inner::before {
      content:"";
      position:absolute;
      width: 56%;
      height: 22%;
      top: 10%;
      border-radius: 999px;
      background: radial-gradient(circle at center, rgba(255,255,255,0.14), transparent 70%);
      filter: blur(12px);
      pointer-events:none;
    }

    .label {
      font-size: clamp(13px, 2vh, 20px);
      letter-spacing: 0.34em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.72);
      margin-bottom: 1.2vh;
      z-index: 2;
    }

    .time {
      font-size: clamp(52px, 11vh, 98px);
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.05em;
      text-shadow:
        0 0 12px rgba(255,255,255,0.08),
        0 0 22px rgba(77,227,255,0.10);
      font-variant-numeric: tabular-nums;
      z-index: 2;
      animation: idleBob 4s ease-in-out infinite;
    }

    @keyframes idleBob {
      0%,100% { transform: translateY(0px); }
      50% { transform: translateY(-2px); }
    }

    .status {
      margin-top: 1.6vh;
      min-height: 1.3em;
      font-size: clamp(13px, 2vh, 19px);
      color: var(--sub);
      z-index: 2;
    }

    .pulse-orb {
      margin-top: 1.8vh;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #fff, var(--c1) 35%, var(--c3) 100%);
      box-shadow:
        0 0 10px rgba(77,227,255,0.6),
        0 0 18px rgba(255,105,199,0.35);
      animation: orbPulse 1.8s ease-in-out infinite;
      z-index: 2;
    }

    @keyframes orbPulse {
      0%,100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.35); opacity: 1; }
    }

    .tap-bubble {
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle, rgba(255,255,255,0.35), rgba(255,255,255,0.08), transparent 70%);
      animation: tapPop 0.55s ease-out forwards;
      z-index: 20;
    }

    @keyframes tapPop {
      0% {
        transform: translate(-50%, -50%) scale(0.2);
        opacity: 0.9;
      }
      100% {
        transform: translate(-50%, -50%) scale(2.8);
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <div class="screen" id="screen">
    <div class="wrap">
      <div class="timer-shell" id="timerShell">
        <div class="inner">
          <div class="label">${data.title || 'Timer'}</div>
          <div class="time" id="time">00:00</div>
          <div class="status" id="status">Ready</div>
          <div class="pulse-orb"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const timeEl = document.getElementById("time");
    const statusEl = document.getElementById("status");
    const timerShell = document.getElementById("timerShell");
    const screen = document.getElementById("screen");

    let totalSeconds = ${data.totalSeconds !== undefined ? data.totalSeconds : duration};
    let remainingSeconds = ${data.remainingSeconds !== undefined ? data.remainingSeconds : duration};
    let running = ${data.running !== undefined ? (data.running ? 'true' : 'false') : 'true'};
    let alarmRinging = ${data.alarmRinging !== undefined ? (data.alarmRinging ? 'true' : 'false') : 'false'};
    let timer = null;

    function syncWithParent() {
      window.parent.postMessage({
        action: 'syncTimer',
        payload: {
          totalSeconds,
          remainingSeconds,
          running,
          alarmRinging,
          title: '${data.title || 'Timer'}'
        }
      }, '*');
    }

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return \`\${String(mins).padStart(2, "0")}:\${String(secs).padStart(2, "0")}\`;
    }

    function updateUI() {
      timeEl.textContent = formatTime(remainingSeconds);

      if (remainingSeconds <= 0) {
        statusEl.textContent = alarmRinging ? "Tap to stop" : "Finished";
      } else if (running) {
        statusEl.textContent = "Running";
      } else if (remainingSeconds === totalSeconds) {
        statusEl.textContent = "Ready";
      } else {
        statusEl.textContent = "Paused";
      }
    }

    function startTimer() {
      if (running || remainingSeconds <= 0) return;

      running = true;
      alarmRinging = false;
      updateUI();
      syncWithParent();

      timer = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
          remainingSeconds = 0;
          stopTimer(false);
          alarmRinging = true;
          updateUI();
          finishEffects();
          syncWithParent();
          return;
        }

        updateUI();
        syncWithParent();
      }, 1000);
    }

    function stopTimer(resetButtonText = true) {
      running = false;
      clearInterval(timer);
      timer = null;
      if (resetButtonText) updateUI();
      syncWithParent();
    }

    function resetTimer() {
      stopTimer(false);
      remainingSeconds = totalSeconds;
      alarmRinging = false;
      updateUI();
      syncWithParent();
    }

    function finishEffects() {
      timerShell.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.04)", filter: "brightness(1.25)" },
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.05)", filter: "brightness(1.3)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ],
        {
          duration: 1400,
          easing: "ease-in-out"
        }
      );

      beepSequence();
      makeCelebrationBubbles();
    }

    function makeCelebrationBubbles() {
      for (let i = 0; i < 8; i++) {
        const b = document.createElement("div");
        b.className = "tap-bubble";
        b.style.left = \`\${35 + Math.random() * 30}%\`;
        b.style.top = \`\${35 + Math.random() * 30}%\`;
        const size = 40 + Math.random() * 80;
        b.style.width = \`\${size}px\`;
        b.style.height = \`\${size}px\`;
        screen.appendChild(b);
        setTimeout(() => b.remove(), 600);
      }
    }

    // Simple Web Audio beep sequence
    function beepSequence() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();

      const notes = [
        { freq: 880, time: 0.00, dur: 0.14 },
        { freq: 1174, time: 0.18, dur: 0.14 },
        { freq: 1568, time: 0.36, dur: 0.22 }
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.value = note.freq;

        gain.gain.setValueAtTime(0.0001, ctx.currentTime + note.time);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + note.time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note.time + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + note.time);
        osc.stop(ctx.currentTime + note.time + note.dur + 0.03);
      });
    }

    // Swipe down to close
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    });
    document.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - touchStartY > 50) {
        window.parent.postMessage({ action: 'close' }, '*');
      }
    });

    function requestStopIfNeeded() {
      if (!alarmRinging && remainingSeconds > 0) return;
      alarmRinging = false;
      running = false;
      clearInterval(timer);
      timer = null;
      syncWithParent();
      window.parent.postMessage({ action: 'stopTimer' }, '*');
    }

    screen.addEventListener('click', requestStopIfNeeded);
    screen.addEventListener('touchend', requestStopIfNeeded);

    updateUI();
    if (running) {
      running = false;
      startTimer();
    } else {
      syncWithParent();
    }
  </script>
</body>
</html>
  `;

  return (
    <iframe
      title="Timer Widget"
      srcDoc={htmlContent}
      className="absolute inset-0 w-full h-full border-none bg-transparent"
    />
  );
};

export const SettingsWidget = ({ data }: { data: any }) => {
  const getIcon = (name: string) => {
    switch (name?.toLowerCase()) {
      case 'info': return <Info size={48} />;
      case 'qr': return <QrCode size={48} />;
      case 'sync': return <RefreshCw size={48} />;
      default: return <Settings size={48} />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black text-white p-4 sm:p-8 min-h-[280px]">
      <h2 className="text-2xl sm:text-4xl font-bold mb-6 sm:mb-12 tracking-wide text-center">{data.title || 'Settings'}</h2>
      <div className="flex flex-row gap-5 sm:gap-8 overflow-x-auto pb-4 sm:pb-8 px-2 sm:px-4 max-w-full">
        {(data.options || []).map((opt: any) => (
          <div key={opt.id} className="flex flex-col items-center gap-3 shrink-0">
            <button className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.2),transparent_42%),linear-gradient(to_bottom,#7c8493,#2d333d)] flex items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.45)] hover:scale-105 transition-transform border border-white/10">
              <div className="text-white drop-shadow-lg scale-90 sm:scale-100">
                {getIcon(opt.icon)}
              </div>
            </button>
            <span className="text-sm sm:text-lg font-medium text-center">{opt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ConfirmationWidget = ({
  data,
  onAnswer,
}: {
  data: any;
  onAnswer?: (answer: string) => void;
}) => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black text-white px-4 py-6 sm:p-8 min-h-[280px]">
      <h2 className="text-2xl sm:text-4xl font-bold text-orange-400 mb-2 text-center">{data.title || 'Confirm?'}</h2>
      <p className="text-base sm:text-xl text-gray-300 mb-6 sm:mb-12 text-center max-w-2xl">{data.subtitle || ''}</p>
      <div className="flex flex-row gap-6 sm:gap-12 items-start">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <button
            onClick={() => onAnswer?.(data.confirmText || 'Yes')}
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.26),transparent_38%),linear-gradient(to_bottom,#b6ff67,#2ca745)] flex items-center justify-center shadow-[0_20px_40px_rgba(15,118,36,0.35)] hover:scale-105 transition-transform border border-white/15"
          >
            <Check size={52} className="text-white drop-shadow-lg sm:w-16 sm:h-16" />
          </button>
          <span className="text-base sm:text-lg font-medium">{data.confirmText || 'Yes'}</span>
        </div>
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <button
            onClick={() => onAnswer?.(data.cancelText || 'No')}
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.22),transparent_38%),linear-gradient(to_bottom,#ff8a72,#d53a31)] flex items-center justify-center shadow-[0_20px_40px_rgba(127,29,29,0.35)] hover:scale-105 transition-transform border border-white/15"
          >
            <X size={52} className="text-white drop-shadow-lg sm:w-16 sm:h-16" />
          </button>
          <span className="text-base sm:text-lg font-medium">{data.cancelText || 'No'}</span>
        </div>
      </div>
    </div>
  );
};

export const NumberWidget = ({ data }: { data: any }) => {
  const value = data?.value ?? '';
  const label = data?.label || data?.title || 'Number';
  const subtitle = data?.subtitle || '';

  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-6 py-8 text-white">
      <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-[2.25rem] border border-white/10 bg-white/[0.04] px-8 py-12 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div className="font-mono text-xs uppercase tracking-[0.35em] text-white/45">{label}</div>
        <div className="mt-6 text-[8rem] font-black leading-none tracking-[-0.06em] text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.18)] sm:text-[10rem]">
          {String(value)}
        </div>
        {subtitle ? (
          <div className="mt-5 max-w-xl text-center text-base text-white/75 sm:text-xl">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
};

export const UiCardWidget = ({ data }: { data: any }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const theme = String(data?.theme || 'info').toLowerCase();
  const title = data?.title || 'Airo';
  const subtitle = data?.subtitle || '';
  const body = data?.body || '';
  const imageUrl = String(data?.imageUrl || '').trim();
  const hasValidImage =
    !imageFailed &&
    Boolean(imageUrl) &&
    (/^data:image\//i.test(imageUrl) ||
      /^https?:\/\//i.test(imageUrl) ||
      /^blob:/i.test(imageUrl) ||
      imageUrl.startsWith('/'));

  if (theme === 'photo') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        {hasValidImage ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black text-white/55">
            <div className="text-center">
              <div className="font-mono text-xs uppercase tracking-[0.35em]">Photo Preview</div>
              <div className="mt-3 text-sm">No image available</div>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-6">
          <div className="text-2xl font-semibold text-white sm:text-3xl">{title}</div>
          {subtitle ? <div className="mt-1 text-white/75 sm:text-lg">{subtitle}</div> : null}
        </div>
      </div>
    );
  }
  const accentMap: Record<string, string> = {
    info: 'from-cyan-400 to-sky-500',
    success: 'from-emerald-400 to-lime-400',
    warning: 'from-amber-300 to-orange-500',
    danger: 'from-rose-400 to-red-500',
    photo: 'from-fuchsia-400 to-cyan-400',
  };
  const accent = accentMap[theme] || accentMap.info;

  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-6 py-8 text-white">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_35%),rgba(255,255,255,0.04)] px-8 py-10 shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`} />
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/45">{theme}</div>
        <div className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">{title}</div>
        {subtitle ? (
          <div className="mt-3 text-lg text-white/70 sm:text-2xl">{subtitle}</div>
        ) : null}
        {hasValidImage ? (
          <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/40">
            <img
              src={imageUrl}
              alt={title}
              className="h-64 w-full object-cover sm:h-80"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : null}
        {body ? (
          <div className="mt-6 text-base leading-relaxed text-white/80 sm:text-xl">{body}</div>
        ) : null}
        {Array.isArray(data?.chips) && data.chips.length ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {data.chips.map((chip: string, index: number) => (
              <div
                key={`${chip}-${index}`}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-white/70"
              >
                {chip}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const SportsScoresWidget = ({ data }: { data: any }) => {
  const league = String(data?.league || 'sports').toUpperCase();
  const title = String(data?.title || `${league} Scores`);
  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-5 py-7 text-white sm:px-8">
      <div className="flex h-full max-h-[78vh] w-full max-w-4xl flex-col rounded-[2rem] border border-cyan-300/20 bg-gradient-to-b from-cyan-500/10 via-sky-500/5 to-transparent p-5 shadow-[0_30px_80px_rgba(6,182,212,0.12)] sm:p-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">{league}</div>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
        <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
          {items.length ? (
            items.map((game: any, index: number) => (
              <div key={`${game?.id || index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm sm:text-lg">
                  <div className="font-semibold text-white">{String(game?.away || 'Away')}</div>
                  <div className="font-mono text-cyan-100/85">{String(game?.score || 'vs')}</div>
                  <div className="font-semibold text-white">{String(game?.home || 'Home')}</div>
                </div>
                <div className="mt-1 text-xs text-white/55 sm:text-sm">{String(game?.status || '')}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/70">
              No live scores available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string | HTMLElement, options: Record<string, unknown>) => any;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<any> | null = null;

const loadYoutubeIframeApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }
  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-airo-youtube-api="true"]') as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.airoYoutubeApi = 'true';
      document.head.appendChild(script);
    }
    const timeoutId = window.setTimeout(() => reject(new Error('YouTube API timed out')), 15000);
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      previousReady?.();
      resolve(window.YT);
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('YouTube API failed to load'));
    };
  });
  return youtubeIframeApiPromise;
};

export const PersistentMusicController = ({ data }: { data: any }) => {
  const mountId = useMemo(() => `airo-music-${Math.random().toString(36).slice(2, 10)}`, []);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const videoId = String(data?.queue?.[data?.currentIndex || 0]?.videoId || data?.videoId || '').trim();

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    let localPlayer: any = null;

    void loadYoutubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        localPlayer = new YT.Player(mountId, {
          videoId,
          width: '1',
          height: '1',
          playerVars: {
            autoplay: 1,
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              playerRef.current = event.target;
              event.target.setVolume(Math.max(0, Math.min(100, Number(data?.volume ?? 65))));
              if (data?.isPaused) {
                event.target.pauseVideo?.();
              } else {
                event.target.playVideo?.();
              }
              setIsReady(true);
            },
            onStateChange: (event: any) => {
              const endedState = window.YT?.PlayerState?.ENDED;
              if (Number(event?.data) === endedState) {
                window.dispatchEvent(new CustomEvent('airo-music-ended'));
              }
            },
          },
        });
      })
      .catch((error) => {
        console.warn('Persistent music controller failed to load', error);
      });

    return () => {
      cancelled = true;
      try {
        localPlayer?.destroy?.();
      } catch {}
      if (playerRef.current === localPlayer) {
        playerRef.current = null;
      }
      setIsReady(false);
    };
  }, [mountId, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;
    try {
      player.setVolume?.(Math.max(0, Math.min(100, Number(data?.volume ?? 65))));
      if (data?.action === 'pause' || data?.isPaused) {
        player.pauseVideo?.();
      } else if (data?.action === 'resume' || data?.action === 'play' || !data?.isPaused) {
        player.playVideo?.();
      }
      if (data?.action === 'stop') {
        player.stopVideo?.();
      }
    } catch (error) {
      console.warn('Persistent music controller action failed', error);
    }
  }, [data?.actionId, data?.action, data?.volume, data?.isPaused, isReady]);

  return <div id={mountId} className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" />;
};

export const MusicPlayerWidget = ({ data }: { data: any }) => {
  const [isPaused, setIsPaused] = useState(Boolean(data?.isPaused));
  const [currentVolume, setCurrentVolume] = useState(Math.max(0, Math.min(100, Number(data?.volume ?? 65))));
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const track = queue[data?.currentIndex || 0] || data;
  const title = String(track?.title || 'Music').trim();
  const artist = String(track?.artist || '').trim();
  const subtitle = artist ? `${artist}${track?.lengthLabel ? ` • ${String(track.lengthLabel)}` : ''}` : String(track?.lengthLabel || '');
  const thumbnailUrl = String(track?.thumbnailUrl || '').trim();

  useEffect(() => {
    setCurrentVolume(Math.max(0, Math.min(100, Number(data?.volume ?? 65))));
    setIsPaused(Boolean(data?.isPaused));
  }, [data?.volume, data?.isPaused, data?.currentIndex]);

  const adjustVolume = (delta: number) => {
    const nextVolume = Math.max(0, Math.min(100, currentVolume + delta));
    setCurrentVolume(nextVolume);
    window.parent.postMessage({ action: 'musicVolume', payload: { delta } }, '*');
  };

  const togglePause = () => {
    window.parent.postMessage({ action: isPaused ? 'resumeMusic' : 'pauseMusic' }, '*');
    setIsPaused((prev) => !prev);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black text-white">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover opacity-35 blur-2xl scale-110"
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_30%),linear-gradient(to_bottom,rgba(0,0,0,0.08),rgba(0,0,0,0.85))]" />
      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col items-center justify-center px-6 py-20">
        <div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_35px_120px_rgba(0,0,0,0.6)]">
          <div className="aspect-video w-full bg-black relative overflow-hidden">
            {thumbnailUrl ? <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover opacity-80" /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-black/35 text-5xl shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                {isPaused ? '▶' : '♪'}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/45">Now Playing</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">{title}</div>
              {subtitle ? <div className="mt-2 text-sm text-white/70 sm:text-lg">{subtitle}</div> : null}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => adjustVolume(-10)}
                className="h-16 w-16 rounded-full border border-white/15 bg-white/10 text-2xl transition hover:bg-white/15"
              >
                -
              </button>
              <button
                onClick={togglePause}
                className="min-w-[9rem] rounded-full border border-cyan-300/25 bg-cyan-400/15 px-6 py-4 font-semibold text-white transition hover:bg-cyan-400/25"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={() => window.parent.postMessage({ action: 'skipMusic' }, '*')}
                className="min-w-[9rem] rounded-full border border-white/15 bg-white/10 px-6 py-4 font-semibold text-white transition hover:bg-white/15"
              >
                Skip
              </button>
              <button
                onClick={() => adjustVolume(10)}
                className="h-16 w-16 rounded-full border border-white/15 bg-white/10 text-2xl transition hover:bg-white/15"
              >
                +
              </button>
              <button
                onClick={() => window.parent.postMessage({ action: 'dismissMusic' }, '*')}
                className="rounded-full border border-white/15 bg-white/10 px-6 py-4 font-semibold text-white transition hover:bg-white/15"
              >
                Dismiss
              </button>
            </div>
            <div className="mx-auto w-full max-w-xl">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-white/45">
                <span>Volume</span>
                <span>{currentVolume}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-400 transition-all"
                  style={{ width: `${currentVolume}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

type EyeKeyframe = {
  at: number;
  left?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    roundness?: number;
    rotateDeg?: number;
    fillMode?: 'color' | 'gradient' | 'media';
    gradientFrom?: string;
    gradientTo?: string;
    mediaUrl?: string;
    shape?: {
      points: Array<{
        x: number;
        y: number;
        inX: number;
        inY: number;
        outX: number;
        outY: number;
      }>;
    };
  };
  right?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: string;
    roundness?: number;
    rotateDeg?: number;
    fillMode?: 'color' | 'gradient' | 'media';
    gradientFrom?: string;
    gradientTo?: string;
    mediaUrl?: string;
    shape?: {
      points: Array<{
        x: number;
        y: number;
        inX: number;
        inY: number;
        outX: number;
        outY: number;
      }>;
    };
  };
};

export const EyesAnimationWidget = ({ data }: { data: any }) => {
  const durationMs = Math.max(250, Number(data?.durationMs) || 1500);
  const loop = data?.loop !== false;
  const frames = (Array.isArray(data?.keyframes) ? data.keyframes : []) as EyeKeyframe[];
  const sortedFrames = frames
    .map((frame) => ({ ...frame, at: Math.max(0, Math.min(1, Number(frame.at) || 0)) }))
    .sort((a, b) => a.at - b.at);

  const fallbackFrames: EyeKeyframe[] = sortedFrames.length
    ? sortedFrames
    : [
        { at: 0, left: { x: 35, y: 56, width: 190, height: 190, color: '#ffffff', roundness: 999, rotateDeg: 0 }, right: { x: 65, y: 56, width: 190, height: 190, color: '#ffffff', roundness: 999, rotateDeg: 0 } },
        { at: 0.5, left: { x: 35, y: 56, width: 190, height: 62, color: '#9bd7ff', roundness: 28, rotateDeg: -6 }, right: { x: 65, y: 56, width: 190, height: 62, color: '#9bd7ff', roundness: 28, rotateDeg: 6 } },
        { at: 1, left: { x: 35, y: 56, width: 190, height: 190, color: '#ffffff', roundness: 999, rotateDeg: 0 }, right: { x: 65, y: 56, width: 190, height: 190, color: '#ffffff', roundness: 999, rotateDeg: 0 } },
      ];

  const transition = {
    duration: durationMs / 1000,
    ease: 'easeInOut' as const,
    repeat: loop ? Infinity : 0,
    times: fallbackFrames.map((frame) => frame.at),
  };
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  useEffect(() => {
    let raf = 0;
    const startedAt = performance.now();
    const tick = (time: number) => {
      const elapsed = time - startedAt;
      const cycle = loop ? elapsed % durationMs : Math.min(elapsed, durationMs);
      const progress = cycle / durationMs;
      let idx = fallbackFrames.length - 1;
      for (let i = 0; i < fallbackFrames.length; i += 1) {
        if (progress <= fallbackFrames[i].at) {
          idx = i;
          break;
        }
      }
      setActiveFrameIndex(idx);
      if (loop || elapsed < durationMs) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, loop, JSON.stringify(fallbackFrames)]);

  const getEyeFillStyle = (eye: EyeKeyframe['left'], id: string): { fill: string; defs: React.ReactNode } => {
    const mode = eye?.fillMode || 'color';
    if (mode === 'media' && eye?.mediaUrl) {
      return {
        fill: `url(#${id}-media)`,
        defs: (
          <pattern id={`${id}-media`} patternUnits="objectBoundingBox" width="1" height="1">
            <image href={String(eye.mediaUrl)} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ),
      };
    }
    if (mode === 'gradient') {
      return {
        fill: `url(#${id}-grad)`,
        defs: (
          <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={String(eye?.gradientFrom || eye?.color || '#ffffff')} />
            <stop offset="100%" stopColor={String(eye?.gradientTo || '#7dd3fc')} />
          </linearGradient>
        ),
      };
    }
    return {
      fill: String(eye?.color || '#ffffff'),
      defs: null,
    };
  };

  const EyeNode = ({ side }: { side: 'left' | 'right' }) => (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/15 p-[6px]"
      animate={{
        left: fallbackFrames.map((frame) => `${Number(frame[side]?.x ?? 50)}%`),
        top: fallbackFrames.map((frame) => `${Number(frame[side]?.y ?? 56)}%`),
        width: fallbackFrames.map((frame) => Number(frame[side]?.width ?? 190)),
        height: fallbackFrames.map((frame) => Number(frame[side]?.height ?? 190)),
        rotate: fallbackFrames.map((frame) => Number(frame[side]?.rotateDeg ?? 0)),
      }}
      transition={transition}
    >
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${Number(fallbackFrames[0]?.[side]?.width || 190)} ${Number(fallbackFrames[0]?.[side]?.height || 190)}`}>
        {(() => {
          const current = fallbackFrames[Math.max(0, Math.min(activeFrameIndex, fallbackFrames.length - 1))]?.[side];
          const fill = getEyeFillStyle(current, `runtime-eye-${side}`);
          return (
            <>
              <defs>{fill.defs}</defs>
              <motion.path
                d={eyeToPathD(current)}
                fill={fill.fill}
                animate={{
                  d: fallbackFrames.map((frame) => eyeToPathD(frame?.[side])),
                }}
                transition={transition}
                style={{ filter: 'drop-shadow(0 0 22px rgba(255,255,255,0.55))' }}
              />
            </>
          );
        })()}
      </svg>
    </motion.div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <EyeNode side="left" />
      <EyeNode side="right" />
    </div>
  );
};
  const createDefaultShape = () => ({
    points: [
      { x: 0.5, y: 0.08, inX: -0.22, inY: 0, outX: 0.22, outY: 0 },
      { x: 0.92, y: 0.5, inX: 0, inY: -0.22, outX: 0, outY: 0.22 },
      { x: 0.5, y: 0.92, inX: 0.22, inY: 0, outX: -0.22, outY: 0 },
      { x: 0.08, y: 0.5, inX: 0, inY: 0.22, outX: 0, outY: -0.22 },
    ],
  });

  const eyeToPathD = (eye: any) => {
    const points = eye?.shape?.points || createDefaultShape().points;
    if (!Array.isArray(points) || points.length < 2) return '';
    const toAbs = (point: any) => ({ x: Number(point.x) * Number(eye.width), y: Number(point.y) * Number(eye.height) });
    const first = toAbs(points[0]);
    const parts = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const c1 = { x: (Number(current.x) + Number(current.outX || 0)) * Number(eye.width), y: (Number(current.y) + Number(current.outY || 0)) * Number(eye.height) };
      const c2 = { x: (Number(next.x) + Number(next.inX || 0)) * Number(eye.width), y: (Number(next.y) + Number(next.inY || 0)) * Number(eye.height) };
      const p2 = toAbs(next);
      parts.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
    }
    parts.push('Z');
    return parts.join(' ');
  };
