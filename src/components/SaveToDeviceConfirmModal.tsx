import React, { useState, useEffect } from 'react';
import { ShieldAlert, Download, X } from 'lucide-react';
import {
  registerSaveConfirmHandler,
  setSaveConfirmationDontAsk,
  SaveConfirmRequest,
} from '../services/deviceStorage';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

export const SaveToDeviceConfirmModal: React.FC<{
  themeMode?: 'dark' | 'light';
}> = ({ themeMode = 'dark' }) => {
  const [currentRequest, setCurrentRequest] = useState<SaveConfirmRequest | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    return registerSaveConfirmHandler((req) => {
      setDontAskAgain(false);
      setCurrentRequest(req);
    });
  }, []);

  const handleClose = () => {
    if (currentRequest) {
      currentRequest.resolve(false);
      setCurrentRequest(null);
    }
  };

  const handleSave = async () => {
    if (dontAskAgain) {
      await setSaveConfirmationDontAsk(true);
    }
    if (currentRequest) {
      currentRequest.resolve(true);
      setCurrentRequest(null);
    }
  };

  useAndroidBackHandler(Boolean(currentRequest), handleClose, 'save-confirm-modal');

  if (!currentRequest) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md border rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 ${
          themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147] text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">Save to Device Storage?</h3>
              <span className="text-xs text-[#949ba4]">Security notice</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-[#dbdee1] leading-relaxed">
          This saves a decrypted copy outside Vibe. Other apps on this phone will be able to read it.
        </p>

        <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="w-4 h-4 rounded-sm accent-[#5865f2] cursor-pointer"
          />
          <span className="text-xs text-[#949ba4] hover:text-white transition-colors">
            Don't ask again
          </span>
        </label>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#3f4147]/50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#949ba4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#5865f2] hover:bg-[#4752c4] text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
