
declare global {
  interface Window {
    AiroAndroidBridge?: {
      startNativeWakeRecognition?: () => string;
      stopNativeWakeRecognition?: () => string;
    };
  }
}

export class WakeWordDetector {
  isListening: boolean = false;
  isLoaded: boolean = false;
  onWake: (audioBuffer: Float32Array, transcript?: string) => void;
  onTranscript?: (text: string) => void;
  
  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private restartTimer: number | null = null;
  private useSpeechRecognitionOnly: boolean = false;
  private suppressNextRecognitionAbort: boolean = false;
  private lastWakeAt: number = 0;
  private consecutiveRecognitionFailures: number = 0;
  private nativeWakeHandler: EventListener | null = null;
  
  private rollingBuffer: Float32Array;
  private bufferSize: number;
  private writeIndex: number = 0;
  private isBufferFull: boolean = false;

  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly BUFFER_SECONDS = 8; // Keep last 8 seconds so wake + command survive handoff

  constructor(onWake: (audioBuffer: Float32Array, transcript?: string) => void, onTranscript?: (text: string) => void) {
    this.onWake = onWake;
    this.onTranscript = onTranscript;
    this.bufferSize = this.TARGET_SAMPLE_RATE * this.BUFFER_SECONDS;
    this.rollingBuffer = new Float32Array(this.bufferSize);

    this.createRecognition();
  }

  private createRecognition() {
    if (typeof window !== 'undefined' && window.AiroAndroidBridge?.startNativeWakeRecognition) {
      this.useSpeechRecognitionOnly = true;
      this.recognition = null;
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    this.useSpeechRecognitionOnly = Boolean(SpeechRecognition) && isMobile;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 5;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        this.consecutiveRecognitionFailures = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          for (let j = 0; j < result.length; j++) {
            const transcript = String(result[j].transcript || '');
            const normalized = this.normalizeTranscript(transcript);
            if (normalized) {
              this.onTranscript?.(`Heard: ${normalized}`);
            }
            const now = Date.now();
            if (
              this.isWakePhrase(normalized) &&
              (result.isFinal || this.isStrongInterimWakePhrase(normalized)) &&
              now - this.lastWakeAt > 1200
            ) {
              this.lastWakeAt = now;
              this.triggerWake(normalized);
              return;
            }
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        const error = String(event.error || 'unknown');
        if (error === 'aborted' && this.suppressNextRecognitionAbort) {
          this.suppressNextRecognitionAbort = false;
          return;
        }
        console.warn("Speech recognition error", error);
        this.onTranscript?.(`Wake listener: ${error}`);

        // Mobile browsers often emit these while auto-restarting.
        if (this.isListening && ['aborted', 'audio-capture', 'network', 'no-speech', 'not-allowed', 'service-not-allowed'].includes(error)) {
          this.scheduleRecognitionRestart();
        }
      };

      this.recognition.onend = () => {
        if (this.suppressNextRecognitionAbort) {
            this.suppressNextRecognitionAbort = false;
            return;
        }
        if (this.isListening) {
            this.scheduleRecognitionRestart();
        }
      };
    } else {
      console.error("Web Speech API not supported in this browser.");
      this.onTranscript?.("Wake word not supported in this browser");
    }
  }

  async load() {
    // No models to load for Web Speech API
    this.isLoaded = true;
  }

