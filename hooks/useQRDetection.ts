import { useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { getSharedCamera, releaseSharedCamera } from './useSharedCamera';

export function useQRDetection(isEnabled: boolean, onQrDetected: (text: string) => void) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        let stream: MediaStream | null = null;
        let isActive = true;
        let lastReportedText = '';
        let lastReportedTime = 0;

        async function startCamera() {
            try {
                const shared = await getSharedCamera();
                
                if (!isActive) {
                    releaseSharedCamera();
                    return;
                }

                videoRef.current = shared.video;
                requestAnimationFrame(scanQRCode);
            } catch (err) {
                console.error("QR Scanner err:", err);
            }
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        function scanQRCode() {
            if (!isActive || !videoRef.current || !context) return;

            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                canvas.height = videoRef.current.videoHeight;
                canvas.width = videoRef.current.videoWidth;
                context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });

                if (code) {
                    const now = Date.now();
                    if (code.data !== lastReportedText || now - lastReportedTime > 10000) {
                        lastReportedText = code.data;
                        lastReportedTime = now;
                        onQrDetected(code.data);
                    }
                }
            }
            requestAnimationFrame(scanQRCode);
        }

        startCamera();

        return () => {
            isActive = false;
            releaseSharedCamera();
            if (videoRef.current) {
                videoRef.current = null;
            }
        };
    }, [isEnabled, onQrDetected]);
}
