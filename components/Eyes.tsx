
import React, { useEffect, useState } from 'react';
import { EyeState } from '../types';
import { QrCode } from 'lucide-react';

export const Eyes = ({ state, isQrMode = false, personPositionXRef, isPersonPresentRef }: { state: EyeState, isQrMode?: boolean, personPositionXRef?: React.MutableRefObject<number>, isPersonPresentRef?: React.MutableRefObject<boolean> }) => {
    const [blink, setBlink] = useState(false);
    const [lookOffset, setLookOffset] = useState({ x: 0, y: 0 });
    const [tilt, setTilt] = useState(0);
    const [recognizedNames, setRecognizedNames] = useState<string[]>([]);
    const [showRecognition, setShowRecognition] = useState(false);

    const updateEyePosition = (targetX: number, targetY: number) => {
        let x = targetX;
        let y = targetY;
        let newTilt = 0;
        
        const MAX_X = 120; // Maximum pixels eyes can move left/right before tilting
        
        if (x > MAX_X) {
            newTilt = (x - MAX_X) * 0.15; // Calculate tilt based on excess
            x = MAX_X;
        } else if (x < -MAX_X) {
            newTilt = (x + MAX_X) * 0.15;
            x = -MAX_X;
        }
        
        // Clamp tilt to a reasonable degree
        newTilt = Math.max(-45, Math.min(45, newTilt));
        
        setLookOffset({ x, y });
        setTilt(newTilt);
    };

    useEffect(() => {
        // Blink loop
        const blinkInterval = setInterval(() => {
            setBlink(true);
            setTimeout(() => setBlink(false), 200);
        }, 3000 + Math.random() * 4000);

        // Look around loop
        const lookInterval = setInterval(() => {
            if (isPersonPresentRef?.current && personPositionXRef) {
                const x = (0.5 - personPositionXRef.current) * 600; 
                const y = (Math.random() - 0.5) * 30;
                updateEyePosition(x, y);
            } else if (state === EyeState.IDLE || state === EyeState.LISTENING) {
                const x = (Math.random() - 0.5) * 80; 
                const y = (Math.random() - 0.5) * 40; 
                updateEyePosition(x, y);
            } else if (state === EyeState.SPEAKING || state === EyeState.THINKING) {
                 updateEyePosition(0, 0);
            }
        }, 2000 + Math.random() * 3000);

        const handleSoundDetected = (e: any) => {
            if (state === EyeState.IDLE || state === EyeState.LISTENING) {
                const x = (Math.random() - 0.5) * 120;
                const y = (Math.random() - 0.5) * 60; 
                updateEyePosition(x, y);
            }
        };

        const handlePersonMoved = (e: any) => {
            if (isPersonPresentRef?.current || e.detail.force) {
                const deltaX = Math.abs(personPositionXRef?.current ? personPositionXRef.current - e.detail.x : 0);
                const speedMultiplier = 1 + (deltaX * 5);
                const x = (0.5 - e.detail.x) * 600 * speedMultiplier; 
                const y = (Math.random() - 0.5) * 30;
                updateEyePosition(x, y);
            }
        };

    const handleFaceRecognized = (e: any) => {
        setRecognizedNames(e.detail.names);
        setShowRecognition(true);
        setTimeout(() => setShowRecognition(false), 4000);
    };

    window.addEventListener('airo-sound-detected', handleSoundDetected);
    window.addEventListener('airo-person-moved', handlePersonMoved);
    window.addEventListener('airo-face-recognized', handleFaceRecognized);

    return () => {
        clearInterval(blinkInterval);
        clearInterval(lookInterval);
        window.removeEventListener('airo-sound-detected', handleSoundDetected);
        window.removeEventListener('airo-person-moved', handlePersonMoved);
        window.removeEventListener('airo-face-recognized', handleFaceRecognized);
    }
  }, [state, personPositionXRef, isPersonPresentRef]);

  const getEyeColorClass = () => {
      if (state === EyeState.SLEEPING) return 'bg-gray-700 shadow-none border border-gray-600';
      if (isQrMode) return 'bg-purple-500 shadow-[0_0_60px_#a855f7] border-none';
      if (state === EyeState.LISTENING) return 'rainbow-bg border-none';
      if (state === EyeState.SPEAKING) return 'bg-blue-500 shadow-[0_0_60px_#3b82f6] border-none';
      if (state === EyeState.THINKING) return 'bg-yellow-400 shadow-[0_0_60px_#facc15] border-none';
      return 'bg-white shadow-[0_0_30px_#fff]';
  };

  const getScale = () => {
      if (isQrMode) return 1.3;
      if (state === EyeState.LISTENING) return 1.4;
      if (state === EyeState.SPEAKING) return 1.2;
      if (state === EyeState.THINKING) return 1.1;
      return 1;
  }

    const eyeStyle = {
        transform: state === EyeState.SLEEPING 
            ? `translate(0px, 150px) scaleY(0.05) scale(1)`
            : `translate(${lookOffset.x}px, ${lookOffset.y}px) scaleY(${blink ? 0.05 : 1}) scale(${getScale()})`,

        transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.5s ease',
    };

    const containerStyle = {
        transform: `rotate(${tilt}deg)`,
        transition: 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)'
    };

    return (
      <div className="flex justify-center items-center h-full w-full bg-black overflow-hidden relative">
        <div className="absolute top-8 text-white font-mono text-xs select-none opacity-30 tracking-[0.5em] uppercase z-10">
            {isQrMode && "QR COMMANDER ACTIVE"}
            {!isQrMode && state === EyeState.IDLE && "System Idle"}
            {!isQrMode && state === EyeState.SLEEPING && "Sleep Mode"}
            {!isQrMode && state === EyeState.LISTENING && "Receiving Input"}
            {!isQrMode && state === EyeState.THINKING && "Processing"}
            {!isQrMode && state === EyeState.SPEAKING && "Generating Output"}
        </div>
        
        {isQrMode && (
          <div className="absolute bottom-10 right-10 flex items-center justify-center p-4 bg-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.4)] rounded-2xl border border-purple-500/50 z-10">
            <QrCode className="w-12 h-12 text-purple-400 animate-pulse" />
          </div>
        )}

        <div className="flex gap-20 justify-center items-center" style={containerStyle}>
          <div className={`w-48 h-48 rounded-full ${getEyeColorClass()} relative flex items-center justify-center`} style={eyeStyle}>
              {showRecognition && (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-full h-full border-4 border-rose-500 rounded-full animate-ping opacity-75"></div>
                      <div className="absolute w-3/4 h-3/4 bg-rose-500/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                          <span className="text-rose-900 font-bold text-xs uppercase tracking-widest px-2 text-center mix-blend-color-burn">
                              {recognizedNames.join(', ')}
                          </span>
                      </div>
                  </div>
              )}
          </div>
          <div className={`w-48 h-48 rounded-full ${getEyeColorClass()} relative flex items-center justify-center`} style={eyeStyle}>
              {showRecognition && (
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="absolute w-full h-full border-4 border-rose-500 rounded-full animate-ping opacity-75"></div>
                      <div className="absolute w-3/4 h-3/4 bg-rose-500/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                          <span className="text-rose-900 font-bold text-xs uppercase tracking-widest px-2 text-center mix-blend-color-burn">
                              {recognizedNames.join(', ')}
                          </span>
                      </div>
                  </div>
              )}
          </div>
        </div>
      </div>
    );
};
