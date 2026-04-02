
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { VisualContent } from '../types';
import { TimerWidget, SettingsWidget, ConfirmationWidget, NumberWidget, UiCardWidget, EyesAnimationWidget, SportsScoresWidget, MusicPlayerWidget } from './PredefinedWidgets';

interface VisualDisplayProps {
  data: VisualContent | null;
  onDismiss: () => void;
  onSyncTimer?: (data: any) => void;
  onStopTimer?: () => void;
  onConfirmationAnswer?: (answer: string) => void;
  onMusicAction?: (action: string, payload?: any) => void;
}

export const VisualDisplay: React.FC<VisualDisplayProps> = ({ data, onDismiss, onSyncTimer, onStopTimer, onConfirmationAnswer, onMusicAction }) => {
  const [offsetY, setOffsetY] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Listen for messages from the iframe widgets
      if (event.data && event.data.action === 'close') {
        onDismiss();
      }
      if (event.data && event.data.action === 'submit') {
        onDismiss();
      }
      if (event.data && event.data.action === 'syncTimer' && onSyncTimer) {
        onSyncTimer(event.data.payload);
      }
      if (event.data && event.data.action === 'stopTimer' && onStopTimer) {
        onStopTimer();
      }
      if (event.data && /^pauseMusic|resumeMusic|skipMusic|dismissMusic|musicVolume$/.test(String(event.data.action || '')) && onMusicAction) {
        onMusicAction(String(event.data.action), event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onDismiss, onSyncTimer, onStopTimer, onMusicAction]);

  if (!data || data.type === 'none') return null;

  const isTransparent = false;

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    isDragging.current = true;
    startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current) return;
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const diff = currentY - startY.current;
    if (diff > 0) setOffsetY(diff);
  };

  const handleDragEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (offsetY > 150) onDismiss();
    else setOffsetY(0);
  };

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <motion.div 
        initial={{ y: '12%', opacity: 0 }}
        animate={{ y: offsetY, opacity: 1 }}
        exit={{ y: '12%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`
          absolute inset-0 bg-black/78 backdrop-blur-xl overflow-hidden flex flex-col pointer-events-auto
        `}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex flex-col items-start">
                <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/45">Swipe Down To Dismiss</div>
                {data.title && (
                  <span className="mt-2 text-white/75 font-mono text-xs tracking-widest uppercase">{data.title}</span>
                )}
            </div>
            <button onClick={onDismiss} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10">✕</button>
        </div>

        <div className="absolute top-3 left-1/2 z-20 h-1.5 w-20 -translate-x-1/2 rounded-full bg-white/20"></div>

        <div className="relative flex-1 overflow-hidden bg-transparent">
            {data.type === 'image' && (
                <div className="absolute inset-0 flex items-center justify-center p-6 pt-20">
                    <img 
                        src={data.content} 
                        alt="AI Visual" 
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => setHasLoaded(true)}
                        onError={() => onDismiss()}
                    />
                </div>
            )}
            {data.type === 'widget' && (
                <iframe
                    title="AI Widget"
                    srcDoc={data.content}
                    className="absolute inset-0 w-full h-full border-none bg-transparent pt-14"
                    onLoad={() => setHasLoaded(true)}
                />
            )}
            {data.type === 'predefined' && data.component === 'timer' && (
                <TimerWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'settings' && (
                <SettingsWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'confirmation' && (
                <ConfirmationWidget data={data.content} onAnswer={onConfirmationAnswer} />
            )}
            {data.type === 'predefined' && data.component === 'number' && (
                <NumberWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'ui-card' && (
                <UiCardWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'eyes-animation' && (
                <EyesAnimationWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'sports' && (
                <SportsScoresWidget data={data.content} />
            )}
            {data.type === 'predefined' && data.component === 'music' && (
                <MusicPlayerWidget data={data.content} />
            )}
            {!hasLoaded && data.type !== 'predefined' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
};
