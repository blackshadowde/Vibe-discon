import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface LogoutBackupWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupBackup: () => void;
  onLogoutAnyway: () => void;
  themeMode?: 'dark' | 'light';
}

export const LogoutBackupWarningModal: React.FC<LogoutBackupWarningModalProps> = ({
  isOpen,
  onClose,
  onSetupBackup,
  onLogoutAnyway,
  themeMode = 'dark',
}) => {
  useAndroidBackHandler(isOpen, onClose, 'logout-backup-warning-modal');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative z-10 w-full max-w-md border rounded-2xl shadow-2xl p-6 space-y-5 ${
          themeMode === 'dark'
            ? 'bg-[#313338] border-red-500/40 text-[#dbdee1]'
            : 'bg-white border-red-200 text-slate-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-bold text-white leading-snug">
            Messages on this device will be lost unless you back them up
          </h3>
          <p className="text-xs text-[#949ba4] leading-relaxed">
            Message backup is not active on this device. If you log out without backing up, your local encryption keys will be permanently cleared and past encrypted messages will become unreadable.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onLogoutAnyway}
            className="w-full sm:w-auto order-2 sm:order-1 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold transition-all cursor-pointer min-h-[38px]"
          >
            Log out anyway
          </button>
          <button
            type="button"
            onClick={onSetupBackup}
            className="w-full sm:w-auto order-1 sm:order-2 px-5 py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold transition-all cursor-pointer shadow-md min-h-[38px]"
          >
            Set up backup
          </button>
        </div>
      </div>
    </div>
  );
};
