
export class WakeWordDetector {
  isListening: boolean = false;
  isLoaded: boolean = false;
  onWake: (audioBuffer: Float32Array) => void;
  
  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  
  private rollingBuffer: Float32Array;
  private bufferSize: number;
  private writeIndex: number = 0;
  private isBufferFull: boolean = false;

  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly BUFFER_SECONDS = 4; // Keep last 4 seconds

  constructor(onWake: (audioBuffer: Float32Array) => void) {
    this.onWake = onWake;
    this.bufferSize = this.TARGET_SAMPLE_RATE * this.BUFFER_SECONDS;
    this.rollingBuffer = new Float32Array(this.bufferSize);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript.toLowerCase();
          if (transcript.includes("hey arrow") || transcript.includes("arrow")) {
            console.log("Wake Word Detected via Web Speech API:", transcript);
            this.triggerWake();
            break;
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
            try {
                this.recognition.start();
            } catch (e) {}
        }
      };
    } else {
      console.error("Web Speech API not supported in this browser.");
    }
  }

  async load() {
    // No models to load for Web Speech API
    this.isLoaded = true;
  }

  async start() {
    if (!this.isLoaded || this.isListening) return;

    try {
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
      
      if (this.recognition) {
          try {
              this.recognition.start();
          } catch (e) {}
      }

      this.isListening = true;
      console.log(`Wake Word Listening Started (Web Speech API).`);
    } catch (e) {
      console.error("Error starting wake word listener:", e);
    }
  }

  stop() {
    this.isListening = false;
    
    if (this.recognition) {
        try {
            this.recognition.stop();
        } catch (e) {}
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
        this.audioContext.close();
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

  private triggerWake() {
      // Extract the ordered buffer
      let orderedBuffer: Float32Array;
      if (this.isBufferFull) {
          orderedBuffer = new Float32Array(this.bufferSize);
          orderedBuffer.set(this.rollingBuffer.subarray(this.writeIndex), 0);
          orderedBuffer.set(this.rollingBuffer.subarray(0, this.writeIndex), this.bufferSize - this.writeIndex);
      } else {
          orderedBuffer = new Float32Array(this.rollingBuffer.subarray(0, this.writeIndex));
      }
      
      this.onWake(orderedBuffer);
      this.stop();
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
