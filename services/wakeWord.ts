import * as ort from 'onnxruntime-web';

// Local, on-device wake word detection via a small openWakeWord-style ONNX pipeline:
//   raw 16kHz audio -> melspectrogram.onnx -> embedding_model.onnx -> sliding window of 16
//   embeddings -> hey_airo.onnx (custom classifier) -> wake word probability.
// This replaces using the Web Speech API to DETECT the wake word (slow on Android - often round
// trips to a cloud recognition service just to notice "hey airo" was said). Web Speech API is
// still used, but only AFTER the ONNX model fires, purely to transcribe the follow-up command.
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1; // avoids requiring cross-origin-isolation (SharedArrayBuffer) headers

const MODEL_URLS = {
  mel: '/models/melspectrogram.onnx',
  embedding: '/models/embedding_model.onnx',
  wake: '/models/hey_airo.onnx',
};

// Exact I/O tensor names, confirmed by inspecting the actual model fil es directly - these are not
// guesses, so don't change them without re-verifying against the real .onnx files.
const MEL_INPUT_NAME = 'input';
const MEL_OUTPUT_NAME = 'output';
const EMB_INPUT_NAME = 'input_1';
const EMB_OUTPUT_NAME = 'conv2d_19';
const WAKE_INPUT_NAME = 'onnx::Flatten_0';
const WAKE_OUTPUT_NAME = '39';

const MEL_CHUNK_SAMPLES = 1280; // 80ms @ 16kHz
const EMB_WINDOW_FRAMES = 76;
const WAKE_WINDOW_EMBEDDINGS = 16;
const EMBEDDING_DIM = 96;
const MEL_BINS = 32;

export class WakeWordDetector {
  isListening: boolean = false;
  isLoaded: boolean = false;
  triggered: boolean = false;
  onWake: (audioBuffer: Float32Array, transcript?: string) => void;
  // Fires once with the fully captured follow-up command (spoken right after/with the wake word),
  // transcribed live via the Web Speech API. Lets callers send this turn as text instead of waiting
  // for the (slower) mic + Live API websocket pipeline to spin up and re-transcribe the same audio.
  onCommandFinalized?: (text: string) => void;

  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private ownsStream: boolean = true;
  private processor: AudioWorkletNode | null = null;

  private rollingBuffer: Float32Array;
  private bufferSize: number;
  private writeIndex: number = 0;
  private isBufferFull: boolean = false;

  private pendingCommandText: string = "";
  private commandFinalized: boolean = false;
  private silenceTimer: any = null;
  private commandMaxTimer: any = null;
  private readonly COMMAND_SILENCE_MS = 900;
  private readonly COMMAND_MAX_WAIT_MS = 2500;
  // Index into event.results of the segment that contained the wake word, and the text that
  // followed it within that same segment. Used to idempotently rebuild the full command text
  // on every onresult event (interim results REPLACE, not append, for a given result index).
  private wakeResultIndex: number = -1;
  private wakeSegmentSuffix: string = "";

  // Tracks whether the native recognition engine itself is still running. abort()/stop() are not
  // synchronous - the engine can take a moment to actually shut down - so calling .start() again
  // before onend fires throws "recognition has already started". pendingRestart defers a requested
  // restart until onend confirms the previous session is truly done.
  private nativeActive: boolean = false;
  private pendingRestart: boolean = false;

  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly BUFFER_SECONDS = 4; // Keep last 4 seconds

  // ONNX wake word model state
  private melSession: ort.InferenceSession | null = null;
  private embSession: ort.InferenceSession | null = null;
  private wakeSession: ort.InferenceSession | null = null;
  private onnxReady: boolean = false;
  private onnxLoadAttempted: boolean = false;
  private readonly WAKE_THRESHOLD = 0.85;
  private readonly MAX_MEL_FRAMES = 200;
  private readonly MAX_EMBEDDINGS = 32;
  private sampleAccum: number[] = [];
  private melFrames: number[][] = [];
  private embeddings: number[][] = [];
  private onnxProcessing: boolean = false;
  // Bumped on every stop() so in-flight async ONNX inference from a previous cycle can detect
  // it's stale and discard its result instead of polluting the next cycle's buffers.
  private onnxCycleId: number = 0;

