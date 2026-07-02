const fs = require('fs');
let text = fs.readFileSync('hooks/usePersonDetection.ts', 'utf8');

const targetStr = `    if (!globalVideoElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = globalVideoElement.videoWidth || 320;
    canvas.height = globalVideoElement.videoHeight || 240;
    if (canvas.width === 0 || canvas.height === 0) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(globalVideoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);`;
    
const replaceStr = `    let video = globalVideoElement;
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
    return canvas.toDataURL('image/jpeg', 0.8);`;
    
text = text.replace(targetStr, replaceStr);
fs.writeFileSync('hooks/usePersonDetection.ts', text);
