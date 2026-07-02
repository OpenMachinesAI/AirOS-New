import { useEffect, useRef, useState } from 'react';
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { getSharedCamera, releaseSharedCamera } from './useSharedCamera';

export let globalVideoElement: HTMLVideoElement | null = null;
export function setGlobalVideoElement(video: HTMLVideoElement | null) {
    globalVideoElement = video;
}

export async function captureCameraFrame(): Promise<string | null> {
    const isSimulator = new URLSearchParams(window.location.search).has('simulator');
    if (isSimulator) {
        const canvas = document.querySelector('canvas');
        if (canvas) {
            return canvas.toDataURL('image/jpeg', 0.8);
        }
    }
    
    let video = globalVideoElement;
    if (!video) {
        try {
            const shared = await getSharedCamera();
            video = shared.video;
        } catch (e) {
            console.error("Failed to get shared camera in captureCameraFrame", e);
            return null;
        }
    }
    if (!video) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    if (canvas.width === 0 || canvas.height === 0) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
}

// Bounding box intersection over union
function calculateIoU(box1: number[], box2: number[]) {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    const x_left = Math.max(x1, x2);
    const y_top = Math.max(y1, y2);
    const x_right = Math.min(x1 + w1, x2 + w2);
    const y_bottom = Math.min(y1 + h1, y2 + h2);
    
    if (x_right < x_left || y_bottom < y_top) return 0.0;
    
    const intersection_area = (x_right - x_left) * (y_bottom - y_top);
    const box1_area = w1 * h1;
    const box2_area = w2 * h2;
    const iou = intersection_area / (box1_area + box2_area - intersection_area);
    return iou;
}

interface TrackedPerson {
    id: number;
    bbox: number[];
    lastSeen: number;
    mouthMovementScores: number[];
    isTalking: boolean;
    lastMouthMat?: any; // cv.Mat
    faceThreshold: number;
    hasTriggeredGreeting: boolean;
}