  // Audio capture doesn't stop at the wake word trigger anymore - it keeps running through the
  // whole connection spin-up window (mic acquisition, websocket handshake, Gemini setup) so that
  // whatever the user says during that gap isn't silently lost. getExtendedInitialAudio() stitches
  // the pre-wake rolling buffer together with this growing tail into one continuous burst, sent as
  // the first thing Gemini hears once the session is actually active.
  private postTriggerBuffer: number[] = [];
  private captureFinalized: boolean = false;
  private finalizedInitialAudio: Float32Array | null = null;
  private readonly MAX_POST_TRIGGER_SECONDS = 15;

  constructor(onWake: (audioBuffer: Float32Array, transcript?: string) => void, onCommandFinalized?: (text: string) => void) {
    this.onWake = onWake;
    this.onCommandFinalized = onCommandFinalized;
    this.bufferSize = this.TARGET_SAMPLE_RATE * this.BUFFER_SECONDS;
    this.rollingBuffer = new Float32Array(this.bufferSize);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.nativeActive = true;
      };

      this.recognition.onresult = (event: any) => {
        // With the ONNX model handling wake word detection, this only ever runs AFTER
        // triggerWake() has already fired (this.triggered is already true by the time
        // recognition starts), so every result here is follow-up command speech. The wake-phrase
        // text matching below only matters for the non-ONNX fallback path (see startWebSpeechWakeDetection).
        const triggers = [
          "hey airow", "airow", "hey arrow", "arrow", "hey airo", "airo", "hey aero", "aero",
          "hey ro", "hey raw", "harrow", "air oh", "air-o", "high road"
        ];

        if (!this.triggered) {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const rawTranscript: string = result[0].transcript;
            const transcript = rawTranscript.toLowerCase();
            const matched = triggers.find(t => transcript.includes(t));
            if (matched) {
              console.log("Wake Word Detected via Web Speech API:", transcript);
              const idx = transcript.indexOf(matched);
              this.wakeResultIndex = i;
              this.wakeSegmentSuffix = rawTranscript.slice(idx + matched.length).trim();
              this.pendingCommandText = this.wakeSegmentSuffix;
              this.triggerWake(transcript);
              // NOTE: even if this wake segment itself is already isFinal (very common - people
              // naturally pause right after the wake word before saying their actual request),
              // do NOT finalize the command yet. armCommandCapture only debounces on silence now.
              this.armCommandCapture();
              break;
            }
          }
          return;
        }

        if (this.commandFinalized || this.wakeResultIndex < 0) return;

