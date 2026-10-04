import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, RefreshCw, X } from 'lucide-react';
import { registerToastHandler } from '../services/deviceStorage';

export const DeviceStorageToast: React.FC = () => {
  const [toast, setToast] = useState<{
    msg: string;
    isError: boolean;
    onRetry?: () => void;
  } | null>(null);

  useEffect(() => {
    return registerToastHandler((msg, isError = false, onRetry) => {
      setToast({ msg, isError, onRetry });
      if (!isError) {
        setTimeout(() => {
          setToast((current) => (current?.msg === msg ? null : current));
        }, 3500);
      }
    });
  }, []);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[140] w-auto max-w-sm px-4 py-2.5 rounded-full bg-[#1e1f22]/95 border border-[#3f4147] text-white text-xs font-semibold shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200 select-none">
      {toast.isError ? (
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      ) : (
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
      )}
      <span className="truncate">{toast.msg}</span>
      {toast.onRetry && (
        <button
          type="button"
          onClick={() => {
            const retry = toast.onRetry;
            setToast(null);
            retry?.();
          }}
          className="ml-1 px-2 py-0.5 rounded-full bg-[#5865f2] hover:bg-[#4752c4] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Retry</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setToast(null)}
        className="ml-auto p-0.5 text-[#949ba4] hover:text-white rounded-full transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
