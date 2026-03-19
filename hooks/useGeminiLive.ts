
import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Tool } from '@google/genai';
import { createPcmBlob, decodeAudioData, PCM_SAMPLE_RATE } from '../services/audioUtils';
import { AppState, VisualContent, EyeState } from '../types';

const endSessionTool: FunctionDeclaration = {
  name: "end_session",
  description: "Ends the voice session. Use when user is done.",
  parameters: { type: Type.OBJECT, properties: {} }
};

const display_image: FunctionDeclaration = {
  name: "display_image",
  description: "Displays an image from a URL. Must use a direct image link.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING },
      caption: { type: Type.STRING }
    },
    required: ["url"]
  }
};

const close_visual: FunctionDeclaration = {
  name: "close_visual",
  description: "Closes any currently displayed image or widget. Use this when the conversation moves on from the visual.",
  parameters: { type: Type.OBJECT, properties: {} }
};

const render_widget: FunctionDeclaration = {
  name: "render_widget",
  description: "Renders an interactive UI widget.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      html: { type: Type.STRING },
      css: { type: Type.STRING },
      javascript: { type: Type.STRING },
      title: { type: Type.STRING }
    },
    required: ["html"]
  }
};

const search_web: FunctionDeclaration = {
  name: "search_web",
  description: "Searches the web for up-to-date information to answer the user's query.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query or question to ask." }
    },
    required: ["query"]
  }
};

const get_weather: FunctionDeclaration = {
  name: "get_weather",
  description: "Gets the current weather and forecast for a specific location using latitude and longitude.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      latitude: { type: Type.NUMBER, description: "Latitude of the location." },
      longitude: { type: Type.NUMBER, description: "Longitude of the location." }
    },
    required: ["latitude", "longitude"]
  }
};

const show_timer_widget: FunctionDeclaration = {
  name: "show_timer_widget",
  description: "Shows a predefined timer widget.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      durationSeconds: { type: Type.NUMBER, description: "The duration of the timer in seconds." },
      title: { type: Type.STRING, description: "The title of the timer, e.g., '5 MINUTE TIMER'." }
    },
    required: ["durationSeconds"]
  }
};

const show_settings_widget: FunctionDeclaration = {
  name: "show_settings_widget",
  description: "Shows a predefined settings widget with circular buttons.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "The title of the settings screen." },
      options: { 
        type: Type.ARRAY, 
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            icon: { type: Type.STRING, description: "Icon name, e.g., 'info', 'qr', 'sync', 'settings'" }
          },
          required: ["id", "label", "icon"]
        }
      }
    },
    required: ["title", "options"]
  }
};

const show_confirmation_widget: FunctionDeclaration = {
  name: "show_confirmation_widget",
  description: "Shows a predefined confirmation widget with Yes/No buttons.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "The main question, e.g., 'Enable QR Commander?'" },
      subtitle: { type: Type.STRING, description: "Additional context." },
      confirmText: { type: Type.STRING, description: "Text for the confirm button, e.g., 'Yes'." },
      cancelText: { type: Type.STRING, description: "Text for the cancel button, e.g., 'No'." }
    },
    required: ["title"]
  }
};

const rotate_robot: FunctionDeclaration = {
  name: "rotate_robot",
  description: "Rotates the physical Ollie robot 360 degrees.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  }
};

const tools: Tool[] = [
  { functionDeclarations: [endSessionTool, display_image, render_widget, close_visual, search_web, get_weather, show_timer_widget, show_settings_widget, show_confirmation_widget, rotate_robot] }
];

