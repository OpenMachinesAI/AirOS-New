import releaseInfo from "./release_info.json";

import React, { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eyes } from './components/Eyes';
import { VisualDisplay } from './components/VisualDisplay';
import { MainMenu } from './components/MainMenu';
import { useGeminiLive } from './hooks/useGeminiLive';
import { WakeWordDetector } from './services/wakeWord';
import { AppState, EyeState, ErrorLevel, AiroError } from './types';
import { ArduinoController } from './utils/arduino';
import { MBotSimulator } from './utils/mbotSimulator';
import { appLogger } from './utils/logger';
import { playSound } from './utils/soundEffects';
import { usePersonDetection, captureCameraFrame } from './hooks/usePersonDetection';
import { getSharedCamera } from './hooks/useSharedCamera';
import { useQRDetection } from './hooks/useQRDetection';
import { useRollingVideoRecorder } from './hooks/useRollingVideoRecorder';
import { AIR_CARDS, AirCard } from './utils/airCards';
import { processAirScript, AirScriptState } from './utils/airScript';
import { AiroErrorBoundary } from './components/ErrorBoundary';
import { ErrorScreens } from './components/ErrorScreens';
import { useAiroContext } from './hooks/useAiroContext';

import { Onboarding } from './components/Onboarding';

// Version: 1.11
export default function App() {
  const [airoError, setAiroError] = useState<AiroError | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [bootState, setBootState] = useState<'BOOTING' | 'WAITING' | 'DONE'>('BOOTING');
  const [wakeState, setWakeState] = useState(false); 
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [initialAudio, setInitialAudio] = useState<Float32Array | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [airScriptState, setAirScriptState] = useState<AirScriptState | null>(null);
  const [localMemory, setLocalMemory] = useState<Record<string, string>>({});
  const [airoBirthday, setAiroBirthday] = useState<string>("");
  const [timers, setTimers] = useState<any[]>([]);
  const [mbotConnected, setMbotConnected] = useState(false);
  const [airoFlags, setAiroFlags] = useState<{
      microphoneMuted: boolean;
      faceRecognitionEnabled: boolean;
      faceRecognitionIntervalMs: number;
      requireActionConfirmation: boolean;
      ignoreUnknownFaces: boolean;
      videoContextEnabled: boolean;
  }>({
      microphoneMuted: false,
      faceRecognitionEnabled: true,
      faceRecognitionIntervalMs: 300000,
      requireActionConfirmation: true,
      ignoreUnknownFaces: true,
      videoContextEnabled: true
  });
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const [robotId, setRobotId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [aiUsageSeconds, setAiUsageSeconds] = useState(0);
  const aiUsageLimitSeconds = 1800; // 30 minutes
  // User-facing "Classic Mode" toggle in AI Usage settings. Classic mode (REST + TTS) is free and
  // never counts towards aiUsageSeconds; realtime (Live API) is the expensive one being metered.
  const [classicModePreference, setClassicModePreference] = useState<boolean>(() => {
      try { return localStorage.getItem('airo_classic_mode') === 'true'; } catch (e) { return false; }
  });
  const usageLimitReached = aiUsageSeconds >= aiUsageLimitSeconds;
  const AI_USAGE_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const resetAiUsage = () => {
      setAiUsageSeconds(0);
      try {
          localStorage.setItem('airo_audio_usage', '0');
          localStorage.setItem('airo_usage_reset_at', Date.now().toString());
      } catch (e) {}
  };

  const [qrCommanderEnabled, setQrCommanderEnabled] = useState(false);
  const [qrModeActive, setQrModeActive] = useState(false);
  
  const [activeAirCard, setActiveAirCard] = useState<AirCard | null>(null);
  const [installingAirCard, setInstallingAirCard] = useState<AirCard | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const activeAirCardRef = useRef<AirCard | null>(null);
  const bKeyHeldRef = useRef(false);
  const tKeyHoldTimerRef = useRef<any>(null);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const hasPromptedUpdateRef = useRef(false);
  useEffect(() => {
     fetch("/api/latest-version").then(res => res.json()).then(data => {
         if (data.version && data.version !== releaseInfo.version) {
             setUpdateAvailable(data.version);
         }
     }).catch(e => console.error("Update check failed", e));
  }, []);
  useEffect(() => {
    if (window.location.hash === "#update") {
       window.location.hash = "";
       setTimeout(() => {
           playSound.bubblySuccess();
           const u = new SpeechSynthesisUtterance(`My systems have successfully updated to version ${releaseInfo.version}! Would you like me to tell you what's new?`);
           u.voice = window.speechSynthesis.getVoices().find(v => v.name.includes("Google US English")) || null;
           u.pitch = 1.3; u.rate = 1.05;
           window.speechSynthesis.speak(u);
           setVisualContent({
              type: "predefined",
              component: "confirmation",
              title: "Update Installed",
              content: {
                 subtitle: "Version " + releaseInfo.version,
                 confirmText: "What's New",
                 cancelText: "Dismiss"
              }
           });
       }, 5000);
    }
  }, []);

  const { contextData, isRemoteViewActive } = useAiroContext(robotId || '');

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key.toLowerCase() === 'b') {
              bKeyHeldRef.current = true;
          }
          if (e.key.toLowerCase() === 't' && !tKeyHoldTimerRef.current) {
              tKeyHoldTimerRef.current = setTimeout(() => {
                  tKeyHoldTimerRef.current = null;
                  resetAiUsage();
              }, 3000);
          }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key.toLowerCase() === 'b') {
              bKeyHeldRef.current = false;
          }
          if (e.key.toLowerCase() === 't' && tKeyHoldTimerRef.current) {
              clearTimeout(tKeyHoldTimerRef.current);
              tKeyHoldTimerRef.current = null;
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          if (tKeyHoldTimerRef.current) {
              clearTimeout(tKeyHoldTimerRef.current);
              tKeyHoldTimerRef.current = null;
          }
      };
  }, []);

  useEffect(() => {
    const checkPerms = async () => {
      let permError = false;
      if (!('wakeLock' in navigator)) {
        permError = true;
      } else {
        try {
          if (!wakeLockRef.current) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            setWakeLockActive(true);
            wakeLockRef.current.addEventListener('release', () => {
              wakeLockRef.current = null;
              setWakeLockActive(false);
            });
          }
        } catch (err: any) {
          permError = true;
          console.warn('Boot Screen Wake Lock request failed:', err.message);
        }
      }

      setTimeout(() => {
        if (permError) {
          setPermissionError("AirOS cannot find these permissions: wakeLock");
        }
        setBootState('WAITING');
      }, 2500);
    };
    checkPerms();
  }, []);

  useEffect(() => {
      activeAirCardRef.current = activeAirCard;
  }, [activeAirCard]);

  useEffect(() => {
      localStorage.setItem('airo_flags', JSON.stringify(airoFlags));
  }, [airoFlags]);

  useEffect(() => {
      try { localStorage.setItem('airo_classic_mode', classicModePreference.toString()); } catch (e) {}
  }, [classicModePreference]);

  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [showDancePopup, setShowDancePopup] = useState(false);
  const [libraryItems, setLibraryItems] = useState<Array<{ url: string, prompt?: string, timestamp: number, type: 'generated' | 'photo' }>>(() => {
      try {
          const stored = localStorage.getItem('airo_library');
          return stored ? JSON.parse(stored) : [];
      } catch (e) {
          return [];
      }
  });

  const saveLibraryItem = (item: { url: string, prompt?: string, timestamp: number, type: 'generated' | 'photo' }) => {
      setLibraryItems(prev => {
          const newItems = [...prev, item];
          try {
              localStorage.setItem('airo_library', JSON.stringify(newItems));
          } catch(e) {}
          return newItems;
      });
  };

  const deleteLibraryItem = (timestamp: number) => {
      setLibraryItems(prev => {
          const newItems = prev.filter(item => item.timestamp !== timestamp);
          try {
              localStorage.setItem('airo_library', JSON.stringify(newItems));
          } catch(e) {}
          return newItems;
      });
  };

  const isAlarmPlayingRef = useRef(false);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTimerActionTime = useRef<number>(0);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
      const rId = localStorage.getItem('airo_robot_id');
      if (!rId) {
          setShowOnboarding(true);
      } else {
          setRobotId(rId);
          const resetAt = Number(localStorage.getItem('airo_usage_reset_at') || 0);
          if (!resetAt || Date.now() - resetAt >= AI_USAGE_RESET_INTERVAL_MS) {
              resetAiUsage();
          } else {
              setAiUsageSeconds(Number(localStorage.getItem('airo_audio_usage') || 0));
          }
          setQrCommanderEnabled(localStorage.getItem('airo_qr_commander') === 'true');
      }
  }, []);

  const handleApproveRobotId = () => {
      const newId = Math.random().toString().slice(2, 12);
      localStorage.setItem('airo_robot_id', newId);
      localStorage.setItem('airo_audio_usage', '0');
      localStorage.setItem('airo_usage_reset_at', Date.now().toString());
      localStorage.setItem('airo_qr_commander', 'false');
      setRobotId(newId);
      setShowOnboarding(false);
  };

  const updateQrCommander = (enabled: boolean) => {
      setQrCommanderEnabled(enabled);
      localStorage.setItem('airo_qr_commander', enabled.toString());
  };

  useEffect(() => {
    isAlarmPlayingRef.current = isAlarmPlaying;
  }, [isAlarmPlaying]);

  useEffect(() => {
    if (hasStarted) {
      // Intilize the camera on startup so person detection works always
      getSharedCamera().catch(e => console.warn("Background camera init failed", e));
    }
  }, [hasStarted]);

  useEffect(() => {
    alarmAudioRef.current = new Audio('/timer_or_alarm_ava.mp3');
    alarmAudioRef.current.loop = true;
    return () => {
      alarmAudioRef.current?.pause();
    };
  }, []);

  // Screen Wake Lock API management
  const wakeLockRef = useRef<any>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  useEffect(() => {
    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      if (wakeLockRef.current) return;
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch (err: any) {
        console.warn('Screen Wake Lock request failed:', err.message);
      }
    }

    // Try immediately
    requestWakeLock();

    // Try when visibility changes (back from background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Try on click/tap gesture (browsers often require user interaction)
    const handleUserGesture = () => {
      requestWakeLock();
    };
    document.addEventListener('click', handleUserGesture);
    document.addEventListener('pointerdown', handleUserGesture);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('click', handleUserGesture);
      document.removeEventListener('pointerdown', handleUserGesture);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((e: any) => console.error(e));
      }
    };
  }, []);

  useEffect(() => {
    isAlarmPlayingRef.current = isAlarmPlaying;
    if (isAlarmPlaying && mbotRef.current) {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout;
        const doShake = async () => {
            if (!isMounted || !isAlarmPlayingRef.current || !mbotRef.current) return;
            if (!isMovingRef.current) {
                isMovingRef.current = true;
                try {
                    await mbotRef.current.leftForward(130);
                    await new Promise(r => setTimeout(r, 150));
                    await mbotRef.current.leftReverse(130);
                    await new Promise(r => setTimeout(r, 150));
                } finally {
                    isMovingRef.current = false;
                    if (mbotRef.current) await mbotRef.current.stopMotors();
                }
            }
            if (isMounted && isAlarmPlayingRef.current) {
                timeoutId = setTimeout(doShake, 500);
            }
        };
        doShake();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }
  }, [isAlarmPlaying]);

  const startAlarm = () => {
    playSound.bubblySuccess();
    if (alarmAudioRef.current) {
      alarmAudioRef.current.currentTime = 0;
      alarmAudioRef.current.play().catch(() => {});
      setIsAlarmPlaying(true);
      isAlarmPlayingRef.current = true; // Sync immediately
      setStatusText("Alarm ringing... Say 'Stop'");
      
      // Inject prompt if in an active chat
      if (connectionStateRef.current === AppState.ACTIVE && sendClientContent) {
          sendClientContent("One of the timers just finished and is ringing! Tell the user that their timer is ringing.");
      }
    }
  };

  const stopAlarm = () => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
    }
    setIsAlarmPlaying(false);
    isAlarmPlayingRef.current = false;
    setWakeState(false);
    setStatusText("Alarm stopped");
    
    // Auto dismiss active timer visualization when alarm stops
    setVisualContent(null);
    // Remove the finished timers so they don't ring again
    setTimers(prev => prev.filter(t => t.remainingSeconds > 0));

    disconnect();
  };

  const handleTimerAction = (action: string, payload: any) => {
    playSound.bubblyPop();
    lastTimerActionTime.current = Date.now();
    if (action === 'create') {
      const duration = payload.durationSeconds || 300;
      const title = payload.title || `Timer ${timers.length + 1}`;
      const newId = Math.random().toString(36).substring(2, 9);
      const newTimer = {
        id: newId,
        title,
        durationSeconds: duration,
        remainingSeconds: duration,
        endTime: Date.now() + duration * 1000,
        running: true,
        highlighted: true
      };
      setTimers((prev) => {
        const updated = [...prev.map(t => ({ ...t, highlighted: false })), newTimer];
        setVisualContent({
          type: 'predefined',
          component: 'timer',
          content: { timers: updated }
        });
        return updated;
      });

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setTimers(prev => {
          const updated = prev.map(t => t.id === newId ? { ...t, highlighted: false } : t);
          setVisualContent(prevVis => {
            if (prevVis?.component === 'timer') {
              return { ...prevVis, content: { timers: updated } };
            }
            return prevVis;
          });
          return updated;
        });
      }, 5000);
    } else if (action === 'cancel') {
      const titleToCancel = payload.title?.toLowerCase() || '';
      setTimers((prev) => {
        const updated = prev.filter(t => {
          const label = t.title.toLowerCase();
          return !label.includes(titleToCancel) && !titleToCancel.includes(label);
        });
        if (updated.length === 0) {
          setVisualContent(null);
        } else {
          setVisualContent(prevVis => {
            if (prevVis?.component === 'timer') {
              return { ...prevVis, content: { timers: updated } };
            }
            return prevVis;
          });
        }
        return updated;
      });
    } else if (action === 'pause') {
      const titleToPause = payload.title?.toLowerCase() || '';
      let pausedId = '';
      setTimers((prev) => {
        const updated = prev.map(t => {
          const label = t.title.toLowerCase();
          if (label.includes(titleToPause) || titleToPause.includes(label)) {
            pausedId = t.id;
            return { ...t, running: false, endTime: undefined, highlighted: true };
          }
          return { ...t, highlighted: false };
        });
        setVisualContent({
          type: 'predefined',
          component: 'timer',
          content: { timers: updated }
        });
        return updated;
      });

      if (pausedId) {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          setTimers(prev => {
            const updated = prev.map(t => t.id === pausedId ? { ...t, highlighted: false } : t);
            setVisualContent(prevVis => {
              if (prevVis?.component === 'timer') {
                return { ...prevVis, content: { timers: updated } };
              }
              return prevVis;
            });
            return updated;
          });
        }, 5000);
      }
    } else if (action === 'resume') {
      const titleToResume = payload.title?.toLowerCase() || '';
      let resumedId = '';
      setTimers((prev) => {
        const updated = prev.map(t => {
          const label = t.title.toLowerCase();
          if (label.includes(titleToResume) || titleToResume.includes(label)) {
            resumedId = t.id;
            return { ...t, running: true, endTime: Date.now() + t.remainingSeconds * 1000, highlighted: true };
          }
          return { ...t, highlighted: false };
        });
        setVisualContent({
          type: 'predefined',
          component: 'timer',
          content: { timers: updated }
        });
        return updated;
      });

      if (resumedId) {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          setTimers(prev => {
            const updated = prev.map(t => t.id === resumedId ? { ...t, highlighted: false } : t);
            setVisualContent(prevVis => {
              if (prevVis?.component === 'timer') {
                return { ...prevVis, content: { timers: updated } };
              }
              return prevVis;
            });
            return updated;
          });
        }, 5000);
      }
    } else if (action === 'highlight') {
      const titleToHighlight = payload.title?.toLowerCase() || '';
      let matchedId = '';
      setTimers((prev) => {
        const updated = prev.map(t => {
          const label = t.title.toLowerCase();
          if (label.includes(titleToHighlight) || titleToHighlight.includes(label)) {
            matchedId = t.id;
            return { ...t, highlighted: true };
          }
          return { ...t, highlighted: false };
        });
        setVisualContent({
          type: 'predefined',
          component: 'timer',
          content: { timers: updated }
        });
        return updated;
      });

      if (matchedId) {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          setTimers(prev => {
            const updated = prev.map(t => t.id === matchedId ? { ...t, highlighted: false } : t);
            setVisualContent(prevVis => {
              if (prevVis?.component === 'timer') {
                return { ...prevVis, content: { timers: updated } };
              }
              return prevVis;
            });
            return updated;
          });
        }, 5000);
      }
    }
  };

  const handleTimerControl = (action: 'pause' | 'resume' | 'cancel' | 'add_time', timerId: string) => {
    lastTimerActionTime.current = Date.now();
    setTimers((prev) => {
      let updated = [...prev];
      if (action === 'pause') {
        updated = prev.map(t => t.id === timerId ? { ...t, running: false, endTime: undefined, highlighted: true } : { ...t, highlighted: false });
      } else if (action === 'resume') {
        updated = prev.map(t => t.id === timerId ? { ...t, running: true, endTime: Date.now() + t.remainingSeconds * 1000, highlighted: true } : { ...t, highlighted: false });
      } else if (action === 'cancel') {
        updated = prev.filter(t => t.id !== timerId);
      } else if (action === 'add_time') {
        updated = prev.map(t => t.id === timerId ? { ...t, durationSeconds: t.durationSeconds + 60, remainingSeconds: t.remainingSeconds + 60, endTime: t.endTime ? t.endTime + 60000 : undefined, highlighted: true } : { ...t, highlighted: false });
      }
      
      // Re-sync visual display
      if (updated.length === 0) {
        setVisualContent(null);
      } else {
        setVisualContent(prevVis => {
          if (prevVis?.component === 'timer') {
            return { ...prevVis, content: { timers: updated } };
          }
          return prevVis;
        });
      }
      return updated;
    });

    if (action !== 'cancel') {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setTimers(prev => {
          const updated = prev.map(t => t.id === timerId ? { ...t, highlighted: false } : t);
          setVisualContent(prevVis => {
            if (prevVis?.component === 'timer') {
              return { ...prevVis, content: { timers: updated } };
            }
            return prevVis;
          });
          return updated;
        });
      }, 5000);
    }
  };

  // Realtime (Live API) is the default experience. Falls back to the classic (Cloud 3-step
  // REST + TTS) pipeline if: the URL explicitly requests it (?classic), the user toggled Classic
  // Mode on in AI Usage settings, or the robot has hit its usage limit (Live API is expensive, so
  // once minutes run out we automatically downgrade to the free classic pipeline).
  const isRealtimeMode = !window.location.search.includes('classic') && !classicModePreference && !usageLimitReached;

  // Non-realtime (Cloud 3-step) states
  const [nonRealtimeState, setNonRealtimeState] = useState<'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'>('IDLE');
  const [messages, setMessages] = useState<any[]>([]); // Conversation memory for Groq
  const [lastHeard, setLastHeard] = useState<string>("");
  const nonRealtimeStateRef = useRef<'IDLE'|'LISTENING'|'THINKING'|'SPEAKING'>('IDLE');

  useEffect(() => {
      nonRealtimeStateRef.current = nonRealtimeState;
  }, [nonRealtimeState]);
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);

  const wakeWordRef = useRef<WakeWordDetector | null>(null);
  const holdTimerRef = useRef<any>(null);
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const thinkingAudioRef = useRef<HTMLAudioElement | null>(null);
  const mbotRef = useRef<ArduinoController | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nonRealtimeTurnIdRef = useRef<number>(0);

  // High-quality TTS queue and playback refs
  const speechQueueRef = useRef<{ text: string; audio: HTMLAudioElement; pause?: number }[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechGenIdRef = useRef<number>(0);

  // Store cooldowns on window for debug data
  if (!(window as any).personGreetingCooldowns) (window as any).personGreetingCooldowns = {};
  if (!(window as any).unknownPersonCooldown) (window as any).unknownPersonCooldown = 0;
  const personGreetingCooldowns = useRef<Record<string, number>>((window as any).personGreetingCooldowns);
  const unknownPersonCooldown = useRef<number>((window as any).unknownPersonCooldown);
  const sessionEndedByToolRef = useRef<boolean>(false);

  const handlePersonDetected = async (newCount: number, totalCount: number, faceThreshold?: number) => {
      if (!airoFlags.faceRecognitionEnabled) return true;

      console.log(`handlePersonDetected called! New: ${newCount}, Total: ${totalCount}, Threshold: ${faceThreshold}`);
      
      if (isRealtimeMode && connectionStateRef.current !== AppState.ACTIVE) {
          console.log("Skipping greeting: Gemini Live is not connected yet.");
          return false;
      }
      
      let prompt = "";
      if (updateAvailable && !hasPromptedUpdateRef.current && (!isRealtimeMode || connectionStateRef.current === AppState.IDLE)) {
          hasPromptedUpdateRef.current = true;
          playSound.bubblyStart();
          const u = new SpeechSynthesisUtterance(`Hello! I have a new software update available to version ${updateAvailable}. Would you like me to install it now?`);
          u.voice = window.speechSynthesis.getVoices().find(v => v.name.includes("Google US English")) || null;
          u.pitch = 1.3; u.rate = 1.05;
          window.speechSynthesis.speak(u);
          setVisualContent({
              type: 'predefined',
              component: 'confirmation',
              title: 'Software Update Available',
              content: {
                 subtitle: 'Version ' + updateAvailable,
                 confirmText: 'Install',
                 cancelText: 'Not Now'
              }
          });
          return true;
      }
      let isKnownPerson = false;
      const now = Date.now();
      const COOLDOWN_MS = airoFlags.faceRecognitionIntervalMs || 180000;
      
      try {
          const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
          if (familyMembers.length > 0) {
              const frame = await captureCameraFrame();
              if (frame) {
                  const response = await fetch('/api/recognize-face', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ currentFrame: frame, familyMembers })
                  });
                  const data = await response.json();
                  if (data.names && data.names.length > 0) {
                      // Filter out people who were recently greeted
                      const namesToGreet = data.names.filter((name: string) => {
                          const lastGreeted = personGreetingCooldowns.current[name] || 0;
                          return now - lastGreeted > COOLDOWN_MS;
                      });

                      if (namesToGreet.length > 0) {
                          isKnownPerson = true;
                          // Update cooldowns
                          namesToGreet.forEach((name: string) => {
                              personGreetingCooldowns.current[name] = now;
                          });
                          
                          prompt = `A known person just walked into the camera frame! Their name(s) is/are: ${namesToGreet.join(', ')}. Greet them warmly and specifically by their name. Keep it very short, 1-2 sentences. STRICT RULE: Speak fluently without any commas, periods, or ellipses in the middle of your sentence. DO NOT pause or hesitate. DO NOT ask questions.`;
                          
                          if (totalCount > 1 && newCount > 0) {
                              prompt = `Another known person (${namesToGreet.join(', ')}) just walked into the room, joining the person already here! Greet them warmly and specifically by their name. Keep it short. STRICT RULE: Speak fluently without any commas, periods, or ellipses. DO NOT pause.`;
                          }

                          window.dispatchEvent(new CustomEvent('airo-face-recognized', { detail: { names: data.names } }));
                      } else {
                          console.log("Skipping greeting: All recognized people are on cooldown.");
                          return true;
                      }
                  }
              }
          }
      } catch (err) {
          console.error("Face recognition error:", err);
      }

      if (!isKnownPerson && !airoFlags.ignoreUnknownFaces) {
          if (now - unknownPersonCooldown.current > COOLDOWN_MS) {
              unknownPersonCooldown.current = now;
              (window as any).unknownPersonCooldown = now;
              if (totalCount === 1) {
                  prompt = `An unknown person just walked into the camera frame! Give a fast, fluent greeting. Say "Hello! I am Airow. Don't be a stranger, want to be my friend? What is your name?". STRICT RULE: Speak fluently without any commas or ellipses. DO NOT pause or hesitate. When they reply with their name, you MUST use the start_face_onboarding tool.`;
              } else if (totalCount > 1) {
                  prompt = `Another unknown person just walked into the camera frame, joining someone else! Give a fast, fluent greeting to the newcomer. Say "Hello there! I am Airow. What is your name?". STRICT RULE: Speak fluently without any commas or ellipses. DO NOT pause or hesitate. When they reply with their name, you MUST use the start_face_onboarding tool.`;
              }
          } else {
              console.log("Skipping greeting: Unknown person is on cooldown.");
              return true;
          }
      }

      if (prompt) {
          if (faceThreshold !== undefined) {
              prompt += ` The face threshold for this person was ${faceThreshold}%, indicating how closely and how long they have been looking directly at the camera. Factor this dynamically into your greeting.`;
          }
          if (!isRealtimeMode) {
              if (nonRealtimeStateRef.current === 'IDLE' && !isAlarmPlayingRef.current) {
                  runNonRealtimeTurn(prompt);
              }
          } else {
              if (connectionStateRef.current === AppState.ACTIVE && sendClientContent) {
                  sendClientContent(prompt);
              }
          }
      }
      return true;
  };

  const { lastDetectedPersonXRef, isPersonPresent, isDark, isMotionDetected } = usePersonDetection(hasStarted && !showMainMenu, handlePersonDetected, 180000); // 3 minute cooldown

  const [isAsleep, setIsAsleep] = useState(false);
  const darkTimerRef = useRef<number | null>(null);
  const emptyTimerRef = useRef<number | null>(null);

  useEffect(() => {
     if (!hasStarted) return;
     if (isAsleep) {
         if (isPersonPresent || isMotionDetected || (contextData.motion && contextData.motion !== 'idle')) {
             setIsAsleep(false);
             playSound.bubblyStart();
         }
     } else {
         if (isDark) {
             if (!darkTimerRef.current) darkTimerRef.current = Date.now();
             else if (Date.now() - darkTimerRef.current > 10000) {
                 setIsAsleep(true);
                 playSound.bubblyPop();
                 darkTimerRef.current = null;
                 emptyTimerRef.current = null;
             }
         } else {
             darkTimerRef.current = null;
         }
         
         if (!isPersonPresent) {
             if (!emptyTimerRef.current) emptyTimerRef.current = Date.now();
             else if (Date.now() - emptyTimerRef.current > 60000) {
                 setIsAsleep(true);
                 playSound.bubblyPop();
                 darkTimerRef.current = null;
                 emptyTimerRef.current = null;
             }
         } else {
             emptyTimerRef.current = null;
         }
     }
  }, [isPersonPresent, isDark, isMotionDetected, contextData.motion, isAsleep, hasStarted]);
  const finalVideo = useRollingVideoRecorder(hasStarted && airoFlags.videoContextEnabled && !showMainMenu, wakeState);

  const handleQrDetected = (text: string) => {
      if (!qrCommanderEnabled || qrModeActive) return;
      
      const airCard = AIR_CARDS[text];
      if (airCard) {
          if (activeAirCardRef.current?.id === airCard.id) {
              // Already active, don't reinstall
              return;
          }

          if (connectionState === AppState.ACTIVE) {
              disconnect();
          }
          setQrModeActive(true);
          setInstallingAirCard(airCard);
          playSound.bubblySuccess();
          
          setTimeout(() => {
              setActiveAirCard(airCard);
              setInstallingAirCard(null);
              setQrModeActive(false);
              if (airCard.startingPrompt) {
                  setPendingPrompt(airCard.startingPrompt);
              }
          }, 3000); // 3 seconds install animation
          return;
      }
      
      setQrModeActive(true);
      speakTextSnippet(text);
      setTimeout(() => {
          setQrModeActive(false);
      }, 5000);
  };

  useQRDetection(qrCommanderEnabled && !showMainMenu, handleQrDetected);

  useEffect(() => {
      let interval: NodeJS.Timeout;
      // Only realtime (Live API) sessions count towards usage - it's a continuous bidirectional
      // audio/video stream, so cost tracks connected time rather than just when it's speaking.
      // Classic mode (REST + TTS) is free and never counted here.
      interval = setInterval(() => {
          // Catches the 24h boundary for sessions that stay open continuously without a reload.
          const resetAt = Number(localStorage.getItem('airo_usage_reset_at') || 0);
          if (resetAt && Date.now() - resetAt >= AI_USAGE_RESET_INTERVAL_MS) {
              resetAiUsage();
              return;
          }

          if (isRealtimeMode && connectionStateRef.current === AppState.ACTIVE && robotId) {
              setAiUsageSeconds(prev => {
                  const next = prev + 1;
                  if (next % 5 === 0) {
                      localStorage.setItem('airo_audio_usage', next.toString());
                  }
                  return next;
              });
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [robotId, isRealtimeMode]);

  const handleTestMovement = async () => {
      if (mbotRef.current) {
          appLogger.pushLog("Testing Movement: Left Flipper Up");
          await mbotRef.current.leftForward(150);
          await new Promise(r => setTimeout(r, 500));
          await mbotRef.current.stopLeftMotor();

          appLogger.pushLog("Testing Movement: Right Flipper Up");
          await mbotRef.current.rightForward(150);
          await new Promise(r => setTimeout(r, 500));
          await mbotRef.current.stopRightMotor();

          appLogger.pushLog("Testing Movement: Both Flippers Down");
          await mbotRef.current.leftReverse(150);
          await mbotRef.current.rightReverse(150);
          await new Promise(r => setTimeout(r, 500));

          appLogger.pushLog("Testing Movement: Reset to center");
          await mbotRef.current.stopMotors();
      } else {
          appLogger.pushLog("Cannot test movement: Robot not connected.");
      }
  };

  const handleRotate360 = async () => {
      if (mbotRef.current) {
          await mbotRef.current.spinLeftFor("forward", 360, 150);
      }
  };

  const { connect, disconnect, isAiSpeaking, isThinking, connectionState, visualContent, setVisualContent, sendClientContent, releaseAudioHold } = useGeminiLive(
    process.env.API_KEY, 
    () => {
        setWakeState(false);
        setIsPreparing(false);
    },
    location,
    handleRotate360,
    () => {
        stopAlarm();
    },
    handleTimerAction,
    () => timers,
    startDance,
    localMemory,
    activeAirCard,
    (err) => {
        setAiroError({
            level: ErrorLevel.GREEN,
            message: err.message || "Airo Cannot Respond due to a server issue",
            timestamp: Date.now()
        });
    },
    contextData,
    airoFlags
  );

  useEffect(() => {
    const handlePhotoAction = (e: any) => {
      const action = e.detail;
      if (action === 'Keep' || action === 'Discard') {
         if (connectionState === AppState.ACTIVE && sendClientContent) {
             sendClientContent(`I chose to ${action} the photo. You can close the preview now.`);
         } else if (!isRealtimeMode) {
             runNonRealtimeTurn(`I chose to ${action} the photo. You can close the preview now.`);
         }
         setVisualContent(null);
      }
    };
    
    const handleConfirmationAction = (e: any) => {
      const action = e.detail;
      
      // Handle proactive update prompts
      if (visualContent?.component === 'confirmation') {
         if (visualContent.title === 'Software Update Available') {
             if (action === 'Yes') {
                 window.location.hash = '#update';
                 window.location.reload();
             } else {
                 setVisualContent(null);
             }
             return;
         }
         if (visualContent.title === 'Update Installed') {
             if (action === 'Yes') {
                 if (connectionState === AppState.ACTIVE && sendClientContent) {
                     sendClientContent("I just updated! Can you read me your changelog from release_info.json?");
                 } else if (!isRealtimeMode) {
                     runNonRealtimeTurn("I just updated! Can you read me your changelog from release_info.json?");
                 }
             }
             setVisualContent(null);
             return;
         }
      }

      if (action === 'Yes' || action === 'No') {
         if (connectionState === AppState.ACTIVE && sendClientContent) {
             sendClientContent(`I tapped ${action} on the confirmation widget. Let's proceed based on that.`);
         } else if (!isRealtimeMode) {
             runNonRealtimeTurn(`I tapped ${action} on the confirmation widget. Let's proceed based on that.`);
         }
         setVisualContent(null);
      }
    };

    const handlePhotoReady = () => {
        if (connectionState === AppState.ACTIVE && sendClientContent) {
            const msg = "I just took a photo and it is showing on the screen. Tell the user you just took it.";
            sendClientContent(msg);
        } else if (!isRealtimeMode) {
            speakTextSnippet("Photo taken! Let me know if you want to save it.");
            setTimeout(() => {
                setWakeState(true);
                setStatusText("Awaiting confirmation...");
            }, 3500);
        }
    };

    window.addEventListener('airo-photo-action', handlePhotoAction);
    window.addEventListener('airo-confirmation-action', handleConfirmationAction);
    window.addEventListener('airo-photo-ready', handlePhotoReady);
    return () => {
        window.removeEventListener('airo-photo-action', handlePhotoAction);
        window.removeEventListener('airo-confirmation-action', handleConfirmationAction);
        window.removeEventListener('airo-photo-ready', handlePhotoReady);
    }
  }, [connectionState, sendClientContent, setVisualContent, isRealtimeMode]);

  useEffect(() => {
     if (connectionState === AppState.ACTIVE && isAsleep) {
         setIsAsleep(false);
         playSound.bubblyStart();
     }
  }, [connectionState, isAsleep]);

  const awaitingTextTurnReleaseRef = useRef(false);
  const prevIsAiSpeakingRef = useRef(false);

  useEffect(() => {
      if (pendingPrompt) {
          if (connectionState === AppState.ACTIVE) {
              sendClientContent(pendingPrompt);
              awaitingTextTurnReleaseRef.current = true;
              setPendingPrompt(null);
          } else if (connectionState === AppState.IDLE) {
              setIsPreparing(true);
              if (activeAirCardRef.current) {
                  playSound.airCardListen();
              } else {
                  playSound.bubblyStart();
              }
              const sharedStream = wakeWordRef.current?.detachStream() || null;
              wakeWordRef.current?.stop();
              connect(0, null, sharedStream, true);
          }
      }
  }, [pendingPrompt, connectionState, sendClientContent, connect]);

  // Once the AI finishes speaking the response to a text-driven first turn, release the mic audio
  // hold so all subsequent turns stream real-time audio as usual.
  useEffect(() => {
      if (prevIsAiSpeakingRef.current && !isAiSpeaking && awaitingTextTurnReleaseRef.current) {
          awaitingTextTurnReleaseRef.current = false;
          releaseAudioHold();
      }
      prevIsAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking, releaseAudioHold]);

  const isMovingRef = useRef(false);
  const isDancingRef = useRef(false);

  useEffect(() => {
      const activeSpeaking = isRealtimeMode ? isAiSpeaking : (nonRealtimeState === 'SPEAKING');
      let isMounted = true;
      let timeoutId: NodeJS.Timeout;

      if (activeSpeaking && mbotRef.current) {
          const loopMovement = async () => {
              if (!isMounted || !mbotRef.current || isDancingRef.current) return;
              if (isMovingRef.current) {
                  timeoutId = setTimeout(loopMovement, 500);
                  return;
              }

              isMovingRef.current = true;
              try {
                  const r = Math.random();
                  if (r < 0.33) {
                      await mbotRef.current.spinLeftFor("forward", 15, 120);
                      await mbotRef.current.spinLeftFor("reverse", 15, 120);
                  } else if (r < 0.66) {
                      await mbotRef.current.leftForward(100);
                      await new Promise(res => setTimeout(res, 100));
                      await mbotRef.current.stopMotors();
                      await new Promise(res => setTimeout(res, 50));
                      await mbotRef.current.leftReverse(100);
                      await new Promise(res => setTimeout(res, 100));
                      await mbotRef.current.stopMotors();
                  } else {
                      await mbotRef.current.leftReverse(100);
                      await new Promise(res => setTimeout(res, 100));
                      await mbotRef.current.stopMotors();
                      await new Promise(res => setTimeout(res, 50));
                      await mbotRef.current.leftForward(100);
                      await new Promise(res => setTimeout(res, 100));
                      await mbotRef.current.stopMotors();
                  }
              } finally {
                  isMovingRef.current = false;
              }

              if (isMounted) {
                  timeoutId = setTimeout(loopMovement, 500 + Math.random() * 1000);
              }
          };
          loopMovement();
      }

      return () => {
          isMounted = false;
          clearTimeout(timeoutId);
      };
  }, [isAiSpeaking, nonRealtimeState]);

  const handleConnectMBot = async () => {
      try {
          const isSimulator = new URLSearchParams(window.location.search).has('simulator');
          const robot: any = isSimulator ? new MBotSimulator() : new ArduinoController();
          await robot.request();
          await robot.connect();
          await robot.init();
          mbotRef.current = robot;
          setMbotConnected(true);
          playSound.bubblySuccess();
          
          // Auto calibrate
          await robot.startupCalibration(1600, 1600, 120);

          // Spatial Map Scan
          appLogger.pushLog("Building spatial map...");
          setStatusText("Building spatial map... Please wait");
          isMovingRef.current = true;
          const images: string[] = [];
          
          for (let i = 0; i < 12; i++) {
              await robot.spinLeftFor("forward", 30, 150);
              await new Promise(r => setTimeout(r, 300));
              const frame = await captureCameraFrame();
              if (frame) {
                 images.push(frame);
              }
          }
          
          appLogger.pushLog("Returning to Homepoint...");
          setStatusText("Processing spatial map & returning to homepoint...");
          
          let mapPromise = null;
          if (images.length > 0) {
             mapPromise = fetch("/api/spatial-map", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ images })
             }).then(res => res.json()).catch(e => {
                 appLogger.pushLog("Spatial map API error");
                 return null;
             });
          }

          // Let it rotate back while waiting
          await robot.spinLeftFor("reverse", 360, 150);
          await robot.stopMotors();
          isMovingRef.current = false;
          
          if (mapPromise) {
             const mapData = await mapPromise;
             if (mapData && mapData.map) {
                appLogger.pushLog("Spatial Map Complete.");
                setLocalMemory(prev => ({ ...prev, "RoomSpatialMap": mapData.map }));
             }
          }
          
          setStatusText("System ready.");
          
      } catch (e: any) {
          appLogger.pushLog("Failed to connect robot: " + e.message);
          alert(`Failed to connect to Arduino: ${e.message}\n\nNote: Serial port access may require opening the app in a new tab.`);
      }
  };

  async function startDance(danceId: number) {
      setShowDancePopup(false);
      if (!mbotRef.current) return;
      isDancingRef.current = true;
      while (isMovingRef.current) {
          await new Promise(r => setTimeout(r, 100)); // wait for other movement to finish
      }
      isMovingRef.current = true;
      let stopMusic = () => {};
      try {
          switch (danceId) {
              case 1:
                  // The Wobble Spin
                  stopMusic = playSound.bubblyDanceMusic(3.5) as any;
                  for (let i = 0; i < 2; i++) {
                      await mbotRef.current.leftForward(130);
                      await new Promise(r => setTimeout(r, 200));
                      await mbotRef.current.leftReverse(130);
                      await new Promise(r => setTimeout(r, 200));
                  }
                  await mbotRef.current.spinLeftFor("forward", 360, 150);
                  await mbotRef.current.spinLeftFor("reverse", 360, 150);
                  break;
              case 2:
                  // The Square Dance
                  stopMusic = playSound.bubblyDanceMusic(4) as any;
                  for (let i = 0; i < 4; i++) {
                      await mbotRef.current.leftForward(120);
                      await new Promise(r => setTimeout(r, 300));
                      await mbotRef.current.stopMotors();
                      await new Promise(r => setTimeout(r, 100));
                      await mbotRef.current.spinLeftFor("forward", 90, 120);
                  }
                  break;
              case 3:
                  // The Rapid Shake
                  stopMusic = playSound.bubblyDanceMusic(3) as any;
                  for (let i = 0; i < 8; i++) {
                      await mbotRef.current.spinLeftFor("forward", 20, 160);
                      await mbotRef.current.spinLeftFor("reverse", 20, 160);
                  }
                  break;
              case 4:
                  // The Backup Beep
                  stopMusic = playSound.bubblyDanceMusic(4) as any;
                  await mbotRef.current.leftReverse(150);
                  await new Promise(r => setTimeout(r, 600));
                  await mbotRef.current.stopMotors();
                  await new Promise(r => setTimeout(r, 200));
                  await mbotRef.current.spinLeftFor("forward", 180, 150);
                  await mbotRef.current.leftForward(150);
                  await new Promise(r => setTimeout(r, 600));
                  await mbotRef.current.stopMotors();
                  await new Promise(r => setTimeout(r, 200));
                  await mbotRef.current.spinLeftFor("forward", 180, 150);
                  break;
              case 5:
                  // The Tornado
                  stopMusic = playSound.bubblyDanceMusic(5) as any;
                  await mbotRef.current.spinLeftFor("forward", 1080, 200); // 3 spins
                  await mbotRef.current.spinLeftFor("reverse", 1080, 200);
                  break;
          }
      } finally {
          isMovingRef.current = false;
          isDancingRef.current = false;
          if (mbotRef.current) await mbotRef.current.stopMotors();
          stopMusic();
      }
  };

  useEffect(() => {
      connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
      if (airoFlags.microphoneMuted && wakeWordRef.current) {
          wakeWordRef.current.stop();
      } else if (!airoFlags.microphoneMuted && wakeWordRef.current && !wakeState && nonRealtimeState === 'IDLE' && connectionState === AppState.IDLE) {
          wakeWordRef.current.start(null);
      }
  }, [airoFlags.microphoneMuted, wakeState, nonRealtimeState, connectionState]);

  // Clean cancel function for TTS playback
  const cancelSpeaking = () => {
      speechGenIdRef.current += 1;
      // Abort any downloading or queued chunks
      speechQueueRef.current.forEach(item => {
          try {
              item.audio.pause();
              item.audio.removeAttribute('src');
              item.audio.load();
          } catch (e) {}
      });
      speechQueueRef.current = [];
      isSpeakingRef.current = false;
      if (currentAudioRef.current) {
          try {
              currentAudioRef.current.pause();
              currentAudioRef.current.removeAttribute('src');
              currentAudioRef.current.load();
          } catch (e) {}
          currentAudioRef.current = null;
      }
      if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
      }
  };

  const speakWithWebSpeechFallback = (text: string, genId: number): Promise<void> => {
      return new Promise((resolve) => {
          if (genId !== speechGenIdRef.current) {
              resolve();
              return;
          }
          if (!window.speechSynthesis) {
              resolve();
              return;
          }
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.05;
          utterance.pitch = 0.95; // slightly lower pitch for a deeper male tone
          
          const voices = window.speechSynthesis.getVoices();
          const idealVoice = voices.find(v => 
              // Prefer distinct English male voices first
              v.name.includes("Microsoft David") || 
              v.name.includes("Google US English Male") || 
              v.name.includes("Male") || 
              v.name.includes("Daniel") || 
              v.name.includes("Google US English") || 
              v.lang.startsWith("en-US")
          ) || voices[0];
          
          if (idealVoice) {
              utterance.voice = idealVoice;
          }
          
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          
          window.speechSynthesis.speak(utterance);
      });
  };

  const playNextSpeechChunk = async (genId: number) => {
      if (genId !== speechGenIdRef.current) {
          return;
      }
      if (speechQueueRef.current.length === 0) {
          isSpeakingRef.current = false;
          return;
      }
      
      isSpeakingRef.current = true;
      const currentItem = speechQueueRef.current.shift()!;
      const { text, audio, pause } = currentItem;
      
      try {
          console.log("Synthesizing speech via Auto-Streaming Edge TTS for:", text);
          
          if (genId !== speechGenIdRef.current) {
              try {
                  audio.pause();
                  audio.removeAttribute('src');
                  audio.load();
              } catch (e) {}
              return;
          }
          
          currentAudioRef.current = audio;
          
          await new Promise<void>((resolve) => {
              audio.onended = () => {
                  resolve();
              };
              audio.onerror = async () => {
                  console.warn("Audio element failed to play streaming URL. Trying WebSpeech fallback.");
                  setAiroError({
                      level: ErrorLevel.GREEN,
                      message: "Airow Speech Engine is currently unavailable. Using emergency fallback voice.",
                      timestamp: Date.now()
                  });
                  if (genId === speechGenIdRef.current) {
                      await speakWithWebSpeechFallback(text, genId);
                  }
                  resolve();
              };
              audio.play().catch(async (err) => {
                  console.warn("Audio play blocked, using WebSpeech fallback:", err);
                  if (genId === speechGenIdRef.current) {
                      await speakWithWebSpeechFallback(text, genId);
                  }
                  resolve();
              });
          });
      } catch (err) {
          console.error("Audio playback error, using WebSpeech fallback:", err);
          if (genId === speechGenIdRef.current) {
              await speakWithWebSpeechFallback(text, genId);
          }
      }
      
      if (genId === speechGenIdRef.current) {
          if (pause && pause > 0) {
              await new Promise(r => setTimeout(r, pause));
          }
          playNextSpeechChunk(genId);
      }
  };

  // Speaks text sequentially via Groq Cloud TTS queue with instant browser voice fallback
  const speakTextSnippet = (text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      
      const currentId = speechGenIdRef.current;
      const wasSpeaking = isSpeakingRef.current;
      
      const punctuationRegex = /([.,!?\n]+)/g;
      const parts = cleaned.split(punctuationRegex);
      
      let currentChunk = "";
      
      for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.match(punctuationRegex)) {
              currentChunk += part;
              
              if (currentChunk.trim()) {
                  const chunkText = currentChunk.trim();
                  const audioUrl = `/api/tts?text=${encodeURIComponent(chunkText)}`;
                  const audio = new Audio(audioUrl);
                  audio.preload = 'auto'; // Force browser to start downloading immediately in the background
                  
                  let pause = 800;
                  if (part.includes(',')) {
                      pause = 300;
                  }
                  
                  speechQueueRef.current.push({ text: chunkText, audio, pause });
                  currentChunk = "";
              }
          } else {
              currentChunk += part;
          }
      }
      
      if (currentChunk.trim()) {
          const chunkText = currentChunk.trim();
          const audioUrl = `/api/tts?text=${encodeURIComponent(chunkText)}`;
          const audio = new Audio(audioUrl);
          audio.preload = 'auto';
          speechQueueRef.current.push({ text: chunkText, audio, pause: 800 });
      }
      
      if (!wasSpeaking && !isSpeakingRef.current) {
          playNextSpeechChunk(currentId);
      }
  };

  // Check when speaking completely finishes before enabling wake word detection again
  const checkSpeechFinishAndStartWakeWord = (shouldListen: boolean = true) => {
      const interval = setInterval(() => {
          const isStillSpeaking = isSpeakingRef.current || (window.speechSynthesis && window.speechSynthesis.speaking);
          if (!isStillSpeaking) {
              clearInterval(interval);
              if (shouldListen) {
                  setNonRealtimeState('LISTENING');
                  setStatusText("Listening for follow-up...");
                  startListeningForQuestion(10000);
              } else {
                  setNonRealtimeState('IDLE');
                  setWakeState(false);
                  setStatusText("Awaiting 'Hey Airow'");
              }
          }
      }, 300);
  };

  // Executing tools locally under non-realtime (Cloud 3-step) mode
  const executeNonRealtimeToolCall = async (toolCall: any): Promise<string> => {
      try {
          let name = (toolCall.name || "").trim();
          if (name.includes(" ")) {
              name = name.split(" ")[0].trim();
          }
          if (name.includes("{")) {
              name = name.split("{")[0].trim();
          }
          const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args;
          
          console.log("Executing non-realtime tool call:", name, args);
          
          if (name === 'end_session') {
              sessionEndedByToolRef.current = true;
              return JSON.stringify({ status: "success", message: "Session ended" });
          }
          else if (name === 'update_airo_flags') {
              setAiroFlags(prev => ({ ...prev, ...args }));
              return JSON.stringify({ status: "success", message: "Airo flags updated." });
          }
          else if (name === 'save_to_memory') {
              const { key, value } = args;
              if (key && value) {
                  setLocalMemory(prev => {
                      const newMem = { ...prev, [key]: value };
                      try { localStorage.setItem('airo_memory', JSON.stringify(newMem)); } catch(e) {}
                      return newMem;
                  });
              }
              return JSON.stringify({ status: "success", message: `Saved ${key} to memory.` });
          }
          else if (name === 'display_image') {
              setVisualContent({ type: 'image', content: args.url, title: args.caption || 'Image Content' });
              return JSON.stringify({ status: "success", message: "Image displayed to user" });
          }
          else if (name === 'generate_airo_image') {
              setVisualContent({ 
                  type: 'predefined', 
                  component: 'airo_image', 
                  content: { prompt: args.prompt, action: args.action, timestamp: Date.now() }, 
                  title: 'AIRO IMAGES' 
              });
              return JSON.stringify({ status: "success", message: "Airo image generation started visually." });
          }
          else if (name === 'take_photo') {
              setVisualContent({ 
                  type: 'predefined', 
                  component: 'photo_preview', 
                  content: { timestamp: Date.now() }, 
                  title: 'CAMERA' 
              });
              setAirScriptState({ flow: 'photo', step: 'confirm' });
              return JSON.stringify({ status: "success", message: "Camera preview opened and countdown started. I will now wait for user confirmation." });
          }
          else if (name === 'recognize_face') {
              try {
                  const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
                  if (familyMembers.length === 0) {
                      return JSON.stringify({ error: "No family members or friends are saved yet." });
                  } else {
                      const frame = await captureCameraFrame();
                      if (frame) {
                          const response = await fetch('/api/recognize-face', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ currentFrame: frame, familyMembers })
                          });
                          const data = await response.json();
                          if (data.names && data.names.length > 0) {
                              const recognizedName = data.names[0];
                              const member = familyMembers.find((m: any) => m.name === recognizedName);
                              if (member && member.image) {
                                  setVisualContent({ 
                                      type: 'predefined', 
                                      component: 'confirmation', 
                                      content: { 
                                          title: `Are you ${recognizedName}?`, 
                                          subtitle: "Face Recognition", 
                                          confirmText: "Yes", 
                                          cancelText: "No", 
                                          imageUrl: member.image 
                                      }, 
                                      title: 'CONFIRM' 
                                  });
                              }
                              return JSON.stringify({ result: `Identified people: ${data.names.join(', ')}. I am showing their face on the screen and asking if I was right.` });
                          } else {
                              return JSON.stringify({ result: "Could not identify any known faces in the camera frame." });
                          }
                      } else {
                          return JSON.stringify({ error: "Camera frame capture failed." });
                      }
                  }
              } catch (e: any) {
                  return JSON.stringify({ error: `Face recognition failed: ${e.message}` });
              }
          }
          else if (name === 'start_face_onboarding') {
              setVisualContent({ 
                  type: 'predefined', 
                  component: 'face_onboarding', 
                  content: { name: args.name, timestamp: Date.now() }, 
                  title: 'FACE SETUP' 
              });
              return JSON.stringify({ status: "success", message: "Started face onboarding visually. I will now wait for user to tap the screen." });
          }
          else if (name === 'trigger_confirmation') {
              window.dispatchEvent(new CustomEvent('airo-voice-trigger', { detail: args.action }));
              return JSON.stringify({ status: "success", message: `Triggered ${args.action} on the widget.` });
          }
          else if (name === 'close_visual') {
              setVisualContent(null);
              return JSON.stringify({ status: "success", message: "Visual interface closed" });
          }
          else if (name === 'render_widget') {
              const combinedHtml = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                      <style>
                          body { margin: 0; padding: 20px; background: transparent; color: white; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; }
                          ${args.css || ''}
                      </style>
                  </head>
                  <body>
                      ${args.html || ''}
                      <script>
                          ${args.javascript || ''}
                      </script>
                  </body>
                  </html>
              `;
              setVisualContent({ type: 'widget', content: combinedHtml, title: args.title || 'Widget' });
              return JSON.stringify({ status: "success", message: "Custom code widget rendered on screen" });
          }
          else if (name === 'show_timer_widget') {
              handleTimerAction('create', args);
              return JSON.stringify({ status: "success", message: `Timer created for ${args.durationSeconds} seconds with title ${args.title || "unnamed"}` });
          }
          else if (name === 'show_settings_widget') {
              setVisualContent({ type: 'predefined', component: 'settings', content: args, title: 'SETTINGS' });
              return JSON.stringify({ status: "success", message: "Settings widget displayed" });
          }
          else if (name === 'ask_confirmation') {
              setVisualContent({ type: 'predefined', component: 'confirmation', content: args, title: 'CONFIRM' });
              return JSON.stringify({ status: "success", message: "Confirmation prompt displayed" });
          }
          else if (name === 'set_system_volume') {
              const { setSoundVolume } = require('./utils/soundEffects');
              setSoundVolume(args.volume / 10);
              setVisualContent({ type: 'predefined', component: 'volume', content: args, title: 'VOLUME CONTROL' });
              return JSON.stringify({ status: "success", message: "Volume updated." });
          }
          else if (name === 'rotate_robot') {
              handleRotate360();
              return JSON.stringify({ status: "success", message: "Robot performed 360 degree spin" });
          }
          else if (name === 'stop_alarm') {
              stopAlarm();
              return JSON.stringify({ status: "success", message: "Alarm and ringtone stopped successfully" });
          }
          else if (name === 'cancel_timer') {
              handleTimerAction('cancel', args);
              return JSON.stringify({ status: "success", message: `Timer cancelled: ${args.title}` });
          }
          else if (name === 'pause_timer') {
              handleTimerAction('pause', args);
              return JSON.stringify({ status: "success", message: `Timer paused: ${args.title}` });
          }
          else if (name === 'resume_timer') {
              handleTimerAction('resume', args);
              return JSON.stringify({ status: "success", message: `Timer resumed: ${args.title}` });
          }
          else if (name === 'highlight_timer') {
              handleTimerAction('highlight', args);
              return JSON.stringify({ status: "success", message: `Timer highlighted: ${args.title}` });
          }
          else if (name === 'get_active_timers') {
              return JSON.stringify({ active_timers: timers });
          }
          else if (name === 'show_math_widget') {
              setVisualContent({ type: 'predefined', component: 'math', content: args, title: 'MATH HELPER', highlightedIndex: 0 });
              return JSON.stringify({ status: "success", message: `Math widget rendered for equation ${args.expression}` });
          }
          else if (name === 'show_time_widget') {
              setVisualContent({ type: 'predefined', component: 'time', content: args, title: 'CURRENT TIME', highlightedIndex: 0 });
              return JSON.stringify({ status: "success", message: "World clocks rendered" });
          }
          else if (name === 'show_battery_widget') {
              setVisualContent({ type: 'predefined', component: 'battery', content: args, title: 'BATTERY STATUS' });
              return JSON.stringify({ status: "success", message: "Battery widget rendered" });
          }
          else if (name === 'show_dice_widget') {
              setVisualContent({ type: 'predefined', component: 'dice', content: args, title: 'DICE ROLL' });
              return JSON.stringify({ status: "success", message: `Dice widget rendered showing ${args.result}` });
          }
          else if (name === 'show_date_widget') {
              // Note: using date instead of time predefined component to map settings
              setVisualContent({ type: 'predefined', component: 'date', content: args, title: 'CURRENT DATE' });
              return JSON.stringify({ status: "success", message: "Date board panel rendered" });
          }
          else if (name === 'show_news_widget') {
              setVisualContent({ type: 'predefined', component: 'news', content: { headlines: args.headlines || [] }, title: 'LATEST NEWS', highlightedIndex: 0 });
              return JSON.stringify({ status: "success", message: "News stories displayed on screen" });
          }
          else if (name === 'highlight_active_item') {
              setVisualContent(prev => {
                  if (prev) {
                      return { ...prev, highlightedIndex: args.index };
                  }
                  return prev;
              });
              return JSON.stringify({ status: "success", message: `Highlighted item index ${args.index}` });
          }
          else if (name === 'request_next_headline') {
              let nextIndex = 0;
              let headlinesCount = 0;
              let nextHeadline = null;
              
              setVisualContent(prev => {
                  if (prev && prev.component === 'news') {
                      const curIdx = prev.highlightedIndex !== undefined ? prev.highlightedIndex : -1;
                      const length = prev.content?.headlines?.length || 0;
                      headlinesCount = length;
                      nextIndex = curIdx + 1;
                      if (nextIndex < length) {
                          nextHeadline = prev.content.headlines[nextIndex];
                          return { ...prev, highlightedIndex: nextIndex };
                      }
                  }
                  return prev;
              });
              
              if (nextHeadline) {
                  return JSON.stringify({ hasMore: nextIndex < headlinesCount - 1, index: nextIndex, headline: nextHeadline });
              } else {
                  return JSON.stringify({ hasMore: false, info: "No more headlines left" });
              }
          }
          else if (name === 'search_web') {
              try {
                  const sRes = await fetch(`/api/search?q=${encodeURIComponent(args.query)}`);
                  const sData = await sRes.json();
                  return JSON.stringify({ result: sData.result });
              } catch (e) {
                  return JSON.stringify({ error: "Search failed. Provide summary on your own." });
              }
          }
          else if (name === 'get_weather' || name === 'show_weather_widget') {
              try {
                  const queryLocation = args.location || "my location";
                  let resolvedLocationName = queryLocation;
                  let latitude: number | undefined = args.latitude;
                  let longitude: number | undefined = args.longitude;

                  if ((!args.location || args.location.toLowerCase() === "my location" || args.location === "Your Location" || args.location === "Unknown") && location) {
                      resolvedLocationName = location;
                  }

                  if (latitude === undefined || longitude === undefined) {
                      const nameToSearch = resolvedLocationName;
                      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nameToSearch)}&count=1&language=en&format=json`);
                      const geoData = await geoRes.json();
                      if (geoData.results && geoData.results.length > 0) {
                          latitude = geoData.results[0].latitude;
                          longitude = geoData.results[0].longitude;
                          resolvedLocationName = geoData.results[0].name;
                      } else {
                          latitude = 48.4284;
                          longitude = -123.3656;
                          resolvedLocationName = "Victoria, BC";
                      }
                  }

                  const wForecastRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum&timezone=auto`);
                  const wData = await wForecastRes.json();

                  const getWmoCondition = (code: number): string => {
                      if (code === 0) return "Sunny";
                      if (code >= 1 && code <= 2) return "Partly Cloudy";
                      if (code === 3) return "Overcast";
                      if (code === 45 || code === 48) return "Foggy";
                      if (code >= 51 && code <= 55) return "Drizzling";
                      if (code >= 56 && code <= 57) return "Freezing Drizzle";
                      if (code >= 61 && code <= 65) return "Raining";
                      if (code >= 66 && code <= 67) return "Freezing Rain";
                      if (code >= 71 && code <= 75) return "Snowing";
                      if (code === 77) return "Snow Grains";
                      if (code >= 80 && code <= 82) return "Rain Showers";
                      if (code >= 85 && code <= 86) return "Snow Showers";
                      if (code >= 95 && code <= 99) return "Thunderstorm";
                      return "Cloudy";
                  };

                  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  const dailyData = (wData.daily?.time || []).map((timeStr: string, idx: number) => {
                      const d = new Date(timeStr + "T00:00:00");
                      const dayName = daysOfWeek[d.getDay()] || "Mon";
                      const dailyCode = wData.daily?.weather_code?.[idx] ?? 0;
                      return {
                          day: dayName,
                          maxTemp: Math.round(wData.daily?.temperature_2m_max?.[idx] ?? 70),
                          minTemp: Math.round(wData.daily?.temperature_2m_min?.[idx] ?? 50),
                          weatherCode: dailyCode,
                          condition: getWmoCondition(dailyCode)
                      };
                  }).slice(0, 5);

                  const widgetData = {
                      locationName: resolvedLocationName,
                      currentTemp: Math.round(wData.current?.temperature_2m ?? 72),
                      unit: "C",
                      condition: getWmoCondition(wData.current?.weather_code ?? 0),
                      weatherCode: wData.current?.weather_code ?? 0,
                      apparentTemp: Math.round(wData.current?.apparent_temperature ?? 72),
                      humidity: Math.round(wData.current?.relative_humidity_2m ?? 50),
                      windSpeed: `${Math.round(wData.current?.wind_speed_10m ?? 0)} km/h`,
                      dailyForecast: dailyData
                  };

                  setVisualContent({ type: 'predefined', component: 'weather', content: widgetData, title: 'WEATHER REPORT' });
                  return JSON.stringify(widgetData);

              } catch (e: any) {
                  console.error("Non-realtime weather execution error:", e);
                  const fallbackData = {
                      locationName: args.location || "Victoria, BC",
                      currentTemp: 22,
                      unit: "C",
                      condition: "Partly Cloudy",
                      weatherCode: 2,
                      apparentTemp: 21,
                      humidity: 60,
                      windSpeed: "12 km/h",
                      dailyForecast: [
                          { day: "Today", maxTemp: 22, minTemp: 14, weatherCode: 2, condition: "Partly Cloudy" }
                      ]
                  };
                  setVisualContent({ type: 'predefined', component: 'weather', content: fallbackData, title: 'WEATHER REPORT' });
                  return JSON.stringify(fallbackData);
              }
          }
          else if (name === 'play_youtube_music') {
              try {
                  setStatusText(`Searching music: "${args.query}"`);
                  const ytRes = await fetch(`/api/youtube/search?q=${encodeURIComponent(args.query)}`);
                  const ytData = await ytRes.json();
                  if (ytData.videoId) {
                      setVisualContent({
                          type: 'predefined',
                          component: 'music_player',
                          content: {
                              videoId: ytData.videoId,
                              title: ytData.title,
                              thumbnail: ytData.thumbnail
                          },
                          title: 'AI MUSIC PLAYER'
                      });
                      return JSON.stringify({ status: "success", message: `Playing music video: ${ytData.title}` });
                  } else {
                      return JSON.stringify({ error: "Music video not found" });
                  }
              } catch (e) {
                  console.error("Music playback failed:", e);
                  return JSON.stringify({ error: "Failed searching/playing music on youtube" });
              }
          }
          else if (name === 'control_music_player') {
              const action = args.action;
              const vol = args.volume;
              let returnMsg = "";
              setVisualContent(prev => {
                  if (prev && prev.component === 'music_player') {
                      const updatedContent = { ...prev.content };
                      if (action === 'pause') {
                          updatedContent.forcePlaybackState = 'pause';
                          returnMsg = "Music paused";
                      } else if (action === 'play' || action === 'resume') {
                          updatedContent.forcePlaybackState = 'play';
                          returnMsg = "Music resumed";
                      }
                      if (vol !== undefined) {
                          updatedContent.forceVolume = vol;
                          returnMsg = `Music volume set to ${vol}%`;
                      }
                      return { ...prev, content: updatedContent };
                  }
                  return prev;
              });
              return JSON.stringify({ status: "success", message: returnMsg || `Music action executed: ${action}` });
          }
      } catch (err: any) {
          console.warn("Failed executing non-realtime tool:", err.message);
          setAiroError({
              level: ErrorLevel.BLUE,
              message: "Internal Widget Error",
              details: err.message,
              timestamp: Date.now()
          });
      }
      return JSON.stringify({ status: "success" });
  };

  // Run the Non-Realtime (3-Step Cloud) interaction flow
  const runNonRealtimeTurn = async (userText: string) => {
      const turnId = nonRealtimeTurnIdRef.current;
      sessionEndedByToolRef.current = false;
      
      try {
          cancelSpeaking();
          setShowMainMenu(false);
          wakeWordRef.current?.stop();
          
          // AIRSCRIPT FAST-PATH EVALUATION
          const airScriptResult = processAirScript(userText, airScriptState);
          
          if (airScriptResult.handled) {
              if (airScriptResult.newState !== undefined) {
                  setAirScriptState(airScriptResult.newState);
              }
              
              if (airScriptResult.spokenText) {
                  speakTextSnippet(airScriptResult.spokenText);
              }
              
              if (airScriptResult.toolCalls && airScriptResult.toolCalls.length > 0) {
                  for (const tool of airScriptResult.toolCalls) {
                      executeNonRealtimeToolCall({ name: tool.name, args: tool.args });
                  }
              }
              
              if (airScriptResult.spokenText) {
                  setNonRealtimeState('SPEAKING');
                  setStatusText(`"${airScriptResult.spokenText}"`);
                  checkSpeechFinishAndStartWakeWord(false);
              } else {
                  setNonRealtimeState('IDLE');
                  setWakeState(false);
                  setStatusText("Action completed");
              }
              return;
          }

          setAirScriptState(null); // Clear state if we fall back to AI
          
          setNonRealtimeState('THINKING');
          setStatusText("Thinking...");
          
          let currentMessages = [...messages, { role: 'user', content: userText }];
          setMessages(currentMessages);

          let continueLoop = true;
          let maxIterations = 15;
          let loopCount = 0;
          let totalSpokenText = "";

          while (continueLoop && loopCount < maxIterations) {
              loopCount++;
              if (turnId !== nonRealtimeTurnIdRef.current) return;
              
              abortControllerRef.current = new AbortController();
              const signal = abortControllerRef.current.signal;
              
              const response = await fetch('/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      messages: currentMessages,
                      userLocation: location,
                      photoData: finalVideo,
                      localMemory: localMemory,
                      airoBirthday: airoBirthday,
                      activeAirCard: activeAirCardRef.current,
                      airoFlags: airoFlags,
                      userTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                      userDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                  }),
                  signal
              });

              if (!response.ok) {
                  throw new Error("Cloud turn request failed.");
              }

              const reader = response.body?.getReader();
              if (!reader) throw new Error("Stream reader not accessible.");

              const decoder = new TextDecoder();
              let rawTextResponse = "";
              let currentSentence = "";
              let toolCallsReceived: any[] = [];

              if (turnId !== nonRealtimeTurnIdRef.current) return;
              
              setNonRealtimeState('SPEAKING');
              setStatusText("Speaking...");

              // Clear past voice synthesis playing and queue only on first turn to allow seamless queued speech across tool iterations
              if (loopCount === 1) {
                  cancelSpeaking();
              }

              let buffer = "";

              while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  if (turnId !== nonRealtimeTurnIdRef.current) {
                      reader.cancel();
                      return;
                  }

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                      const cleanedLine = line.trim();
                      if (!cleanedLine.startsWith("data: ")) continue;

                      try {
                          const data = JSON.parse(cleanedLine.substring(6));
                          if (data.type === 'text') {
                              rawTextResponse += data.delta;
                              currentSentence += data.delta;
                              setStatusText(rawTextResponse);

                              // Simply accumulate text; we will speak the entire response seamlessly once it's done generating.
                          } else if (data.type === 'toolCall') {
                              toolCallsReceived.push(data);
                          }
                      } catch (e) {
                          // Silently bypass fractional json parsing errors
                      }
                  }
              }

              if (turnId !== nonRealtimeTurnIdRef.current) return;

              if (rawTextResponse.trim()) {
                  speakTextSnippet(rawTextResponse);
                  totalSpokenText += rawTextResponse + " ";
              }

              if (toolCallsReceived.length > 0) {
                  setNonRealtimeState('THINKING');
                  setStatusText("Executing actions...");

                  const assistantToolCallMessage = {
                      role: "assistant",
                      content: rawTextResponse || null,
                      tool_calls: toolCallsReceived.map(tc => {
                          let cleanName = (tc.name || "").trim();
                          if (cleanName.includes(" ")) {
                              cleanName = cleanName.split(" ")[0].trim();
                          }
                          if (cleanName.includes("{")) {
                              cleanName = cleanName.split("{")[0].trim();
                          }
                          return {
                              id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
                              type: "function",
                              function: {
                                  name: cleanName,
                                  arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
                              }
                          };
                      })
                  };

                  currentMessages = [...currentMessages, assistantToolCallMessage];

                  const toolMessages = [];
                  for (let i = 0; i < toolCallsReceived.length; i++) {
                      if (turnId !== nonRealtimeTurnIdRef.current) return;
                      const tc = toolCallsReceived[i];
                      const callId = assistantToolCallMessage.tool_calls[i].id;
                      const result = await executeNonRealtimeToolCall(tc);
                      let cleanName = (tc.name || "").trim();
                      if (cleanName.includes(" ")) {
                          cleanName = cleanName.split(" ")[0].trim();
                      }
                      if (cleanName.includes("{")) {
                          cleanName = cleanName.split("{")[0].trim();
                      }
                      toolMessages.push({
                          role: "tool",
                          tool_call_id: callId,
                          name: cleanName,
                          content: typeof result === 'string' ? result : JSON.stringify(result || { status: "success" })
                      });
                  }

                  currentMessages = [...currentMessages, ...toolMessages];
                  continueLoop = true;
              } else {
                  if (rawTextResponse) {
                      currentMessages = [...currentMessages, { role: 'assistant', content: rawTextResponse }];
                  }
                  continueLoop = false;
              }
          }

          if (turnId !== nonRealtimeTurnIdRef.current) return;

          if (currentMessages.length > 15) {
              try {
                  const compressRes = await fetch('/api/compress-memory', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ messages: currentMessages, currentMemory: localMemory })
                  });
                  if (compressRes.ok) {
                      const data = await compressRes.json();
                      if (data.memory) {
                          setLocalMemory(data.memory);
                          localStorage.setItem('airo_memory', JSON.stringify(data.memory));
                          currentMessages = currentMessages.slice(currentMessages.length - 6);
                      }
                  }
              } catch (e) {
                  console.error("Memory compression failed", e);
              }
          }

          setMessages(currentMessages);
          const shouldListen = totalSpokenText.trim().length > 0 && !sessionEndedByToolRef.current;
          checkSpeechFinishAndStartWakeWord(shouldListen);
      } catch (err: any) {
          if (turnId !== nonRealtimeTurnIdRef.current) return;
          console.error("Non-realtime flow error:", err.message);
          setStatusText("System Busy - Error");
          setNonRealtimeState('IDLE');
          setWakeState(false);
      }
  };

  // Start micro-listening to capture user's detailed follow up question
  const startListeningForQuestion = async (emptyTimeoutMs: number = 6000) => {
      const currentTurnId = nonRealtimeTurnIdRef.current;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
          console.error("Speech Recognition API not supported in this browser.");
          setStatusText("Speech Recognition Not Supported.");
          setNonRealtimeState('IDLE');
          setWakeState(false);
          return;
      }
      
      try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          
          let finalTranscript = '';
          
          let emptyTimeout: ReturnType<typeof setTimeout> | null = null;
          
          const resetTimeout = (currentText: string = '') => {
              if (emptyTimeout) clearTimeout(emptyTimeout);
              
              const wordCount = currentText.trim().split(/\s+/).filter(w => w.length > 0).length;
              // Base timeout is 6 seconds (6000ms), decreases by 1 second per word.
              // Minimum timeout is 1.5 seconds (1500ms).
              let calculatedTime = 6000 - (wordCount * 1000);
              if (calculatedTime < 1500) {
                  calculatedTime = 1500;
              }
              
              emptyTimeout = setTimeout(() => {
                  try {
                      if (recognitionRef.current) recognitionRef.current.stop();
                  } catch(e) {}
              }, calculatedTime);
          };

          recognition.onresult = (event: any) => {
              if (currentTurnId !== nonRealtimeTurnIdRef.current) {
                  recognition.stop();
                  return;
              }
              
              let interimTranscript = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                  if (event.results[i].isFinal) {
                      finalTranscript += event.results[i][0].transcript;
                  } else {
                      interimTranscript += event.results[i][0].transcript;
                  }
              }
              
              const displayText = finalTranscript + interimTranscript;
              if (displayText) {
                  setStatusText(`"${displayText}"`);
              }
              
              resetTimeout(displayText); // Keep listening if they are still speaking, using dynamic timeout
          };
          
          recognition.onend = () => {
              if (currentTurnId !== nonRealtimeTurnIdRef.current) return;
              
              if (finalTranscript && finalTranscript.trim().length > 0) {
                  const question = finalTranscript.trim();
                  setStatusText(`"${question}"`);
                  setLastHeard(question);
                  runNonRealtimeTurn(question);
              } else {
                  setNonRealtimeState('IDLE');
                  setWakeState(false);
                  setStatusText("Awaiting 'Hey Airow'");
              }
          };
          
          recognition.onerror = (event: any) => {
              if (currentTurnId !== nonRealtimeTurnIdRef.current) return;
              console.error("Speech recognition error:", event.error);
              setNonRealtimeState('IDLE');
              setWakeState(false);
              setStatusText("Awaiting 'Hey Airow'");
          };

          recognitionRef.current = recognition;
          recognition.start();
          
          resetTimeout();

      } catch (err: any) {
          console.error("Failed to start SpeechRecognition:", err.message);
          setStatusText("Audio Error. Mic unavailable.");
          setNonRealtimeState('IDLE');
          setWakeState(false);
      }
  };


  // Initialize Wake Word Detector
  useEffect(() => {
    // Local Memory Initialization
    try {
        const storedMem = localStorage.getItem('airo_memory');
        if (storedMem) setLocalMemory(JSON.parse(storedMem));
        
        const storedFlags = localStorage.getItem('airo_flags');
        if (storedFlags) setAiroFlags(JSON.parse(storedFlags));
        
        let bday = localStorage.getItem('airo_birthday');
        if (!bday) {
            bday = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            localStorage.setItem('airo_birthday', bday);
        }
        setAiroBirthday(bday);
    } catch (e) { console.error("Memory load error", e); }

    if (!thinkingAudioRef.current) {
        thinkingAudioRef.current = new Audio('/Loading Dips.wav');
        thinkingAudioRef.current.loop = true;
    }

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            try {
                const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
                const data = await res.json();
                const place = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
                const state = data.address?.state || "";
                const country = data.address?.country || "";
                setLocation(`${place ? place + ", " : ""}${state ? state + ", " : ""}${country}`);
            } catch (e) {
                setLocation(`${lat}, ${lon}`);
            }
        }, (error) => {
            console.error("Geolocation error:", error);
        });
    }

    wakeWordRef.current = new WakeWordDetector((audioBuffer, transcript) => {
        setShowMainMenu(false);
        if (isPersonPresent.current && mbotRef.current) {
            const x = lastDetectedPersonXRef.current;
            if (x < 0.4) {
               mbotRef.current.spinLeftFor("forward", 15, 120);
            } else if (x > 0.6) {
               mbotRef.current.spinLeftFor("reverse", 15, 120);
            }
        }
        
        let extractedContext = null;
        if (transcript) {
            const wakeWords = ["hey airow", "airow", "hey arrow", "arrow", "hey airo", "airo", "hey aero", "aero", "hey ro", "hey raw", "harrow", "air oh", "air-o", "high road"];
            let t = transcript;
            for (const w of wakeWords) {
                if (t.includes(w)) {
                    t = t.replace(w, "").trim();
                }
            }
            if (t.length > 2) {
                extractedContext = "Context right before wake word: " + t;
            }
        }

        if (isRealtimeMode) {
            if (connectionStateRef.current === AppState.IDLE) {
                setInitialAudio(audioBuffer);
                // Do NOT set pendingPrompt from this single chunk here - onCommandFinalized (below)
                // keeps listening a little longer via the Web Speech API and delivers the complete
                // follow-up command as text, which is both faster and more complete than this.
                cancelSpeaking();
                setWakeState(true);
                setStatusText("Wake Word Detected!");
            }
        } else {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            nonRealtimeTurnIdRef.current += 1;
            
            if (nonRealtimeStateRef.current !== 'IDLE') {
                if (recognitionRef.current) {
                    try { recognitionRef.current.stop(); } catch(e) {}
                    recognitionRef.current = null;
                }
                cancelSpeaking();
                setNonRealtimeState('IDLE');
                setWakeState(false);
                setTimeout(() => {
                    if (extractedContext) setPendingPrompt(extractedContext);
                    setWakeState(true);
                }, 50);
            } else {
                if (extractedContext) setPendingPrompt(extractedContext);
                setWakeState(true);
            }
        }
    }, (commandText) => {
        // Fires once the Web Speech API has settled on the full follow-up command spoken
        // right after the wake word. Only used for realtime/Live mode - non-realtime already
        // gets its transcript via a separate recognition flow in startListeningForQuestion.
        if (isRealtimeMode && commandText && commandText.length > 2) {
            setPendingPrompt(commandText);
        }
    });

    return () => {
        wakeWordRef.current?.stop();
    };
  }, []); // Run only on mount since closures use refs now

  const sharedStreamRef = useRef<MediaStream | null>(null);

  // Model Loading Logic
  const handleStart = async () => {
    playSound.bubblyStart();
    if (!wakeWordRef.current) return;

    // Request Immersive Fullscreen to auto-hide Android status and navigation bar
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.warn("Could not enter fullscreen mode:", err.message);
        });
    }
    
    setIsLoadingModels(true);
    
    try {
        let audioStream: MediaStream | null = null;
        if (bKeyHeldRef.current) {
            console.log("Bypassing permissions prompt (B key held)");
            setPermissionError(null);
            setHasStarted(true);
            await wakeWordRef.current.load();
            wakeWordRef.current.start(null);
            setIsLoadingModels(false);
            return;
        }

        try {
            // Request microphone access to explicitly trigger the browser permission prompt
            audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                }, 
                video: true 
            });
            // Immediately release all tracks so usePersonDetection and wakeWord can claim them fresh
            audioStream.getTracks().forEach(t => t.stop());
        } catch (e: any) {
            console.warn("Could not acquire A/V for permissions prompt, trying audio only:", e.message);
            try {
                audioStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1
                    }
                });
                audioStream.getTracks().forEach(t => t.stop());
            } catch (err: any) {
                console.error("Audio permission request failed:", err.message);
            }
        }
        
        if (audioStream) {
            setPermissionError(null);
        } else {
            setPermissionError("Camera/Microphone permission was denied. If using a custom Kiosk/WebView, ensure 'WebChromeClient.onPermissionRequest' is implemented.");
            setIsLoadingModels(false);
            return;
        }

        setHasStarted(true);
        wakeWordRef.current?.preloadContext();
        
        // Ensure video is acquired before we start audio to prevent getUserMedia conflicts
        try {
            await getSharedCamera();
        } catch (e) {
            console.warn("Failed to acquire shared camera during startup:", e);
        }
        await wakeWordRef.current.load();
        wakeWordRef.current.start(null); // Let wakeWord request its own stream fresh
        setIsLoadingModels(false);
    } catch (e) {
        console.error("Failed to load models/stream", e);
        setStatusText("Startup Error");
        setIsLoadingModels(false);
    }
  };
   // Connection & Multi-Approach Flow Management
   useEffect(() => {
     let timeoutId: any;
 
     if (wakeState) {
         if (isRealtimeMode) {
             if (connectionState === AppState.IDLE) {
                 setIsPreparing(true);
                 
                 if (activeAirCardRef.current) {
                     playSound.airCardListen();
                 } else {
                     playSound.bubblyStart();
                 }
                 
                 const sharedStream = wakeWordRef.current?.detachStream() || null;
                 // NOTE: intentionally NOT calling wakeWordRef.current?.stop() here. Doing so
                 // synchronously (as this effect does, right when wakeState flips true) would abort
                 // the Web Speech API recognition before its own silence/max-wait timers ever get a
                 // chance to capture the user's follow-up command - the whole text-first mechanism
                 // depends on that capture window surviving past this point. The detector aborts its
                 // own recognition (via finalizeCommand) once the command settles or its 2.5s max
                 // wait elapses, which is what actually releases the mic for connect() below.
                 //
                 // This used to wait 600ms "to let WebSpeechAPI/Android OS release the microphone
                 // lock" before connecting, but since we no longer stop() the wake detector here,
                 // recognition is still running regardless of how long we wait - so that delay was
                 // just adding pure latency to the websocket spin-up. Start connecting immediately
                 // (connect()'s own mic-acquisition retry loop already tolerates transient conflicts).
                 //
                 // Pass a getter (not the static initialAudio snapshot) so it resolves once the
                 // session is truly active, picking up everything captured through the whole
                 // spin-up window - not just what was buffered at the moment the wake word fired.
                 connect(0, () => wakeWordRef.current?.getExtendedInitialAudio() ?? null, sharedStream, true).finally(() => {
                     setIsPreparing(false);
                     setInitialAudio(null);
                 });
             }
         } else {
             if (nonRealtimeState === 'IDLE') {
                 wakeWordRef.current?.stop();
                 setNonRealtimeState('LISTENING');
                 setStatusText("Listening...");
                 
                 if (activeAirCardRef.current) {
                     playSound.airCardListen();
                 } else {
                     playSound.bubblyStart();
                 }
                 
                 startListeningForQuestion();
             } else {
                 setWakeState(false);
             }
         }
     } else if (!wakeState && hasStarted && !isLoadingModels) {
         if (isRealtimeMode) {
             if (connectionState === AppState.IDLE) {
                 disconnect(); // Ensure any previous session is cleaned up
                 
                 timeoutId = setTimeout(() => {
                      if (!wakeState && !isPreparing && !airoFlags.microphoneMuted) {
                         wakeWordRef.current?.start(null);
                       }
                  }, 800);
             }
         } else {
             if (nonRealtimeState === 'IDLE') {
                 timeoutId = setTimeout(() => {
                     if (!wakeState && !airoFlags.microphoneMuted) {
                         wakeWordRef.current?.start(null);
                     }
                 }, 800);
             }
         }
     }
   
      return () => clearTimeout(timeoutId);
    }, [wakeState, hasStarted, isLoadingModels, connectionState, nonRealtimeState, initialAudio, isRealtimeMode]);
 
   useEffect(() => {
       const activeThinking = isRealtimeMode ? isThinking : (nonRealtimeState === 'THINKING');
       if (activeThinking) {
           const p = thinkingAudioRef.current?.play();
           if (p !== undefined) {
               p.catch(e => console.error("Audio play error", e));
           }
       } else {
           if (thinkingAudioRef.current) {
               thinkingAudioRef.current.pause();
               thinkingAudioRef.current.currentTime = 0;
           }
       }
   }, [isThinking, nonRealtimeState, isRealtimeMode]);

  // Background timer tick for multiple timers
  useEffect(() => {
      const interval = setInterval(() => {
          setTimers((prev) => {
              if (prev.length === 0) return prev;
              let anyTimerFinished = false;
              
              const updated = prev.map(t => {
                  if (!t.running || t.remainingSeconds <= 0) return t;
                  
                  let nextRemaining = t.remainingSeconds - 1;
                  if (t.endTime) {
                      nextRemaining = Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000));
                  }
                  
                  if (nextRemaining <= 0) {
                      anyTimerFinished = true;
                      return { ...t, remainingSeconds: 0, running: false, endTime: undefined };
                  }
                  return { ...t, remainingSeconds: nextRemaining };
              });

              if (anyTimerFinished && !isAlarmPlayingRef.current) {
                  startAlarm();
                  setVisualContent({
                      type: 'predefined',
                      component: 'timer',
                      content: { timers: updated }
                  });
              } else {
                  // Sync current visible timer content
                  setVisualContent(prevVis => {
                      if (prevVis?.component === 'timer') {
                          return { ...prevVis, content: { timers: updated } };
                      }
                      return prevVis;
                  });
              }
              return updated;
          });
      }, 500); // Check more frequently to catch exact seconds
      return () => clearInterval(interval);
  }, []);

  let eyeState = EyeState.IDLE;
  if (isAsleep) eyeState = EyeState.SLEEPING;
  else if (isRemoteViewActive) {
      eyeState = EyeState.REMOTE_VIEW;
  } else if (!isRealtimeMode) {
      if (nonRealtimeState === 'THINKING') eyeState = EyeState.THINKING;
      else if (nonRealtimeState === 'SPEAKING') eyeState = EyeState.SPEAKING;
      else if (nonRealtimeState === 'LISTENING') eyeState = EyeState.LISTENING;
      else eyeState = EyeState.IDLE;
  } else {
      if (connectionState === AppState.ACTIVE) {
          if (isThinking) eyeState = EyeState.THINKING;
          else if (isAiSpeaking) eyeState = EyeState.SPEAKING;
          else eyeState = EyeState.LISTENING;
      } else if (connectionState === AppState.CONNECTING || isPreparing || isLoadingModels) {
          eyeState = EyeState.LISTENING;
      }
  }

  const displayConnectionState = !isRealtimeMode 
      ? (nonRealtimeState === 'LISTENING' || nonRealtimeState === 'SPEAKING' ? AppState.ACTIVE :
         nonRealtimeState === 'THINKING' ? AppState.CONNECTING : AppState.IDLE)
      : connectionState;

  const touchStartY = useRef<number>(0);

  // Hide timer UI if user asked about something else
  useEffect(() => {
      if (isAiSpeaking) {
          const timeSinceTimerAction = Date.now() - lastTimerActionTime.current;
          // If Gemini is now speaking, and no timer tool was called in the last 2 seconds,
          // it means the conversation moved on to something else. So hide the timer UI!
          if (timeSinceTimerAction > 2000 && visualContent?.component === 'timer') {
              setVisualContent(null);
          }
      }
  }, [isAiSpeaking, visualContent]);

  // Auto-close widgets 5 seconds after Gemini finishes speaking, if not alarm playing
  useEffect(() => {
      let timeout: NodeJS.Timeout;
      const activeSpeaking = isRealtimeMode ? isAiSpeaking : (nonRealtimeState === 'SPEAKING');
      const activeThinking = isRealtimeMode ? isThinking : (nonRealtimeState === 'THINKING');
      
      if (visualContent && visualContent.component !== 'music_player' && visualContent.component !== 'airo_image' && visualContent.component !== 'photo_preview' && visualContent.component !== 'confirmation' && visualContent.component !== 'volume' && !isAlarmPlaying && !activeSpeaking && !activeThinking) {
          timeout = setTimeout(() => {
              setVisualContent(null);
          }, 5000);
      }
      return () => clearTimeout(timeout);
  }, [visualContent, isAlarmPlaying, isAiSpeaking, isThinking, nonRealtimeState, isRealtimeMode]);

  // Listen to exterior Simulator mic button events
  useEffect(() => {
      const handleMicDown = () => {
          if (!hasStarted || isPreparing || isLoadingModels || connectionState !== AppState.IDLE) return;
          // Hold triggers wake instantly for the remote button
          cancelSpeaking();
          setWakeState(true);
          setStatusText("Manual Mic Triggered");
      };
      
      const handleMicUp = () => {
          // Do not set wakeState false here, otherwise quick taps might cancel connection setup
      };

      window.addEventListener('airo-mic-down', handleMicDown);
      window.addEventListener('airo-mic-up', handleMicUp);
      
      return () => {
          window.removeEventListener('airo-mic-down', handleMicDown);
          window.removeEventListener('airo-mic-up', handleMicUp);
      };
  }, [hasStarted, isPreparing, isLoadingModels, connectionState]);

  const handlePointerDown = (e: React.PointerEvent) => {
      if (isAlarmPlaying) {
          stopAlarm();
          return;
      }
      if (!isRealtimeMode) {
          if (nonRealtimeState === 'SPEAKING') {
              cancelSpeaking();
              setNonRealtimeState('IDLE');
              setWakeState(false);
              setStatusText("Cancelled. Awaiting 'Hey Arrow'");
              return;
          }
          if (nonRealtimeState === 'LISTENING') {
              if (recognitionRef.current) {
                  recognitionRef.current.stop();
              }
              return;
          }
      }
      touchStartY.current = e.clientY;
      if (!hasStarted || isPreparing || isLoadingModels || connectionState !== AppState.IDLE) return;
      holdTimerRef.current = setTimeout(() => {
          cancelSpeaking();
          setWakeState(true);
          setStatusText("Manual Hold Triggered");
      }, 700);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
      }
      
      // Detect swipe up/down and tap
      const touchEndY = e.clientY;
      const deltaY = touchEndY - touchStartY.current;
      
      if (Math.abs(deltaY) < 10) {
          // It's a tap
          if (showMainMenu) {
              // Handled by menu backdrop
          } else {
              setShowMainMenu(true);
          }
      } else if (deltaY < -100 && !visualContent && timers.length > 0 && !showMainMenu) {
          // Swipe up to reopen timer
          setVisualContent({ type: 'predefined', component: 'timer', content: { timers } });
      } else if (deltaY > 150) {
          // Swipe down to close
          if (showMainMenu) {
              setShowMainMenu(false);
          } else if (visualContent?.component === 'timer') {
              setVisualContent(null);
          }
      }
  };

  const activeTimers = timers.filter(t => t.remainingSeconds > 0);
  const runningTimers = activeTimers.filter(t => t.running);
  const nextUpTimer = runningTimers.length > 0 
    ? [...runningTimers].sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0]
    : null;

  const finishedTimers = timers.filter(t => t.remainingSeconds <= 0);
  const finishedTimerTitle = finishedTimers.length > 0 
    ? finishedTimers.map(t => t.title).join(", ") 
    : "Timer";

  useEffect(() => {
    const autoStart = () => { handleStart(); };
    window.addEventListener("airo-auto-start", autoStart);
    return () => window.removeEventListener("airo-auto-start", autoStart);
  }, []);

  if (showOnboarding) {
      return (
          <AiroErrorBoundary onError={(err) => setAiroError(err)}>
              <ErrorScreens error={airoError} onRestart={() => window.location.reload()} onContinue={() => setAiroError(null)} />
              <Onboarding onComplete={handleApproveRobotId} speakTextSnippet={speakTextSnippet} stopSpeech={() => window.speechSynthesis?.cancel?.()} />
          </AiroErrorBoundary>
      );
  }

  if (!hasStarted) {
    if (bootState === 'BOOTING') {
      return (
        <AiroErrorBoundary onError={(err) => setAiroError(err)}>
          <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white">
             <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="text-6xl md:text-8xl font-black tracking-tighter font-sans text-transparent bg-clip-text bg-gradient-to-r from-gray-200 via-white to-gray-400 mb-8"
             >
                airow
             </motion.h1>
             <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1 }}
                className="flex items-center gap-2"
             >
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
             </motion.div>
          </div>
        </AiroErrorBoundary>
      );
    }

    if (permissionError) {
      return (
        <AiroErrorBoundary onError={(err) => setAiroError(err)}>
          <div className="w-full h-full bg-red-950 flex flex-col items-center justify-center text-white gap-6">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
            </div>
            <h1 className="text-4xl font-black tracking-tight font-sans text-red-400">
              Permission Error
            </h1>
            <p className="text-gray-300 text-lg font-mono tracking-wide text-center px-8 max-w-md">
              {permissionError}
            </p>
            <button 
                onClick={() => setPermissionError(null)}
                className="mt-8 px-10 py-4 border-2 border-red-500/50 text-red-300 hover:bg-red-500/10 rounded-full font-bold hover:scale-105 active:scale-95 transition-all"
            >
              Continue anyway
            </button>
          </div>
        </AiroErrorBoundary>
      );
    }

    return (
      <AiroErrorBoundary onError={(err) => setAiroError(err)}>
        <ErrorScreens error={airoError} onRestart={() => window.location.reload()} onContinue={() => setAiroError(null)} />
        <div className="w-full h-full bg-black flex flex-col items-center justify-center text-white gap-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 150 }}
          className="flex flex-col items-center gap-4 text-center px-4"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center animate-pulse shadow-[0_0_35px_rgba(6,182,212,0.4)] mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black tracking-tight font-sans text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-gray-400">
            Start Airow?
          </h1>
          <p className="text-gray-500 text-xs font-mono tracking-widest max-w-xs mb-4">
            Your Airow Robot is now ready!
          </p>
        </motion.div>
        
        <div className="flex flex-col items-center gap-6 z-10">
          <button 
              onClick={handleStart}
              className="px-16 py-6 bg-white text-black rounded-[32px] hover:bg-gray-200 hover:scale-105 active:scale-95 duration-200 transition-all font-sans font-bold text-3xl shadow-[0_0_40px_rgba(255,255,255,0.3)] cursor-pointer animate-pulse"
          >
            Initialize Airow
          </button>
          <button 
              onClick={handleConnectMBot}
              disabled={mbotConnected}
              className={`px-8 py-3 border rounded-[24px] duration-200 hover:scale-105 active:scale-95 transition-all font-sans font-semibold text-base cursor-pointer shadow-[0_6px_20px_rgba(0,0,0,0.4)] ${mbotConnected ? 'bg-green-950/40 border-green-700/60 text-green-300' : 'bg-gray-900/60 border-white/5 hover:bg-gray-800 hover:border-white/10'}`}
          >
            {mbotConnected ? '✓ Arduino Connected' : 'Connect Arduino Robot'}
          </button>
        </div>
        <div className="flex flex-col items-center gap-1.5 mt-8 select-none">
          <p className="text-gray-600 text-[10px] font-mono tracking-widest">Active Core (v1.6.11)</p>
          {wakeLockActive ? (
            <div className="flex items-center gap-1.5 text-cyan-400 text-[10px] font-mono tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>Screen Awake Lock Enabled</span>
            </div>
          ) : (
            <div className="text-gray-600 text-[9px] font-mono uppercase">Acquiring Screen Wake Lock...</div>
          )}
        </div>
      </div>
      </AiroErrorBoundary>
    );
  }

  return (
    <AiroErrorBoundary onError={(err) => setAiroError(err)}>
    <ErrorScreens error={airoError} onRestart={() => window.location.reload()} onContinue={() => setAiroError(null)} />
    <div 
        className={`relative w-full h-full overflow-hidden select-none transition-colors duration-1000 touch-none ${isAlarmPlaying ? 'bg-red-950/30' : 'bg-black'}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    >
      <AnimatePresence>
        {isAlarmPlaying && (
          <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
          >
              <div className="relative flex flex-col items-center justify-center max-w-sm px-6 text-center">
                  {/* Pulsing Outer Rings */}
                  <div className="absolute w-64 h-64 rounded-full bg-red-500/5 border border-red-500/10 animate-ping duration-1500 z-0"></div>
                  <div className="absolute w-48 h-48 rounded-full bg-red-500/10 border border-red-500/20 animate-pulse z-0"></div>
                  
                  {/* Icon Wrapper representing a ringing bell */}
                  <div className="relative z-10 w-24 h-24 rounded-full bg-red-600 flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.5)] animate-bounce mb-8">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.003 6.003 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                  </div>

                  <h2 className="relative z-10 text-white font-sans text-3xl font-black tracking-tight uppercase mb-2">
                      {finishedTimerTitle} Finished!
                  </h2>
                  <p className="relative z-10 text-red-500 font-mono text-xs tracking-widest uppercase mb-12">
                      Alert is Active
                  </p>

                  {/* Stop Button */}
                  <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          stopAlarm();
                      }}
                      className="relative z-10 px-12 py-5 bg-white text-black font-sans font-bold text-lg rounded-full hover:bg-gray-100 hover:shadow-2xl transition-all shadow-lg active:scale-95 duration-200 cursor-pointer pointer-events-auto"
                  >
                      STOP TIMER
                  </button>
                  
                  <p className="relative z-10 text-white/30 font-sans text-[11px] uppercase tracking-wide mt-6">
                      Or say &ldquo;Stop&rdquo; to turn off the alarm
                  </p>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`absolute inset-0 transition-opacity duration-1000 ${visualContent?.component === 'timer' ? 'opacity-0' : 'opacity-100'}`}>
        {!showMainMenu && <Eyes state={eyeState} isQrMode={qrModeActive} personPositionXRef={lastDetectedPersonXRef} isPersonPresentRef={isPersonPresent} />}
        {airoFlags.microphoneMuted && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center z-50 cursor-pointer bg-black/80"
            onClick={() => setAiroFlags(prev => ({ ...prev, microphoneMuted: false }))}
          >
            <div className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
              </svg>
            </div>
            <p className="text-white font-sans font-semibold tracking-wider opacity-80">Tap to unmute</p>
          </div>
        )}
      </div>

      {isRemoteViewActive && (
          <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-black/80 border border-white/10 px-3 py-1.5 rounded-full z-[60] shadow-lg">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-red-400">Streaming...</span>
          </div>
      )}
      
      {mbotConnected && !showMainMenu && (
          <div className="absolute top-6 left-6 z-50">
              <button 
                  onClick={(e) => { e.stopPropagation(); setShowDancePopup(true); }}
                  className="bg-gray-900/90 border border-white/10 text-white p-3 rounded-full hover:bg-gray-800 transition-all shadow-lg flex items-center justify-center pointer-events-auto"
              >
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l10-3v13M9 9l10-3" />
                      <circle cx="6" cy="18" r="3" strokeWidth={2} />
                      <circle cx="16" cy="15" r="3" strokeWidth={2} />
                  </svg>
              </button>
          </div>
      )}

      {nextUpTimer && visualContent?.component !== 'timer' && !showMainMenu && (
          <div 
              className="absolute top-6 right-6 bg-gray-900/90 border border-white/10 rounded-full px-4 py-2 text-white font-mono text-sm cursor-pointer hover:bg-gray-800 transition-colors z-50 flex items-center gap-3 shadow-lg"
              onClick={() => setVisualContent({ type: 'predefined', component: 'timer', content: { timers } })}
          >
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span>
                {nextUpTimer.title}: {Math.floor(nextUpTimer.remainingSeconds / 60)}:{(nextUpTimer.remainingSeconds % 60).toString().padStart(2, '0')}
                {activeTimers.length > 1 && ` (+${activeTimers.length - 1})`}
              </span>
          </div>
      )}

      <AnimatePresence>
        {visualContent && (
          <VisualDisplay 
            data={visualContent} 
            onDismiss={() => setVisualContent(null)} 
            onTimerControl={handleTimerControl}
            isAiSpeaking={isAiSpeaking}
            onSaveToLibrary={saveLibraryItem}
            onGenerationComplete={(prompt) => {
              sendClientContent(`The image for prompt "${prompt}" has finished generating.`);
            }}
          />
        )}
      </AnimatePresence>

      {showMainMenu && (
          <MainMenu 
             onClose={() => setShowMainMenu(false)} 
             robotId={robotId || ''} 
             aiUsageSeconds={aiUsageSeconds} 
             aiUsageLimitSeconds={aiUsageLimitSeconds}
             localMemory={localMemory}
             qrCommanderEnabled={qrCommanderEnabled}
             setQrCommanderEnabled={updateQrCommander}
             onTestMovement={handleTestMovement}
             onStartDance={startDance}
             libraryItems={libraryItems}
             onDeleteLibraryItem={deleteLibraryItem}
             onIterate={(prompt) => {
                 sendClientContent(`I'm ready to modify the image for: "${prompt}". Tell me what changes you'd like to see!`);
                 setShowMainMenu(false);
             }}
             airoFlags={airoFlags}
             setAiroFlags={setAiroFlags}
             classicModePreference={classicModePreference}
             setClassicModePreference={setClassicModePreference}
             usageLimitReached={usageLimitReached}
             onStartAutoOnboarding={() => {
                 const prompt = "The user wants to register a new family member right now. Introduce yourself (e.g. 'Hi, I am Airow!') and ask them 'What is your name?'. Once they reply with their name, you MUST use the start_face_onboarding tool. Wait for their response.";
                 if (isRealtimeMode && connectionState === AppState.ACTIVE && sendClientContent) {
                     sendClientContent(prompt);
                 } else if (!isRealtimeMode && nonRealtimeState === 'IDLE' && !isAlarmPlaying) {
                     runNonRealtimeTurn(prompt);
                 } else {
                     console.log("Could not start VUI onboarding, agent not ready");
                 }
             }}
          />
      )}

      <AnimatePresence>
        {installingAirCard && (
            <motion.div 
               initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
               animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
               exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
               className="absolute inset-0 z-[150] flex flex-col items-center justify-center bg-black/60 pointer-events-none"
            >
               <motion.div
                  initial={{ scale: 0.8, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: -20, opacity: 0 }}
                  transition={{ type: "spring", damping: 20, stiffness: 200 }}
                  className="bg-gray-900 border border-blue-500/30 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
               >
                   <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>
                   
                   <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-6 relative">
                       <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                       </svg>
                       <motion.div 
                           className="absolute inset-0 border-4 border-blue-500 rounded-full"
                           animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                           transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                           style={{ borderTopColor: 'transparent', borderRightColor: 'transparent' }}
                       />
                   </div>
                   
                   <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Installing Software...</h2>
                   <p className="text-blue-300 font-mono text-sm font-bold tracking-widest uppercase mb-2">AirCard ID: {installingAirCard.id}</p>
                   <p className="text-gray-400 text-sm leading-relaxed">{installingAirCard.name}</p>
               </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDancePopup && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 px-4 pointer-events-auto"
               onClick={() => setShowDancePopup(false)}
            >
               <div 
                   className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center text-center shadow-2xl"
                   onClick={(e) => e.stopPropagation()}
               >
                   <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                       <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l10-3v13M9 9l10-3" />
                           <circle cx="6" cy="18" r="3" strokeWidth={2} />
                           <circle cx="16" cy="15" r="3" strokeWidth={2} />
                       </svg>
                   </div>
                   <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Dance Mode</h2>
                   <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                       Please place Airow on the floor and ensure it has enough freedom to move around safely.
                   </p>
                   
                   <div className="flex flex-col w-full gap-3">
                       <button onClick={() => startDance(1)} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Wobble Spin</button>
                       <button onClick={() => startDance(2)} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Square Dance</button>
                       <button onClick={() => startDance(3)} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Rapid Shake</button>
                       <button onClick={() => startDance(4)} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Backup Beep</button>
                       <button onClick={() => startDance(5)} className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white py-3 rounded-xl font-medium transition-all">The Tornado</button>
                   </div>
                   
                   <button onClick={() => setShowDancePopup(false)} className="mt-8 text-gray-500 hover:text-white font-medium uppercase tracking-wider text-xs">Cancel</button>
               </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
    </AiroErrorBoundary>
  );
}
