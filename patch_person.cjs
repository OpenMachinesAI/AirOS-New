const fs = require('fs');
let text = fs.readFileSync('hooks/usePersonDetection.ts', 'utf8');

const t1 = `    const lastGreetingTotalCountRef = useRef<number>(0);
    const [isDark, setIsDark] = useState(false);
    const [isMotionDetected, setIsMotionDetected] = useState(false);
    const lastFrameRef = useRef<ImageData | null>(null);`;
text = text.replace(/    const lastGreetingTotalCountRef = useRef<number>\(0\);/, t1);

const t2 = `                                    const imageData = ctx.getImageData(0, 0, vidW, vidH);
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

                                    frameMat = cv.imread(hiddenCanvasRef.current);`;
text = text.replace(/                                    frameMat = cv\.imread\(hiddenCanvasRef\.current\);/, t2);

const t3 = `    return { lastDetectedPersonXRef, isPersonPresent: lastDetectionResult, isDark, isMotionDetected };`;
text = text.replace(/    return \{ lastDetectedPersonXRef, isPersonPresent: lastDetectionResult \};/, t3);

fs.writeFileSync('hooks/usePersonDetection.ts', text);