export const useGeminiLive = (apiKey: string | undefined, onDisconnect: () => void, location?: string | null, onRotate360?: () => void) => {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [connectionState, setConnectionState] = useState<AppState>(AppState.IDLE);
  const [visualContent, setVisualContent] = useState<VisualContent | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const connectionStateRef = useRef<AppState>(AppState.IDLE);
  const connectionIdRef = useRef<number>(0);
  const videoIntervalRef = useRef<any>(null);
  
  const isAiSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const lastSpokeTimeRef = useRef(Date.now());
  const silencePromptSentRef = useRef(false);

  useEffect(() => { connectionStateRef.current = connectionState; }, [connectionState]);
  useEffect(() => { isAiSpeakingRef.current = isAiSpeaking; }, [isAiSpeaking]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);

  const cleanup = async () => {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
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

  const disconnect = useCallback(async () => {
      connectionIdRef.current++;
      sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
      sourcesRef.current.clear();
      setIsThinking(false);
      setIsAiSpeaking(false);
      await cleanup();
      setConnectionState(AppState.IDLE);
      onDisconnect();
  }, [onDisconnect]);

  const connect = async (retryCount = 0, initialAudio?: Float32Array | null): Promise<void> => {
    if (!apiKey) return;
    const currentId = ++connectionIdRef.current;
    
    try {
      setConnectionState(AppState.CONNECTING);
      await cleanup();
      
      const ai = new GoogleGenAI({ 
          apiKey
      });
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Request both audio and video with retry logic to handle mic contention
      let stream: MediaStream | null = null;
      let attempt = 0;
      while (!stream && attempt < 5) {
          if (currentId !== connectionIdRef.current) return;
          try {
             stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                },
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10 } }
             });
          } catch (e: any) {
              console.warn(`Mic/Cam acquisition failed (attempt ${attempt + 1}/5):`, e.message);
              // Wait for WakeWordDetector to fully release the mic
              await new Promise(r => setTimeout(r, 400));
              attempt++;
          }
      }
      
      if (!stream) throw new Error("Could not acquire microphone/camera after retries");
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: async () => {
            if (currentId !== connectionIdRef.current) return;
            try {
                if (!stream) return; // Should not happen
                streamRef.current = stream;
                setConnectionState(AppState.ACTIVE);
                
                if (initialAudio) {
                    const pcmBlob = createPcmBlob(initialAudio);
                    sessionPromise.then((session: any) => {
                        try { session.sendRealtimeInput({ audio: pcmBlob }); } catch (err) {}
                    });
                }

                // Audio Streaming
                if (!inputContextRef.current) return;
                const source = inputContextRef.current.createMediaStreamSource(stream);
                const scriptProcessor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
                processorRef.current = scriptProcessor;
                
                scriptProcessor.onaudioprocess = (e) => {
                  if (connectionStateRef.current !== AppState.ACTIVE || currentId !== connectionIdRef.current) return;
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
                      const silenceDuration = Date.now() - lastSpokeTimeRef.current;
                      if (silenceDuration > 10000) { // 10 seconds of silence
                          disconnect();
                          return; // Stop processing
                      }
                  }

                  const pcmBlob = createPcmBlob(inputData);
                  sessionPromise.then((session: any) => {
                    try { session.sendRealtimeInput({ audio: pcmBlob }); } catch (err) {}
                  });
                };
                
                source.connect(scriptProcessor);
                // Important: Connect to a mute node to prevent local echo/feedback loop while keeping the processor active
                const muteNode = inputContextRef.current.createGain();
                muteNode.gain.value = 0;
                scriptProcessor.connect(muteNode);
                muteNode.connect(inputContextRef.current.destination);

                // Video Streaming (Frames)
                const videoEl = document.createElement('video');
                videoEl.srcObject = stream;
                videoEl.muted = true; // Prevent local audio playback
                videoEl.play();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                videoIntervalRef.current = setInterval(() => {
                    if (connectionStateRef.current !== AppState.ACTIVE || currentId !== connectionIdRef.current) return;
                    if (ctx && videoEl.readyState >= 2) {
                        canvas.width = 320;
                        canvas.height = 240;
                        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                        const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                        sessionPromise.then(session => {
                            session.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
                        });
                    }
                }, 1000); // 1 frame per second

            } catch (err) { disconnect(); }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (currentId !== connectionIdRef.current) return;

            // Handle Audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
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

            // Handle Tool Calls
            if (message.toolCall) {
                setIsThinking(true);
                const session = await sessionPromise;
                const functionResponses: any[] = [];
                for (const fc of message.toolCall.functionCalls) {
                    let result: any = { status: "ok" };
                    if (fc.name === 'end_session') { disconnect(); return; }
                    else if (fc.name === 'display_image') {
                        setVisualContent({ type: 'image', content: (fc.args as any).url, title: (fc.args as any).caption || 'Image Content' });
                        result = { result: "Image rendered" };
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
                        setVisualContent({ type: 'predefined', component: 'timer', content: args, title: args.title || 'TIMER' });
                        result = { result: "Timer widget rendered" };
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
                    else if (fc.name === 'rotate_robot') {
                        if (onRotate360) {
                            onRotate360();
                            result = { result: "Robot rotated 360 degrees" };
                        } else {
                            result = { result: "Robot is not connected" };
                        }
                    }
                    else if (fc.name === 'search_web') {
                        const query = (fc.args as any).query;
                        try {
                            if (!apiKey) throw new Error("API key missing");
                            const searchAi = new GoogleGenAI({ apiKey });
                            const searchResponse = await searchAi.models.generateContent({
                                model: "gemini-2.5-flash",
                                contents: query,
                                config: {
                                    tools: [{ googleSearch: {} }]
                                }
                            });
                            result = { result: searchResponse.text };
                        } catch (e: any) {
                            result = { error: e.message };
                        }
                    }
                    else if (fc.name === 'get_weather') {
                        const { latitude, longitude } = fc.args as any;
                        try {
                            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum&timezone=auto`);
                            const data = await res.json();
                            result = { result: data };
                        } catch (e: any) {
                            result = { error: e.message };
                        }
                    }
                    functionResponses.push({ id: fc.id, name: fc.name, response: result });
                }
                if (functionResponses.length > 0) session.sendToolResponse({ functionResponses });
            }
            
            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => { try{s.stop()}catch(e){} });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsAiSpeaking(false);
                setIsThinking(false);
            }
          },
          onclose: () => { if (currentId === connectionIdRef.current) disconnect(); },
          onerror: (err) => {
              console.error("Critical Connection Error:", err);
              if (err instanceof Error) {
                  console.error("Error message:", err.message);
                  console.error("Error stack:", err.stack);
              }
              if (retryCount < 2) setTimeout(() => connect(retryCount + 1, initialAudio), 1000);
              else { setConnectionState(AppState.ERROR); setTimeout(disconnect, 2000); }
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Zephyr' }
                }
            },
            tools: tools,
            systemInstruction: {
                parts: [{
                    text: `You are Airo, a helpful and snappy voice assistant with vision capabilities.
            - You can see the user via their camera.
            - Keep responses concise, natural, and friendly.
            - Do NOT repeat the user's words. Do NOT start by saying "You said...".
            - Just answer or execute the command.
            - IMPORTANT: If the user only says your name or "Hey Arrow", do NOT respond immediately. Wait for them to finish their command. If they pause for a long time, then you can say "Yes?". This prevents you from speaking twice.
            - You can rotate the physical Ollie robot 360 degrees using the 'rotate_robot' tool.
            - When showing visual content, use 'display_image', 'show_timer_widget', 'show_settings_widget', 'show_confirmation_widget', or 'render_widget'.
            - Prefer using the predefined widgets ('show_timer_widget', 'show_settings_widget', 'show_confirmation_widget') over 'render_widget' whenever possible.
            - When using 'render_widget' for custom UI, ALWAYS style it with a dark, bubbly aesthetic to match the system UI: use a transparent background, large circular buttons with vibrant gradients (e.g., green for yes, red for no, gray for settings) and drop shadows, white text, and clean rounded sans-serif typography. Avoid square corners, sharp edges, and white backgrounds. Icons inside circles should have a long shadow effect if possible.
            - Call 'close_visual' when the visual is no longer needed.
            - Call 'end_session' if the user says goodbye or wants to stop.
            - If you hear the user talking to someone else or saying something clearly not directed at you, ignore it and ask "I'm still listening, do you want me to end the chat?" or something similar. Do not attempt to answer or respond to background conversations.
            - Use 'search_web' to find up-to-date information when asked about recent events, facts, or things you don't know.
            - Use 'get_weather' to get the current weather and forecast for a specific location.
            ${location ? `- The user's current approximate location (latitude, longitude) is: ${location}. Use this to tailor local results (weather, places, etc.).` : ''}`
                }]
            },
        }
      });
    } catch (e) {
      console.error(e);
      setConnectionState(AppState.ERROR);
      setTimeout(disconnect, 2000);
    }
  };

  return { connect, disconnect, isAiSpeaking, isThinking, connectionState, visualContent, setVisualContent };
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
