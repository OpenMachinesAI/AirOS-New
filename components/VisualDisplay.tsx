
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { VisualContent } from '../types';
import { TimerWidget, SettingsWidget, ConfirmationWidget } from './PredefinedWidgets';

interface VisualDisplayProps {
  data: VisualContent | null;
  onDismiss: () => void;
  onSyncTimer?: (data: any) => void;
}

export const VisualDisplay: React.FC<VisualDisplayProps> = ({ data, onDismiss, onSyncTimer }) => {
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
        console.log("Widget submitted data:", event.data.payload);
        // Here we could potentially send this back to the AI or handle it in the app
        onDismiss();
      }
      if (event.data && event.data.action === 'syncTimer' && onSyncTimer) {
        onSyncTimer(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onDismiss, onSyncTimer]);

  if (!data || data.type === 'none') return null;

  const isTransparent = data.type === 'predefined' && data.component === 'timer';

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
    <div className="absolute inset-0 z-50 flex items-end justify-center pointer-events-none p-4 pb-12 sm:items-center sm:pb-4">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: offsetY, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`
          ${isTransparent ? '' : 'bg-gray-900/95 backdrop-blur-2xl border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.9)]'}
          rounded-3xl overflow-hidden max-w-4xl w-full flex flex-col pointer-events-auto
        `}
        onTouchStart={isTransparent ? undefined : handleDragStart}
        onTouchMove={isTransparent ? undefined : handleDragMove}
        onTouchEnd={isTransparent ? undefined : handleDragEnd}
        onMouseDown={isTransparent ? undefined : handleDragStart}
        onMouseMove={isTransparent ? undefined : handleDragMove}
        onMouseUp={isTransparent ? undefined : handleDragEnd}
        onMouseLeave={isTransparent ? undefined : handleDragEnd}
      >
        {!isTransparent && (
          <>
            <div className="h-12 flex items-center justify-center bg-white/5 cursor-grab active:cursor-grabbing border-b border-white/5">
                <div className="w-16 h-1 bg-white/20 rounded-full"></div>
            </div>

            {data.title && (
                <div className="px-6 py-4 flex justify-between items-center">
                    <span className="text-white/60 font-mono text-xs tracking-widest uppercase">{data.title}</span>
                    <button onClick={onDismiss} className="text-white/30 hover:text-white transition-colors">✕</button>
                </div>
            )}
          </>
        )}

        <div className={`relative overflow-hidden ${isTransparent ? 'h-[80vh] w-full' : 'flex-1 min-h-[350px] bg-black'}`}>
            {data.type === 'image' && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
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
                    className="absolute inset-0 w-full h-full border-none bg-transparent"
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
                <ConfirmationWidget data={data.content} />
            )}
            {!hasLoaded && data.type !== 'predefined' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
};
