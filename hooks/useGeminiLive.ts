import { captureCameraFrame } from './usePersonDetection';
import { useEffect, useRef, useState, useCallback } from 'react';
import { LiveServerMessage } from '@google/genai';
import { createPcmBlob, decodeAudioData, PCM_SAMPLE_RATE } from '../services/audioUtils';
import { AppState, VisualContent } from '../types';
import { playSound } from '../utils/soundEffects';
import { getSharedCamera, releaseSharedCamera } from './useSharedCamera';
import { AirCard } from '../utils/airCards';

// How long to wait with no voice activity (while listening, i.e. not while the AI is speaking or
// thinking) before ending the session and falling back to wake-word listening.
const VAD_SILENCE_DISCONNECT_MS = 4500;

export const useGeminiLive = (
  apiKey: string | undefined, 
  onDisconnect: () => void, 
  location?: string | null, 
  onRotate360?: () => void,
  onStopAlarm?: () => void,
  onTimerAction?: (action: string, payload: any) => void,
  getActiveTimers?: () => any[],
  onDance?: (danceId: number) => void,
  localMemory?: Record<string, string> | null,
  activeAirCard?: AirCard | null,
  onError?: (err: any) => void,
  contextData?: any,
  airoFlags?: any
) => {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [connectionState, setConnectionState] = useState<AppState>(AppState.IDLE);
  const [visualContent, setVisualContent] = useState<VisualContent | null>(null);
  const visualContentRef = useRef<VisualContent | null>(null);
  const lastPlayedTrackRef = useRef<any>(null);
  const locationRef = useRef<string | null | undefined>(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    visualContentRef.current = visualContent;
  }, [visualContent]);
  
  const getActiveTimersRef = useRef(getActiveTimers);
  useEffect(() => {
    getActiveTimersRef.current = getActiveTimers;
  }, [getActiveTimers]);

  const sessionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterOutputGainRef = useRef<GainNode | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const connectionIdRef = useRef<number>(0);
  const videoIntervalRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  
  const isAiSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const lastSpokeTimeRef = useRef(Date.now());
  const silencePromptSentRef = useRef(false);
  const isVirtualMicRef = useRef(false);

  // While held, real mic audio is captured (to keep silence-detection alive) but never sent to the
  // Live API. Used so the very first turn after a wake word can be sent as fast Web-Speech-API text
  // instead of waiting on this session's own (slower) audio pipeline; released once that turn's
  // response finishes, or automatically after a short safety window if no text turn ever arrives.
  const audioHeldRef = useRef(false);
  const audioHoldSafetyTimerRef = useRef<any>(null);
  // Tracks whether a clientContent text turn has actually been sent yet this connection. Guards
  // the buffered-audio fallback below: sending the same spoken command as BOTH raw audio AND text
  // confuses Gemini (duplicate/conflicting input for one utterance), which was causing sessions to
  // end right after the first request instead of responding to it.
  const textTurnSentRef = useRef(false);
  const pendingFallbackAudioRef = useRef<Float32Array | null>(null);

  useEffect(() => { connectionStateRef.current = connectionState; }, [connectionState]);
  useEffect(() => { isAiSpeakingRef.current = isAiSpeaking; }, [isAiSpeaking]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);

  const cleanup = async () => {
      sessionRef.current = null;
      if (audioHoldSafetyTimerRef.current) {
          clearTimeout(audioHoldSafetyTimerRef.current);
          audioHoldSafetyTimerRef.current = null;
      }
      audioHeldRef.current = false;
      pendingFallbackAudioRef.current = null;
      if (wsRef.current) {
          try {
              if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
                  wsRef.current.close();
              }
          } catch (e) {}
          wsRef.current = null;
      }
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      if (videoElRef.current) {
          try {
              if (videoElRef.current.parentNode) {
                  videoElRef.current.parentNode.removeChild(videoElRef.current);
              }
              videoElRef.current.srcObject = null;
          } catch (e) {}
          videoElRef.current = null;
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }
      if (streamRef.current) {
          try {
              streamRef.current.getAudioTracks().forEach(track => {
                  track.stop();
              });
              releaseSharedCamera(); // Release the shared video stream reference
          } catch (trackErr) {
              console.warn("Failed to stop media track in cleanup:", trackErr);
          }
          streamRef.current = null;
      }
      if (inputContextRef.current) {
          await inputContextRef.current.close().catch(() => {});
          inputContextRef.current = null;
      }
      if (audioContextRef.current) {
          await audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
      }
      await new Promise(r => setTimeout(r, 200));
  };

  const disconnect = useCallback(async (reason: string = "unspecified") => {
      console.log(`[GeminiLive] disconnect() called - reason: ${reason}`);
      connectionIdRef.current++;
      sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
      sourcesRef.current.clear();
      setIsThinking(false);
      setIsAiSpeaking(false);
      await cleanup();
      setConnectionState(AppState.IDLE);
      onDisconnect();
  }, [onDisconnect]);

  // initialAudio may be a plain snapshot, or (preferably) a getter resolved right before it's
  // sent - i.e. once the session is truly active, not at wake-trigger time - so it can include
  // audio captured continuously through the connection spin-up window, not just a pre-wake snapshot.
  const connect = useCallback(async (retryCount = 0, initialAudio?: Float32Array | (() => Float32Array | null) | null, sharedStream?: MediaStream | null, holdAudioForTextTurn?: boolean): Promise<void> => {
    const currentId = ++connectionIdRef.current;

    try {
      setConnectionState(AppState.CONNECTING);
      await cleanup();

      textTurnSentRef.current = false;
      pendingFallbackAudioRef.current = null;

      if (holdAudioForTextTurn) {
          audioHeldRef.current = true;
          // Safety net: if no text turn ever arrives (Web Speech API unavailable/failed to
          // capture anything), don't let the assistant sit deaf - fall back to sending whatever
          // audio was buffered through the spin-up window (see pendingFallbackAudioRef below).
          // Only fires if textTurnSentRef is still false, so this never races with/duplicates a
          // text turn that did go out in time.
          audioHoldSafetyTimerRef.current = setTimeout(() => {
              audioHeldRef.current = false;
              if (!textTurnSentRef.current && pendingFallbackAudioRef.current && pendingFallbackAudioRef.current.length > 0 && sessionRef.current) {
                  const pcmBlob = createPcmBlob(pendingFallbackAudioRef.current);
                  sessionRef.current.sendRealtimeInput({ audio: pcmBlob });
              }
              pendingFallbackAudioRef.current = null;
          }, 3000);
      } else {
          audioHeldRef.current = false;
      }

      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      masterOutputGainRef.current = audioContextRef.current.createGain();
      
      const initVol = typeof window !== 'undefined' && localStorage.getItem('app-volume') ? parseFloat(localStorage.getItem('app-volume')!) : 1.0;
      masterOutputGainRef.current.gain.value = initVol;
      
      const handleVol = (e: any) => {
          if (masterOutputGainRef.current) masterOutputGainRef.current.gain.value = e.detail;
      };
      window.addEventListener('app-volume-change', handleVol);
      
      // We will need to remove event listener on cleanup, but for now we can just rely on the ref replacing.
      // A better way is to set it initially:
      masterOutputGainRef.current.connect(audioContextRef.current.destination);


      // Proactively resume contexts immediately on user-gesture creation to wake them up
      if (inputContextRef.current.state === 'suspended') {
          await inputContextRef.current.resume().catch(e => console.warn("Failed to resume inputContext on init:", e));
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume().catch(e => console.warn("Failed to resume audioContext on init:", e));
      }

      // Acquire stream combining getSharedCamera (video) and getUserMedia (audio)
      let stream: MediaStream | null = null;
      let attempt = 0;
      
      while (!stream && attempt < 5) {
          if (currentId !== connectionIdRef.current) return;
          try {
              // 1. Get Audio
              let audioStream: MediaStream | null = null;
              if (sharedStream && sharedStream.active && sharedStream.getAudioTracks().length > 0) {
                  audioStream = sharedStream;
                  console.log("Using transitioned audio media stream.");
              } else {
                  console.log(`Acquiring microphone (attempt ${attempt + 1})...`);
                  audioStream = await navigator.mediaDevices.getUserMedia({ 
                      audio: {
                          echoCancellation: true,
                          noiseSuppression: true,
                          autoGainControl: true
                      }
                  });
              }

              // 2. Get Video
              let sharedCam;
              try {
                  sharedCam = await getSharedCamera();
              } catch (videoError: any) {
                  if (audioStream && audioStream !== sharedStream) {
                      audioStream.getTracks().forEach(t => t.stop());
                  }
                  throw videoError;
              }
              
              // 3. Combine
              stream = new MediaStream([
                  ...audioStream.getAudioTracks(),
                  ...sharedCam.stream.getVideoTracks()
              ]);
          } catch (e: any) {
              console.warn(`Mic/Cam acquisition failed (attempt ${attempt + 1}/5):`, e.message);
              await new Promise(r => setTimeout(r, 400));
              attempt++;
          }
      }
      
      // SIMULATOR VIDEO INJECTION
      const isSimulator = new URLSearchParams(window.location.search).has('simulator');
      if (isSimulator && stream) {
          const cvs = document.querySelector('canvas') as HTMLCanvasElement;
          if (cvs) {
              const videoTrack = cvs.captureStream(15).getVideoTracks()[0];
              if (videoTrack) {
                  stream.getVideoTracks().forEach(t => {
                      stream!.removeTrack(t);
                      t.stop();
                  });
                  stream.addTrack(videoTrack);
                  console.log("Simulator Video Track Injected!");
              }
          }
      }

      if (!stream) {
          console.warn("Could not acquire physically connected microphone/camera. Creating Virtual/Silent Audio track so session can run...");
          try {
              if (inputContextRef.current) {
                  const osc = inputContextRef.current.createOscillator();
                  const gain = inputContextRef.current.createGain();
                  gain.gain.value = 0.0;
                  osc.connect(gain);
                  osc.start();
                  const dest = inputContextRef.current.createMediaStreamDestination();
                  gain.connect(dest);
                  stream = dest.stream;
                  isVirtualMicRef.current = true;
                  console.log("Virtual silent microphone stream created successfully!");
              }
          } catch (virtualErr: any) {
              console.error("Failed to generate programmatically simulated silent audio track:", virtualErr);
          }
      }

      if (!stream) throw new Error("Could not acquire microphone/camera after retries, and virtual mic creation failed.");
      
      // Establish WebSocket connection directly to secure custom local/production server
      const l = window.location;
      const protocol = l.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${l.host}/api/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const session = {
          sendRealtimeInput: (input: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                  if (input.audio) {
                      ws.send(JSON.stringify({ type: 'audio', data: input.audio.data }));
                  } else if (input.video) {
                      ws.send(JSON.stringify({ type: 'video', data: input.video.data }));
                  }
              }
          },
          sendToolResponse: (resp: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'toolResponse', functionResponses: resp.functionResponses }));
              }
          },
          sendClientContent: (content: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'clientContent', content }));
              }
          }
      };

      ws.onopen = () => {
          if (currentId !== connectionIdRef.current) {
              ws.close();
              return;
          }
          console.log("Secure Proxy WebSocket connection opened. Initialising session...");
          // Send init packet to server context (server will perform ai.live.connect)
          ws.send(JSON.stringify({
              type: 'init',
              location: locationRef.current || null,
              localMemory: localMemory || null,
              activeAirCard: activeAirCard || null,
              contextData: contextData || null,
              airoFlags: airoFlags || null,
              userTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
              userDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }));
      };

      ws.onmessage = async (evt) => {
          if (currentId !== connectionIdRef.current) return;
          try {
              const data = JSON.parse(evt.data);

              if (data.type === 'open') {
                  streamRef.current = stream;
                  setConnectionState(AppState.ACTIVE);
                  sessionRef.current = session;
                  lastSpokeTimeRef.current = Date.now();

                  // Resolve now (not at connect() call time) so a getter can capture whatever was
                  // recorded through the whole spin-up window, right up until this exact moment.
                  const resolvedInitialAudio = typeof initialAudio === 'function' ? initialAudio() : initialAudio;
                  if (holdAudioForTextTurn) {
                      // Don't send this as raw audio yet - the text-first turn (once transcribed)
                      // covers the same spoken command, and sending both confuses Gemini. Hold it
                      // as a fallback only, sent by the safety timeout above if text never arrives.
                      pendingFallbackAudioRef.current = resolvedInitialAudio || null;
                  } else if (resolvedInitialAudio && resolvedInitialAudio.length > 0) {
                      const pcmBlob = createPcmBlob(resolvedInitialAudio);
                      session.sendRealtimeInput({ audio: pcmBlob });
                  }

                  // Audio Streaming
                  if (!inputContextRef.current) return;
                  const source = inputContextRef.current.createMediaStreamSource(stream!);
                  const scriptProcessor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
                  processorRef.current = scriptProcessor;
                  
                  scriptProcessor.onaudioprocess = (e) => {
                    if (connectionStateRef.current !== AppState.ACTIVE || currentId !== connectionIdRef.current) return;
                    try {
                        const inputData = e.inputBuffer.getChannelData(0);
                        
                        // Silence detection
                        let sum = 0;
                        for (let i = 0; i < inputData.length; i++) {
                            sum += inputData[i] * inputData[i];
                        }
                        const rms = Math.sqrt(sum / inputData.length);
                        
                        if (rms > 0.01 || isAiSpeakingRef.current || isThinkingRef.current) {
                            lastSpokeTimeRef.current = Date.now();
                            silencePromptSentRef.current = false;
                        } else {
                            if (isVirtualMicRef.current) {
                                // Keep resetting lastSpokeTime so it never auto-disconnects due to programmatic silence
                                lastSpokeTimeRef.current = Date.now();
                                silencePromptSentRef.current = false;
                            } else {
                                const silenceDuration = Date.now() - lastSpokeTimeRef.current;
                                if (silenceDuration > VAD_SILENCE_DISCONNECT_MS) {
                                    disconnect(`${VAD_SILENCE_DISCONNECT_MS}ms silence timeout (no VAD while listening)`);
                                    return; // Stop processing
                                }
                            }
                        }

                        if (audioHeldRef.current) {
                            // Holding for the first (text-driven) turn to finish - don't stream mic
                            // audio yet, but keep lastSpokeTime fresh so we don't auto-disconnect.
                            lastSpokeTimeRef.current = Date.now();
                            return;
                        }

                        const pcmBlob = createPcmBlob(inputData);
                        session.sendRealtimeInput({ audio: pcmBlob });
                    } catch (audioProcessErr) {
                        console.error("Error in onaudioprocess handler:", audioProcessErr);
                    }
                  };
                  
                  source.connect(scriptProcessor);
                  const muteNode = inputContextRef.current.createGain();
                  muteNode.gain.value = 0;
                  scriptProcessor.connect(muteNode);
                  muteNode.connect(inputContextRef.current.destination);

                  // Video Streaming
                  if (stream!.getVideoTracks().length > 0) {
                      const videoEl = document.createElement('video');
                      videoEl.srcObject = stream;
                      videoEl.muted = true;
                      videoEl.playsInline = true;
                      videoEl.style.position = 'absolute';
                      videoEl.style.width = '1px';
                      videoEl.style.height = '1px';
                      videoEl.style.opacity = '0';
                      videoEl.style.pointerEvents = 'none';
                      videoEl.setAttribute('playsinline', 'true');
                      videoEl.setAttribute('autoplay', 'true');
                      videoEl.setAttribute('muted', 'true');
                      document.body.appendChild(videoEl);
                      videoElRef.current = videoEl;
                      videoEl.play().catch(e => console.warn("Video playback for frame extraction failed in DOM:", e.message));
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      
                      videoIntervalRef.current = setInterval(() => {
                          if (connectionStateRef.current !== AppState.ACTIVE || currentId !== connectionIdRef.current) return;
                          if (ctx && videoEl.readyState >= 2) {
                              canvas.width = 240;
                              canvas.height = 180;
                              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                              const base64Data = canvas.toDataURL('image/jpeg', 0.3).split(',')[1];
                              session.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
                          }
                      }, 666); // ~1.5 fps - optimized for bandwidth
                  } else {
                      console.log("No camera tracks available. Session is running in Audio-Only mode.");
                  }

              } 
              else if (data.type === 'message') {
                  const message: LiveServerMessage = data.message;

                  // Handle Audio Output
                  const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (base64Audio && audioContextRef.current) {
                      const ctx = audioContextRef.current;
                      if (ctx.state === 'suspended') {
                          await ctx.resume().catch(e => console.warn("Failed to resume audioContext on audio incoming:", e));
                      }
                      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                      const source = ctx.createBufferSource();
                      source.buffer = audioBuffer;
                      source.connect(masterOutputGainRef.current!);
                      setIsAiSpeaking(true);
                      setIsThinking(false);
                      source.onended = () => {
                          sourcesRef.current.delete(source);
                          if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
                      };
                      source.start(nextStartTimeRef.current);
                      sourcesRef.current.add(source);
                      nextStartTimeRef.current += audioBuffer.duration;
                  }

                  // Handle Tool Calls (delegated execution on client UI)
                  if (message.toolCall) {
                      setIsThinking(true);
                      const functionResponses: any[] = [];
                      for (const fc of message.toolCall.functionCalls) {
                          let result: any = { status: "ok" };
                          try {
                              if (fc.name === 'end_session') { disconnect(`model called end_session tool (action="${(fc as any).name}")`); return; }
                          else if (fc.name === 'display_image') {
                              setVisualContent({ type: 'image', content: (fc.args as any).url, title: (fc.args as any).caption || 'Image Content' });
                              result = { result: "Image rendered" };
                          }
                          else if (fc.name === 'generate_airo_image') {
                              const args = fc.args as any;
                              const finalPrompt = args.prompt || 'A detailed image';
                              setVisualContent({ 
                                  type: 'predefined', 
                                  component: 'airo_image', 
                                  content: { prompt: finalPrompt, action: args.action || 'generate', timestamp: Date.now() }, 
                                  title: 'AIRO IMAGES' 
                              });
                              result = { result: "Airo image generation started visually." };
                          }
                          else if (fc.name === 'take_photo') {
                              setVisualContent({ 
                                  type: 'predefined', 
                                  component: 'photo_preview', 
                                  content: { timestamp: Date.now() }, 
                                  title: 'CAMERA' 
                              });
                              result = { result: "Camera preview opened and countdown started." };
                          }
                          else if (fc.name === 'recognize_face') {
                              try {
                                  const familyMembers = JSON.parse(localStorage.getItem('airo_family_members') || '[]');
                                  if (familyMembers.length === 0) {
                                      result = { error: "No family members or friends are saved yet. The user needs to add someone first." };
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
                                              result = { result: `Identified people: ${data.names.join(', ')}. I am showing their face on the screen and asking if I was right.` };
                                          } else {
                                              result = { result: "Could not identify any known faces in the camera frame." };
                                          }
                                      } else {
                                          result = { error: "Camera frame capture failed. Ensure the camera is active." };
                                      }
                                  }
                              } catch (e: any) {
                                  result = { error: `Face recognition failed: ${e.message}` };
                              }
                          }
                          else if (fc.name === 'start_face_onboarding') {
                              const args = fc.args as any;
                              setVisualContent({ 
                                  type: 'predefined', 
                                  component: 'face_onboarding', 
                                  content: { name: args.name, timestamp: Date.now() }, 
                                  title: 'FACE SETUP' 
                              });
                              result = { result: "Started face onboarding visually. I will now wait for user to tap the screen." };
                          }
                          else if (fc.name === 'save_to_memory') {
                              const args = fc.args as any;
                              if (args.key && args.value) {
                                  try {
                                      const prev = JSON.parse(localStorage.getItem('airo_memory') || '{}');
                                      localStorage.setItem('airo_memory', JSON.stringify({ ...prev, [args.key]: args.value }));
                                  } catch(e) {}
                              }
                              result = { result: `Saved ${args.key} to memory.` };
                          }
                          else if (fc.name === 'ask_confirmation') {
                              const args = fc.args as any;
                              setVisualContent({ 
                                  type: 'predefined', 
                                  component: 'confirmation', 
                                  content: { 
                                      title: args.title, 
                                      subtitle: args.subtitle, 
                                      imageUrl: args.imageUrl, 
                                      confirmText: args.confirmText, 
                                      cancelText: args.cancelText, 
                                      timestamp: Date.now() 
                                  }, 
                                  title: 'CONFIRMATION' 
                              });
                              result = { result: "Confirmation widget presented visually." };
                          }
                          else if (fc.name === 'trigger_confirmation') {
                              const args = fc.args as any;
                              window.dispatchEvent(new CustomEvent('airo-voice-trigger', { detail: args.action }));
                              result = { result: `Triggered ${args.action} on the widget.` };
                          }
                          else if (fc.name === 'close_visual') {
                              setVisualContent(null);
                              result = { result: "Visual display closed" };
                          }
                          else if (fc.name === 'render_widget') {
                              const args = fc.args as any;
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
                              result = { result: "Widget rendered" };
                          }
                          else if (fc.name === 'show_timer_widget') {
                              const args = fc.args as any;
                              if (onTimerAction) {
                                  onTimerAction('create', args);
                                  result = { result: `Timer '${args.title || 'unnamed'}' for ${args.durationSeconds} seconds started.` };
                              } else {
                                  setVisualContent({ type: 'predefined', component: 'timer', content: args, title: args.title || 'TIMER' });
                                  result = { result: "Timer widget rendered" };
                              }
                          }
                          else if (fc.name === 'cancel_timer') {
                              const args = fc.args as any;
                              if (onTimerAction) {
                                  onTimerAction('cancel', args);
                                  result = { result: `Timer '${args.title}' cancelled successfully.` };
                              } else {
                                  result = { error: "Multiple timers feature not initialised" };
                              }
                          }
                          else if (fc.name === 'pause_timer') {
                              const args = fc.args as any;
                              if (onTimerAction) {
                                  onTimerAction('pause', args);
                                  result = { result: `Timer '${args.title}' paused.` };
                              } else {
                                  result = { error: "Multiple timers feature not initialised" };
                              }
                          }
                          else if (fc.name === 'resume_timer') {
                              const args = fc.args as any;
                              if (onTimerAction) {
                                  onTimerAction('resume', args);
                                  result = { result: `Timer '${args.title}' resumed.` };
                              } else {
                                  result = { error: "Multiple timers feature not initialised" };
                              }
                          }
                          else if (fc.name === 'highlight_timer') {
                              const args = fc.args as any;
                              if (onTimerAction) {
                                  onTimerAction('highlight', args);
                                  result = { result: `Timer '${args.title}' highlighted.` };
                              } else {
                                  result = { error: "Multiple timers feature not initialised" };
                              }
                          }
                          else if (fc.name === 'get_active_timers') {
                              if (getActiveTimersRef.current) {
                                  const currentTimersList = getActiveTimersRef.current();
                                  result = { timers: currentTimersList };
                              } else {
                                  result = { error: "Multiple timers feature not initialised" };
                              }
                          }
                          else if (fc.name === 'show_settings_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'settings', content: args, title: args.title || 'SETTINGS' });
                              result = { result: "Settings widget rendered" };
                          }
                          else if (fc.name === 'show_confirmation_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'confirmation', content: args, title: args.title || 'CONFIRMATION' });
                              result = { result: "Confirmation widget rendered" };
                          }
                          else if (fc.name === 'show_math_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'math', content: args, title: 'Mathematical Solution', highlightedIndex: 0 });
                              result = { result: "Math widget rendered successfully" };
                          }
                          else if (fc.name === 'show_time_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'time', content: args, title: 'Current Time & World Clocks', highlightedIndex: 0 });
                              result = { result: "Time widget rendered successfully" };
                          }
                          else if (fc.name === 'show_battery_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'battery', content: args, title: 'BATTERY STATUS' });
                              result = { result: "Battery widget rendered successfully" };
                          }
                          else if (fc.name === 'show_dice_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'dice', content: args, title: 'DICE ROLL' });
                              result = { result: "Dice widget rendered successfully" };
                          }
                          else if (fc.name === 'show_date_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'date', content: args, title: 'Calendar & Date' });
                              result = { result: "Date widget rendered successfully" };
                          }
                          else if (fc.name === 'show_news_widget') {
                              const args = fc.args as any;
                              setVisualContent({ type: 'predefined', component: 'news', content: args, title: 'News Feed', highlightedIndex: 0 });
                              result = { result: "News widget rendered successfully" };
                          }
                          else if (fc.name === 'play_youtube_music') {
                              const { query } = fc.args as any;
                              try {
                                  const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
                                  const searchResult = await response.json();
                                  if (searchResult.error) throw new Error(searchResult.error);
                                  
                                  lastPlayedTrackRef.current = searchResult;
                                  setVisualContent({ 
                                      type: 'predefined', 
                                      component: 'music_player', 
                                      content: searchResult, 
                                      title: `Now Playing: ${searchResult.title}` 
                                  });
                                  result = { success: true, videoId: searchResult.videoId, title: searchResult.title };
                                  // Automatically end the chat when new music starts
                                  setTimeout(() => {
                                      disconnect("play_youtube_music started playback (designed auto-end)");
                                  }, 500);
                              } catch (e: any) {
                                  result = { error: `Failed to find track: ${e.message}` };
                              }
                          }
                          else if (fc.name === 'control_music_player') {
                              const { action, volume } = fc.args as any;
                              const currentVisual = visualContentRef.current;
                              
                              if (action === 'resume' || action === 'play') {
                                  if (!currentVisual || currentVisual.component !== 'music_player') {
                                      if (lastPlayedTrackRef.current) {
                                          const restoredContent = { 
                                              ...lastPlayedTrackRef.current, 
                                              forcePlaybackState: 'play' 
                                          };
                                          setVisualContent({
                                              type: 'predefined',
                                              component: 'music_player',
                                              content: restoredContent,
                                              title: `Now Playing: ${lastPlayedTrackRef.current.title}`
                                          });
                                          result = { success: true, message: `Restored last played track: ${lastPlayedTrackRef.current.title} and set to play.` };
                                          // End the chat when music starts/resumes
                                          setTimeout(() => {
                                              disconnect("control_music_player resumed playback (designed auto-end)");
                                          }, 500);
                                      } else {
                                          result = { success: false, error: "No music track currently in memory to play. You must ask me to play a specific song or artist first!" };
                                      }
                                  } else {
                                      setVisualContent({
                                          ...currentVisual,
                                          content: {
                                              ...currentVisual.content,
                                              forcePlaybackState: 'play'
                                          }
                                      });
                                      result = { success: true, message: "Music set to play state" };
                                      // End the chat when music starts/resumes
                                      setTimeout(() => {
                                          disconnect("control_music_player set play state (designed auto-end)");
                                      }, 500);
                                  }
                              }
                              else if (action === 'pause') {
                                  if (currentVisual && currentVisual.component === 'music_player') {
                                      setVisualContent({
                                          ...currentVisual,
                                          content: {
                                              ...currentVisual.content,
                                              forcePlaybackState: 'pause'
                                          }
                                      });
                                      result = { success: true, message: "Music set to pause state" };
                                  } else {
                                      result = { success: false, error: "No active music player is currently displayed. Nothing to pause." };
                                  }
                              }
                              else if (action === 'set_volume') {
                                  if (currentVisual && currentVisual.component === 'music_player') {
                                      setVisualContent({
                                          ...currentVisual,
                                          content: {
                                              ...currentVisual.content,
                                              forceVolume: volume
                                          }
                                      });
                                      result = { success: true, message: `Music volume adjusted to ${volume}%` };
                                  } else {
                                      result = { success: false, error: "No active music player is currently displayed. Cannot adjust volume." };
                                  }
                              }
                          }
                          else if (fc.name === 'highlight_active_item') {
                              const args = fc.args as any;
                              const index = typeof args.index === 'number' ? args.index : parseInt(args.index);
                              setVisualContent(prev => {
                                  if (prev) {
                                      return { ...prev, highlightedIndex: index };
                                  }
                                  return prev;
                              });
                              result = { result: `Item at index ${index} highlighted successfully` };
                          }
                          else if (fc.name === 'request_next_headline') {
                              const currentVisual = visualContentRef.current;
                              if (currentVisual && currentVisual.type === 'predefined' && currentVisual.component === 'news') {
                                  const stories = currentVisual.content?.stories || currentVisual.content?.headlines || [];
                                  const currentIndex = typeof currentVisual.highlightedIndex === 'number' ? currentVisual.highlightedIndex : 0;
                                  const nextIndex = currentIndex + 1;
                                  
                                  if (nextIndex < stories.length) {
                                      const nextStory = stories[nextIndex];
                                      setVisualContent({
                                          ...currentVisual,
                                          highlightedIndex: nextIndex
                                      });
                                      result = {
                                          success: true,
                                          nextStory: {
                                              title: nextStory.title,
                                              summary: nextStory.summary,
                                              source: nextStory.source || '',
                                              timeAgo: nextStory.timeAgo || '',
                                              category: nextStory.category || '',
                                              url: nextStory.url || ''
                                          },
                                          index: nextIndex,
                                          totalStories: stories.length,
                                          hasMore: true
                                      };
                                  } else {
                                      result = {
                                          success: true,
                                          nextStory: null,
                                          index: nextIndex,
                                          totalStories: stories.length,
                                          hasMore: false,
                                          message: "That was the last story. No more headlines left."
                                      };
                                  }
                              } else {
                                  result = {
                                      error: "No active news feed found. Call 'show_news_widget' first before requesting the next headline."
                                  };
                              }
                          }
                          else if (fc.name === 'set_system_volume') {
                              const args = fc.args as any;
                              const { setSoundVolume } = require('../utils/soundEffects');
                              setSoundVolume(args.volume / 10);
                              setVisualContent({ type: 'predefined', component: 'volume', content: args, title: 'VOLUME' });
                              result = { result: "Volume updated." };
                          }
                          else if (fc.name === 'rotate_robot') {
                              if (onRotate360) {
                                  onRotate360();
                                  result = { result: "Robot rotated 360 degrees" };
                              } else {
                                  result = { result: "Robot is not connected" };
                              }
                          }
                          else if (fc.name === 'stop_alarm') {
                              if (onStopAlarm) {
                                  onStopAlarm();
                                  result = { result: "Alarm noise stopped" };
                              } else {
                                  result = { result: "No alarm is currently playing" };
                              }
                          }
                          else if (fc.name === 'perform_dance') {
                              if (onDance) {
                                  const id = (fc.args && typeof (fc.args as any).danceId === 'number') ? (fc.args as any).danceId : (Math.floor(Math.random() * 5) + 1);
                                  onDance(id);
                                  result = { result: "Dancing! Express excitement to the user about doing the dance!" };
                              } else {
                                  result = { result: "Dance failed: robot not connected." };
                              }
                          }
                          else if (fc.name === 'search_web') {
                              const query = (fc.args as any).query;
                              try {
                                  const webSearchResponse = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                                  const searchResponseData = await webSearchResponse.json();
                                  if (searchResponseData.error) throw new Error(searchResponseData.error);
                                  result = { result: searchResponseData.result };
                              } catch (e: any) {
                                  result = { error: e.message };
                              }
                          }
                          else if (fc.name === 'get_weather' || fc.name === 'show_weather_widget') {
                              let { latitude, longitude, location: toolLocation } = fc.args as any;
                              try {
                                  if ((!toolLocation || toolLocation.toLowerCase() === "my location" || toolLocation === "Your Location" || toolLocation === "Unknown") && locationRef.current) {
                                      toolLocation = locationRef.current;
                                  }
                                  let resolvedLocation = toolLocation || "";
                                  if ((latitude === undefined || longitude === undefined) && toolLocation) {
                                      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(toolLocation)}&count=1&language=en&format=json`);
                                      const geoData = await geoRes.json();
                                      if (geoData.results && geoData.results.length > 0) {
                                          latitude = geoData.results[0].latitude;
                                          longitude = geoData.results[0].longitude;
                                          resolvedLocation = geoData.results[0].name;
                                      } else {
                                          // Fallback to Victoria, BC instead of throwing
                                          latitude = 48.4284;
                                          longitude = -123.3656;
                                          resolvedLocation = "Victoria, BC";
                                      }
                                  }
                                  
                                  if (latitude === undefined || longitude === undefined) {
                                      latitude = 48.4284;
                                      longitude = -123.3656;
                                      resolvedLocation = "Victoria, BC";
                                  }

                                  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum&timezone=auto`);
                                  const data = await res.json();
                                  
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
                                  const dailyData = (data.daily?.time || []).map((timeStr: string, idx: number) => {
                                      const d = new Date(timeStr + "T00:00:00");
                                      const dayName = daysOfWeek[d.getDay()] || "Mon";
                                      const dailyCode = data.daily?.weather_code?.[idx] ?? 0;
                                      return {
                                          day: dayName,
                                          maxTemp: Math.round(data.daily?.temperature_2m_max?.[idx] ?? 70),
                                          minTemp: Math.round(data.daily?.temperature_2m_min?.[idx] ?? 50),
                                          weatherCode: dailyCode,
                                          condition: getWmoCondition(dailyCode)
                                      };
                                  }).slice(0, 5);

                                  const widgetData = {
                                      locationName: resolvedLocation || "Current Location",
                                      currentTemp: Math.round(data.current?.temperature_2m ?? 72),
                                      unit: "C",
                                      condition: getWmoCondition(data.current?.weather_code ?? 0),
                                      weatherCode: data.current?.weather_code ?? 0,
                                      apparentTemp: Math.round(data.current?.apparent_temperature ?? 72),
                                      humidity: Math.round(data.current?.relative_humidity_2m ?? 50),
                                      windSpeed: `${Math.round(data.current?.wind_speed_10m ?? 0)} km/h`,
                                      dailyForecast: dailyData
                                  };

                                  setVisualContent({ 
                                      type: 'predefined', 
                                      component: 'weather', 
                                      content: widgetData, 
                                      title: `Weather Forecast for ${widgetData.locationName}` 
                                  });
                                  result = { result: widgetData };
                              } catch (e: any) {
                                  result = { error: e.message };
                              }
                              }
                          } catch (toolErr: any) {
                              console.error(`Error executing tool ${fc.name}:`, toolErr);
                              if (onError) {
                                  onError({
                                      level: 'BLUE',
                                      message: `Widget Error: ${fc.name} failed`,
                                      details: toolErr.message,
                                      timestamp: Date.now()
                                  });
                              }
                              result = { error: toolErr.message };
                          }
                          functionResponses.push({ id: fc.id, name: fc.name, response: result });
                      }
                      if (functionResponses.length > 0) session.sendToolResponse({ functionResponses });
                      setIsThinking(false);
                  }

                  if (message.serverContent?.interrupted) {
                      sourcesRef.current.forEach(s => { try{s.stop()}catch(e){} });
                      sourcesRef.current.clear();
                      nextStartTimeRef.current = 0;
                      setIsAiSpeaking(false);
                      setIsThinking(false);
                  }
              }
              else if (data.type === 'close') {
                  console.log("[GeminiLive] Server sent type:'close' - the Gemini Live websocket (geminiWs) closed on the server side.");
                  if (currentId === connectionIdRef.current) disconnect("server relayed geminiWs close");
              }
              else if (data.type === 'error') {
                  console.error("Critical Connection Error from secure server tunnel:", data.error);
                  playSound.bubblyError();

                  if (retryCount < 2) {
                      console.log(`Connection failed. Retrying connection, attempt ${retryCount + 1}/2...`);
                      setTimeout(() => connect(retryCount + 1, initialAudio), 1500);
                  } else {
                      setConnectionState(AppState.ERROR);
                      setTimeout(() => disconnect(`server relayed error after retries exhausted: ${data.error}`), 2000);
                  }
              }
          } catch (err) {
              console.error("Client WS onmessage error:", err);
          }
      };

      ws.onclose = (closeEvt: any) => {
          console.log(`[GeminiLive] Client->Server websocket closed. code=${closeEvt?.code} reason="${closeEvt?.reason}" wasClean=${closeEvt?.wasClean}`);
          if (currentId === connectionIdRef.current) {
              disconnect(`client-server websocket closed (code=${closeEvt?.code})`);
          }
      };

      ws.onerror = (err) => {
          console.error("Client WS error:", err);
          if (currentId === connectionIdRef.current) {
              playSound.bubblyError();
              if (retryCount < 2) {
                  console.log(`Connection failed on error. Retrying...`);
                  setTimeout(() => connect(retryCount + 1, initialAudio), 1500);
              } else {
                  setConnectionState(AppState.ERROR);
                  setTimeout(() => disconnect("client-server websocket error after retries exhausted"), 2000);
              }
          }
      };

    } catch (e) {
      console.error(e);
      if (onError) onError(e);
      setConnectionState(AppState.ERROR);
    }
  }, [disconnect, activeAirCard, location, localMemory]);

  const sendClientContent = useCallback((text: string) => {
      if (sessionRef.current) {
          try {
              sessionRef.current.sendClientContent({
                  turns: [
                      {
                          role: "user",
                          parts: [{ text }]
                      }
                  ],
                  turnComplete: true
              });
              // Marks the text-first fallback-audio safety net as satisfied, so it won't also
              // send the buffered audio for the same spoken command if it fires after this.
              textTurnSentRef.current = true;
          } catch (e) {
              console.error("Failed to send ClientContent:", e);
          }
      }
  }, []);

  const releaseAudioHold = useCallback(() => {
      audioHeldRef.current = false;
      if (audioHoldSafetyTimerRef.current) {
          clearTimeout(audioHoldSafetyTimerRef.current);
          audioHoldSafetyTimerRef.current = null;
      }
  }, []);

  return { connect, disconnect, isAiSpeaking, isThinking, connectionState, visualContent, setVisualContent, sendClientContent, releaseAudioHold };
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
