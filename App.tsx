
import React, { useEffect, useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Eyes } from './components/Eyes';
import { VisualDisplay } from './components/VisualDisplay';
import { useGeminiLive } from './hooks/useGeminiLive';
import { WakeWordDetector } from './services/wakeWord';
import { AppState, EyeState } from './types';
import { Ollie } from './utils/ollie';

// Version: 1.6.1 - Fix Threading & Resampling
export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [wakeState, setWakeState] = useState(false); 
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [initialAudio, setInitialAudio] = useState<Float32Array | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [backgroundTimer, setBackgroundTimer] = useState<any>(null);
  const [ollieConnected, setOllieConnected] = useState(false);
  
  const wakeWordRef = useRef<WakeWordDetector | null>(null);
  const holdTimerRef = useRef<any>(null);
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const thinkingAudioRef = useRef<HTMLAudioElement | null>(null);
  const ollieRef = useRef<Ollie | null>(null);

  const handleRotate360 = async () => {
      if (ollieRef.current) {
          await ollieRef.current.spinLeftFor("forward", 360, 150);
      }
  };

  const { connect, disconnect, isAiSpeaking, isThinking, connectionState, visualContent, setVisualContent } = useGeminiLive(
    process.env.API_KEY, 
    () => {
        setWakeState(false);
        setIsPreparing(false);
    },
    location,
    handleRotate360
  );

  const isMovingRef = useRef(false);

  useEffect(() => {
      if (isAiSpeaking && ollieRef.current && !isMovingRef.current) {
          const doMovement = async () => {
              if (!ollieRef.current) return;
              isMovingRef.current = true;
              try {
                  await ollieRef.current.spinLeftFor("forward", 15, 100);
                  await ollieRef.current.spinLeftFor("reverse", 15, 100);
              } finally {
                  isMovingRef.current = false;
              }
          };
          doMovement();
      }
  }, [isAiSpeaking]);

  const handleConnectOllie = async () => {
      try {
          const ollie = new Ollie();
          await ollie.request();
          await ollie.connect();
          await ollie.init();
          ollieRef.current = ollie;
          setOllieConnected(true);
          
          // Auto calibrate
          await ollie.startupCalibration(1600, 1600, 120);
      } catch (e) {
          console.error("Failed to connect Ollie", e);
      }
  };

  useEffect(() => {
      connectionStateRef.current = connectionState;
  }, [connectionState]);

  // Initialize Wake Word Detector
  useEffect(() => {
    thinkingAudioRef.current = new Audio('/Loading Dips.wav');
    thinkingAudioRef.current.loop = true;

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            setLocation(`${position.coords.latitude}, ${position.coords.longitude}`);
        }, (error) => {
            console.error("Geolocation error:", error);
        });
    }

    wakeWordRef.current = new WakeWordDetector((audioBuffer) => {
        if (connectionStateRef.current === AppState.IDLE) {
            setInitialAudio(audioBuffer);
            setWakeState(true);
            setStatusText("Wake Word Detected!");
        }
    });

    return () => {
        wakeWordRef.current?.stop();
    };
  }, []); // Run once on mount to create instance

  // Model Loading Logic
  const handleStart = async () => {
    if (!wakeWordRef.current) return;
    
    setIsLoadingModels(true);
    setHasStarted(true);
    
    try {
        await wakeWordRef.current.load();
        wakeWordRef.current.start();
        setIsLoadingModels(false);
    } catch (e) {
        console.error("Failed to load models", e);
        setStatusText("Model Load Error");
        setIsLoadingModels(false);
        // Optionally fallback or alert user
    }
  };

  // Connection Management
  useEffect(() => {
    let timeoutId: any;

    if (wakeState && connectionState === AppState.IDLE) {
        setIsPreparing(true);
        wakeWordRef.current?.stop(); // Ensure it's stopped before connecting
        
        // Short delay to ensure mic release
        timeoutId = setTimeout(() => {
            if (wakeState) {
                connect(0, initialAudio).finally(() => {
                    setIsPreparing(false);
                    setInitialAudio(null);
                });
            }
        }, 300);

    } else if (!wakeState && hasStarted && !isLoadingModels && connectionState === AppState.IDLE) {
        // Resume listening if we are idle and not connecting
        disconnect(); // Ensure any previous session is cleaned up
        
        timeoutId = setTimeout(() => {
             if (!wakeState && !isPreparing) {
                wakeWordRef.current?.start();
             }
        }, 800);
    }

    return () => clearTimeout(timeoutId);
  }, [wakeState, hasStarted, isLoadingModels, connectionState, initialAudio]);

  useEffect(() => {
      if (isThinking) {
          thinkingAudioRef.current?.play().catch(e => console.error("Audio play error", e));
      } else {
          if (thinkingAudioRef.current) {
              thinkingAudioRef.current.pause();
              thinkingAudioRef.current.currentTime = 0;
          }
      }
  }, [isThinking]);

  // Background timer tick
  useEffect(() => {
      if (!backgroundTimer?.running) return;

      const isTimerVisible = visualContent?.type === 'predefined' && visualContent?.component === 'timer';
      if (isTimerVisible) return;

      const interval = setInterval(() => {
          setBackgroundTimer((prev: any) => {
              if (!prev || !prev.running) return prev;
              const nextRemaining = prev.remainingSeconds - 1;
              if (nextRemaining <= 0) {
                  // Timer finished! Resurface it.
                  setVisualContent({
                      type: 'predefined',
                      component: 'timer',
                      content: {
                          ...prev,
                          remainingSeconds: 0,
                          running: false
                      }
                  });
                  return { ...prev, remainingSeconds: 0, running: false };
              }
              return { ...prev, remainingSeconds: nextRemaining };
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [backgroundTimer?.running, visualContent]);

  let eyeState = EyeState.IDLE;
  if (connectionState === AppState.ACTIVE) {
      if (isThinking) eyeState = EyeState.THINKING;
      else if (isAiSpeaking) eyeState = EyeState.SPEAKING;
      else eyeState = EyeState.LISTENING;
  } else if (connectionState === AppState.CONNECTING || isPreparing || isLoadingModels) {
      eyeState = EyeState.LISTENING;
  }

  const touchStartY = useRef<number>(0);

  // Auto-close timer after 7 seconds
  useEffect(() => {
      let timeout: NodeJS.Timeout;
      if (visualContent?.component === 'timer') {
          timeout = setTimeout(() => {
              setVisualContent(null);
          }, 7000);
      }
      return () => clearTimeout(timeout);
  }, [visualContent]);

  const handlePointerDown = (e: React.PointerEvent) => {
      touchStartY.current = e.clientY;
      if (!hasStarted || isPreparing || isLoadingModels || connectionState !== AppState.IDLE) return;
      holdTimerRef.current = setTimeout(() => {
          setWakeState(true);
          setStatusText("Manual Hold Triggered");
      }, 700);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
      }
      
      // Detect swipe up/down
      const touchEndY = e.clientY;
      const deltaY = touchEndY - touchStartY.current;
      
      if (deltaY < -50 && !visualContent && backgroundTimer && backgroundTimer.remainingSeconds > 0) {
          // Swipe up to reopen timer
          setVisualContent({ type: 'predefined', component: 'timer', content: backgroundTimer });
      } else if (deltaY > 50 && visualContent?.component === 'timer') {
          // Swipe down to close timer
          setVisualContent(null);
      }
  };

  if (!hasStarted) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white gap-4">
        <button 
            onClick={handleStart}
            className="px-8 py-4 bg-gray-900 border border-gray-700 rounded-full hover:bg-gray-800 transition-all font-mono text-xl shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        >
          Initialize Airo System
        </button>
        <button 
            onClick={handleConnectOllie}
            disabled={ollieConnected}
            className={`px-6 py-2 border rounded-full transition-all font-mono text-sm ${ollieConnected ? 'bg-green-900 border-green-700 text-green-300' : 'bg-gray-800 border-gray-600 hover:bg-gray-700'}`}
        >
          {ollieConnected ? 'Ollie Connected' : 'Connect Ollie Robot'}
        </button>
        <p className="text-gray-500 text-sm">Vision & Voice Active (v1.6.1)</p>
      </div>
    );
  }

  return (
    <div 
        className="relative h-screen w-screen overflow-hidden select-none bg-black"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    >
      <div className={`transition-opacity duration-1000 ${visualContent?.component === 'timer' ? 'opacity-0' : 'opacity-100'}`}>
        <Eyes state={eyeState} />
      </div>
      
      {backgroundTimer && backgroundTimer.remainingSeconds > 0 && visualContent?.component !== 'timer' && (
          <div 
              className="absolute top-6 right-6 bg-gray-900/80 backdrop-blur border border-white/10 rounded-full px-4 py-2 text-white font-mono text-sm cursor-pointer hover:bg-gray-800 transition-colors z-50 flex items-center gap-3 shadow-lg"
              onClick={() => setVisualContent({ type: 'predefined', component: 'timer', content: backgroundTimer })}
          >
              <div className={`w-2 h-2 rounded-full ${backgroundTimer.running ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              {Math.floor(backgroundTimer.remainingSeconds / 60)}:{(backgroundTimer.remainingSeconds % 60).toString().padStart(2, '0')}
          </div>
      )}

      <AnimatePresence>
        {visualContent && (
          <VisualDisplay 
            data={visualContent} 
            onDismiss={() => setVisualContent(null)} 
            onSyncTimer={(timerData) => setBackgroundTimer(timerData)}
          />
        )}
      </AnimatePresence>
      
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none gap-3 z-10">
          <span className={`inline-block w-2.5 h-2.5 rounded-full transition-all duration-700 ${
              connectionState === AppState.ACTIVE ? 'bg-green-500 shadow-[0_0_15px_#22c55e]' : 
              connectionState === AppState.CONNECTING || isPreparing || isLoadingModels ? 'bg-yellow-500 animate-pulse' : 
              connectionState === AppState.ERROR ? 'bg-red-500' : 'bg-white/5'
          }`}></span>
          
          <div className="text-gray-500 font-mono text-[10px] uppercase tracking-[0.2em] opacity-60 text-center px-4 max-w-xs truncate">
              {isLoadingModels ? "Initializing..." : 
               isPreparing ? "Connecting..." : 
               (statusText || "Awaiting 'Hey Arrow'")}
          </div>
          
          {connectionState === AppState.ERROR && (
              <div className="text-red-500 font-mono text-xs animate-pulse bg-red-900/10 px-3 py-1 rounded-full border border-red-900/20">
                  SYSTEM BUSY - RECONNECTING
              </div>
          )}
      </div>
    </div>
  );
}
