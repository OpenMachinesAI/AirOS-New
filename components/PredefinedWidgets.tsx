import React, { useState, useEffect, useRef } from 'react';
import { Info, QrCode, RefreshCw, Settings, Check, X, Play, Pause, Trash2, Plus, Clock, Calendar, Calculator, Newspaper, ExternalLink, Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, CloudSun, Wind, Thermometer, Droplets, Music, Volume2, VolumeX, Tv, Camera, Sparkles, History, Layers, Cpu, ChevronLeft, ChevronRight, Download, Image as LucideImage, Battery, BatteryCharging, BatteryFull, Dices } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound, setSoundVolume } from '../utils/soundEffects';
import { captureCameraFrame, globalVideoElement, setGlobalVideoElement } from '../hooks/usePersonDetection';
import { getSharedCamera, releaseSharedCamera } from '../hooks/useSharedCamera';

export const BatteryWidget = ({ data }: { data: any }) => {
  const level = data?.level !== undefined ? data.level : 100;
  const isCharging = data?.isCharging !== undefined ? data.isCharging : true;
  const statusText = data?.statusText || "Fully Charged";

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden text-white" onClick={(e) => e.stopPropagation()}>
      <div className="p-8 pb-10 flex flex-col items-center justify-center relative z-10">
        <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="relative mb-6"
        >
            <div className={`w-32 h-32 rounded-full flex items-center justify-center ${isCharging ? 'bg-green-500/20 text-green-400' : level > 20 ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'} shadow-[0_0_50px_rgba(0,0,0,0.3)] inset-0 border border-white/10`} style={{ boxShadow: isCharging ? '0 0 40px rgba(74, 222, 128, 0.4)' : level > 20 ? '0 0 40px rgba(59, 130, 246, 0.4)' : '0 0 40px rgba(239, 68, 68, 0.4)'}}>
                {isCharging ? (
                    <BatteryCharging size={64} className="drop-shadow-lg" />
                ) : (
                    <BatteryFull size={64} className="drop-shadow-lg" />
                )}
            </div>
            {isCharging && (
                 <motion.div 
                     animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }}
                     transition={{ duration: 2, repeat: Infinity }}
                     className="absolute -top-2 -right-2 bg-green-400 w-6 h-6 rounded-full flex items-center justify-center shadow-[0_0_15px_#4ade80]"
                 >
                     <CloudLightning size={14} className="text-gray-900" />
                 </motion.div>
            )}
        </motion.div>
        
        <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-6xl font-bold font-mono tracking-tighter mb-2"
        >
            {level}%
        </motion.h2>
        
        <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`text-lg font-medium px-4 py-1.5 rounded-full ${isCharging ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-gray-300'}`}
        >
            {statusText}
        </motion.p>
      </div>
    </div>
  );
};

export const DiceWidget = ({ data }: { data: any }) => {
  const result = data?.result || 1;
  const [isRolling, setIsRolling] = useState(true);
  const [displayResult, setDisplayResult] = useState(1);
  
  useEffect(() => {
      let interval: any;
      if (isRolling) {
          playSound.bubblyPop();
          interval = setInterval(() => {
              setDisplayResult(Math.floor(Math.random() * 6) + 1);
          }, 100);
          
          setTimeout(() => {
              setIsRolling(false);
              setDisplayResult(result);
              playSound.bubblySuccess();
          }, 1500);
      }
      return () => clearInterval(interval);
  }, [result, isRolling]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden text-white" onClick={(e) => e.stopPropagation()}>
      <div className="p-8 pb-10 flex flex-col items-center justify-center relative z-10">
        <motion.div
            animate={isRolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }}
            transition={isRolling ? { duration: 0.3, repeat: Infinity, ease: "linear" } : { type: "spring", bounce: 0.6 }}
            className="relative mb-6"
        >
            <div className="w-40 h-40 rounded-3xl bg-white flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.4)] relative">
                 <h2 className="text-8xl font-bold font-mono text-gray-900 tracking-tighter">{displayResult}</h2>
            </div>
        </motion.div>
        
        <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`text-2xl font-bold font-mono tracking-tight mt-4 transition-opacity ${isRolling ? 'opacity-0' : 'opacity-100'}`}
        >
            Rolled a {result}!
        </motion.p>
      </div>
    </div>
  );
};

