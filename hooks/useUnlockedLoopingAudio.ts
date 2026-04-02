import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const buildSourceCandidates = (src: string) => {
  const normalized = src.startsWith('/') ? src : `/${src}`;
  const basename = normalized.split('/').pop() || 'loading-dips.wav';
  const extMatch = basename.match(/\.[a-z0-9]+$/i);
  const ext = extMatch?.[0] || '.wav';
  const stem = basename.slice(0, basename.length - ext.length);
  const separators = ['-', '_', ' '];
  const extensions = ['.wav', '.mp3'];
  const candidates = new Set<string>([normalized]);

  for (const separator of separators) {
    const variantStem = stem.replace(/[-_ ]+/g, separator);
    for (const variantExt of extensions) {
      candidates.add(`/${variantStem}${variantExt}`);
    }
  }

  return Array.from(candidates);
};

export const useUnlockedLoopingAudio = (src: string) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolvedSourceRef = useRef<string | null>(null);
  const loadPromiseRef = useRef<Promise<string> | null>(null);
  const missingSourceRef = useRef(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const sourceCandidates = useMemo(() => buildSourceCandidates(src), [src]);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) {
      return audioRef.current;
    }

    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    return audio;
  }, []);

  const tryLoadSource = useCallback(async (audio: HTMLAudioElement) => {
    if (resolvedSourceRef.current) {
      return resolvedSourceRef.current;
    }
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    loadPromiseRef.current = (async () => {
    for (const candidate of sourceCandidates) {
      audio.src = candidate;
      audio.load();

      try {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error(`Unsupported audio source: ${candidate}`));
          };
          const onTimeout = () => {
            cleanup();
            reject(new Error(`Timed out loading audio source: ${candidate}`));
          };
          const cleanup = () => {
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('loadeddata', onReady);
            audio.removeEventListener('error', onError);
            window.clearTimeout(timer);
          };
          const timer = window.setTimeout(onTimeout, 2000);

          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.addEventListener('canplay', onReady, { once: true });
          audio.addEventListener('loadeddata', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });
        });
        resolvedSourceRef.current = candidate;
        missingSourceRef.current = false;
        return candidate;
      } catch {
        continue;
      }
    }

    missingSourceRef.current = true;
    throw new Error(`No supported loading audio source found for ${src}`);
    })();

    try {
      return await loadPromiseRef.current;
    } finally {
      loadPromiseRef.current = null;
    }
  }, [sourceCandidates, src]);

  const unlock = useCallback(async () => {
    try {
      const audio = ensureAudio();
      await tryLoadSource(audio);
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      setIsUnlocked(true);
    } catch (error) {
      if (!missingSourceRef.current) {
        console.warn('Audio unlock failed:', error);
      }
    }
  }, [ensureAudio, tryLoadSource]);

  const play = useCallback(async () => {
    try {
      const audio = ensureAudio();
      if (!audio.src) {
        await tryLoadSource(audio);
      }
      if (!audio.paused) {
        return;
      }
      audio.muted = false;
      await audio.play();
    } catch (error) {
      if (!missingSourceRef.current) {
        console.warn('Looping audio play failed:', error);
      }
    }
  }, [ensureAudio, tryLoadSource]);

  const stop = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (!audioRef.current) return;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      audioRef.current = null;
      resolvedSourceRef.current = null;
      loadPromiseRef.current = null;
    };
  }, []);

  return { isUnlocked, unlock, play, stop };
};
