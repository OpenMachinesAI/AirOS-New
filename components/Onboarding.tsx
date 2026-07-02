import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, Mic } from 'lucide-react';
import { getSharedCamera } from '../hooks/useSharedCamera';

export const Onboarding = ({ onComplete, speakTextSnippet, stopSpeech }: { onComplete: () => void, speakTextSnippet: (text: string) => void, stopSpeech: () => void }) => {
    const [step, setStep] = useState(0); // 0: intro & name, 1: listening for name, 2: face, 3: tutorial
    const [name, setName] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript.replace(/[.,]/g, '').trim();
                if (transcript) {
                    setName(transcript);
                    setStep(2);
                    handleRequestCamera();
                }
            };
            recognitionRef.current.onerror = (e: any) => {
                console.error("Speech recognition error in onboarding", e);
                setStep(0); // fallback to manual
            };
        }
    }, []);

    useEffect(() => {
        stopSpeech();
        if (step === 0) {
            speakTextSnippet("Hello! I'm Airo, your AI assistant. What's your name?");
        } else if (step === 2) {
            speakTextSnippet(`Nice to meet you, ${name}! Let's see that smile! Get your face in the frame and tap anywhere.`);
        } else if (step === 3) {
            speakTextSnippet(`All set, ${name}! To get my attention, just say 'Hey Airo' followed by your question.`);
        }
    }, [step, name]);

    useEffect(() => {
        if (step === 1 && recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error(e);
            }
        } else if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {}
        }
    }, [step]);

    const handleRequestCamera = () => {
        // Must be called from user interaction to bypass Safari constraints
        getSharedCamera().then(res => {
            if (videoRef.current && res.stream) {
                videoRef.current.srcObject = res.stream;
                videoRef.current.play().catch(e => console.warn("Onboarding video play failed:", e));
            }
        }).catch(console.error);
    };

    const handleCaptureFace = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL('image/jpeg', 0.8);
                
                try {
                    const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
                    const updated = [...familyMembers, { name: name.trim(), image }];
                    localStorage.setItem('airo_family_members', JSON.stringify(updated));
                } catch (e) {
                    console.error("Failed to save family member", e);
                }
                
                setStep(3);
            }
        }
    };

    return (
        <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white p-8 text-center overflow-hidden">
            <AnimatePresence mode="wait">
                {step === 0 && (
                    <motion.div 
                        key="intro"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className="max-w-md w-full bg-gray-900 rounded-3xl p-10 border border-white/10 shadow-2xl flex flex-col items-center"
                    >
                        <h1 className="text-4xl font-bold mb-4 tracking-tight text-rose-400">Hello!</h1>
                        <p className="text-gray-300 mb-8 text-xl">I'm Airo. What's your name?</p>
                        
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Type your name..."
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-6 py-4 text-white text-xl placeholder:text-white/40 outline-none focus:border-rose-400 focus:bg-white/20 transition-all text-center font-medium mb-6"
                        />
                        
                        <div className="flex gap-4 w-full">
                            <button 
                                onClick={() => { stopSpeech(); setStep(1); }}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl text-xl transition-all flex items-center justify-center gap-2"
                            >
                                <Mic className="w-6 h-6" /> Speak
                            </button>
                            <button 
                                onClick={() => {
                                    if (name.trim()) {
                                        setStep(2);
                                        handleRequestCamera();
                                    }
                                }} 
                                disabled={!name.trim()}
                                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-4 rounded-xl text-xl transition-all active:scale-95 shadow-lg"
                            >
                                Next
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 1 && (
                    <motion.div 
                        key="listening"
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="max-w-md w-full flex flex-col items-center justify-center"
                    >
                        <div className="w-32 h-32 bg-rose-500/20 rounded-full flex items-center justify-center animate-pulse mb-8 border border-rose-500/50">
                            <Mic className="w-16 h-16 text-rose-400" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Listening...</h2>
                        <p className="text-rose-300/60">Say your name</p>
                        <button onClick={() => setStep(0)} className="mt-8 text-white/50 hover:text-white transition-colors">Cancel</button>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div 
                        key="face"
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
                        className="max-w-2xl w-full h-full max-h-[80vh] flex flex-col items-center justify-center relative cursor-pointer"
                        onClick={handleCaptureFace}
                    >
                        <h1 className="text-3xl font-bold mb-4 tracking-tight text-white z-10">Nice to meet you, {name}!</h1>
                        <p className="text-gray-300 mb-6 text-lg z-10">Get your face in the frame and <b>tap anywhere</b>.</p>
                        
                        <div className="relative w-full flex-1 min-h-0 rounded-3xl overflow-hidden border-4 border-white/20 bg-black shadow-2xl mb-6 flex flex-col items-center justify-center group">
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="w-full h-full object-cover scale-x-[-1]"
                            ></video>
                            <div className="absolute inset-0 border-4 border-dashed border-white/40 rounded-3xl m-6 md:m-12 pointer-events-none opacity-50 flex items-center justify-center">
                                <div className="w-48 h-64 border-2 border-rose-400/50 rounded-full"></div>
                            </div>
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
                            
                            {/* Fallback button if auto-play fails */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleRequestCamera(); }}
                                className="absolute bg-white/20 hover:bg-white/30 backdrop-blur-md px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Camera className="w-5 h-5" /> Start Camera
                            </button>
                        </div>
                        
                        <canvas ref={canvasRef} className="hidden" />
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div 
                        key="tutorial"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className="max-w-md w-full bg-gray-900 rounded-3xl p-10 border border-white/10 shadow-2xl flex flex-col items-center"
                    >
                        <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-6 border border-green-500/50">
                            <Check className="w-10 h-10" />
                        </div>
                        <h1 className="text-3xl font-bold mb-4 tracking-tight text-white">All set, {name}!</h1>
                        <p className="text-gray-300 mb-8 text-lg">
                            To get my attention, just say <b>"Hey Airo"</b> followed by your question.
                        </p>
                        <button 
                            onClick={onComplete} 
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(22,163,74,0.4)]"
                        >
                            Finish Setup
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