export const TimerWidget = ({ 
  data, 
  onControl 
}: { 
  data: any, 
  onControl?: (action: 'pause' | 'resume' | 'cancel' | 'add_time', id: string) => void 
}) => {
  const timers = data?.timers || (data?.remainingSeconds !== undefined ? [data] : []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-white/90">Active Timers</h2>
        <span className="text-xs font-mono text-white/40 uppercase tracking-widest bg-white/5 px-2.5 py-1 rounded-full">
          {timers.length} Active
        </span>
      </div>

      {timers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white/5 rounded-[32px] border border-white/10 p-6">
          <p className="text-lg text-white/60 mb-1">No active timers</p>
          <p className="text-xs text-white/40 max-w-[240px]">Ask Gemini "Set a tea timer for 3 minutes" to start one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {timers.map((timer: any) => {
            const progress = timer.durationSeconds > 0 
              ? (timer.remainingSeconds / timer.durationSeconds) * 100 
              : 0;

            const isFinished = timer.remainingSeconds <= 0;
            const isHighlighted = !!timer.highlighted;

            let cardStyles = "border-white/10 bg-white/5";
            if (isFinished) {
              cardStyles = "border-red-500/30 bg-red-950/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]";
            } else if (isHighlighted) {
              cardStyles = "border-cyan-400 bg-cyan-950/40 shadow-[0_0_25px_rgba(34,211,238,0.4)] ring-2 ring-cyan-400/20";
            }

            return (
              <motion.div 
                key={timer.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: isHighlighted ? 1.02 : 1 
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className={`relative overflow-hidden rounded-[28px] border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${cardStyles} transition-all duration-300`}
              >
                {/* Thin progress background bar */}
                {!isFinished && (
                  <div 
                    className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                )}

                <div className="flex flex-col gap-1 min-w-[150px]">
                  <span className={`text-base font-semibold tracking-wide ${isFinished ? 'text-red-400 animate-pulse' : 'text-white/80'}`}>
                    {timer.title || 'Timer'}
                  </span>
                  <span className="text-xs text-white/40 font-mono">
                    {isFinished ? 'Finished' : timer.running ? 'Running' : 'Paused'}
                  </span>
                </div>

                <div className="flex items-center gap-6 justify-between sm:justify-end flex-1">
                  <div className={`text-4xl font-extrabold font-mono tracking-tight ${isFinished ? 'text-red-500 animate-bounce' : 'text-white'}`}>
                    {formatTime(timer.remainingSeconds)}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isFinished && (
                      <>
                        <button 
                          onClick={() => { playSound.bubblyPop(); onControl?.('add_time', timer.id); }}
                          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all text-xs font-bold font-mono border border-white/5 cursor-pointer"
                          title="Add 1 minute"
                        >
                          +1m
                        </button>
                        <button 
                          onClick={() => { playSound.bubblyPop(); onControl?.(timer.running ? 'pause' : 'resume', timer.id); }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer border ${timer.running ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}
                        >
                          {timer.running ? <Pause size={18} /> : <Play size={18} />}
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => { playSound.bubblyPop(); onControl?.('cancel', timer.id); }}
                      className="w-10 h-10 rounded-full bg-red-500/10 text-red-100 hover:bg-red-500/20 border border-red-500/30 flex items-center justify-center active:scale-95 transition-all cursor-pointer text-red-400"
                      title="Delete timer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const SettingsWidget = ({ data }: { data: any }) => {
  const getIcon = (name: string) => {
    switch (name?.toLowerCase()) {
      case 'info': return <Info size={48} />;
      case 'qr': return <QrCode size={48} />;
      case 'sync': return <RefreshCw size={48} />;
      default: return <Settings size={48} />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black text-white p-8 min-h-[350px]">
      <h2 className="text-4xl font-bold mb-12 tracking-wide">{data.title || 'Settings'}</h2>
      <div className="flex flex-row gap-8 overflow-x-auto pb-8 px-4 max-w-full">
        {(data.options || []).map((opt: any) => (
          <div key={opt.id} className="flex flex-col items-center gap-4 shrink-0">
            <button 
              onClick={() => playSound.bubblyPop()}
              className="w-32 h-32 rounded-full bg-gradient-to-b from-gray-400 to-gray-700 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform"
            >
              <div className="text-white drop-shadow-lg">
                {getIcon(opt.icon)}
              </div>
            </button>
            <span className="text-lg font-medium">{opt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ConfirmationWidget = ({ data }: { data: any }) => {
  const handleConfirm = () => {
    playSound.bubblySuccess();
    window.dispatchEvent(new CustomEvent('airo-confirmation-action', { detail: 'Yes' }));
  };

  const handleCancel = () => {
    playSound.bubblyPop();
    window.dispatchEvent(new CustomEvent('airo-confirmation-action', { detail: 'No' }));
  };

  useEffect(() => {
    const handleVoiceTrigger = (e: any) => {
        const action = (e.detail || '').toLowerCase();
        if (action === 'yes') handleConfirm();
        if (action === 'no') handleCancel();
    };
    window.addEventListener('airo-voice-trigger', handleVoiceTrigger);
    return () => window.removeEventListener('airo-voice-trigger', handleVoiceTrigger);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-slate-950 text-white p-8 min-h-[400px]">
      <h2 className="text-3xl md:text-4xl font-bold text-orange-400 mb-8 text-center">{data.title || 'Confirm?'}</h2>
      
      <div className="flex flex-row items-center gap-12 w-full max-w-2xl px-4">
        <div className="flex flex-col items-center gap-4 shrink-0">
          <button 
            onClick={handleCancel}
            className="w-24 h-24 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex items-center justify-center shadow-[0_20px_50px_rgba(220,38,38,0.5)] hover:scale-110 active:scale-95 transition-all"
          >
            <X size={48} className="text-white drop-shadow-lg" />
          </button>
          <span className="text-lg font-bold tracking-widest uppercase">{data.cancelText || 'No'}</span>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center min-w-[200px]">
           {data.imageUrl ? (
               <img src={data.imageUrl} className="max-w-full max-h-[250px] rounded-[24px] border-4 border-slate-700 shadow-xl" alt="Preview" />
           ) : (
               <p className="text-2xl font-medium text-gray-200 text-center leading-relaxed">{data.subtitle || 'Are you sure?'}</p>
           )}
        </div>

        <div className="flex flex-col items-center gap-4 shrink-0">
          <button 
            onClick={handleConfirm}
            className="w-24 h-24 rounded-full bg-gradient-to-b from-green-400 to-green-600 flex items-center justify-center shadow-[0_20px_50px_rgba(22,163,74,0.5)] hover:scale-110 active:scale-95 transition-all animate-pulse"
          >
            <Check size={48} className="text-white drop-shadow-lg" />
          </button>
          <span className="text-lg font-bold tracking-widest uppercase">{data.confirmText || 'Yes'}</span>
        </div>
      </div>
    </div>
  );
};

export const MathWidget = ({ data, isAiSpeaking, highlightedIndex }: { data: any; isAiSpeaking?: boolean; highlightedIndex?: number }) => {
  const equation = data?.equation || data?.expression || "Math Problem";
  const result = data?.result || "";
  const steps = data?.steps || [];
  const explanation = data?.explanation || "";
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [steps]);

  useEffect(() => {
    if (typeof highlightedIndex === 'number' && highlightedIndex >= 0 && highlightedIndex < steps.length) {
      setActiveIndex(highlightedIndex);
    }
  }, [highlightedIndex, steps.length]);

  useEffect(() => {
    if (!isAiSpeaking) {
      return;
    }
    // If the model is not explicitly highlighting via tool, use fallback timer
    if (typeof highlightedIndex !== 'number') {
      const intervalTime = 4.5 * 1000;
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          if (prev < steps.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, intervalTime);
      return () => clearInterval(interval);
    }
  }, [isAiSpeaking, steps.length, highlightedIndex]);

  useEffect(() => {
    if (activeIndex >= 0) {
      playSound.bubblyPop();
      const element = document.getElementById(`math-step-${activeIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Calculator size={20} className="text-purple-400" />
          <h2 className="text-xl font-bold tracking-tight text-white/90">Mathematical Answer</h2>
        </div>
        <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 rounded-full">
          Solv-it Engine
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Problem & Answer Card */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Problem / Equation</span>
            <span className="text-lg font-mono text-white/95 tracking-tight">{equation}</span>
          </div>

          <div className="flex flex-col gap-1 border-t border-white/5 pt-4">
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">Result</span>
            <div className="text-4xl font-black font-mono tracking-tight text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              {result}
            </div>
          </div>
        </div>

        {/* Steps Display */}
        {steps.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[28px] border border-white/5 bg-white/5 p-6">
            <h3 className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">Step-by-Step Resolution</h3>
            <div className="flex flex-col gap-3">
              {steps.map((step: any, index: number) => {
                const isActive = index === activeIndex;
                return (
                  <div 
                    key={index} 
                    id={`math-step-${index}`}
                    onClick={() => setActiveIndex(index)}
                    className={`flex gap-4 p-4 rounded-xl border transition-all duration-500 cursor-pointer ${
                      isActive 
                        ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.2)] scale-[1.01] opacity-100' 
                        : 'border-transparent opacity-40 hover:opacity-85 scale-95'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all duration-500 ${
                      isActive 
                        ? 'bg-purple-500 text-white border-purple-400' 
                        : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                    }`}>
                      <span className="text-xs font-mono font-bold">{index + 1}</span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                      <p className={`text-sm leading-relaxed transition-all duration-300 ${isActive ? 'text-white font-semibold' : 'text-white/70'}`}>
                        {typeof step === 'string' ? step : (step.description || '') + ' ' + (step.subExpression ? '=> ' + step.subExpression : '')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Explanation */}
        {explanation && (
          <div className="rounded-[28px] border border-white/5 bg-white/5 p-6">
            <h3 className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">Explanation</h3>
            <p className="text-sm text-white/75 leading-relaxed">{explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const TimeWidget = ({ data, isAiSpeaking, highlightedIndex }: { data: any; isAiSpeaking?: boolean; highlightedIndex?: number }) => {
  let locations = data?.locations || data?.locationTimeList || data?.clocks || [];
  
  const [activeIndex, setActiveIndex] = useState(0);

  // Dynamic fallback to the user's browser local time
  const d = new Date();
  const fallbackTimeString = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let localTimezoneName = "Local Time";
  try {
      localTimezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch(e) {}
  
  if (locations.length === 0 && data?.localTime) {
      locations = [{ name: "Current Time", currentTime: data.localTime, timezone: localTimezoneName }];
  }

  let activeLoc = locations[activeIndex] || locations[0];
  const timeString = activeLoc?.currentTime || activeLoc?.time || data?.localTime || data?.timeString || fallbackTimeString;
  const timezone = activeLoc?.timezone || data?.timezone || localTimezoneName;
  const locName = activeLoc?.name || activeLoc?.location || activeLoc?.city || "Current Area";

  useEffect(() => {
    setActiveIndex(0);
  }, [locations]);

  useEffect(() => {
    if (typeof highlightedIndex === 'number' && highlightedIndex >= 0 && highlightedIndex < locations.length) {
      setActiveIndex(highlightedIndex);
    }
  }, [highlightedIndex, locations.length]);

  useEffect(() => {
    if (!isAiSpeaking || locations.length <= 1) {
      return;
    }
    // If the model is not explicitly highlighting via tool, use fallback timer
    if (typeof highlightedIndex !== 'number') {
      const intervalTime = 3.5 * 1000;
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          if (prev < locations.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, intervalTime);
      return () => clearInterval(interval);
    }
  }, [isAiSpeaking, locations.length, highlightedIndex]);

  useEffect(() => {
    if (activeIndex >= 0) {
      playSound.bubblyPop();
      const element = document.getElementById(`time-loc-${activeIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-cyan-400" />
          <h2 className="text-xl font-bold tracking-tight text-white/90">Current Time</h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-950/40 border border-cyan-500/20 px-2.5 py-1 rounded-full">
          {timezone}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Main Time Card */}
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-500/20 bg-cyan-950/10 p-8 flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(34,211,238,0.05)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="text-5xl md:text-6xl font-black font-sans tracking-tight text-white mb-2 drop-shadow-[0_0_20px_rgba(34,211,238,0.25)] select-all selection:bg-cyan-500 selection:text-black">
            {timeString}
          </div>
          <p className="text-xs text-cyan-400/70 font-mono tracking-widest uppercase">
            {locName} {timezone !== "Local Time" && timezone !== locName ? `(${timezone})` : ""}
          </p>
        </div>

        {/* World Times List */}
        {locations.length > 0 && (
          <div className="flex flex-col gap-3 rounded-[28px] border border-white/5 bg-white/5 p-6">
            <h3 className="text-xs text-white/40 uppercase tracking-wider font-mono mb-2">World Locations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {locations.map((loc: any, idx: number) => {
                const isActive = idx === activeIndex;
                const displayLocName = loc.name || loc.location || loc.city;
                const displayLocTime = loc.currentTime || loc.time;
                return (
                  <div 
                    key={idx} 
                    id={`time-loc-${idx}`}
                    onClick={() => setActiveIndex(idx)}
                    className={`flex justify-between items-center border p-4 rounded-2xl transition-all duration-500 cursor-pointer ${
                      isActive 
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)] scale-[1.01] opacity-100' 
                        : 'bg-white/5 border-transparent opacity-40 hover:opacity-85 scale-95'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white/80">{displayLocName}</span>
                      <span className="text-[10px] text-white/40 font-mono uppercase">{loc.timezone || loc.timeDiff || ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                        </span>
                      )}
                      <span className={`text-lg font-bold font-mono transition-colors duration-300 ${isActive ? 'text-cyan-400' : 'text-white'}`}>
                        {displayLocTime}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const DateWidget = ({ data }: { data: any }) => {
  const dateString = data?.dateString || "Tuesday, May 19, 2026";
  const dayOfWeek = data?.dayOfWeek || "Tuesday";
  const day = parseInt(data?.day || "19");
  const month = data?.month || "May";
  const year = data?.year || "2026";
  const weekNumber = data?.weekNumber || "";
  const zodiac = data?.zodiac || "";

  const daysInMonthList = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-orange-400" />
          <h2 className="text-xl font-bold tracking-tight text-white/90">Current Date</h2>
        </div>
        <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest bg-orange-950/40 border border-orange-500/20 px-2.5 py-1 rounded-full">
          Calendar Card
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Main Big Date display */}
        <div className="md:col-span-3 relative overflow-hidden rounded-[28px] border border-orange-500/20 bg-orange-950/10 p-6 flex flex-col justify-between gap-8 shadow-[0_0_30px_rgba(249,115,22,0.05)]">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-orange-400 font-mono tracking-widest uppercase">{dayOfWeek}</span>
            <div className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mt-1 leading-snug">
              {dateString}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-white/5 pt-4 text-xs font-mono text-white/50">
            {weekNumber && <div>WEEK <span className="text-orange-400 font-bold">{weekNumber}</span></div>}
            {zodiac && <div className="border-l border-white/10 pl-4">ZODIAC <span className="text-orange-400 font-bold">{zodiac}</span></div>}
            <div className="border-l border-white/10 pl-4">YEAR <span className="text-white font-bold">{year}</span></div>
          </div>
        </div>

        {/* Mini Calendar View card */}
        <div className="md:col-span-2 rounded-[28px] border border-white/5 bg-white/5 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold font-mono text-white/70 uppercase">{month} {year}</span>
            <span className="text-[9px] font-mono text-white/30">MINI VIEW</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-mono text-white/40 mb-1">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <span key={`empty-${idx}`} />
            ))}
            {daysInMonthList.slice(0, 28).map((d) => {
              const isCurrentDay = d === day;
              return (
                <div 
                  key={d} 
                  className={`
                    h-6 w-6 rounded-full flex items-center justify-center font-mono text-xs transition-all
                    ${isCurrentDay 
                      ? 'bg-orange-500 text-black font-extrabold shadow-[0_0_12px_rgba(249,115,22,0.4)] scale-110' 
                      : 'text-white/75 hover:bg-white/5 cursor-default'
                    }
                  `}
                >
                  {d}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const NewsWidget = ({ data, isAiSpeaking, highlightedIndex }: { data: any; isAiSpeaking?: boolean; highlightedIndex?: number }) => {
  const stories = data?.stories || data?.headlines || [];
  const queryTopic = data?.queryTopic || "Latest News";
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [stories]);

  useEffect(() => {
    if (typeof highlightedIndex === 'number' && highlightedIndex >= 0 && highlightedIndex < stories.length) {
      setActiveIndex(highlightedIndex);
    }
  }, [highlightedIndex, stories.length]);

  useEffect(() => {
    if (!isAiSpeaking) {
      return;
    }
    // If the model is not explicitly highlighting via tool, use fallback timer
    if (typeof highlightedIndex !== 'number') {
      const intervalTime = 7.0 * 1000;
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          if (prev < stories.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, intervalTime);
      return () => clearInterval(interval);
    }
  }, [isAiSpeaking, stories.length, highlightedIndex]);

  useEffect(() => {
    if (activeIndex >= 0) {
      playSound.bubblyPop();
      const element = document.getElementById(`news-story-${activeIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Newspaper size={20} className="text-blue-400" />
          <h2 className="text-xl font-bold tracking-tight text-white/90">News Feed</h2>
        </div>
        <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest bg-blue-950/40 border border-blue-500/20 px-2.5 py-1 rounded-full">
          {queryTopic}
        </span>
      </div>

      {stories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white/5 rounded-[32px] border border-white/10 p-6">
          <p className="text-lg text-white/60 mb-1">No news stories found</p>
          <p className="text-xs text-white/40">Try asking Gemini "Show me the latest stories about SpaceX"!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {stories.map((story: any, idx: number) => {
            const isActive = idx === activeIndex;
            return (
              <div 
                key={idx}
                id={`news-story-${idx}`}
                onClick={() => setActiveIndex(idx)}
                className={`relative overflow-hidden rounded-[28px] border p-6 flex flex-col gap-3 transition-all duration-500 cursor-pointer pointer-events-auto ${
                  isActive 
                    ? 'border-blue-500 bg-blue-950/20 shadow-[0_0_25px_rgba(59,130,246,0.25)] scale-[1.01] opacity-100 z-10' 
                    : 'border-white/10 bg-white/5 opacity-40 hover:opacity-85 scale-95'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-2">
                    {story.category && (
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest bg-blue-500/15 text-blue-400 border border-blue-500/25 px-2.5 py-0.5 rounded-full">
                        {story.category}
                      </span>
                    )}
                    {isActive && (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                    )}
                  </div>
                  {story.timeAgo && (
                    <span className="text-[10px] font-mono text-white/30 self-center">
                      {story.timeAgo}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <h3 className="text-base font-bold tracking-tight text-white/90 leading-snug">
                    {story.title}
                  </h3>
                  {story.summary && (
                    <p className="text-sm text-white/60 leading-relaxed font-sans">
                      {story.summary}
                    </p>
                  )}
                </div>

                {(story.source || story.url) && (
                  <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
                    <span className="text-xs font-mono font-medium text-white/40">
                      Source: {story.source || "News Outlet"}
                    </span>
                    {story.url && (
                      <a 
                        href={story.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer pointer-events-auto"
                      >
                        Read full <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const WeatherWidget = ({ data }: { data: any }) => {
  const locationName = data?.locationName || "Current Location";
  const currentTemp = data?.currentTemp !== undefined ? data.currentTemp : 72;
  const unit = data?.unit || "F";
  const condition = data?.condition || "Sunny";
  const weatherCode = data?.weatherCode !== undefined ? data.weatherCode : 0;
  const apparentTemp = data?.apparentTemp !== undefined ? data.apparentTemp : currentTemp;
  const humidity = data?.humidity !== undefined ? data.humidity : 50;
  const windSpeed = data?.windSpeed || "0 mph";
  const dailyForecast = data?.dailyForecast || [];

  const getWeatherIcon = (code: number, size = 24, className = "") => {
    // Mapping weather codes (WMO standard)
    if (code === 0) return <Sun size={size} className={`text-yellow-400 ${className}`} />;
    if (code >= 1 && code <= 2) return <CloudSun size={size} className={`text-gray-300 ${className}`} />;
    if (code === 3) return <Cloud size={size} className={`text-gray-400 ${className}`} />;
    if (code === 45 || code === 48) return <CloudFog size={size} className={`text-gray-500 ${className}`} />;
    if (code >= 51 && code <= 57) return <CloudDrizzle size={size} className={`text-blue-400 ${className}`} />;
    if (code >= 61 && code <= 67) return <CloudRain size={size} className={`text-blue-500 ${className}`} />;
    if (code >= 71 && code <= 77) return <CloudSnow size={size} className={`text-blue-200 ${className}`} />;
    if (code >= 80 && code <= 82) return <CloudRain size={size} className={`text-blue-600 ${className}`} />;
    if (code >= 85 && code <= 86) return <CloudSnow size={size} className={`text-blue-100 ${className}`} />;
    if (code >= 95 && code <= 99) return <CloudLightning size={size} className={`text-purple-400 ${className}`} />;
    
    // Fallback based on condition string if code is missing or unknown
    const condLower = condition.toLowerCase();
    if (condLower.includes("sun") || condLower.includes("clear")) return <Sun size={size} className={`text-yellow-400 ${className}`} />;
    if (condLower.includes("partly") || condLower.includes("mostly")) return <CloudSun size={size} className={`text-gray-300 ${className}`} />;
    if (condLower.includes("cloud") || condLower.includes("overcast")) return <Cloud size={size} className={`text-gray-400 ${className}`} />;
    if (condLower.includes("rain") || condLower.includes("shower") || condLower.includes("drizzle")) return <CloudRain size={size} className={`text-blue-500 ${className}`} />;
    if (condLower.includes("snow") || condLower.includes("ice") || condLower.includes("hail")) return <CloudSnow size={size} className={`text-blue-200 ${className}`} />;
    if (condLower.includes("thunder") || condLower.includes("storm")) return <CloudLightning size={size} className={`text-purple-400 ${className}`} />;
    if (condLower.includes("fog") || condLower.includes("mist") || condLower.includes("haze")) return <CloudFog size={size} className={`text-gray-500 ${className}`} />;
    
    return <Cloud size={size} className={`text-gray-400 ${className}`} />;
  };

  const getWeatherTheme = (code: number) => {
    if (code === 0) return "from-yellow-950/20 to-orange-950/20 border-yellow-500/20 shadow-[0_0_30px_rgba(234,179,8,0.05)]";
    if (code >= 51 && code <= 67) return "from-blue-950/25 to-sky-950/25 border-blue-500/25 shadow-[0_0_30px_rgba(59,130,246,0.05)]";
    if (code >= 71 && code <= 77) return "from-slate-900/30 to-blue-950/20 border-sky-400/20 shadow-[0_0_30px_rgba(56,189,248,0.05)]";
    if (code >= 95 && code <= 99) return "from-purple-950/20 to-slate-950/20 border-purple-500/25 shadow-[0_0_30px_rgba(168,85,247,0.05)]";
    return "from-gray-950/20 to-slate-950/20 border-white/5 shadow-[0_0_30px_rgba(255,255,255,0.02)]";
  };

  return (
    <div className="w-full h-full text-white p-4 md:p-6 overflow-hidden flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-2 md:pb-4 shrink-0">
        <div className="flex items-center gap-2">
          {getWeatherIcon(weatherCode, 20)}
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-white/95">Weather Forecast</h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest bg-cyan-950/40 border border-cyan-500/20 px-2.5 py-1 rounded-full">
          Meteo Link
        </span>
      </div>

      <div className="flex flex-col md:grid md:grid-cols-5 gap-4 flex-1 min-h-0">
        {/* Current Weather Card */}
        <div className={`md:col-span-3 relative overflow-hidden rounded-[24px] md:rounded-[28px] border bg-gradient-to-br ${getWeatherTheme(weatherCode)} p-4 md:p-6 flex flex-col justify-between flex-1`}>
          <div className="absolute top-4 right-4 animate-pulse">
            {getWeatherIcon(weatherCode, 72, "opacity-90 [filter:drop-shadow(0_0_15px_rgba(255,255,255,0.15))]")}
          </div>

          <div className="flex flex-col gap-1.5 z-10">
            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">{locationName}</span>
            <div className="text-5xl md:text-6xl font-black font-sans tracking-tighter text-white">
              {currentTemp}°{unit}
            </div>
            <span className="text-sm font-semibold text-white/80 mt-1">{condition}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 mt-6 text-xs font-mono text-white/50 z-10">
            <div className="flex items-center gap-1.5">
              <Thermometer size={14} className="text-white/40" />
              <div>FEELS <span className="text-white font-bold">{apparentTemp}°</span></div>
            </div>
            <div className="flex items-center gap-1.5 border-l border-white/5 pl-2">
              <Droplets size={14} className="text-white/40" />
              <div>HUMID <span className="text-white font-bold">{humidity}%</span></div>
            </div>
            <div className="flex items-center gap-1.5 border-l border-white/5 pl-2">
              <Wind size={14} className="text-white/40" />
              <div className="truncate">WIND <span className="text-white font-bold">{windSpeed}</span></div>
            </div>
          </div>
        </div>

        {/* Daily Forecast Cards */}
        <div className="md:col-span-2 rounded-[24px] md:rounded-[28px] border border-white/5 bg-white/5 p-4 md:p-5 flex flex-col gap-2 md:gap-3 flex-1 overflow-hidden min-h-[160px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 shrink-0">
            <span className="text-xs font-bold font-mono text-white/70 uppercase">Daily Outlook</span>
            <span className="text-[9px] font-mono text-white/30">Next Days</span>
          </div>

          {dailyForecast.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <span className="text-xs text-white/40">No forecast data provided</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 md:gap-2.5 overflow-y-auto no-scrollbar flex-1">
              {dailyForecast.map((fc: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-transparent hover:border-white/5 hover:bg-white/[0.04] transition-all">
                  <span className="text-[10px] md:text-xs font-bold text-white/70 w-10 md:w-12">{fc.day}</span>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    {getWeatherIcon(fc.weatherCode, 14, "md:w-4 md:h-4")}
                    <span className="text-[10px] md:text-xs text-white/50 text-left w-16 md:w-20 truncate">{fc.condition || "Clear"}</span>
                  </div>
                  <span className="text-[10px] md:text-xs font-mono font-semibold text-white/90">
                    {fc.maxTemp}° <span className="text-white/40 font-normal">/ {fc.minTemp}°</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const MusicPlayerWidget = ({ data }: { data: any }) => {
  const { videoId, title, thumbnail, embedUrl } = data || {};
  const [isPlaying, setIsPlaying] = useState(() => {
    if (data?.forcePlaybackState === 'pause') return false;
    return true;
  });
  const [volume, setVolume] = useState(() => {
    if (typeof data?.forceVolume === 'number') return data.forceVolume;
    return 80;
  });
  const [showVideo, setShowVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(240); // Standard simulated song duration (4:00)

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Autoplay start simulation of play state
    setIsPlaying(data?.forcePlaybackState === 'pause' ? false : true);
    setCurrentTime(0);
  }, [videoId]);

  // Command messenger for YouTube iframe API control
  const sendPlayerCommand = (func: string, args: any[] = []) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      } catch (err) {
        console.error("YouTube frame message failed:", err);
      }
    }
  };

  // Watch for external playback control forces
  useEffect(() => {
    if (data?.forcePlaybackState === 'pause' && isPlaying) {
      sendPlayerCommand('pauseVideo');
      setIsPlaying(false);
    } else if ((data?.forcePlaybackState === 'play' || data?.forcePlaybackState === 'resume') && !isPlaying) {
      sendPlayerCommand('playVideo');
      setIsPlaying(true);
    }
  }, [data?.forcePlaybackState]);

  // Watch for external volume control forces
  useEffect(() => {
    if (data && typeof data.forceVolume === 'number') {
      const vol = data.forceVolume;
      setVolume(vol);
      sendPlayerCommand('setVolume', [vol]);
    }
  }, [data?.forceVolume]);

  // Keep progress moving elegantly when playing
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            return 0; // seamless replay logic
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const handlePlayPause = () => {
    playSound.bubblyPop();
    if (isPlaying) {
      sendPlayerCommand('pauseVideo');
      setIsPlaying(false);
    } else {
      sendPlayerCommand('playVideo');
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    sendPlayerCommand('setVolume', [val]);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setCurrentTime(val);
    sendPlayerCommand('seekTo', [val, true]);
  };

  const toggleVideo = () => {
    playSound.bubblyPop();
    setShowVideo(!showVideo);
  };

  const formatSeconds = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="w-full text-white p-6 max-h-[75%] overflow-y-auto custom-scrollbar flex flex-col gap-6">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Music size={20} className="text-purple-450 animate-pulse" />
          <h2 className="text-xl font-bold tracking-tight text-white/95 text-ellipsis overflow-hidden">Music Player</h2>
        </div>
        <button
          onClick={toggleVideo}
          className={`text-[10px] sm:text-xs font-mono flex items-center gap-1.5 uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
            showVideo 
              ? 'bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
              : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
          }`}
        >
          <Tv size={14} />
          {showVideo ? 'Hide Video' : 'See Video'}
        </button>
      </div>

      {/* Main Panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-white/[0.02] border border-white/5 rounded-[32px] p-6 shadow-inner">
        
        {/* Left column: Visual CD Vinyl or Frame Embed */}
        <div className="md:col-span-5 flex justify-center items-center relative overflow-hidden">
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 max-w-full flex items-center justify-center">
            
            {/* Hidden/revealed YouTube iframe with proper play hooks */}
            <div 
              className={`absolute inset-0 transition-opacity duration-500 rounded-2xl overflow-hidden shadow-2xl bg-black ${
                showVideo ? 'opacity-100 z-20' : 'opacity-0 -z-10 pointer-events-none'
              }`}
            >
              <iframe
                ref={iframeRef}
                src={`${embedUrl || ''}&origin=${window.location.origin}`}
                className="w-full h-full border-none bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                title={title || "YouTube Audio stream"}
              />
            </div>

            {/* Simulated CD Vinyl with thumbnail cover art inside */}
            <div className="w-full h-full rounded-full bg-neutral-900 border-4 border-neutral-800 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex items-center justify-center relative select-none">
              
              {/* Grooves decoration */}
              <div className="absolute inset-2 border border-neutral-800/40 rounded-full" />
              <div className="absolute inset-6 border border-neutral-700/20 rounded-full" />
              <div className="absolute inset-10 border border-neutral-800/40 rounded-full" />
              
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={isPlaying ? { repeat: Infinity, duration: 12, ease: 'linear' } : { duration: 0.5 }}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-neutral-950 flex items-center justify-center relative shadow-md"
              >
                {thumbnail ? (
                  <img src={thumbnail} alt="album art" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-cyan-600 to-purple-800 flex items-center justify-center">
                    <Music size={28} className="text-white/80 animate-bounce" />
                  </div>
                )}
                {/* Center hole design */}
                <div className="absolute w-6 h-6 rounded-full bg-neutral-900 border-2 border-neutral-950 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                </div>
              </motion.div>
            </div>
            
            {/* Ambient pulsed glow in the back of CD */}
            <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/10 to-purple-500/10 -z-10 filter blur-xl ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        {/* Right column: Details, waveform and player control buttons */}
        <div className="md:col-span-7 flex flex-col gap-6 w-full">
          <div>
            <span className="text-xs font-mono tracking-widest text-purple-400 font-bold uppercase bg-purple-950/45 px-2.5 py-1 rounded-full border border-purple-500/12 inline-block">
              NOW PLAYING
            </span>
            <h3 className="text-xl md:text-2xl font-extrabold tracking-tight text-white mt-2 leading-snug line-clamp-2">
              {title || 'Loading audio query...'}
            </h3>
            <p className="text-xs font-mono text-white/40 mt-1 uppercase tracking-wide">YouTube Stream Link</p>
          </div>

          {/* Custom micro wave visualizer */}
          <div className="flex items-center gap-3.5 bg-white/[0.01] border border-white/5 rounded-2xl py-3 px-4 w-fit">
            <span className="text-xs font-mono text-white/50 tracking-wider">LIVE COMPONENT</span>
            <div className="flex items-end gap-1.5 h-6">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-gradient-to-t from-cyan-400 to-purple-500 rounded-full"
                  animate={isPlaying ? {
                    height: [6, Math.random() * 18 + 6, 6]
                  } : { height: 6 }}
                  transition={{
                    duration: 0.6 + i * 0.1,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Time slider details */}
          <div className="flex flex-col gap-1.5 w-full">
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={handleSeekChange}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-colors"
            />
            <div className="flex items-center justify-between font-mono text-[10px] text-white/40 font-bold">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Media Interactive Controls bar */}
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-between border-t border-white/5 pt-5 mt-2">
            
            {/* Play/Pause Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayPause}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-90 hover:scale-105 cursor-pointer shadow-lg ${
                  isPlaying 
                    ? 'bg-gradient-to-b from-purple-500 to-purple-700 text-white shadow-purple-650/20' 
                    : 'bg-white text-black shadow-white/10'
                }`}
              >
                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <div className="text-xs text-white/50 font-medium">
                {isPlaying ? 'Playing track...' : 'Track paused'}
              </div>
            </div>

            {/* Custom volume input */}
            <div className="flex items-center gap-2.5 bg-white/5 hover:bg-white/10 transition-colors py-2 px-4 rounded-2xl border border-white/5">
              <Volume2 size={16} className="text-white/60" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 hover:w-24 transition-all h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                title="Volume control"
              />
              <span className="text-[10px] font-mono text-white/40 w-6 text-right font-bold">{volume}%</span>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

export const AiroImageWidget = ({ data, onSaveToLibrary, onGenerationComplete }: { data: any, onSaveToLibrary?: (item: any) => void, onGenerationComplete?: (prompt: string) => void }) => {
  const [history, setHistory] = useState<Array<{ url: string; prompt: string; timestamp: number }>>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingText, setLoadingText] = useState<string>("Peeling pixels...");
  const [error, setError] = useState<string | null>(null);

  const loadingTexts = [
    "Painting pixels...",
    "Growing visual molecules...",
    "Synthesizing image...",
    "Polishing textures...",
    "Rendering custom photons...",
    "Finalizing image..."
  ];

  useEffect(() => {
    if (!data?.prompt) return;

    // Check if we already have this generation running to prevent duplicates
    const newPrompt = data.prompt;
    const isNew = !history.some(
      h => h.prompt === newPrompt && Math.abs(h.timestamp - data.timestamp) < 500
    );

    if (isNew) {
      generateImage(newPrompt);
    }
  }, [data?.prompt, data?.timestamp]);

  // Rotate loading text
  useEffect(() => {
    if (!isGenerating) return;
    let textIdx = 0;
    const interval = setInterval(() => {
      textIdx = (textIdx + 1) % loadingTexts.length;
      setLoadingText(loadingTexts[textIdx]);
    }, 1800);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const generateImage = async (promptText: string) => {
    setIsGenerating(true);
    setLoadingProgress(0);
    setLoadingText("Painting pixels...");
    setError(null);

    // Start progress counter
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 96) {
          clearInterval(progressInterval);
          return 96;
        }
        return prev + Math.floor(Math.random() * 6) + 3;
      });
    }, 120);

    try {
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        promptText
      )}?width=1024&height=1024&nologo=true&seed=${seed}`;

      // Preload image
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load generated image"));
      });

      clearInterval(progressInterval);
      setLoadingProgress(100);

      setTimeout(() => {
        setHistory(prev => {
          const newHistory = [...prev, { url: imageUrl, prompt: promptText, timestamp: Date.now() }];
          setCurrentIndex(newHistory.length - 1);
          return newHistory;
        });
        setIsGenerating(false);
        if (onGenerationComplete) onGenerationComplete(promptText);
      }, 200);

    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(err);
      setError("AirowImages encountered an error! Tap anywhere or try again.");
      setIsGenerating(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      playSound.bubblyPop();
    }
  };

  const handleNext = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(prev => prev + 1);
      playSound.bubblyPop();
    }
  };

  const handleDownload = () => {
    if (currentIndex >= 0 && currentIndex < history.length) {
      const current = history[currentIndex];
      window.open(current.url, '_blank');
      playSound.bubblyPop();
    }
  };

  const currentItem = history[currentIndex];

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-slate-950 text-white p-4 sm:p-6 min-h-[380px] font-sans">
      {/* Top bar with stats */}
      <div className="w-full flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-400">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white/95">AirowImages AI</h3>
            <p className="text-[10px] font-mono text-blue-400/80 uppercase tracking-widest">Cohesive Generative Lab</p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1 rounded-full text-xs font-mono text-white/60">
            <History size={12} className="text-blue-400" />
            <span>{currentIndex + 1} / {history.length}</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col md:flex-row items-center justify-center gap-6 max-h-[400px]">
        {/* Canvas Display */}
        <div className="relative aspect-square w-full max-w-[280px] sm:max-w-[320px] bg-slate-900/50 border border-white/10 rounded-[32px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* History cross-fade */}
          {history.map((item, index) => (
            <motion.div
              key={item.url}
              initial={{ opacity: 0 }}
              animate={{ opacity: index === currentIndex ? 1 : 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute inset-0"
              style={{ zIndex: index === currentIndex ? 10 : 1 }}
            >
              <img
                src={item.url}
                alt={item.prompt}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ))}

          {/* Initial State / empty history */}
          {history.length === 0 && !isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white/40 gap-3">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-blue-400/60 animate-bounce">
                <LucideImage size={28} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/80">Awaiting prompt...</p>
                <p className="text-[11px] max-w-[180px] mx-auto mt-1">Ask "Airow, generate an image of a cybernetic monkey!"</p>
              </div>
            </div>
          )}

          {/* Blur transition backdrop when generating (previous image stays visible but blurred underneath!) */}
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-slate-950/70 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center"
            >
              {/* Circular spinning outline */}
              <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-white/10"
                    fill="transparent"
                  />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    fill="transparent"
                    strokeDasharray="213"
                    animate={{ strokeDashoffset: 213 - (213 * loadingProgress) / 100 }}
                    transition={{ ease: "easeInOut" }}
                  />
                </svg>
                {/* Center icon */}
                <span className="absolute text-2xl animate-pulse text-blue-400">
                  <LucideImage size={24} />
                </span>
              </div>

              {/* Loader stats */}
              <h4 className="text-sm font-bold text-white tracking-wide animate-pulse">{loadingText}</h4>
              <p className="text-[10px] font-mono text-blue-400/80 mt-1.5 bg-blue-400/10 px-2.5 py-0.5 rounded-full border border-blue-400/20">{loadingProgress}% COMPLETE</p>
            </motion.div>
          )}

          {/* Error fallback overlay */}
          {error && (
            <div className="absolute inset-0 z-30 bg-red-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <span className="text-3xl mb-2">⚠️</span>
              <p className="text-xs font-semibold text-red-200">{error}</p>
              <button 
                onClick={() => generateImage(data?.prompt || "A golden digital banana")}
                className="mt-3 text-[10px] font-bold uppercase tracking-widest bg-white/10 hover:bg-white/25 px-3 py-1.5 rounded-lg border border-white/10 transition-all"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Text Prompt & Controls Column */}
        <div className="flex-1 flex flex-col justify-center max-w-[280px] sm:max-w-[320px] text-center md:text-left gap-3">
          {currentItem ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-blue-400/90 text-xs font-mono font-bold tracking-wider uppercase justify-center md:justify-start">
                <Layers size={12} />
                <span>ACTIVE SPECIFICATION</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed bg-white/5 border border-white/5 px-3.5 py-2.5 rounded-2xl max-h-[85px] overflow-y-auto text-left custom-scrollbar">
                "{currentItem.prompt}"
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-white/40 text-xs font-mono font-bold tracking-wider uppercase justify-center md:justify-start">
                <Cpu size={12} />
                <span>STANDBY MODE</span>
              </div>
              <p className="text-xs text-white/40 leading-relaxed bg-white/5 border border-white/5 px-3.5 py-2.5 rounded-2xl text-left">
                No specifications active yet. Say "Hey Arrow, generate an image of a golden robot monkey eating a holographic banana!"
              </p>
            </div>
          )}

          {/* Nav & Utility Controls */}
          {history.length > 0 && (
            <div className="flex items-center justify-between gap-3 mt-1.5">
              <div className="flex gap-2">
                <button
                  disabled={currentIndex <= 0}
                  onClick={handlePrev}
                  className={`p-2.5 rounded-xl border transition-all ${
                    currentIndex <= 0 
                      ? 'border-white/5 text-white/20 bg-transparent' 
                      : 'border-white/10 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95'
                  }`}
                  title="Previous iteration"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={currentIndex >= history.length - 1}
                  onClick={handleNext}
                  className={`p-2.5 rounded-xl border transition-all ${
                    currentIndex >= history.length - 1 
                      ? 'border-white/5 text-white/20 bg-transparent' 
                      : 'border-white/10 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 active:scale-95'
                  }`}
                  title="Next iteration"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                onClick={() => {
                  if (onSaveToLibrary && currentItem) {
                    onSaveToLibrary({ url: currentItem.url, prompt: currentItem.prompt, timestamp: currentItem.timestamp, type: 'generated' });
                    playSound.bubblySuccess();
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold transition-all shadow-[0_4px_12px_rgba(234,179,8,0.2)] active:scale-95"
              >
                <Download size={14} strokeWidth={2.5} />
                <span>SAVE TO LIBRARY</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const VolumeWidget = ({ data }: { data: { volume: number } }) => {
  const [vol, setVol] = useState(data.volume);

  useEffect(() => {
    setVol(data.volume);
  }, [data.volume]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVol(val);
    setSoundVolume(val / 10);
  };

  return (
    <div className="w-full text-white p-6 max-h-[75%] flex flex-col gap-8 items-center justify-center h-full">
      <div className="flex items-center gap-4 text-blue-400">
        {vol === 0 ? <VolumeX size={48} /> : <Volume2 size={48} />}
        <span className="text-5xl font-black">{vol}</span>
      </div>
      
      <div className="w-full max-w-sm px-4">
        <input 
          type="range" 
          min="0" max="10" step="1" 
          value={vol} 
          onChange={handleChange}
          className="w-full h-4 bg-white/20 rounded-full appearance-none outline-none focus:outline-none focus:ring-4 focus:ring-blue-500/50 cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${(vol/10)*100}%, rgba(255,255,255,0.2) ${(vol/10)*100}%)`
          }}
        />
        <div className="flex justify-between w-full text-xs font-bold text-white/40 mt-3 px-1">
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </div>
      </div>
      
      <p className="text-sm font-bold text-white/50 tracking-widest uppercase">System Volume</p>
    </div>
  );
};

export const PhotoPreviewWidget = ({ onSaveToLibrary }: { onSaveToLibrary?: (item: any) => void }) => {
  const [countdown, setCountdown] = useState<number | null>(3);
  const [flash, setFlash] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    let isActive = true;
    getSharedCamera().then(({ video }) => {
        if (isActive) {
            setGlobalVideoElement(video);
            setVideoEl(video);
        }
    }).catch(err => {
        console.error("Camera error in PhotoPreviewWidget:", err);
    });

    return () => {
        isActive = false;
        releaseSharedCamera();
    };
  }, []);

  useEffect(() => {
    let animationId: number;
    const canvas = document.getElementById('camera-preview-canvas') as HTMLCanvasElement;
    if (canvas && !photoData) {
        const ctx = canvas.getContext('2d');
        const drawFrame = () => {
          if (videoEl && ctx && canvas) {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } else if (globalVideoElement && ctx && canvas) {
            ctx.drawImage(globalVideoElement, 0, 0, canvas.width, canvas.height);
          }
          animationId = requestAnimationFrame(drawFrame);
        };
        drawFrame();
    }
    return () => cancelAnimationFrame(animationId);
  }, [photoData, videoEl]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      playSound.bubblyPop();
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setFlash(true);
      playSound.bubblySuccess();
      captureCameraFrame().then(dataUrl => {
        if (dataUrl) {
           setPhotoData(dataUrl);
           setTimeout(() => setFlash(false), 200);
           window.dispatchEvent(new CustomEvent('airo-photo-ready'));
        }
      });
      setCountdown(null);
    }
  }, [countdown]);

  const handleKeep = () => {
      playSound.bubblySuccess();
      if (onSaveToLibrary && photoData) {
          onSaveToLibrary({ url: photoData, timestamp: Date.now(), type: 'photo' });
      }
      window.dispatchEvent(new CustomEvent('airo-photo-action', { detail: 'Keep' }));
  };

  const handleDiscard = () => {
      playSound.bubblyPop();
      window.dispatchEvent(new CustomEvent('airo-photo-action', { detail: 'Discard' }));
  };

  useEffect(() => {
    const handleVoiceTrigger = (e: any) => {
        if (!photoData) return;
        const action = (e.detail || '').toLowerCase();
        if (action === 'yes' || action === 'keep') handleKeep();
        if (action === 'no' || action === 'discard') handleDiscard();
    };
    window.addEventListener('airo-voice-trigger', handleVoiceTrigger);
    return () => window.removeEventListener('airo-voice-trigger', handleVoiceTrigger);
  }, [photoData, onSaveToLibrary]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-slate-950/80 backdrop-blur-3xl overflow-hidden p-6 sm:p-12 relative min-h-[380px]">
      <motion.div 
         layout
         className={`relative bg-black rounded-[32px] overflow-hidden border-4 border-slate-800 shadow-2xl transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${photoData ? 'aspect-video w-[60%] shrink-0' : 'w-full h-full'}`}
      >
         {!photoData ? (
           <>
             <canvas id="camera-preview-canvas" width={1920} height={1080} className="w-full h-full object-cover scale-x-[-1]" />
             {countdown !== null && countdown > 0 && (
               <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                 <motion.span 
                   key={countdown}
                   initial={{ scale: 2, opacity: 0 }}
                   animate={{ scale: 1, opacity: 1 }}
                   exit={{ scale: 0.5, opacity: 0 }}
                   className="text-9xl font-black text-white drop-shadow-[0_0_40px_rgba(255,255,255,1)] tracking-tighter"
                 >
                   {countdown}
                 </motion.span>
               </div>
             )}
             {flash && <div className="absolute inset-0 bg-white z-50"></div>}
           </>
         ) : (
           <img src={photoData} className="w-full h-full object-cover scale-x-[-1]" />
         )}
      </motion.div>
      
      <AnimatePresence>
          {photoData && (
              <motion.div 
                 initial={{ opacity: 0, y: 50, scale: 0.9 }}
                 animate={{ opacity: 1, y: 0, scale: 1 }}
                 transition={{ delay: 0.5, type: 'spring' }}
                 className="absolute bottom-12 left-0 right-0 flex justify-center gap-16 px-8"
              >
                  <div className="flex flex-col items-center gap-4 shrink-0">
                    <button 
                        onClick={handleDiscard}
                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-b from-red-400 to-red-600 flex items-center justify-center shadow-[0_20px_50px_rgba(220,38,38,0.5)] hover:scale-110 active:scale-95 transition-all"
                    >
                        <X size={64} className="text-white drop-shadow-lg" />
                    </button>
                    <span className="text-xl font-bold text-white tracking-widest drop-shadow-md uppercase">Discard</span>
                  </div>
                  
                  <div className="flex flex-col items-center gap-4 shrink-0">
                    <button 
                        onClick={handleKeep}
                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-b from-green-400 to-green-600 flex items-center justify-center shadow-[0_20px_50px_rgba(22,163,74,0.5)] hover:scale-110 active:scale-95 transition-all animate-pulse"
                    >
                        <Check size={64} className="text-white drop-shadow-lg" />
                    </button>
                    <span className="text-xl font-bold text-white tracking-widest drop-shadow-md uppercase">Keep</span>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};

export const FaceOnboardingWidget = ({ data, onComplete }: { data: any, onComplete: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const name = data?.name || 'Friend';
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
      getSharedCamera().then(res => {
          if (videoRef.current && res.stream) {
              videoRef.current.srcObject = res.stream;
              videoRef.current.play().catch(e => console.warn("Video play failed:", e));
          }
      }).catch(console.error);
  }, []);

  const handleCapture = () => {
      if (captured) return;
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
                  console.log("Saved new family member:", name);
              } catch (e) {
                  console.error("Failed to save family member", e);
              }
              
              playSound.bubblySuccess();
              setCaptured(true);
              setTimeout(() => {
                  onComplete();
              }, 1500);
          }
      }
  };

  return (
      <div 
          className="w-full h-full min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden bg-black text-white cursor-pointer rounded-3xl"
          onClick={(e) => { e.stopPropagation(); handleCapture(); }}
      >
          <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-10 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-black/40">
              <div className="w-64 h-64 border-4 border-dashed border-rose-500/50 rounded-full mb-8 animate-[spin_10s_linear_infinite] flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-solid border-rose-400/30 rounded-full animate-pulse" />
              </div>
              <h2 className="text-4xl font-bold mb-4 tracking-tight drop-shadow-lg">Line up your face!</h2>
              <p className="text-rose-200/80 text-xl font-medium px-6 py-3 bg-black/40 rounded-full backdrop-blur-md">
                  Tap anywhere to save as <span className="text-white font-bold">{name}</span>
              </p>
          </div>
          
          <AnimatePresence>
              {captured && (
                  <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-50 bg-rose-600 flex flex-col items-center justify-center"
                  >
                      <Check className="w-32 h-32 text-white mb-6 animate-bounce" />
                      <h2 className="text-5xl font-bold text-white tracking-tight drop-shadow-xl">Got it!</h2>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
  );
};
