import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import {
  ensureMatrixReady,
  isManagedAccount,
  openAccountPage,
  matrixWithPasswordAuth,
  matrixLogout,
} from '../services/matrix';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
  themeMode?: 'dark' | 'light';
  triggerHaptic?: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  onClose,
  onLogout,
  themeMode = 'dark',
  triggerHaptic,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'delete-account-modal');
  const [confirmInput, setConfirmInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [eraseMessages, setEraseMessages] = useState(false);
  const [isManaged, setIsManaged] = useState<boolean | null>(null);
  const [managedStatusMsg, setManagedStatusMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
      setPasswordInput('');
      setEraseMessages(false);
      setManagedStatusMsg(null);
      setErrorMessage(null);
      setIsProcessing(false);

      isManagedAccount()
        .then((managed) => setIsManaged(managed))
        .catch(() => setIsManaged(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmInput.trim() === 'DELETE';

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) return;
    if (triggerHaptic) triggerHaptic();

    if (isManaged) {
      try {
        setIsProcessing(true);
        await openAccountPage('org.matrix.account_deactivate');
        setManagedStatusMsg(
          "Finish on your account page. This app will sign you out when it's done."
        );
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to open account page');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!passwordInput) {
      setErrorMessage('Please enter your account password to confirm deactivation');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const client = await ensureMatrixReady();
      if (!client) throw new Error('Matrix client is not initialized');

      await matrixWithPasswordAuth(passwordInput, (auth) =>
        (client as any).deactivateAccount(auth, eraseMessages)
      );

      matrixLogout();
      onClose();
      if (onLogout) {
        onLogout();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to deactivate account. Please check your password.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={() => !isProcessing && onClose()} />
      <div
        className={`relative z-10 w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${
          themeMode === 'dark'
            ? 'bg-[#313338] border-[#3f4147] text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-[#f23f43] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#f23f43]">Delete Account</h3>
              <p className="text-[11px] text-[#949ba4]">Permanent account deactivation</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-1 rounded-lg text-[#949ba4] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Warning: Permanent Action</span>
          </div>
          <p>
            This permanently deactivates your account. You can't sign in again and the username can't
            be reused. This can't be undone.
          </p>
        </div>

        {managedStatusMsg ? (
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-[#5865f2]/20 border border-[#5865f2]/40 text-[#5865f2] text-xs font-medium">
              {managedStatusMsg}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} className="space-y-4 pt-1">
            <div>
              <label
                className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                  themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'
                }`}
              >
                Type <span className="font-mono text-red-400 font-extrabold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                autoFocus
                required
                value={confirmInput}
                disabled={isProcessing}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE"
                className={`w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border font-mono tracking-widest focus:outline-hidden focus:border-red-500 transition-colors ${
                  themeMode === 'dark'
                    ? 'bg-[#1e1f22] text-white border-[#3f4147]'
                    : 'bg-slate-100 text-slate-900 border-slate-300'
                }`}
              />
            </div>

            {!isManaged && (
              <>
                <div>
                  <label
                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
                      themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'
                    }`}
                  >
                    Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    disabled={isProcessing}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password to authorize deactivation"
                    className={`w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-red-500 transition-colors ${
                      themeMode === 'dark'
                        ? 'bg-[#1e1f22] text-white border-[#3f4147]'
                        : 'bg-slate-100 text-slate-900 border-slate-300'
                    }`}
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={eraseMessages}
                    onChange={(e) => setEraseMessages(e.target.checked)}
                    disabled={isProcessing}
                    className="w-4 h-4 rounded-md border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <span
                    className={`text-xs ${
                      themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-700'
                    }`}
                  >
                    Also erase my messages (where the server supports it)
                  </span>
                </label>
              </>
            )}

            {errorMessage && (
              <div className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={onClose}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  themeMode === 'dark'
                    ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isConfirmed || isProcessing}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#da373c] hover:bg-[#ba2f34] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete my account</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
