import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { EyeState } from '../types';

type EyeEmotion = 'neutral' | 'laugh' | 'whisper' | 'sad' | 'recognize';

type EyeShapePoint = {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
};

type EyeFrameShape = {
  points: EyeShapePoint[];
};

type EyeFrame = {
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
  shape?: EyeFrameShape;
};

type EyeAnimationFrame = {
  at: number;
  left?: EyeFrame;
  right?: EyeFrame;
};

type CustomEyeAnimation = {
  keyframes: EyeAnimationFrame[];
  durationMs?: number;
  loop?: boolean;
  continueRunning?: boolean;
};

export const Eyes = ({
  state,
  intentX = 0,
  intentBlink = false,
  emotion = 'neutral',
  customAnimation = null,
}: {
  state: EyeState;
  intentX?: number;
  intentBlink?: boolean;
  emotion?: EyeEmotion;
  customAnimation?: CustomEyeAnimation | null;
}) => {
  const lowPowerMode = useMemo(() => {
    const memory = Number((navigator as any)?.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
  }, []);
  const [blink, setBlink] = useState(false);
  const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });
  const [glowPulse, setGlowPulse] = useState(false);
  const [renderAnimation, setRenderAnimation] = useState<CustomEyeAnimation | null>(null);
  const [outroActive, setOutroActive] = useState(false);

  const defaultShape = useMemo<EyeFrameShape>(
    () => ({
      points: [
        { x: 0.5, y: 0, inX: -0.28, inY: 0, outX: 0.28, outY: 0 },
        { x: 1, y: 0.5, inX: 0, inY: -0.28, outX: 0, outY: 0.28 },
        { x: 0.5, y: 1, inX: 0.28, inY: 0, outX: -0.28, outY: 0 },
        { x: 0, y: 0.5, inX: 0, inY: 0.28, outX: 0, outY: -0.28 },
      ],
    }),
    []
  );

  const framePathD = (eye: EyeFrame) => {
    const normalizeLegacySize = (value: number) => (value > 0 && value <= 170 ? value * (192 / 150) : value);
    const width = normalizeLegacySize(Number(eye.width ?? 192));
    const height = normalizeLegacySize(Number(eye.height ?? 192));
    const points = eye.shape?.points || defaultShape.points;
    if (!Array.isArray(points) || points.length < 2) return '';
    const first = points[0];
    const commands = [`M ${(first.x * width).toFixed(2)} ${(first.y * height).toFixed(2)}`];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const c1x = (current.x + current.outX) * width;
      const c1y = (current.y + current.outY) * height;
      const c2x = (next.x + next.inX) * width;
      const c2y = (next.y + next.inY) * height;
      const px = next.x * width;
      const py = next.y * height;
      commands.push(
        `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${px.toFixed(2)} ${py.toFixed(2)}`
      );
    }
    commands.push('Z');
    return commands.join(' ');
  };

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, (lowPowerMode ? 2800 : 2200) + Math.random() * (lowPowerMode ? 3000 : 2600));

    const lookInterval = setInterval(() => {
      if (state === EyeState.IDLE || state === EyeState.LISTENING || state === EyeState.CONNECTING) {
        const x = (Math.random() - 0.5) * 80;
        const y = (Math.random() - 0.5) * 40;
        setLookOffset({ x, y });
      } else if (state === EyeState.SPEAKING || state === EyeState.THINKING) {
        setLookOffset({ x: 0, y: 0 });
      }
    }, (lowPowerMode ? 2000 : 1200) + Math.random() * (lowPowerMode ? 2400 : 1800));

    const glowInterval = setInterval(() => {
      if (state === EyeState.IDLE || state === EyeState.LISTENING || state === EyeState.SPEAKING) {
        setGlowPulse(true);
        window.setTimeout(() => setGlowPulse(false), 260);
      }
    }, (lowPowerMode ? 2200 : 1300) + Math.random() * (lowPowerMode ? 2600 : 1700));

    return () => {
      clearInterval(blinkInterval);
      clearInterval(lookInterval);
      clearInterval(glowInterval);
    };
  }, [lowPowerMode, state]);

  useEffect(() => {
    if (Math.abs(intentX) < 0.01) return;
    setLookOffset({ x: intentX * 90, y: 0 });
  }, [intentX]);

  useEffect(() => {
    if (!intentBlink) return;
    setBlink(true);
    const timer = window.setTimeout(() => setBlink(false), 140);
    return () => window.clearTimeout(timer);
  }, [intentBlink]);

  useEffect(() => {
    if (state === EyeState.LISTENING && !customAnimation) {
      setRenderAnimation(null);
      setOutroActive(false);
    }
  }, [state, customAnimation]);

  useEffect(() => {
    if (customAnimation) {
      setRenderAnimation(customAnimation);
      setOutroActive(false);
      return;
    }
    if (!renderAnimation || outroActive) return;

    const frames = Array.isArray(renderAnimation.keyframes) ? [...renderAnimation.keyframes] : [];
    const lastFrame = frames
      .map((frame) => ({ ...frame, at: Math.max(0, Math.min(1, Number(frame.at) || 0)) }))
      .sort((a, b) => a.at - b.at)
      .slice(-1)[0];

    if (!lastFrame) {
      setRenderAnimation(null);
      return;
    }

    const fallbackEye = (side: 'left' | 'right') => ({
      x: side === 'left' ? 35 : 65,
      y: 55,
      width: 192,
      height: 192,
      color: '#ffffff',
      fillMode: 'color' as const,
      gradientFrom: '#ffffff',
      gradientTo: '#ffffff',
      mediaUrl: '',
      rotateDeg: 0,
      shape: defaultShape,
    });

    const outroDuration = 260;
    setRenderAnimation({
      keyframes: [
        { at: 0, left: lastFrame.left, right: lastFrame.right },
        { at: 1, left: fallbackEye('left'), right: fallbackEye('right') },
      ],
      durationMs: outroDuration,
      loop: false,
      continueRunning: false,
    });
    setOutroActive(true);
    const timer = window.setTimeout(() => {
      setRenderAnimation(null);
      setOutroActive(false);
    }, outroDuration + 20);
    return () => window.clearTimeout(timer);
  }, [customAnimation, defaultShape, outroActive, renderAnimation]);

  const animationFrames = useMemo(() => {
    const frames = Array.isArray(renderAnimation?.keyframes) ? renderAnimation.keyframes : [];
    if (!frames.length) return [];
    return frames
      .map((frame) => ({ ...frame, at: Math.max(0, Math.min(1, Number(frame.at) || 0)) }))
      .sort((a, b) => a.at - b.at);
  }, [renderAnimation]);

  const animationDuration = Math.max(250, Number(renderAnimation?.durationMs) || 1400);
  const animationLoop = renderAnimation?.loop === true && !lowPowerMode;
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  const getEyeColorClass = () => {
    if (emotion === 'laugh') return 'bg-yellow-300 shadow-[0_0_70px_#fde047] border-none';
    if (emotion === 'whisper') return 'bg-blue-200 shadow-[0_0_35px_#93c5fd] border-none';
    if (emotion === 'sad') return 'bg-blue-500 shadow-[0_0_45px_#3b82f6] border-none';
    if (emotion === 'recognize') return 'bg-green-400 shadow-[0_0_55px_#4ade80] border-none';
    if (state === EyeState.CONNECTING) return 'border-none';
    if (state === EyeState.LISTENING) return 'border-none';
    if (state === EyeState.SPEAKING) return 'bg-blue-500 shadow-[0_0_60px_#3b82f6] border-none';
    if (state === EyeState.THINKING) return 'bg-yellow-400 shadow-[0_0_60px_#facc15] border-none';
    if (state === EyeState.MUTED) return 'bg-red-500 shadow-[0_0_60px_#ef4444] border-none';
    return glowPulse ? 'bg-white shadow-[0_0_56px_#fff]' : 'bg-white shadow-[0_0_34px_#fff]';
  };

  const getScale = () => {
    if (emotion === 'laugh') return 1.22;
    if (emotion === 'whisper') return 0.78;
    if (emotion === 'sad') return 0.98;
    if (state === EyeState.CONNECTING) return 1.28;
    if (state === EyeState.LISTENING) return 1.4;
    if (state === EyeState.SPEAKING) return 1.2;
    if (state === EyeState.THINKING) return 1.1;
    if (state === EyeState.MUTED) return 1.05;
    return 1;
  };

  const getAnimatedEyeSurfaceStyle = () => {
    if (state === EyeState.CONNECTING) {
      return {
        background: 'linear-gradient(120deg, #f472b6 0%, #facc15 25%, #22d3ee 50%, #a78bfa 75%, #f472b6 100%)',
        backgroundSize: '300% 300%',
        animation: 'airoRainbowShift 2.2s linear infinite',
        filter: lowPowerMode ? 'drop-shadow(0 0 18px rgba(167,139,250,0.45)) grayscale(1)' : 'drop-shadow(0 0 26px rgba(167,139,250,0.6)) grayscale(1)',
      } as const;
    }
    if (state === EyeState.LISTENING) {
      return {
        background: 'linear-gradient(120deg, #22d3ee 0%, #60a5fa 22%, #a78bfa 45%, #f472b6 70%, #22d3ee 100%)',
        backgroundSize: '320% 320%',
        animation: 'airoRainbowShift 1.5s linear infinite',
        filter: lowPowerMode ? 'drop-shadow(0 0 22px rgba(34,211,238,0.55))' : 'drop-shadow(0 0 34px rgba(34,211,238,0.75))',
      } as const;
    }
    return {};
  };

  const getEmotionShapeStyle = () => {
    if (emotion === 'laugh') {
      return {
        clipPath: 'inset(50% 0 0 0 round 999px)',
        transform: 'translateY(-16px) scaleY(0.9)',
      };
    }
    if (emotion === 'whisper') {
      return {
        clipPath: 'inset(16% 0 16% 0 round 999px)',
        transform: 'scale(0.86)',
      };
    }
    if (emotion === 'sad') {
      return {
        clipPath: 'inset(0 0 50% 0 round 999px)',
        transform: 'translateY(18px) scaleY(0.86)',
      };
    }
    return {
      clipPath: 'inset(0 0 0 0 round 999px)',
      transform: 'translateY(0) scale(1)',
    };
  };

  useEffect(() => {
    if (!animationFrames.length) {
      setActiveFrameIndex(0);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (time: number) => {
      const elapsed = time - startedAt;
      const cycle = animationLoop ? elapsed % animationDuration : Math.min(elapsed, animationDuration);
      const progress = cycle / animationDuration;
      let idx = animationFrames.length - 1;
      for (let i = 0; i < animationFrames.length; i += 1) {
        if (progress <= animationFrames[i].at) {
          idx = i;
          break;
        }
      }
      setActiveFrameIndex(idx);
      if (animationLoop || elapsed < animationDuration) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animationDuration, animationFrames, animationLoop]);

  if (animationFrames.length > 0) {
    const transition = {
      duration: animationDuration / 1000,
      ease: 'easeInOut' as const,
      repeat: animationLoop ? Infinity : 0,
      times: animationFrames.map((frame) => frame.at),
    };

    const renderAnimatedEye = (side: 'left' | 'right') => {
      const first = animationFrames[0]?.[side] || {};
      const baseWidth = 192;
      const baseHeight = 192;
      const baseX = side === 'left' ? 35 : 65;
      const baseY = 55;
      const gradId = `eyes-grad-${side}`;
      const mediaId = `eyes-media-${side}`;
      const active = animationFrames[Math.max(0, Math.min(activeFrameIndex, animationFrames.length - 1))]?.[side] || first;
      return (
        <div
          className="w-48 h-48 overflow-hidden rounded-full"
          style={{
            transform: `translate(${lookOffset.x}px, ${lookOffset.y}px) scaleY(${blink ? 0.05 : 1}) scale(${getScale()})`,
            transition: lowPowerMode ? 'transform 0.24s linear' : 'transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          <motion.div
          className="relative w-48 h-48"
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: 1,
            scale: 1,
            rotate: animationFrames.map((frame) => Number(frame[side]?.rotateDeg ?? 0)),
            x: animationFrames.map((frame) => {
              const x = Number(frame[side]?.x ?? baseX);
              return (x - baseX) * 6;
            }),
            y: animationFrames.map((frame) => {
              const y = Number(frame[side]?.y ?? baseY);
              return (y - baseY) * 4;
            }),
          }}
          transition={{ ...transition, opacity: { duration: 0.18 }, scale: { duration: 0.18 } }}
        >
          <svg className="h-full w-full overflow-hidden" viewBox={`0 0 ${baseWidth} ${baseHeight}`}>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={String(active.gradientFrom || active.color || '#ffffff')} />
                <stop offset="100%" stopColor={String(active.gradientTo || '#7dd3fc')} />
              </linearGradient>
              {active.mediaUrl ? (
                <pattern id={mediaId} patternUnits="objectBoundingBox" width="1" height="1">
                  <image href={String(active.mediaUrl)} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                </pattern>
              ) : null}
            </defs>
            <motion.path
              d={framePathD(first)}
              animate={{
                d: animationFrames.map((frame) => framePathD(frame[side] || {})),
                fill: animationFrames.map((frame) => {
                  const eye = frame[side] || {};
                  if (eye.fillMode === 'media' && eye.mediaUrl) return `url(#${mediaId})`;
                  if (eye.fillMode === 'gradient') return `url(#${gradId})`;
                  return String(eye.color || '#ffffff');
                }),
              }}
              transition={transition}
              style={{ filter: 'drop-shadow(0 0 24px rgba(255,255,255,0.55))' }}
            />
          </svg>
          </motion.div>
        </div>
      );
    };

    return (
      <div className="flex gap-20 justify-center items-center h-screen w-screen bg-black overflow-hidden relative">
        {renderAnimatedEye('left')}
        {renderAnimatedEye('right')}
      </div>
    );
  }

  const eyeStyle = {
    transform: `translate(${lookOffset.x}px, ${lookOffset.y}px) scaleY(${blink ? 0.05 : 1}) scale(${getScale()})`,
    transition: 'transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), background-color 0.4s ease, filter 0.4s ease',
  };
  const emotionShapeStyle = getEmotionShapeStyle();

  return (
    <div className="flex gap-20 justify-center items-center h-screen w-screen bg-black overflow-hidden relative">
      <div className="absolute top-8 text-white font-mono text-xs select-none opacity-10 tracking-[0.5em] uppercase">
        {state === EyeState.IDLE && 'System Idle'}
        {state === EyeState.CONNECTING && 'Connecting'}
        {state === EyeState.LISTENING && 'Receiving Input'}
        {state === EyeState.THINKING && 'Processing'}
        {state === EyeState.SPEAKING && 'Generating Output'}
        {state === EyeState.MUTED && 'Microphone Muted'}
      </div>
      <div className="w-48 h-48 overflow-hidden rounded-full" style={eyeStyle}>
        <div
          className={`w-48 h-48 rounded-full ${getEyeColorClass()}`}
          style={{
            ...emotionShapeStyle,
            transition: lowPowerMode
              ? 'transform 0.2s linear, clip-path 0.2s linear'
              : 'transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), clip-path 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)',
            ...getAnimatedEyeSurfaceStyle(),
          }}
        />
      </div>
      <div className="w-48 h-48 overflow-hidden rounded-full" style={eyeStyle}>
        <div
          className={`w-48 h-48 rounded-full ${getEyeColorClass()}`}
          style={{
            ...emotionShapeStyle,
            transition: lowPowerMode
              ? 'transform 0.2s linear, clip-path 0.2s linear'
              : 'transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), clip-path 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)',
            ...getAnimatedEyeSurfaceStyle(),
          }}
        />
      </div>
      <style>{`
        @keyframes airoRainbowShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
};
