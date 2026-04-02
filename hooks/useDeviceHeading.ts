import { useCallback, useEffect, useRef, useState } from 'react';

type PermissionStateLike = 'granted' | 'denied' | 'prompt' | 'unsupported';

const normalizeHeading = (value: number) => {
  let heading = value % 360;
  if (heading < 0) heading += 360;
  return heading;
};

const shortestDelta = (from: number, to: number) => {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
};

export const useDeviceHeading = () => {
  const [heading, setHeading] = useState<number | null>(null);
  const [relativeHeading, setRelativeHeading] = useState(0);
  const [pitch, setPitch] = useState<number | null>(null);
  const [roll, setRoll] = useState<number | null>(null);
  const [relativePitch, setRelativePitch] = useState(0);
  const [relativeRoll, setRelativeRoll] = useState(0);
  const [turnRate, setTurnRate] = useState(0);
  const [permissionState, setPermissionState] = useState<PermissionStateLike>('prompt');

  const zeroHeadingRef = useRef<number | null>(null);
  const zeroPitchRef = useRef<number | null>(null);
  const zeroRollRef = useRef<number | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const rawHeading =
      typeof (event as any).webkitCompassHeading === 'number'
        ? (event as any).webkitCompassHeading
        : event.alpha;

    if (typeof rawHeading !== 'number' || Number.isNaN(rawHeading)) {
      return;
    }

    const normalized = normalizeHeading(rawHeading);
    const rawPitch = typeof event.beta === 'number' && !Number.isNaN(event.beta) ? event.beta : null;
    const rawRoll = typeof event.gamma === 'number' && !Number.isNaN(event.gamma) ? event.gamma : null;
    if (zeroHeadingRef.current == null) {
      zeroHeadingRef.current = normalized;
    }
    if (rawPitch != null && zeroPitchRef.current == null) {
      zeroPitchRef.current = rawPitch;
    }
    if (rawRoll != null && zeroRollRef.current == null) {
      zeroRollRef.current = rawRoll;
    }

    const relative = normalizeHeading(normalized - zeroHeadingRef.current);
    const now = performance.now();

    if (lastHeadingRef.current != null && lastTsRef.current != null) {
      const delta = shortestDelta(lastHeadingRef.current, normalized);
      const dtSeconds = Math.max((now - lastTsRef.current) / 1000, 0.016);
      setTurnRate(delta / dtSeconds);
    }

    lastHeadingRef.current = normalized;
    lastTsRef.current = now;
    setHeading(normalized);
    setRelativeHeading(relative);
    setPitch(rawPitch);
    setRoll(rawRoll);
    setRelativePitch(rawPitch != null && zeroPitchRef.current != null ? rawPitch - zeroPitchRef.current : 0);
    setRelativeRoll(rawRoll != null && zeroRollRef.current != null ? rawRoll - zeroRollRef.current : 0);
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    window.addEventListener('deviceorientation', handleOrientation, true);
    activeRef.current = true;
  }, [handleOrientation]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    window.removeEventListener('deviceorientation', handleOrientation, true);
    activeRef.current = false;
  }, [handleOrientation]);

  const requestPermission = useCallback(async () => {
    const requestFn = (DeviceOrientationEvent as any)?.requestPermission;

    if (typeof requestFn === 'function') {
      try {
        const result = await requestFn();
        const state = result === 'granted' ? 'granted' : 'denied';
        setPermissionState(state);
        if (state === 'granted') start();
        return state;
      } catch {
        setPermissionState('denied');
        return 'denied';
      }
    }

    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setPermissionState('unsupported');
      return 'unsupported';
    }

    setPermissionState('granted');
    start();
    return 'granted';
  }, [start]);

  const zeroHeading = useCallback(() => {
    if (heading != null) {
      zeroHeadingRef.current = heading;
      setRelativeHeading(0);
    }
    if (pitch != null) {
      zeroPitchRef.current = pitch;
      setRelativePitch(0);
    }
    if (roll != null) {
      zeroRollRef.current = roll;
      setRelativeRoll(0);
    }
  }, [heading, pitch, roll]);

  useEffect(() => () => stop(), [stop]);

  return {
    heading,
    relativeHeading,
    pitch,
    roll,
    relativePitch,
    relativeRoll,
    turnRate,
    permissionState,
    requestPermission,
    zeroHeading,
  };
};