  private recreateRecognition() {
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort?.();
      } catch {}
      try {
        this.recognition.stop?.();
      } catch {}
    }
    this.recognition = null;
    this.createRecognition();
  }

  async start() {
    if (!this.isLoaded) return;

    if (this.isListening) {
      this.stop();
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    try {
      if (!this.recognition) {
        this.createRecognition();
      }
      this.isListening = true;
      this.suppressNextRecognitionAbort = false;
      this.onTranscript?.("Listening for Hey Airo");

      if (typeof window !== 'undefined' && window.AiroAndroidBridge?.startNativeWakeRecognition) {
        if (!this.nativeWakeHandler) {
          this.nativeWakeHandler = ((event: Event) => {
            const detail = (event as CustomEvent<{ text?: string; isFinal?: boolean }>).detail || {};
            const transcript = String(detail.text || '').trim();
            const normalized = this.normalizeTranscript(transcript);
            if (normalized) {
              this.onTranscript?.(`Heard: ${normalized}`);
            }
            const now = Date.now();
            if (
              normalized &&
              this.isWakePhrase(normalized) &&
              (detail.isFinal || this.isStrongInterimWakePhrase(normalized)) &&
              now - this.lastWakeAt > 1200
            ) {
              this.lastWakeAt = now;
              this.triggerWake(normalized);
            }
          }) as EventListener;
          window.addEventListener('airo-native-wake', this.nativeWakeHandler);
        }
        const result = window.AiroAndroidBridge.startNativeWakeRecognition();
        if (result === 'ok' || result === '' || result == null) {
          return;
        }
        throw new Error(result);
      }

      // On mobile, letting SpeechRecognition own the microphone is more reliable
      // than competing with an active getUserMedia stream.
      if (!this.useSpeechRecognitionOnly) {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            }
        });

        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: this.TARGET_SAMPLE_RATE });
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        const source = this.audioContext.createMediaStreamSource(this.stream);
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => this.handleAudio(e);
      }

      if (this.recognition) {
          this.startRecognition();
      }
    } catch (e) {
      this.stop();
      this.isListening = false;
      console.error("Error starting wake word listener:", e);
      const message = e instanceof Error ? e.message : String(e);
      this.onTranscript?.(`Mic start failed: ${message}`);
    }
  }

  stop() {
    this.isListening = false;
    if (this.restartTimer) {
        window.clearTimeout(this.restartTimer);
        this.restartTimer = null;
    }
    
    if (this.nativeWakeHandler) {
        window.removeEventListener('airo-native-wake', this.nativeWakeHandler);
        this.nativeWakeHandler = null;
    }
    try {
        window.AiroAndroidBridge?.stopNativeWakeRecognition?.();
    } catch {}

    if (this.recognition) {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.suppressNextRecognitionAbort = true;
        try {
            this.recognition.abort?.();
        } catch (e) {}
        try {
            this.recognition.stop();
        } catch (e) {}
        this.recognition = null;
    }

    if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
        this.processor = null;
    }
    
    if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
    }
    
    this.rollingBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.isBufferFull = false;
  }

  private handleAudio(event: AudioProcessingEvent) {
      if (!this.isListening) return;

      const inputData = event.inputBuffer.getChannelData(0);
      
      let processedData: Float32Array;
      if (event.inputBuffer.sampleRate !== this.TARGET_SAMPLE_RATE) {
          processedData = this.downsample(inputData, event.inputBuffer.sampleRate, this.TARGET_SAMPLE_RATE);
      } else {
          processedData = inputData;
      }

      // Add to rolling buffer
      for (let i = 0; i < processedData.length; i++) {
          this.rollingBuffer[this.writeIndex] = processedData[i];
          this.writeIndex++;
          if (this.writeIndex >= this.bufferSize) {
              this.writeIndex = 0;
              this.isBufferFull = true;
          }
      }
  }

  private triggerWake(transcript?: string) {
      // Extract the ordered buffer
      let orderedBuffer: Float32Array;
      if (this.useSpeechRecognitionOnly) {
          orderedBuffer = new Float32Array(0);
      } else if (this.isBufferFull) {
          orderedBuffer = new Float32Array(this.bufferSize);
          orderedBuffer.set(this.rollingBuffer.subarray(this.writeIndex), 0);
          orderedBuffer.set(this.rollingBuffer.subarray(0, this.writeIndex), this.bufferSize - this.writeIndex);
      } else {
          orderedBuffer = new Float32Array(this.rollingBuffer.subarray(0, this.writeIndex));
      }
      
      this.onWake(orderedBuffer, transcript);
      this.stop();
  }

  private startRecognition() {
      if (!this.isListening) return;
      if (!this.recognition) {
          this.createRecognition();
      }
      if (!this.recognition) return;
      try {
          this.recognition.start();
          this.consecutiveRecognitionFailures = 0;
      } catch (error) {
          this.consecutiveRecognitionFailures += 1;
          if (this.consecutiveRecognitionFailures >= 2) {
              this.recreateRecognition();
          }
          this.scheduleRecognitionRestart();
      }
  }

  private scheduleRecognitionRestart() {
      if (!this.recognition || !this.isListening || this.restartTimer) return;
      this.restartTimer = window.setTimeout(() => {
          this.restartTimer = null;
          this.startRecognition();
      }, 350);
  }

  private normalizeTranscript(transcript: string) {
      return transcript
          .toLowerCase()
          .replace(/[^a-z\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
  }

  private isWakePhrase(transcript: string) {
      if (!transcript) return false;

      const exactPatterns = [
          /\bhey airo\b/,
          /\bhey arrow\b/,
          /\bhey aero\b/,
          /\bhey airoh\b/,
          /\bhey air o\b/,
          /\bhey ai row\b/,
          /\bhey hey row\b/,
          /\bhey row\b/,
          /\bok airo\b/,
          /\bok arrow\b/,
          /\bok aero\b/,
          /\bhello airo\b/,
          /\bhello arrow\b/
      ];

      if (exactPatterns.some((pattern) => pattern.test(transcript))) {
          return true;
      }

      const words = transcript.split(' ').filter(Boolean);
      const targets = ['airo', 'arrow', 'aero', 'airow', 'airoh', 'arrowe'];

      for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const previous = i > 0 ? words[i - 1] : '';

          const isWakeLead = previous === 'hey' || previous === 'ok' || previous === 'hello';
          const closeToWakeWord = targets.some((target) => this.editDistance(word, target) <= 2);

          if (closeToWakeWord && (isWakeLead || word.length >= 4)) {
              return true;
          }
      }

      return false;
  }

  private isStrongInterimWakePhrase(transcript: string) {
      if (!transcript) return false;
      if (/\b(hey|hi|hello|ok)\s+(ai|air|airo|arrow|aero|arro|aro)\b/.test(transcript)) return true;
      if (/\bhey\s+ar\b/.test(transcript)) return true;
      return false;
  }

  private editDistance(a: string, b: string) {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;

      const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
      for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

      for (let i = 1; i <= a.length; i++) {
          for (let j = 1; j <= b.length; j++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              matrix[i][j] = Math.min(
                  matrix[i - 1][j] + 1,
                  matrix[i][j - 1] + 1,
                  matrix[i - 1][j - 1] + cost
              );
          }
      }

      return matrix[a.length][b.length];
  }

  private downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
      if (fromRate === toRate) return buffer;
      const ratio = fromRate / toRate;
      const newLength = Math.round(buffer.length / ratio);
      const result = new Float32Array(newLength);
      
      for (let i = 0; i < newLength; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.floor((i + 1) * ratio);
          let sum = 0;
          let count = 0;
          for (let j = start; j < end && j < buffer.length; j++) {
              sum += buffer[j];
              count++;
          }
          result[i] = count > 0 ? sum / count : buffer[start];
      }
      return result;
  }
}
