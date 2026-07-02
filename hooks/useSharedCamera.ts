import { useEffect, useState } from 'react';

let globalStream: MediaStream | null = null;
let globalVideo: HTMLVideoElement | null = null;
let referenceCount = 0;

let cameraPromise: Promise<{stream: MediaStream, video: HTMLVideoElement}> | null = null;

export async function getSharedCamera(): Promise<{stream: MediaStream, video: HTMLVideoElement}> {
    if (globalStream && globalVideo) {
        referenceCount++;
        return { stream: globalStream, video: globalVideo };
    }
    
    if (cameraPromise) {
        const res = await cameraPromise;
        referenceCount++;
        return res;
    }
    
    cameraPromise = (async () => {
        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                });
            } catch (e: any) {
                console.warn("Could not acquire shared camera with ideal constraints, trying basic video:", e.message);
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.setAttribute('playsinline', 'true');
            video.setAttribute('autoplay', 'true');
            video.setAttribute('muted', 'true');
            video.playsInline = true;
            video.muted = true;
            video.style.position = 'absolute';
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
            video.style.width = '320px';
            video.style.height = '240px';
            video.width = 320;
            video.height = 240;
            document.body.appendChild(video);
            
            await new Promise<void>((resolve) => {
                video.onloadedmetadata = () => {
                    video.play().then(resolve).catch(e => {
                        console.warn("Video play failed:", e);
                        resolve(); // Resolve anyway so we don't block forever
                    });
                };
            });
            
            globalStream = stream;
            globalVideo = video;
            return { stream, video };
        } finally {
            cameraPromise = null;
        }
    })();
    
    const res = await cameraPromise;
    referenceCount++;
    return res;
}

export function releaseSharedCamera() {
    referenceCount--;
    if (referenceCount <= 0) {
        if (globalStream) {
            globalStream.getTracks().forEach(t => t.stop());
            globalStream = null;
        }
        if (globalVideo) {
            globalVideo.remove();
            globalVideo = null;
        }
        referenceCount = 0;
    }
}
