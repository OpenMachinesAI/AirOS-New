import { useCallback, useEffect, useRef, useState } from 'react';

export type VisionSource = 'front' | 'rear';

export type VisionTarget = {
  kind: 'face' | 'motion';
  source: VisionSource;
  x: number;
  y: number;
  strength: number;
  speed: number;
  width: number;
  height: number;
};

type FaceDetectorLike = {
  detect: (input: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

type CameraSession = {
  source: VisionSource;
  stream: MediaStream;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
};

declare global {
  interface Window {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;
    cv?: any;
    Module?: any;
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const useBackgroundVisionTracker = () => {
  const [target, setTarget] = useState<VisionTarget | null>(null);
  const [frontTarget, setFrontTarget] = useState<VisionTarget | null>(null);
  const [rearTarget, setRearTarget] = useState<VisionTarget | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraMode, setCameraMode] = useState<'none' | 'single-front' | 'single-rear' | 'dual'>('none');
  const [opencvState, setOpenCvState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const sessionsRef = useRef<CameraSession[]>([]);
  const intervalRef = useRef<number | null>(null);
  const previousFramesRef = useRef<Record<VisionSource, Uint8ClampedArray | null>>({ front: null, rear: null });
  const lastTargetsRef = useRef<Record<VisionSource, VisionTarget | null>>({ front: null, rear: null });
  const faceDetectorRef = useRef<FaceDetectorLike | null>(null);
  const cascadeReadyRef = useRef(false);
  const cvReadyPromiseRef = useRef<Promise<void> | null>(null);

  const buildTarget = useCallback((
    source: VisionSource,
    kind: 'face' | 'motion',
    normalizedX: number,
    normalizedY: number,
    widthNorm: number,
    heightNorm: number
  ): VisionTarget => {
    const x = clamp((normalizedX - 0.5) * 2, -1, 1);
    const y = clamp((normalizedY - 0.5) * 2, -1, 1);
    const previous = lastTargetsRef.current[source];
    const speed = previous ? Math.abs(x - previous.x) + Math.abs(y - previous.y) : 0;
    return {
      kind,
      source,
      x,
      y,
      width: widthNorm,
      height: heightNorm,
      strength: clamp(Math.max(widthNorm, heightNorm), 0, 1),
      speed: clamp(speed * 2.5, 0, 1),
    };
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    sessionsRef.current.forEach(({ stream, video }) => {
      stream.getTracks().forEach((track) => track.stop());
      video.pause();
    });
    sessionsRef.current = [];
    previousFramesRef.current = { front: null, rear: null };
    lastTargetsRef.current = { front: null, rear: null };
    faceDetectorRef.current = null;
    setTarget(null);
    setFrontTarget(null);
    setRearTarget(null);
    setCameraMode('none');
    setCameraState('idle');
  }, []);

  const ensureOpenCvReady = useCallback(async () => {
    if (window.cv?.CascadeClassifier) {
      setOpenCvState('ready');
      return;
    }

    if (cvReadyPromiseRef.current) {
      await cvReadyPromiseRef.current;
      return;
    }

    setOpenCvState('loading');
    cvReadyPromiseRef.current = new Promise<void>((resolve, reject) => {
      const finish = () => {
        setOpenCvState('ready');
        resolve();
      };

      const fail = () => {
        setOpenCvState('error');
        reject(new Error('OpenCV failed to initialize'));
      };

      if (window.cv?.CascadeClassifier) {
        finish();
        return;
      }

      const timeout = window.setTimeout(fail, 12000);
      const previous = window.Module?.onRuntimeInitialized;
      window.Module = {
        ...(window.Module || {}),
        onRuntimeInitialized: () => {
          window.clearTimeout(timeout);
          try {
            previous?.();
          } catch {}
          finish();
        },
      };

      const poll = window.setInterval(() => {
        if (window.cv?.CascadeClassifier) {
          window.clearInterval(poll);
          window.clearTimeout(timeout);
          finish();
        }
      }, 150);
    });

    await cvReadyPromiseRef.current;
  }, []);

  const ensureCascadeLoaded = useCallback(async () => {
    if (cascadeReadyRef.current) return;
    await ensureOpenCvReady();
    const cv = window.cv;
    if (!cv) throw new Error('OpenCV not available');

    const cascadePath = '/haarcascade_frontalface_default.xml';
    try {
      cv.FS_unlink(cascadePath);
    } catch {}

    const response = await fetch('/opencv/haarcascade_frontalface_default.xml');
    const buffer = await response.arrayBuffer();
    cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml', new Uint8Array(buffer), true, false, false);
    cascadeReadyRef.current = true;
  }, [ensureOpenCvReady]);

  const createSession = useCallback(async (source: VisionSource, videoConstraints: MediaTrackConstraints) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 72;

    return { source, stream, video, canvas };
  }, []);

  const analyzeSession = useCallback(async (session: CameraSession) => {
    const { source, video, canvas } = session;
    if (video.readyState < 2) return null;

    const cvTarget = detectOpenCvFace(video, canvas, source, buildTarget);
    if (cvTarget) {
      lastTargetsRef.current[source] = cvTarget;
      return cvTarget;
    }

    const detector = faceDetectorRef.current;
    if (detector) {
      try {
        const faces = await detector.detect(video);
        if (faces.length) {
          const face = faces[0].boundingBox;
          const faceTarget = buildTarget(
            source,
            'face',
            (face.x + face.width / 2) / video.videoWidth,
            (face.y + face.height / 2) / video.videoHeight,
            face.width / video.videoWidth,
            face.height / video.videoHeight
          );
          lastTargetsRef.current[source] = faceTarget;
          return faceTarget;
        }
      } catch {}
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const previous = previousFramesRef.current[source];
    const current = new Uint8ClampedArray(canvas.width * canvas.height);
    let motionPixels = 0;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < canvas.width * canvas.height; i++) {
      const idx = i * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      current[i] = gray;
      if (!previous) continue;
      const diff = Math.abs(gray - previous[i]);
      if (diff > 28) {
        motionPixels += 1;
        sumX += i % canvas.width;
        sumY += Math.floor(i / canvas.width);
      }
    }

    previousFramesRef.current[source] = current;
    if (!previous || motionPixels < 40) return null;

    const motionTarget = buildTarget(
      source,
      'motion',
      (sumX / motionPixels) / canvas.width,
      (sumY / motionPixels) / canvas.height,
      clamp(motionPixels / (canvas.width * canvas.height * 0.15), 0, 1),
      clamp(motionPixels / (canvas.width * canvas.height * 0.15), 0, 1) * 0.7
    );
    lastTargetsRef.current[source] = motionTarget;
    return motionTarget;
  }, [buildTarget]);

  const start = useCallback(async () => {
    if (sessionsRef.current.length || cameraState === 'starting') return;
    setCameraState('starting');

    try {
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
      const sessions: CameraSession[] = [];

      try {
        sessions.push(await createSession('front', {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 10, max: 12 },
        }));
      } catch (error) {
        console.warn('Front camera unavailable:', error);
      }

      if (isMobile) {
        try {
          sessions.push(await createSession('rear', {
            facingMode: { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 10, max: 12 },
          }));
        } catch (error) {
          console.warn('Rear camera unavailable:', error);
        }
      }

      if (!sessions.length) {
        throw new Error('No camera streams could be started');
      }

      sessionsRef.current = sessions;
      if (sessions.length === 2) setCameraMode('dual');
      else if (sessions[0].source === 'front') setCameraMode('single-front');
      else setCameraMode('single-rear');

      if (window.FaceDetector) {
        faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      }

      try {
        await ensureCascadeLoaded();
      } catch (error) {
        console.warn('OpenCV cascade load failed, falling back:', error);
      }

      intervalRef.current = window.setInterval(async () => {
        const frontSession = sessionsRef.current.find((session) => session.source === 'front') || null;
        const rearSession = sessionsRef.current.find((session) => session.source === 'rear') || null;

        const nextFrontTarget = frontSession ? await analyzeSession(frontSession) : null;
        const nextRearTarget = rearSession ? await analyzeSession(rearSession) : null;

        setFrontTarget(nextFrontTarget);
        setRearTarget(nextRearTarget);
        setTarget(nextFrontTarget);
      }, 260);

      setCameraState('active');
    } catch (error) {
      console.error('Background vision tracker failed:', error);
      setCameraState('error');
    }
  }, [analyzeSession, cameraState, createSession, ensureCascadeLoaded]);

  useEffect(() => () => stop(), [stop]);

  const captureFrame = useCallback((
    source: VisionSource,
    cropTarget?: VisionTarget | null,
    options?: { aspectRatio?: number }
  ) => {
    const session =
      sessionsRef.current.find((entry) => entry.source === source) ||
      sessionsRef.current[0] ||
      null;
    if (!session) return null;

    const { video } = session;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement('canvas');
    const aspectRatio = options?.aspectRatio || 1;
    const canvasWidth = 480;
    const canvasHeight = Math.round(canvasWidth / aspectRatio);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;

    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (cropTarget) {
      const centerX = ((cropTarget.x + 1) / 2) * video.videoWidth;
      const centerY = ((cropTarget.y + 1) / 2) * video.videoHeight;
      const cropWidth = Math.max(video.videoWidth * Math.max(cropTarget.width, 0.2) * 1.8, 180);
      const cropHeight = Math.max(video.videoHeight * Math.max(cropTarget.height, 0.2) * 2.0, 180);
      sw = Math.min(video.videoWidth, cropWidth);
      sh = Math.min(video.videoHeight, cropHeight);
      sx = clamp(centerX - sw / 2, 0, Math.max(video.videoWidth - sw, 0));
      sy = clamp(centerY - sh / 2, 0, Math.max(video.videoHeight - sh, 0));
    }

    if (!cropTarget) {
      const videoAspect = video.videoWidth / video.videoHeight;
      if (videoAspect > aspectRatio) {
        sw = video.videoHeight * aspectRatio;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth / aspectRatio;
        sy = (video.videoHeight - sh) / 2;
      }
    }

    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    return canvas.toDataURL('image/jpeg', 0.86);
  }, []);

  return { target, frontTarget, rearTarget, cameraState, cameraMode, opencvState, start, stop, captureFrame };
};

function detectOpenCvFace(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  source: VisionSource,
  buildTarget: (
    source: VisionSource,
    kind: 'face' | 'motion',
    normalizedX: number,
    normalizedY: number,
    widthNorm: number,
    heightNorm: number
  ) => VisionTarget
) {
  const cv = window.cv;
  if (!cv?.CascadeClassifier) return null;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const faces = new cv.RectVector();
  const classifier = new cv.CascadeClassifier();

  try {
    if (!classifier.load('/haarcascade_frontalface_default.xml')) return null;
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.equalizeHist(gray, gray);
    classifier.detectMultiScale(gray, faces, 1.1, 3, 0, new cv.Size(24, 24), new cv.Size());

    if (faces.size() < 1) return null;
    const face = faces.get(0);
    return buildTarget(
      source,
      'face',
      (face.x + face.width / 2) / canvas.width,
      (face.y + face.height / 2) / canvas.height,
      face.width / canvas.width,
      face.height / canvas.height
    );
  } finally {
    src.delete();
    gray.delete();
    faces.delete();
    classifier.delete();
  }
}
