import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, RefreshCw, ChevronRight, Loader2 } from 'lucide-react';
import { ErrorLevel, AiroError } from '../types';

interface ErrorScreensProps {
  error: AiroError | null;
  onRestart: () => void;
  onContinue: () => void;
}

export const ErrorScreens: React.FC<ErrorScreensProps> = ({ error, onRestart, onContinue }) => {
  const [blueStep, setBlueStep] = useState<'reporting' | 'done'>('reporting');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (error?.level === ErrorLevel.BLUE) {
      setBlueStep('reporting');
      setProgress(0);
      const startTime = Date.now();
      const duration = 4000;

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const p = Math.min((elapsed / duration) * 100, 100);
        setProgress(p);
        if (p >= 100) {
          clearInterval(interval);
          setBlueStep('done');
          // Actually report the error to the backend
          reportError(error);
        }
      }, 50);

      return () => clearInterval(interval);
    }
  }, [error]);

  const reportError = async (err: AiroError) => {
    try {
      await fetch('/api/error-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err),
      });
    } catch (e) {
      console.error('Failed to report error:', e);
    }
  };

  if (!error) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6">
      <AnimatePresence mode="wait">
        {error.level === ErrorLevel.RED && (
          <motion.div
            key="red-error"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-900 border-2 border-red-600 rounded-3xl p-8 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="bg-red-600 p-4 rounded-full shadow-[0_0_30px_rgba(220,38,38,0.5)]">
                <X className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-red-500 mb-2">Red Error</h2>
            <p className="text-red-400/80 mb-4">Something has gone wrong with AirOS</p>
            <p className="text-red-400 mb-6 italic">You can Restart to fix this</p>
            
            <div className="bg-black/50 rounded-xl p-4 mb-8 border border-red-900/30">
              <p className="text-zinc-500 text-sm font-mono break-words">
                "{error.message || 'Unknown critical error'}"
              </p>
            </div>

            <button
              onClick={onRestart}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-2xl"
            >
              <RefreshCw className="w-6 h-6" />
              Restart
            </button>
          </motion.div>
        )}

        {error.level === ErrorLevel.BLUE && (
          <motion.div
            key="blue-error"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-900 border-2 border-cyan-500 rounded-3xl p-8 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="bg-cyan-500 p-4 rounded-full shadow-[0_0_30px_rgba(6,182,212,0.5)]">
                <X className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-cyan-400 mb-2">Blue Error</h2>
            <p className="text-cyan-300/80 mb-2">The Widget you tried to use isn't working</p>
            <p className="text-cyan-300/60 mb-8">We will report the error to Alex and then you can continue</p>
            
            <div className="w-full h-8 bg-zinc-800 rounded-lg overflow-hidden border border-cyan-900/30">
              <motion.div 
                className="h-full bg-cyan-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            
            {blueStep === 'done' && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={onContinue}
                className="mt-8 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-xl"
              >
                Continue
              </motion.button>
            )}
          </motion.div>
        )}

        {error.level === ErrorLevel.GREEN && (
          <motion.div
            key="green-error"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-zinc-900 border-2 border-green-500 rounded-3xl p-8 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="bg-green-500 p-4 rounded-full shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                <X className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-green-500 mb-2">Green Error</h2>
            <p className="text-green-400/80 mb-2">Airo Cannot Respond due to a server issue</p>
            <p className="text-green-400/60 mb-8">We will report the error to Alex and then you can continue</p>

            <button
              onClick={onContinue}
              className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-2xl shadow-[0_4px_20px_rgba(34,197,94,0.3)]"
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
