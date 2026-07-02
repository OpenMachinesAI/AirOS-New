// Procedural Bubbly Sound Synth using Web Audio API
// High-quality, safe, lightweight, and cute sound effects with no asset loading required!

let audioCtx: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let currentVolume = typeof window !== 'undefined' && localStorage.getItem('app-volume') ? parseFloat(localStorage.getItem('app-volume')!) : 1.0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = currentVolume;
      masterGainNode.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const getCurrentVolume = () => currentVolume;

export const setSoundVolume = (vol: number) => {
  currentVolume = vol;
  if (typeof window !== 'undefined') localStorage.setItem('app-volume', vol.toString());
  if (masterGainNode) {
    masterGainNode.gain.value = vol;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-volume-change', { detail: vol }));
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('app-volume-change', (e: any) => {
    currentVolume = e.detail;
    if (masterGainNode) masterGainNode.gain.value = e.detail;
  });
}

export const playSound = {
  // 1. Ascending bubbly start chime (mBot system initialization)
  bubblyStart: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Series of 4 quick rising bubble notes
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.08;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Bubbly tone is mostly sine, with a touch of triangle for warmth
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      // Quick pitch bubble modulation
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.15);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      
      osc.connect(gain);
      gain.connect(masterGainNode!);
      
      osc.start(time);
      osc.stop(time + 0.22);
    });
  },

  // 2. Cute single bubble pop (when items transition, highlight changes, or button clicks)
  bubblyPop: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    // Classic bubble freq sweep: low to very high instantly, then pop
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    
    osc.connect(gain);
    gain.connect(masterGainNode!);
    
    osc.start(now);
    osc.stop(now + 0.1);
  },

  // 3. Dual bouncy bubble popping up (when widget displays or slides up)
  bubblyWidgetOpen: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Two pops working together
    const pop = (time: number, startFreq: number, endFreq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      
      osc.connect(gain);
      gain.connect(masterGainNode!);
      
      osc.start(time);
      osc.stop(time + 0.14);
    };
    
    pop(now, 300, 900);
    pop(now + 0.07, 450, 1350);
  },

  // 4. Descending bubbly pop (when widget closes)
  bubblyWidgetClose: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    
    osc.connect(gain);
    gain.connect(masterGainNode!);
    
    osc.start(now);
    osc.stop(now + 0.17);
  },

  // 5. Successful happy bubble alignment (timer completes or alarm rings)
  bubblySuccess: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Upward pentatonic scale of bubbles
    const freqs = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; // C5 to C6 pentatonic
    freqs.forEach((freq, idx) => {
      const time = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.3, time + 0.12);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.1, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      
      osc.connect(gain);
      gain.connect(masterGainNode!);
      
      osc.start(time);
      osc.stop(time + 0.25);
    });
  },

  // 6. Calm warn / system busy low-pitched sound (connection errors/reconnecting states)
  bubblyError: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Double low tone bubble drop
    const drop = (time: number, startFreq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, time + 0.25);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      
      osc.connect(gain);
      gain.connect(masterGainNode!);
      
      osc.start(time);
      osc.stop(time + 0.32);
    };
    
    drop(now, 180);
    drop(now + 0.12, 140);
  },

  // 7. Whisper pop (AI listening state start)
  bubblyWhisper: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    osc.connect(gain);
    gain.connect(masterGainNode!);
    
    osc.start(now);
    osc.stop(now + 0.07);
  },

  airCardListen: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const pop = (time: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      
      osc.connect(gain);
      gain.connect(masterGainNode!);
      
      osc.start(time);
      osc.stop(time + 0.35);
    };
    
    pop(now, 440);
    pop(now + 0.15, 554.37);
  },

  // 8. Fun up-beat chiptune dance music for Airo
  bubblyDanceMusic: (durationSecs: number = 5) => {
    const ctx = getAudioContext();
    if (!ctx) return () => {};
    const now = ctx.currentTime;
    
    const oscillators: OscillatorNode[] = [];
    const tempo = 120;
    const beatLen = 60 / tempo; // 0.5s per beat
    const notePattern = [
       { notes: [261.63], dur: 0.5 }, // C4
       { notes: [329.63], dur: 0.5 }, // E4
       { notes: [392.00], dur: 1.0 }, // G4
       { notes: [349.23], dur: 0.5 }, // F4
       { notes: [329.63], dur: 0.5 }, // E4
       { notes: [293.66], dur: 1.0 }, // D4
       { notes: [261.63, 392.00], dur: 0.25 }, // Chord
       { notes: [261.63, 392.00], dur: 0.25 },
       { notes: [261.63, 440.00], dur: 0.5 },
    ];
    
    // Calculate total duration roughly
    const repeatTimes = Math.ceil(durationSecs / 3.0); 
    
    for (let r = 0; r < repeatTimes; r++) {
         let timeAcc = now + (r * 3.0);
         for (const step of notePattern) {
             const dur = step.dur * beatLen;
             if (timeAcc + dur > now + durationSecs) break; // Don't overshoot too much
             step.notes.forEach(f => {
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  
                  osc.type = 'square';
                  osc.frequency.value = f;
                  
                  gain.gain.setValueAtTime(0, timeAcc);
                  gain.gain.linearRampToValueAtTime(0.06, timeAcc + 0.05);
                  gain.gain.setValueAtTime(0.06, timeAcc + dur - 0.05);
                  gain.gain.linearRampToValueAtTime(0, timeAcc + dur);
                  
                  osc.connect(gain);
                  gain.connect(masterGainNode!);
                  
                  osc.start(timeAcc);
                  osc.stop(timeAcc + dur);
                  oscillators.push(osc);
             });
             timeAcc += dur;
         }
    }
    
    return () => {
         // Stop function if needed early
         oscillators.forEach(osc => {
             try { osc.stop(); } catch(e) {}
         });
    };
  }
};