export function usePersonDetection(isEnabled: boolean, onPersonDetected: (newCount: number, totalCount: number, faceThreshold?: number) => any, cooldownMs: number = 30000) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const onPersonDetectedRef = useRef(onPersonDetected);
    const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);

    const activeTracksRef = useRef<TrackedPerson[]>([]);
    const nextPersonId = useRef<number>(1);
    const lastDetectedPersonXRef = useRef<number>(0.5); 
    const lastDetectionResult = useRef<boolean>(false);
    const lastGreetingTimeRef = useRef<number>(0);
    const lastGreetingTotalCountRef = useRef<number>(0);
    const [isDark, setIsDark] = useState(false);
    const [isMotionDetected, setIsMotionDetected] = useState(false);
    const lastFrameRef = useRef<ImageData | null>(null);
    
    // For OpenCV processing
    const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        onPersonDetectedRef.current = onPersonDetected;
    }, [onPersonDetected]);

    useEffect(() => {
        let isActive = true;
        
        async function loadModel() {
            try {
                const loadedModel = await cocoSsd.load();
                if (isActive) setModel(loadedModel);
            } catch (err) {
                console.error("Failed to load coco-ssd model:", err);
            }
        }
        loadModel();
        
        hiddenCanvasRef.current = document.createElement('canvas');

        return () => {
            isActive = false;
            // Clean up OpenCV mats if any
            activeTracksRef.current.forEach(t => {
                if (t.lastMouthMat && typeof (window as any).cv !== 'undefined') {
                    try { t.lastMouthMat.delete(); } catch(e) {}
                }
            });
        };
    }, []);

    useEffect(() => {
        if (!isEnabled) return;
        let isActive = true;
        let timerId: NodeJS.Timeout | null = null;

        async function startCamera() {
            try {
                const shared = await getSharedCamera();
                if (!isActive) {
                    releaseSharedCamera();
                    return;
                }
                videoRef.current = shared.video;
                globalVideoElement = shared.video;
                
                runThrottledLoop();
            } catch (err) {
                console.error("Could not start background camera for person detection:", err);
            }
        }

        async function runThrottledLoop() {
            if (!isActive) return;
            const checkIntervalMs = 500; // Check more frequently for mouth tracking
            const cv = (window as any).cv;

            try {
                const now = Date.now();

                if (videoRef.current && model && videoRef.current.readyState >= 2) {
                    let newPeopleCount = 0;
                    
                    try {
                        const predictions = await model.detect(videoRef.current);
                        const personPreds = predictions.filter(p => p.class === 'person' && p.score > 0.4);
                        
                        const vidW = videoRef.current.videoWidth || 320;
                        const vidH = videoRef.current.videoHeight || 240;
                        
                        // OpenCV Frame extraction for mouth movement
                        let frameMat: any = null;
                        if (cv && typeof cv.Mat === 'function' && hiddenCanvasRef.current) {
                            hiddenCanvasRef.current.width = vidW;
                            hiddenCanvasRef.current.height = vidH;
                            const ctx = hiddenCanvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(videoRef.current, 0, 0, vidW, vidH);
                                try {
                                    const imageData = ctx.getImageData(0, 0, vidW, vidH);
                                    const data = imageData.data;
                                    let totalBrightness = 0;
                                    let motionCount = 0;
                                    
                                    // Sample every 4th pixel for performance (i += 16)
                                    for (let i = 0; i < data.length; i += 16) {
                                        const r = data[i];
                                        const g = data[i + 1];
                                        const b = data[i + 2];
                                        const brightness = (r + g + b) / 3;
                                        totalBrightness += brightness;
                                        
                                        if (lastFrameRef.current) {
                                            const lastR = lastFrameRef.current.data[i];
                                            const lastG = lastFrameRef.current.data[i + 1];
                                            const lastB = lastFrameRef.current.data[i + 2];
                                            const diff = Math.abs(r - lastR) + Math.abs(g - lastG) + Math.abs(b - lastB);
                                            if (diff > 50) motionCount++;
                                        }
                                    }
                                    const pixelsSampled = data.length / 16;
                                    const avgBrightness = totalBrightness / pixelsSampled;
                                    setIsDark(avgBrightness < 20); // 20 out of 255 is quite dark
                                    setIsMotionDetected(motionCount > (pixelsSampled * 0.05)); // 5% of pixels changed
                                    lastFrameRef.current = imageData;

                                    frameMat = cv.imread(hiddenCanvasRef.current);
                                } catch (e) {
                                    console.warn("OpenCV imread failed", e);
                                }
                            }
                        }

                        // Track people with IoU
                        const currentTracks = activeTracksRef.current;
                        const matchedPreds = new Set<number>();
                        
                        // Age tracks and match
                        for (const track of currentTracks) {
                            let bestIoU = 0.3; // threshold
                            let bestPredIdx = -1;
                            
                            for (let i = 0; i < personPreds.length; i++) {
                                if (matchedPreds.has(i)) continue;
                                const iou = calculateIoU(track.bbox, personPreds[i].bbox);
                                if (iou > bestIoU) {
                                    bestIoU = iou;
                                    bestPredIdx = i;
                                }
                            }
                            
                            if (bestPredIdx !== -1) {
                                const predBox = personPreds[bestPredIdx].bbox;
                                track.bbox = predBox;
                                track.lastSeen = now;
                                matchedPreds.add(bestPredIdx);
                                
                                // Mouth movement detection with OpenCV
                                if (frameMat) {
                                    try {
                                        // Estimate face region (top 30% of body box)
                                        const [x, y, w, h] = predBox;
                                        const faceX = Math.max(0, x + w * 0.2);
                                        const faceY = Math.max(0, y);
                                        const faceW = Math.min(vidW - faceX, w * 0.6);
                                        const faceH = Math.min(vidH - faceY, h * 0.3);
                                        
                                        // Estimate mouth region (lower half of face)
                                        const mouthY = faceY + faceH * 0.6;
                                        const mouthH = faceH * 0.4;
                                        
                                        if (faceW > 10 && mouthH > 10) {
                                            const rect = new cv.Rect(Math.floor(faceX), Math.floor(mouthY), Math.floor(faceW), Math.floor(mouthH));
                                            const mouthRoi = frameMat.roi(rect);
                                            const grayMouth = new cv.Mat();
                                            cv.cvtColor(mouthRoi, grayMouth, cv.COLOR_RGBA2GRAY);
                                            
                                            if (track.lastMouthMat) {
                                                const diff = new cv.Mat();
                                                cv.absdiff(grayMouth, track.lastMouthMat, diff);
                                                cv.threshold(diff, diff, 25, 255, cv.THRESH_BINARY);
                                                
                                                // Calculate non-zero pixels (motion)
                                                const nonZero = cv.countNonZero(diff);
                                                const motionScore = nonZero / (rect.width * rect.height);
                                                
                                                track.mouthMovementScores.push(motionScore);
                                                if (track.mouthMovementScores.length > 5) track.mouthMovementScores.shift();
                                                
                                                const avgMotion = track.mouthMovementScores.reduce((a, b) => a + b, 0) / track.mouthMovementScores.length;
                                                track.isTalking = avgMotion > 0.05; // threshold for talking
                                                
                                                diff.delete();
                                            }
                                            
                                            if (track.lastMouthMat) track.lastMouthMat.delete();
                                            track.lastMouthMat = grayMouth;
                                            mouthRoi.delete();
                                        }
                                    } catch (e) {
                                        // Ignore OpenCV errors during ROI
                                    }
                                }
                            }
                        }
                        
                        // Add new tracks
                        for (let i = 0; i < personPreds.length; i++) {
                            if (!matchedPreds.has(i)) {
                                const predBox = personPreds[i].bbox;
                                activeTracksRef.current.push({
                                    id: nextPersonId.current++,
                                    bbox: predBox,
                                    lastSeen: now,
                                    mouthMovementScores: [],
                                    isTalking: false,
                                    faceThreshold: 0,
                                    hasTriggeredGreeting: false
                                });
                            }
                        }
                        
                        let peopleToGreet = 0;
                        let averageThreshold = 0;
                        
                        for (let track of activeTracksRef.current) {
                            if (!track.hasTriggeredGreeting) {
                                const [x, y, w, h] = track.bbox;
                                if (w > vidW * 0.25 || h > vidH * 0.4) {
                                    track.faceThreshold += 15;
                                } else {
                                    track.faceThreshold += 5;
                                }
                                
                                if (track.faceThreshold >= 65) {
                                    track.hasTriggeredGreeting = true;
                                    peopleToGreet++;
                                    averageThreshold += track.faceThreshold;
                                }
                            }
                        }
                        
                        if (peopleToGreet > 0) averageThreshold /= peopleToGreet;

                        if (frameMat) {
                            frameMat.delete();
                        }
                        
                        // Cleanup old tracks (not seen for > 60 seconds)
                        activeTracksRef.current = activeTracksRef.current.filter(t => {
                            const keep = now - t.lastSeen < 60000;
                            if (!keep && t.lastMouthMat && cv) {
                                try { t.lastMouthMat.delete(); } catch(e) {}
                            }
                            return keep;
                        });

                        lastDetectionResult.current = activeTracksRef.current.length > 0;
                        
                        // Determine main person X (closest to center or talking)
                        if (activeTracksRef.current.length > 0) {
                            const talkingPerson = activeTracksRef.current.find(t => t.isTalking) || activeTracksRef.current[0];
                            const [x, y, width] = talkingPerson.bbox;
                            lastDetectedPersonXRef.current = (x + width / 2) / vidW;
                        }

                        // Trigger event if talking
                        const talkingPeople = activeTracksRef.current.filter(t => t.isTalking);
                        if (talkingPeople.length > 0) {
                            window.dispatchEvent(new CustomEvent('airo-person-talking', { 
                                detail: { count: talkingPeople.length, ids: talkingPeople.map(t => t.id) } 
                            }));
                        }

                        // Emit tracks for debug overlay
                        window.dispatchEvent(new CustomEvent('airo-person-tracked', {
                            detail: {
                                vidW,
                                vidH,
                                tracks: activeTracksRef.current.map(t => ({
                                    id: t.id,
                                    bbox: t.bbox,
                                    faceThreshold: t.faceThreshold,
                                    isTalking: t.isTalking
                                }))
                            }
                        }));

                        // Greet logic
                        if (peopleToGreet > 0) {
                            console.log(`[Person] Detected ${peopleToGreet} person/people reaching threshold!`);
                            
                            // Trigger callback. App.tsx will handle per-person cooldowns.
                            await onPersonDetectedRef.current(peopleToGreet, activeTracksRef.current.length, Math.round(averageThreshold));
                        }

                    } catch(e) {
                        console.error("Inference err:", e);
                    }
                }
            } catch (e) {
                console.error("Exception in person detection pipeline:", e);
            }

            if (isActive) {
                timerId = setTimeout(runThrottledLoop, checkIntervalMs);
            }
        }

        if (model) {
            startCamera();
        }

        return () => {
            isActive = false;
            if (timerId) clearTimeout(timerId);
            releaseSharedCamera();
            if (videoRef.current) {
                videoRef.current = null;
                globalVideoElement = null;
            }
        };
    }, [model, cooldownMs, isEnabled]);

    return { lastDetectedPersonXRef, isPersonPresent: lastDetectionResult, isDark, isMotionDetected };
}