        // Interim results REPLACE the text at their index rather than appending to it, so rebuild
        // the full command idempotently from the authoritative event.results array every time -
        // this avoids duplicated/garbled text from naively concatenating each interim update.
        let combined = this.wakeSegmentSuffix;
        for (let j = this.wakeResultIndex + 1; j < event.results.length; j++) {
          combined = (combined + " " + event.results[j][0].transcript).trim();
        }
        this.pendingCommandText = combined;
        this.armCommandCapture();
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // Normal/expected events in ambient listening; ignore silently to prevent spam
          return;
        }
        console.error("Speech recognition error", event.error);
      };

      this.recognition.onend = () => {
        this.nativeActive = false;
        if (this.pendingRestart) {
            this.pendingRestart = false;
            try {
                this.recognition.start();
            } catch (e) {}
            return;
        }
        // Only auto-restart for ambient wake-phrase listening in the non-ONNX fallback path.
        // Once ONNX is handling detection, recognition is only ever started on-demand for
        // follow-up capture (see startWebSpeechFollowUpCapture) and should NOT auto-restart here.
        if (this.isListening && !this.onnxReady) {
            try {
                this.recognition.start();
            } catch (e) {}
        }
      };
    } else {
      console.error("Web Speech API not supported in this browser.");
    }
  }

  // Debounces on silence to decide the follow-up command is complete, bounded by a max wait so we
  // never block the audio fallback for long if speech trails off. Deliberately ignores isFinal -
  // a segment being final (e.g. "hey arrow" alone, right after the wake word) does NOT mean the
  // user is done talking in continuous mode; only actual silence (or the max-wait cap) does.
  private armCommandCapture() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finalizeCommand(), this.COMMAND_SILENCE_MS);
    if (!this.commandMaxTimer) {
      this.commandMaxTimer = setTimeout(() => this.finalizeCommand(), this.COMMAND_MAX_WAIT_MS);
    }
  }

  private finalizeCommand() {
    if (!this.triggered || this.commandFinalized) return;
    this.commandFinalized = true;
    clearTimeout(this.silenceTimer);
    clearTimeout(this.commandMaxTimer);
    this.silenceTimer = null;
    this.commandMaxTimer = null;
    try { this.recognition?.abort(); } catch (e) {}
    const text = this.pendingCommandText.trim();
    if (this.onCommandFinalized) this.onCommandFinalized(text);
  }

  preloadContext() {
      if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: this.TARGET_SAMPLE_RATE });
      }
      if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
      }
  }

  async load() {
    if (this.onnxLoadAttempted) return;
    this.onnxLoadAttempted = true;
    try {
      const [melSession, embSession, wakeSession] = await Promise.all([
        ort.InferenceSession.create(MODEL_URLS.mel, { executionProviders: ['wasm'] }),
        ort.InferenceSession.create(MODEL_URLS.embedding, { executionProviders: ['wasm'] }),
        ort.InferenceSession.create(MODEL_URLS.wake, { executionProviders: ['wasm'] }),
      ]);
      this.melSession = melSession;
      this.embSession = embSession;
      this.wakeSession = wakeSession;
      this.onnxReady = true;
      console.log("WakeWord: Local ONNX wake word model loaded - using fast on-device detection.");
    } catch (e: any) {
      console.warn("WakeWord: Failed to load local ONNX wake word model, falling back to Web Speech API phrase detection.", e?.message || e);
      this.onnxReady = false;
    }
    this.isLoaded = true;
  }

  getStream(): MediaStream | null {
      return this.stream;
  }

  async start(existingStream?: MediaStream | null) {
    if (!this.isLoaded || this.isListening) return;
    // Only block if a wake cycle is ACTIVELY capturing its follow-up command right now - do not
    // reset state out from under that. Once finalizeCommand() has run (commandFinalized=true) the
    // cycle is done and `triggered` is just stale bookkeeping from last time; start() must be
    // allowed to proceed and reset it, otherwise the detector can never restart after a session
    // ends and the mic never gets handed back to wake-word listening.
    if (this.triggered && !this.commandFinalized) return;

    try {
      this.triggered = false;
      this.isListening = true;

      // Clear buffers so old audio doesn't re-trigger immediately
      this.rollingBuffer = new Float32Array(this.bufferSize);
      this.writeIndex = 0;
      this.isBufferFull = false;
      this.sampleAccum = [];
      this.melFrames = [];
      this.embeddings = [];
      this.postTriggerBuffer = [];
      this.captureFinalized = false;
      this.finalizedInitialAudio = null;
      this.onnxProcessing = false;
      this.onnxCycleId++;

      if (this.onnxReady) {
          await this.setupAudioWorkletCapture(existingStream);
          console.log("Wake Word Listening Started (Local ONNX Model - Fast On-Device Detection).");
          return;
      }

      if (this.recognition) {
          this.startWebSpeechWakeDetection();
          return;
      }

      // Final fallback: raw AudioWorklet capture with no smart wake detection at all (legacy
      // behavior, only reached if the browser has neither ONNX nor SpeechRecognition available).
      await this.setupAudioWorkletCapture(existingStream);
      console.log("Wake Word Listening Started (AudioWorklet Raw Audio Capture, no wake model available).");
    } catch (e) {
      console.error("Error starting wake word listener:", e);
    }
  }

  private startWebSpeechWakeDetection() {
      if (this.nativeActive) {
          this.pendingRestart = true;
          return;
      }
      const attemptStart = async (retries = 3) => {
          for (let i = 0; i < retries; i++) {
              if (!this.isListening) return;
              if (this.nativeActive) return; // onend's pendingRestart will pick it up instead
              try {
                  this.recognition.start();
                  console.log("Wake Word Listening Started (Web Speech API Only - No Mic Lock).");
                  return;
              } catch (e: any) {
                  console.warn(`SpeechRecognition start failed (attempt ${i + 1}):`, e);
                  await new Promise(r => setTimeout(r, 1000));
              }
          }
          console.error("WakeWord: Failed to start SpeechRecognition after retries.");
      };
      attemptStart();
  }

  // ONNX only tells us the wake word fired - it doesn't transcribe anything. Start Web Speech API
  // fresh, purely to capture the follow-up command text. Since `this.triggered` is already true by
  // this point, the onresult handler above routes every result straight to the follow-up-capture
  // branch (wakeResultIndex defaults to -1, so it rebuilds from index 0 - exactly right for a
  // freshly-started session).
  private startWebSpeechFollowUpCapture() {
      if (!this.recognition) {
          // No speech-to-text available at all - finalize immediately with empty text so the
          // caller doesn't wait forever; the buffered audio replay (initialAudio) still applies.
          this.armCommandCapture();
          return;
      }
      if (this.nativeActive) {
          this.pendingRestart = true;
          this.armCommandCapture();
          return;
      }
      try {
          this.recognition.start();
      } catch (e) {
          console.warn("WakeWord: Failed to start follow-up SpeechRecognition:", e);
      }
      // Arm the debounce/max-wait timers immediately so a completely silent follow-up (user only
      // said the wake word) still finalizes instead of hanging forever with no onresult events.
      this.armCommandCapture();
  }

  private async setupAudioWorkletCapture(existingStream?: MediaStream | null) {
      if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: this.TARGET_SAMPLE_RATE });
      }
      // Ensure the context starts up if we are inside a user gesture
      if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
      }

      if (existingStream) {
          this.stream = existingStream;
          this.ownsStream = false;
      } else {
          try {
              this.stream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true,
                      channelCount: 1
                  }
              });
              this.ownsStream = true;
          } catch (audioErr: any) {
              console.warn("WakeWord: Failed to acquire microphone, using programmatic silent audio simulation.");
              const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: this.TARGET_SAMPLE_RATE });
              const osc = tempCtx.createOscillator();
              const gain = tempCtx.createGain();
              gain.gain.value = 0.0;
              osc.connect(gain);
              osc.start();
              const dest = tempCtx.createMediaStreamDestination();
              gain.connect(dest);
              this.stream = dest.stream;
              this.ownsStream = true;
          }
      }

      let moduleLoaded = false;
      try {
          // If we can create it, the module is already loaded
          new AudioWorkletNode(this.audioContext, 'wake-word-processor');
          moduleLoaded = true;
      } catch (e) {
          moduleLoaded = false;
      }

      if (!moduleLoaded) {
          const workletCode = `
            class WakeWordProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const channelData = input[0];
                  // Copy data to avoid mutation issues before sending
                  const data = new Float32Array(channelData);
                  this.port.postMessage(data, [data.buffer]);
                }
                return true;
              }
            }
            registerProcessor('wake-word-processor', WakeWordProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await this.audioContext.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
      }

      this.processor = new AudioWorkletNode(this.audioContext, 'wake-word-processor');
      this.processor.port.onmessage = (event) => {
          this.handleAudioWorklet(event.data);
      };

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.isListening = false;
    this.pendingRestart = false;
    this.onnxCycleId++; // discard any in-flight ONNX inference from this cycle

    // If something external force-stops us mid-capture (rather than letting our own silence/
    // max-wait timers finish naturally), still deliver whatever follow-up text was captured so
    // far instead of silently discarding it - this is the safety net for callers of stop().
    if (this.triggered && !this.commandFinalized) {
        this.finalizeCommand();
    }

    clearTimeout(this.silenceTimer);
    clearTimeout(this.commandMaxTimer);
    this.silenceTimer = null;
    this.commandMaxTimer = null;
    this.pendingCommandText = "";
    this.commandFinalized = false;
    this.wakeResultIndex = -1;
    this.wakeSegmentSuffix = "";
    this.triggered = false;

    if (this.recognition) {
        try {
            this.recognition.abort();
        } catch (e) {}
    }

    if (this.processor) {
        try {
            this.processor.disconnect();
            this.processor.port.onmessage = null;
        } catch (e) {}
        this.processor = null;
    }

    if (this.stream) {
        try {
            if (this.ownsStream) {
                this.stream.getTracks().forEach(t => t.stop());
            }
        } catch (e) {}
        this.stream = null;
    }

    if (this.audioContext) {
        try {
            this.audioContext.close();
        } catch (e) {}
        this.audioContext = null;
    }

    this.rollingBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.isBufferFull = false;

    this.sampleAccum = [];
    this.melFrames = [];
    this.embeddings = [];
    this.onnxProcessing = false;

    this.postTriggerBuffer = [];
    this.captureFinalized = false;
    this.finalizedInitialAudio = null;
  }

  private handleAudioWorklet(inputData: Float32Array) {
      if (this.isListening) {
          // Ambient listening (pre-trigger): RMS event dispatch + rolling pre-wake buffer + ONNX feed.
          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
              sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);

          // Dispatch sound detected event if threshold crossed (but try not to spam)
          if (rms > 0.05) { // Threshold may need tuning, 0.05 is relatively loud
              if (Date.now() - (window as any)._lastSoundDetectTime > 500 || !(window as any)._lastSoundDetectTime) {
                 (window as any)._lastSoundDetectTime = Date.now();
                 window.dispatchEvent(new CustomEvent('airo-sound-detected', { detail: { rms } }));
              }
          }

          for (let i = 0; i < inputData.length; i++) {
              this.rollingBuffer[this.writeIndex] = inputData[i];
              this.writeIndex++;
              if (this.writeIndex >= this.bufferSize) {
                  this.writeIndex = 0;
                  this.isBufferFull = true;
              }
          }

          if (this.onnxReady && !this.triggered) {
              this.feedOnnxPipeline(inputData);
          }
          return;
      }

      // Post-trigger (spin-up window): keep capturing raw audio until getExtendedInitialAudio()
      // is called (once the Live session is actually active) or stop() resets the cycle.
      if (this.triggered && !this.captureFinalized) {
          for (let i = 0; i < inputData.length; i++) {
              this.postTriggerBuffer.push(inputData[i]);
          }
          const maxSamples = this.TARGET_SAMPLE_RATE * this.MAX_POST_TRIGGER_SECONDS;
          if (this.postTriggerBuffer.length > maxSamples) {
              this.postTriggerBuffer.splice(0, this.postTriggerBuffer.length - maxSamples);
          }
      }
  }

  private feedOnnxPipeline(chunk: Float32Array) {
      // openWakeWord convention: samples scaled to int16 range as float32, NOT normalized -1..1.
      for (let i = 0; i < chunk.length; i++) {
          this.sampleAccum.push(chunk[i] * 32767);
      }

      while (this.sampleAccum.length >= MEL_CHUNK_SAMPLES && !this.onnxProcessing && this.isListening) {
          const frame = this.sampleAccum.splice(0, MEL_CHUNK_SAMPLES);
          this.onnxProcessing = true;
          const myCycleId = this.onnxCycleId;
          this.runMelAndClassify(frame, myCycleId).finally(() => {
              if (myCycleId === this.onnxCycleId) this.onnxProcessing = false;
          });
          // Only process one chunk per call to keep this synchronous-looking loop from racing
          // ahead of itself; feedOnnxPipeline gets called again on the next audio frame anyway.
          break;
      }
  }

  private async runMelAndClassify(samples: number[], cycleId: number) {
      if (!this.melSession || !this.embSession || !this.wakeSession) return;
      try {
          const inputTensor = new ort.Tensor('float32', Float32Array.from(samples), [1, MEL_CHUNK_SAMPLES]);
          const melResult = await this.melSession.run({ [MEL_INPUT_NAME]: inputTensor });
          if (cycleId !== this.onnxCycleId) return; // stale - a new cycle started while we awaited

          const melOut = melResult[MEL_OUTPUT_NAME];
          const melData = melOut.data as Float32Array;
          const dims = melOut.dims as number[];
          const numFrames = dims[dims.length - 2];
          const melBins = dims[dims.length - 1];

          for (let f = 0; f < numFrames; f++) {
              const melFrame: number[] = new Array(melBins);
              for (let b = 0; b < melBins; b++) {
                  melFrame[b] = melData[f * melBins + b] / 10.0 + 2.0;
              }
              this.melFrames.push(melFrame);
          }
          if (this.melFrames.length > this.MAX_MEL_FRAMES) {
              this.melFrames.splice(0, this.melFrames.length - this.MAX_MEL_FRAMES);
          }

          if (this.melFrames.length < EMB_WINDOW_FRAMES) return;

          const last76 = this.melFrames.slice(this.melFrames.length - EMB_WINDOW_FRAMES);
          const embInputData = new Float32Array(EMB_WINDOW_FRAMES * MEL_BINS);
          for (let f = 0; f < EMB_WINDOW_FRAMES; f++) {
              for (let b = 0; b < MEL_BINS; b++) {
                  embInputData[f * MEL_BINS + b] = last76[f][b];
              }
          }
          const embInputTensor = new ort.Tensor('float32', embInputData, [1, EMB_WINDOW_FRAMES, MEL_BINS, 1]);
          const embResult = await this.embSession.run({ [EMB_INPUT_NAME]: embInputTensor });
          if (cycleId !== this.onnxCycleId) return;

          const embedding = Array.from(embResult[EMB_OUTPUT_NAME].data as Float32Array);
          this.embeddings.push(embedding);
          if (this.embeddings.length > this.MAX_EMBEDDINGS) {
              this.embeddings.splice(0, this.embeddings.length - this.MAX_EMBEDDINGS);
          }

          if (this.embeddings.length < WAKE_WINDOW_EMBEDDINGS) return;

          const last16 = this.embeddings.slice(this.embeddings.length - WAKE_WINDOW_EMBEDDINGS);
          const wakeInputData = new Float32Array(WAKE_WINDOW_EMBEDDINGS * EMBEDDING_DIM);
          for (let e = 0; e < WAKE_WINDOW_EMBEDDINGS; e++) {
              for (let d = 0; d < EMBEDDING_DIM; d++) {
                  wakeInputData[e * EMBEDDING_DIM + d] = last16[e][d];
              }
          }
          const wakeInputTensor = new ort.Tensor('float32', wakeInputData, [1, WAKE_WINDOW_EMBEDDINGS, EMBEDDING_DIM]);
          const wakeResult = await this.wakeSession.run({ [WAKE_INPUT_NAME]: wakeInputTensor });
          if (cycleId !== this.onnxCycleId) return;

          const probability = (wakeResult[WAKE_OUTPUT_NAME].data as Float32Array)[0];

          if (probability > this.WAKE_THRESHOLD && !this.triggered) {
              console.log(`Wake Word Detected via local ONNX model (probability=${probability.toFixed(3)})`);
              this.triggerWake(undefined);
              this.startWebSpeechFollowUpCapture();
          }
      } catch (e) {
          console.error("WakeWord ONNX pipeline error:", e);
      }
  }

  detachStream(): MediaStream | null {
      const s = this.stream;
      this.ownsStream = false; // Relinquish ownership but don't clear it yet so stop() doesn't kill tracks
      return s;
  }

  // Snapshot of the rolling pre-wake buffer in correct chronological order, as of right now.
  private snapshotRollingBuffer(): Float32Array {
      if (this.isBufferFull) {
          const b = new Float32Array(this.bufferSize);
          b.set(this.rollingBuffer.subarray(this.writeIndex), 0);
          b.set(this.rollingBuffer.subarray(0, this.writeIndex), this.bufferSize - this.writeIndex);
          return b;
      }
      return new Float32Array(this.rollingBuffer.subarray(0, this.writeIndex));
  }

  // Stitches the pre-wake rolling buffer together with everything captured continuously since the
  // trigger (through mic acquisition, websocket handshake, and Gemini setup) into one continuous
  // burst. Call this once the Live session is actually active, right before sending initialAudio -
  // NOT at trigger time, since the whole point is to include audio spoken during the spin-up gap
  // that would otherwise be silently lost. Idempotent: repeated calls return the same snapshot.
  getExtendedInitialAudio(): Float32Array | null {
      if (this.finalizedInitialAudio) return this.finalizedInitialAudio;
      if (!this.triggered) return null;

      const preWake = this.snapshotRollingBuffer();
      const combined = new Float32Array(preWake.length + this.postTriggerBuffer.length);
      combined.set(preWake, 0);
      combined.set(Float32Array.from(this.postTriggerBuffer), preWake.length);

      this.finalizedInitialAudio = combined;
      this.captureFinalized = true;
      this.postTriggerBuffer = [];

      // The Live session has its own audio pipeline by now - stop this parallel capture.
      if (this.processor) {
          try { this.processor.disconnect(); this.processor.port.onmessage = null; } catch (e) {}
          this.processor = null;
      }
      // Do NOT close this.audioContext here, as recreating it later outside a user gesture will leave it permanently suspended.

      return combined;
  }

  private triggerWake(transcript?: string) {
      if (this.triggered) return;
      this.triggered = true;
      this.commandFinalized = false;
      this.isListening = false; // Stop ambient listening but don't destroy the stream yet so App can detach it

      // NOTE: recognition is intentionally NOT aborted here anymore - it keeps running briefly to
      // capture any follow-up command speech; finalizeCommand() aborts it once that settles.

      const orderedBuffer = this.snapshotRollingBuffer();

      this.onWake(orderedBuffer, transcript);
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
