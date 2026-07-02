import { useState, useEffect, useRef } from 'react';

export interface AiroContextData {
    battery: { level: number; charging: boolean } | null;
    location: { latitude: number; longitude: number } | null;
    acceleration: { x: number; y: number; z: number } | null;
    motion: 'idle' | 'walking' | 'running' | 'driving';
    recognizedNames?: string[];
    talkingCount?: number;
}

export const useAiroContext = (robotId: string) => {
    const [contextData, setContextData] = useState<AiroContextData>({
        battery: null,
        location: null,
        acceleration: null,
        motion: 'idle',
        recognizedNames: [],
        talkingCount: 0
    });
    const contextDataRef = useRef(contextData);

    // Update ref whenever state changes so loops can use latest without dependencies
    useEffect(() => {
        contextDataRef.current = contextData;
    }, [contextData]);

    const [isRemoteViewActive, setIsRemoteViewActive] = useState(false);
    const isRemoteViewActiveRef = useRef(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const poiRef = useRef<{x: number, y: number} | null>(null);
    const recognizedNamesRef = useRef<string[]>([]);
    const personBoxesRef = useRef<any[]>([]);
    const talkingCountRef = useRef<number>(0);
    
    // 1. Vitals (Battery)
    useEffect(() => {
        let battery: any = null;
        
        const updateBattery = () => {
            if (battery) {
                setContextData(prev => ({
                    ...prev,
                    battery: { level: battery.level, charging: battery.charging }
                }));
            }
        };

        if ('getBattery' in navigator) {
            (navigator as any).getBattery().then((b: any) => {
                battery = b;
                updateBattery();
                battery.addEventListener('levelchange', updateBattery);
                battery.addEventListener('chargingchange', updateBattery);
            });
        }
        
        return () => {
            if (battery) {
                battery.removeEventListener('levelchange', updateBattery);
                battery.removeEventListener('chargingchange', updateBattery);
            }
        };
    }, []);

    // 1.5 Face Recognition & Person Detection Listener
    useEffect(() => {
        const handleFaceRecognized = (e: any) => {
            recognizedNamesRef.current = e.detail.names;
            setContextData(prev => ({ ...prev, recognizedNames: e.detail.names }));
            setTimeout(() => {
                recognizedNamesRef.current = [];
                setContextData(prev => ({ ...prev, recognizedNames: [] }));
            }, 5000);
        };
        const handlePersonMoved = (e: any) => {
            if (e.detail.bbox) {
                personBoxesRef.current = [e.detail.bbox];
                setTimeout(() => {
                    personBoxesRef.current = [];
                }, 1000);
            }
        };
        const handlePersonTalking = (e: any) => {
            talkingCountRef.current = e.detail.count;
            setContextData(prev => ({ ...prev, talkingCount: e.detail.count }));
            // Clear talking status quickly if it stops
            setTimeout(() => {
                if (talkingCountRef.current === e.detail.count) {
                    talkingCountRef.current = 0;
                    setContextData(prev => ({ ...prev, talkingCount: 0 }));
                }
            }, 2000);
        };

        const handlePersonTracked = (e: any) => {
            if (e.detail.tracks) {
                const { vidW, vidH } = e.detail;
                
                personBoxesRef.current = e.detail.tracks.map((t: any) => ({
                    x: (t.bbox[0] / vidW) * 100,
                    y: (t.bbox[1] / vidH) * 100,
                    width: (t.bbox[2] / vidW) * 100,
                    height: (t.bbox[3] / vidH) * 100,
                    label: `Person ${t.id} [${t.faceThreshold}%]`
                }));
            }
        };
        
        window.addEventListener('airo-face-recognized', handleFaceRecognized);
        window.addEventListener('airo-person-moved', handlePersonMoved);
        window.addEventListener('airo-person-talking', handlePersonTalking);
        window.addEventListener('airo-person-tracked', handlePersonTracked);
        return () => {
            window.removeEventListener('airo-face-recognized', handleFaceRecognized);
            window.removeEventListener('airo-person-moved', handlePersonMoved);
            window.removeEventListener('airo-person-talking', handlePersonTalking);
            window.removeEventListener('airo-person-tracked', handlePersonTracked);
        };
    }, []);

    // 2. Geolocation
    useEffect(() => {
        if ('geolocation' in navigator) {
            const watchId = navigator.geolocation.watchPosition((position) => {
                setContextData(prev => ({
                    ...prev,
                    location: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }
                }));
            }, console.warn, { enableHighAccuracy: true });
            
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    // 3. Kinetic State (Motion)
    useEffect(() => {
        let lastUpdateTime = 0;
        const handleMotion = (event: DeviceMotionEvent) => {
            const now = Date.now();
            if (now - lastUpdateTime < 1000) return; // Throttle to 1 second
            
            if (event.accelerationIncludingGravity) {
                const { x, y, z } = event.accelerationIncludingGravity;
                const accel = Math.sqrt((x||0)**2 + (y||0)**2 + (z||0)**2);
                let motionState: AiroContextData['motion'] = 'idle';
                
                if (accel > 12 && accel < 15) motionState = 'walking';
                else if (accel >= 15) motionState = 'running';
                
                // Only update state if something significant changed to avoid re-renders
                setContextData(prev => {
                    // Update if motion state changed, or if it's been a while
                    if (prev.motion !== motionState || now - lastUpdateTime > 5000) {
                        lastUpdateTime = now;
                        return {
                            ...prev,
                            acceleration: { x: x||0, y: y||0, z: z||0 },
                            motion: motionState
                        };
                    }
                    return prev;
                });
            }
        };
        window.addEventListener('devicemotion', handleMotion);
        return () => window.removeEventListener('devicemotion', handleMotion);
    }, []);

    // 4. OpenCV Reactions & Debug Stream
    useEffect(() => {
        if (!robotId) return;

        let active = true;
        let lastFrameTime = 0;

        // Initialize hidden video and canvas
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        videoRef.current = video;

        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let stream: MediaStream | null = null;

        let checkCv: NodeJS.Timeout;
        const startCamera = async () => {
            try {
                const { getSharedCamera } = await import('./useSharedCamera');
                const shared = await getSharedCamera();
                stream = shared.stream;
                videoRef.current = shared.video;
                
                // Keep the canvas downscaled to 160x120 for extremely fast processing on main thread
                canvas.width = 160;
                canvas.height = 120;
                processFrames();
            } catch (err) {
                console.warn('Camera not available for OpenCV', err);
            }
        };

        // We use a basic frame differencing for motion tracking using OpenCV
        let previousFrame: any = null;

        const processFrames = () => {
            if (!active) return;
            requestAnimationFrame(processFrames);

            const now = Date.now();
            const minFrameTime = isRemoteViewActiveRef.current ? 33 : 100; // ~30 fps vs 10 fps
            if (now - lastFrameTime < minFrameTime) return;
            
            const fps = 1000 / (now - lastFrameTime);
            lastFrameTime = now;
            
            const targetWidth = isRemoteViewActiveRef.current ? 640 : 160;
            const targetHeight = isRemoteViewActiveRef.current ? 480 : 120;
            if (canvas.width !== targetWidth) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                if (previousFrame && !previousFrame.isDeleted()) {
                    previousFrame.delete();
                    previousFrame = null;
                }
            }

            const cv = (window as any).cv;
            const currentVideo = videoRef.current;
            if (currentVideo && currentVideo.readyState >= 2 && ctx && cv && cv.Mat) {
                const cvStartTime = performance.now();
                ctx.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
                
                let boxes: any[] = [];
                
                try {
                    const currentFrame = cv.imread(canvas);
                    const gray = new cv.Mat();
                    cv.cvtColor(currentFrame, gray, cv.COLOR_RGBA2GRAY);
                    cv.GaussianBlur(gray, gray, new cv.Size(21, 21), 0);

                    if (previousFrame) {
                        const diff = new cv.Mat();
                        cv.absdiff(previousFrame, gray, diff);
                        const thresh = new cv.Mat();
                        cv.threshold(diff, thresh, 25, 255, cv.THRESH_BINARY);
                        cv.dilate(thresh, thresh, new cv.Mat(), new cv.Point(-1, -1), 2);

                        const contours = new cv.MatVector();
                        const hierarchy = new cv.Mat();
                        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                        let maxArea = 0;
                        let maxRect: any = null;

                        for (let i = 0; i < contours.size(); ++i) {
                            const cnt = contours.get(i);
                            const area = cv.contourArea(cnt);
                            if (area > 500) { // minimum area
                                const rect = cv.boundingRect(cnt);
                                // convert to percentage based coordinates
                                boxes.push({
                                    x: (rect.x / canvas.width) * 100,
                                    y: (rect.y / canvas.height) * 100,
                                    width: (rect.width / canvas.width) * 100,
                                    height: (rect.height / canvas.height) * 100,
                                    label: 'Motion'
                                });
                                
                                if (area > maxArea) {
                                    maxArea = area;
                                    maxRect = rect;
                                }
                            }
                        }
                        
                        if (maxRect) {
                            const centerX = (maxRect.x + maxRect.width / 2) / canvas.width;
                            const centerY = (maxRect.y + maxRect.height / 2) / canvas.height;
                            poiRef.current = { x: centerX * 100, y: centerY * 100 };
                            window.dispatchEvent(new CustomEvent('airo-person-moved', { detail: { x: centerX, force: true } }));
                        }
                        
                        diff.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
                    } else {
                        previousFrame = new cv.Mat();
                    }
                    
                    gray.copyTo(previousFrame);
                    gray.delete();
                    currentFrame.delete();
                } catch (e) {
                    console.warn("OpenCV Error", e);
                }

                const cvTime = performance.now() - cvStartTime;

                // Convert to base64
                const frameData = canvas.toDataURL('image/jpeg', isRemoteViewActiveRef.current ? 0.8 : 0.5);
                
                // Send to debug stream at a limited rate
                if (!(window as any).lastNetworkTime) (window as any).lastNetworkTime = 0;
                const networkRate = isRemoteViewActiveRef.current ? 33 : 1000; // 30fps streaming in remote view
                if (now - (window as any).lastNetworkTime > networkRate) {
                    (window as any).lastNetworkTime = now;
                    fetch('/api/debug/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: robotId,
                            frame: frameData,
                            data: {
                                ...contextDataRef.current,
                                boxes: [...boxes, ...personBoxesRef.current],
                                poi: poiRef.current,
                                recognizedNames: recognizedNamesRef.current,
                                fps: fps.toFixed(1),
                                cvTime: cvTime.toFixed(1),
                                resolution: `${canvas.width}x${canvas.height}`,
                                cooldowns: (window as any).personGreetingCooldowns || {},
                                unknownCooldown: (window as any).unknownPersonCooldown || 0
                            }
                        })
                    }).then(res => res.json()).then(res => {
                        // We can track if remote view is active by checking if there are subscribers
                        const isActive = !!res.isViewed;
                        setIsRemoteViewActive(isActive);
                        isRemoteViewActiveRef.current = isActive;
                    }).catch(() => {});
                }
            }
        };

        // Start checking if cv is available
        checkCv = setInterval(() => {
            const cv = (window as any).cv;
            if (cv && typeof cv.Mat === 'function') {
                clearInterval(checkCv);
                startCamera();
            }
        }, 500);

        return () => {
            active = false;
            clearInterval(checkCv);
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (previousFrame && !previousFrame.isDeleted()) previousFrame.delete();
        };
    }, [robotId]);

    return { contextData, isRemoteViewActive };
};
