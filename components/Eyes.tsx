
import React, { useEffect, useState } from 'react';
import { EyeState } from '../types';

export const Eyes = ({ state }: { state: EyeState }) => {
  const [blink, setBlink] = useState(false);
  const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Blink loop
    const blinkInterval = setInterval(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 200);
    }, 3000 + Math.random() * 4000);

    // Look around loop
    const lookInterval = setInterval(() => {
        if (state === EyeState.IDLE || state === EyeState.LISTENING) {
            const x = (Math.random() - 0.5) * 80; 
            const y = (Math.random() - 0.5) * 40; 
            setLookOffset({ x, y });
        } else if (state === EyeState.SPEAKING || state === EyeState.THINKING) {
             setLookOffset({ x: 0, y: 0 });
        }
    }, 2000 + Math.random() * 3000);

    return () => {
        clearInterval(blinkInterval);
        clearInterval(lookInterval);
    }
  }, [state]);

  const getEyeColorClass = () => {
      if (state === EyeState.LISTENING) return 'rainbow-bg border-none';
      if (state === EyeState.SPEAKING) return 'bg-blue-500 shadow-[0_0_60px_#3b82f6] border-none';
      if (state === EyeState.THINKING) return 'bg-yellow-400 shadow-[0_0_60px_#facc15] border-none';
      return 'bg-white shadow-[0_0_30px_#fff]';
  };

  const getScale = () => {
      if (state === EyeState.LISTENING) return 1.4;
      if (state === EyeState.SPEAKING) return 1.2;
      if (state === EyeState.THINKING) return 1.1;
      return 1;
  }

  const eyeStyle = {
      transform: `translate(${lookOffset.x}px, ${lookOffset.y}px) scaleY(${blink ? 0.05 : 1}) scale(${getScale()})`,
      transition: 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 0.5s ease',
  };

  return (
    <div className="flex gap-20 justify-center items-center h-screen w-screen bg-black overflow-hidden relative">
        <div className="absolute top-8 text-white font-mono text-xs select-none opacity-10 tracking-[0.5em] uppercase">
            {state === EyeState.IDLE && "System Idle"}
            {state === EyeState.LISTENING && "Receiving Input"}
            {state === EyeState.THINKING && "Processing"}
            {state === EyeState.SPEAKING && "Generating Output"}
        </div>
      <div className={`w-48 h-48 rounded-full ${getEyeColorClass()}`} style={eyeStyle}></div>
      <div className={`w-48 h-48 rounded-full ${getEyeColorClass()}`} style={eyeStyle}></div>
    </div>
  );
};
