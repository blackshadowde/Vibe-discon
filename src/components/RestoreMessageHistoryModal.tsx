import React, { useState } from 'react';
import {
  KeyRound,
  RefreshCw,
  Check,
  AlertTriangle,
  X,
  Lock,
  History,
  Info,
} from 'lucide-react';
import { restoreMessageBackup } from '../services/matrix';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface RestoreMessageHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  themeMode?: 'dark' | 'light';
  isAutoPrompt?: boolean;
  onSkipAutoPrompt?: () => void;
}

export const RestoreMessageHistoryModal: React.FC<RestoreMessageHistoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  themeMode = 'dark',
  isAutoPrompt = false,
  onSkipAutoPrompt,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'restore-message-history-modal');

  const [recoveryKey, setRecoveryKey] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('Preparing restoration...');

  if (!isOpen) return null;

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = recoveryKey.trim();
    if (!cleanKey) return;

    setIsRestoring(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setProgressPercent(10);
    setProgressStatus('Decoding recovery key...');

    try {
      const result = await restoreMessageBackup(cleanKey, (progress: any) => {
        if (progress) {
          if (progress.stage === 'fetch') {
            setProgressPercent(30);
            setProgressStatus('Fetching encrypted key backup from server...');
          } else if (progress.stage === 'load_keys') {
            const { successes, total } = progress;
            const pct = total > 0 ? Math.min(95, Math.round((successes / total) * 100)) : 60;
            setProgressPercent(pct);
            setProgressStatus(`Importing keys... (${successes} of ${total || 'all'} keys)`);
          }
        }
      });

      setProgressPercent(100);
      setProgressStatus('Restoration complete!');

      const importedCount = result?.imported ?? 0;
      setSuccessMessage(
        importedCount > 0
          ? `Successfully restored ${importedCount} encryption key${importedCount > 1 ? 's' : ''}! Old messages decrypted.`
          : 'Message keys restored successfully! Decrypting past room messages...'
      );

      setTimeout(() => {
        setIsRestoring(false);
        setRecoveryKey('');
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.warn('[RestoreBackup] Error:', err);
      setIsRestoring(false);
      setProgressPercent(0);
      let msg = 'Invalid recovery key. Check the key and try again.';
      if (err?.message && (err.message.includes('format') || err.message.includes('MAC') || err.message.includes('invalid'))) {
        msg = 'Invalid recovery key. Check the code formatting and try again.';
      } else if (err?.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
    }
  };

  const handleSkip = () => {
    if (isAutoPrompt && onSkipAutoPrompt) {
      onSkipAutoPrompt();
    }
    setRecoveryKey('');
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={handleSkip} />

      <div
        className={`relative z-10 w-full max-w-md border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          themeMode === 'dark'
            ? 'bg-[#313338] border-[#3f4147] text-[#dbdee1]'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#232428]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Restore message history</h3>
              <p className="text-xs text-[#949ba4]">Decrypt past messages with recovery key</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-start gap-3">
            <KeyRound className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Enter your secret recovery key to unlock your encrypted message backup and restore past chat history to this device.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-200">Restoration Failed</div>
                <p className="mt-0.5 leading-normal">{errorMessage}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleRestoreSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1.5">
                Secret Recovery Key
              </label>
              <textarea
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="e.g. Es9K ..."
                rows={3}
                disabled={isRestoring}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1f22] border border-[#3f4147] text-white text-xs font-mono placeholder-[#949ba4] focus:outline-none focus:border-purple-500 transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Progress Bar Display */}
            {isRestoring && (
              <div className="space-y-2 p-3.5 rounded-xl bg-[#1e1f22] border border-[#3f4147]">
                <div className="flex items-center justify-between text-xs font-medium text-[#b5bac1]">
                  <span>{progressStatus}</span>
                  <span className="text-purple-400 font-bold">{progressPercent}%</span>
                </div>
                <div className="w-full bg-[#2b2d31] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isRestoring}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#949ba4] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
              >
                Skip
              </button>

              <button
                type="submit"
                disabled={!recoveryKey.trim() || isRestoring}
                className="ml-auto px-5 py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer min-h-[38px]"
              >
                {isRestoring && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isRestoring ? 'Restoring...' : 'Restore history'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
