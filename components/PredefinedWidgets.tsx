import React, { useState, useEffect } from 'react';
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
    let timer = null;

    function syncWithParent() {
      window.parent.postMessage({
        action: 'syncTimer',
        payload: {
          totalSeconds,
          remainingSeconds,
          running,
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
        statusEl.textContent = "Finished";
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
      updateUI();
      syncWithParent();

      timer = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
          remainingSeconds = 0;
          stopTimer(false);
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
    <div className="flex flex-col items-center justify-center w-full h-full bg-black text-white p-8 min-h-[350px]">
      <h2 className="text-4xl font-bold mb-12 tracking-wide">{data.title || 'Settings'}</h2>
      <div className="flex flex-row gap-8 overflow-x-auto pb-8 px-4 max-w-full">
        {(data.options || []).map((opt: any) => (
          <div key={opt.id} className="flex flex-col items-center gap-4 shrink-0">
            <button className="w-32 h-32 rounded-full bg-gradient-to-b from-gray-400 to-gray-700 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
              <div className="text-white drop-shadow-lg">
                {getIcon(opt.icon)}
              </div>
            </button>
            <span className="text-lg font-medium">{opt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ConfirmationWidget = ({ data }: { data: any }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black text-white p-8 min-h-[350px]">
      <h2 className="text-3xl md:text-4xl font-bold text-orange-400 mb-2 text-center">{data.title || 'Confirm?'}</h2>
      <p className="text-xl text-gray-300 mb-12 text-center">{data.subtitle || ''}</p>
      <div className="flex flex-row gap-12">
        <div className="flex flex-col items-center gap-4">
          <button className="w-32 h-32 rounded-full bg-gradient-to-b from-green-400 to-green-600 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
            <Check size={64} className="text-white drop-shadow-lg" />
          </button>
          <span className="text-lg font-medium">{data.confirmText || 'Yes'}</span>
        </div>
        <div className="flex flex-col items-center gap-4">
          <button className="w-32 h-32 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
            <X size={64} className="text-white drop-shadow-lg" />
          </button>
          <span className="text-lg font-medium">{data.cancelText || 'No'}</span>
        </div>
      </div>
    </div>
  );
};
