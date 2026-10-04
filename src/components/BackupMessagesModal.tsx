import React, { useState } from 'react';
import {
  Shield,
  Key,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  X,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { setupMessageBackup } from '../services/matrix';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { copyText } from '../native/platform';

interface BackupMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  themeMode?: 'dark' | 'light';
  isAutoPrompt?: boolean;
  onSkipAutoPrompt?: () => void;
}

export const BackupMessagesModal: React.FC<BackupMessagesModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  themeMode = 'dark',
  isAutoPrompt = false,
  onSkipAutoPrompt,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'backup-messages-modal');

  const [step, setStep] = useState<'password' | 'recoveryKey' | 'confirmSkip'>('password');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSavedChecked, setIsSavedChecked] = useState(false);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const key = await setupMessageBackup(password);
      setRecoveryKey(key);
      setStep('recoveryKey');
      setPassword('');
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to set up message backup. Please check your password and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (recoveryKey) {
      copyText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    if (!isSavedChecked) return;
    setRecoveryKey(null);
    setStep('password');
    if (onSuccess) onSuccess();
    onClose();
  };

  const handleInitiateSkip = () => {
    if (isAutoPrompt) {
      setStep('confirmSkip');
    } else {
      onClose();
    }
  };

  const handleConfirmSkip = () => {
    if (onSkipAutoPrompt) onSkipAutoPrompt();
    setStep('password');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={handleInitiateSkip} />

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
            {step === 'confirmSkip' ? (
              <button
                type="button"
                onClick={() => setStep('password')}
                className="p-1.5 -ml-1 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Shield className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-white">Back up your messages</h3>
              <p className="text-xs text-[#949ba4]">Secure cross-device encrypted message backup</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleInitiateSkip}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* STEP 1: PASSWORD */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs flex items-start gap-3">
                <Lock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Enter your account password to generate your secret recovery key and initialize encrypted message backup on the server.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1.5">
                  Account Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1f22] border border-[#3f4147] text-white text-xs placeholder-[#949ba4] focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                {isAutoPrompt && (
                  <button
                    type="button"
                    onClick={handleInitiateSkip}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#949ba4] hover:text-white transition-colors cursor-pointer"
                  >
                    Skip for now
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!password || isLoading}
                  className="ml-auto px-5 py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer min-h-[38px]"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isLoading ? 'Setting up...' : 'Set up backup'}</span>
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: RECOVERY KEY */}
          {step === 'recoveryKey' && recoveryKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#b5bac1]">
                  <span>Your Secret Recovery Key</span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    {copied ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Copied!
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-[#1e1f22] border border-[#3f4147] font-mono text-center text-xs tracking-wider text-purple-300 select-all break-all leading-relaxed shadow-inner">
                  {recoveryKey}
                </div>
              </div>

              {/* Clear Warning */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">
                  If you lose this key and all your devices, old messages cannot be recovered.
                </p>
              </div>

              {/* Required Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSavedChecked}
                    onChange={(e) => setIsSavedChecked(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5865f2] focus:ring-0 focus:ring-offset-0 bg-[#1e1f22] border-[#3f4147] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white">I saved this key</span>
                </label>
              </div>

              {/* Done Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleDone}
                  disabled={!isSavedChecked}
                  className="w-full py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all cursor-pointer min-h-[38px]"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM SKIP */}
          {step === 'confirmSkip' && (
            <div className="space-y-4 py-1">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Skip Message Backup?</span>
                </div>
                <p className="leading-relaxed text-[#dbdee1]">
                  Without a message backup, if you log out or switch to a new device, you will lose access to your encrypted message history.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('password')}
                  className="px-4 py-2.5 rounded-xl bg-[#35373c] hover:bg-[#3f4147] text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Go Back & Back Up
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSkip}
                  className="px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
