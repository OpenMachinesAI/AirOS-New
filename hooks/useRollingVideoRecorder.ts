import { useState, useEffect, useRef } from 'react';
import { globalVideoElement } from './usePersonDetection';

export function useRollingVideoRecorder(enabled: boolean, wakeState: boolean) {
    const [finalPhotos, setFinalPhotos] = useState<string[] | null>(null);
    const photosRef = useRef<{ data: string, timestamp: number }[]>([]);
    const isRecordingRef = useRef(false);

    useEffect(() => {
        if (!enabled) {
            photosRef.current = [];
            return;
        }

        let isMounted = true;
        let timer: NodeJS.Timeout;

        const captureFrame = () => {
            if (!isMounted) return;

            if (globalVideoElement && globalVideoElement.readyState >= 2) { // HAVE_CURRENT_DATA
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 640;
                    canvas.height = 480;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(globalVideoElement, 0, 0, canvas.width, canvas.height);
                        const base64data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                        
                        photosRef.current.push({
                            data: base64data,
                            timestamp: Date.now()
                        });

                        // If NOT in a wake state, keep only photos from the last 1.5 seconds
                        if (!isRecordingRef.current) {
                            const cutoff = Date.now() - 1500;
                            while (photosRef.current.length > 0 && photosRef.current[0].timestamp < cutoff) {
                                photosRef.current.shift();
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Failed to capture rolling photo:", e);
                }
            }

            // 2 frames per second -> 500ms
            timer = setTimeout(captureFrame, 500);
        };

        captureFrame();

        return () => {
            isMounted = false;
            if (timer) clearTimeout(timer);
        };
    }, [enabled]);

    useEffect(() => {
        isRecordingRef.current = wakeState;

        if (!wakeState && photosRef.current.length > 0) {
            // Wake state ended, output the collected photos
            const collectedBase64 = photosRef.current.map(p => p.data);
            setFinalPhotos(collectedBase64);
            
            // Clear but keep recording
            photosRef.current = [];
        } else if (wakeState) {
            setFinalPhotos(null);
        }
    }, [wakeState]);

    return finalPhotos; // this is now string[] | null
}

