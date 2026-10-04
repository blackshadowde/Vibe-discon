import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus,
  Check,
  ArrowLeft,
  Camera,
  Upload,
  Shield,
  Moon,
  Sun,
  Vibrate,
  LogOut,
  Sparkles,
  Bell,
  Edit3,
  RefreshCw,
  Copy,
  Bug,
  Smartphone,
  Laptop,
  Trash2,
  ExternalLink,
  KeyRound,
  AlertCircle,
  X,
  Lock,
  Type,
  Settings,
  Link2,
} from 'lucide-react';
import { useLinkPreviewsEnabled } from '../utils/privacySettings';
import {
  matrixCreateDirectRoom,
  getEncryptionSummary,
  EncryptionSummary,
  ensureMatrixReady,
  isManagedAccount,
  openAccountPage,
  matrixWithPasswordAuth,
} from '../services/matrix';
import { FloatingBottomNav, ManagementTab } from './FloatingBottomNav';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { copyText } from '../native/platform';
import { MatrixAvatar } from './MatrixAvatar';
import { Avatar } from './Avatar';
import { E2EEDebugModal } from './E2EEDebugModal';
import { DeleteAccountModal } from './DeleteAccountModal';

interface UserProfileModalProps {
  user: {
    userName: string;
    userId: string;
    userAvatar?: string;
    avatarColor?: string;
    isCurrentUser?: boolean;
  } | null;
  isInitialFriend?: boolean;
  onClose: () => void;
  activeNavTab?: ManagementTab;
  themeMode?: 'dark' | 'light';
  onToggleTheme?: (mode: 'dark' | 'light') => void;
  hapticEnabled?: boolean;
  onToggleHaptic?: () => void;
  triggerHaptic?: () => void;
  onUpdateDisplayName?: (name: string) => void;
  onUpdateAvatarUrl?: (fileOrUrl: File | string) => void;
  onLogout?: () => void;
  onOpenNotifications?: () => void;
  onOpenE2EEDebug?: () => void;
  activeRoomId?: string;
  chatFontSize?: number;
  onChatFontSizeChange?: (size: number) => void;
  onOpenSettings?: () => void;
}


// Helper to generate a consistent color from a string
const getHashColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
  return colors[Math.abs(hash) % colors.length];
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isInitialFriend = false,
  onClose,
  activeNavTab = 'account',
  themeMode = 'dark',
  onToggleTheme,
  hapticEnabled = true,
  onToggleHaptic,
  triggerHaptic,
  onUpdateDisplayName,
  onUpdateAvatarUrl,
  onLogout,
  onOpenNotifications,
  onOpenE2EEDebug,
  activeRoomId,
  chatFontSize,
  onChatFontSizeChange,
  onOpenSettings,
}) => {
  useAndroidBackHandler(Boolean(user), onClose, 'user-profile-modal');
  const [currentTab, setCurrentTab] = useState<ManagementTab>((activeNavTab as string) === 'status' ? 'account' : activeNavTab);

  useEffect(() => {
    if (activeNavTab) {
      setCurrentTab((activeNavTab as string) === 'status' ? 'account' : activeNavTab);
    }
  }, [activeNavTab]);

  const [isFriend, setIsFriend] = useState(isInitialFriend);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [displayNameInput, setDisplayNameInput] = useState(user?.userName || 'WHO');
  const [isEditMode, setIsEditMode] = useState(false);
  const initialDisplayName = user?.userName || 'WHO';
  const hasChanges = displayNameInput.trim() !== initialDisplayName;

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [avatarSuccessMsg, setAvatarSuccessMsg] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [encryptionSummary, setEncryptionSummary] = useState<EncryptionSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [linkPreviewsEnabled, setLinkPreviewsEnabled] = useLinkPreviewsEnabled();

  // Sessions state
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isManaged, setIsManaged] = useState<boolean | null>(null);
  const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState<string | null>(null);

  // Password confirmation modal state
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  const [pendingDeviceIds, setPendingDeviceIds] = useState<string[]>([]);
  const [pendingRemoveDescription, setPendingRemoveDescription] = useState('');

  // Password change and Delete account state
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleOpenPasswordChange = async () => {
    if (triggerHaptic) triggerHaptic();
    if (isManaged) {
      try {
        await openAccountPage();
      } catch (err: any) {
        setSessionFeedbackMessage(err?.message || 'Failed to open account page');
      }
      return;
    }
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);
    setIsPasswordChangeOpen(true);
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordInput.length < 8) {
      setPasswordChangeError('New password must be at least 8 characters');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    try {
      const client = await ensureMatrixReady();
      if (!client) throw new Error('Matrix client unavailable');
      await matrixWithPasswordAuth(currentPasswordInput, (auth) =>
        client.setPassword(auth, newPasswordInput, false)
      );
      setPasswordChangeSuccess('Password updated successfully');
      setTimeout(() => {
        setIsPasswordChangeOpen(false);
      }, 1500);
    } catch (err: any) {
      setPasswordChangeError(err?.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const formatRelativeTime = (ts?: number) => {
    if (!ts) return 'Unknown';
    const now = Date.now();
    const diffMs = Math.max(0, now - ts);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin === 1) return '1 minute ago';
    if (diffMin < 60) return `${diffMin} minutes ago`;
    if (diffHrs === 1) return '1 hour ago';
    if (diffHrs < 24) return `${diffHrs} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  const fetchEncryptionData = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const summary = await getEncryptionSummary();
      setEncryptionSummary(summary);
    } catch {
      // ignore
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionFeedbackMessage(null);
    try {
      const client = await ensureMatrixReady();
      if (!client) {
        setIsLoadingSessions(false);
        return;
      }
      const myDevId =
        (typeof client.getDeviceId === 'function' && client.getDeviceId()) ||
        localStorage.getItem('matrix_device_id') ||
        '';
      setCurrentDeviceId(myDevId);

      try {
        const managed = await isManagedAccount();
        setIsManaged(managed);
      } catch {
        setIsManaged(false);
      }

      if (typeof client.getDevices === 'function') {
        const res = await client.getDevices();
        const devs = res?.devices || [];
        const sorted = [...devs].sort((a: any, b: any) => {
          if (a.device_id === myDevId) return -1;
          if (b.device_id === myDevId) return 1;
          return (b.last_seen_ts || 0) - (a.last_seen_ts || 0);
        });
        setSessionsList(sorted);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (currentTab === 'security') {
      fetchEncryptionData();
      loadSessions();
    }
  }, [currentTab, fetchEncryptionData, loadSessions]);

  const handleCopyFingerprint = async () => {
    if (!encryptionSummary?.fingerprint) return;
    try {
      await copyText(encryptionSummary.fingerprint);
      if (triggerHaptic) triggerHaptic();
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {}
  };

  const handleRemoveOtherSessions = async () => {
    if (triggerHaptic) triggerHaptic();
    if (isManaged) {
      try {
        await openAccountPage('org.matrix.sessions_list');
      } catch (err: any) {
        setSessionFeedbackMessage(err?.message || 'Failed to open account page');
      }
      return;
    }

    const otherIds = sessionsList
      .filter((d) => d.device_id !== currentDeviceId)
      .map((d) => d.device_id);

    if (otherIds.length === 0) {
      setSessionFeedbackMessage('No other sessions to remove.');
      return;
    }

    setPendingDeviceIds(otherIds);
    setPendingRemoveDescription(
      `This will sign out ${otherIds.length} other session${otherIds.length > 1 ? 's' : ''}. This device stays signed in.`
    );
    setPasswordInput('');
    setPasswordError(null);
    setIsPasswordPromptOpen(true);
  };

  const handleManageSession = async (device: any) => {
    if (triggerHaptic) triggerHaptic();
    if (isManaged) {
      try {
        await openAccountPage('org.matrix.session_view', { device_id: device.device_id });
      } catch (err: any) {
        setSessionFeedbackMessage(err?.message || 'Failed to open account page');
      }
      return;
    }

    // In-app remove single session
    setPendingDeviceIds([device.device_id]);
    setPendingRemoveDescription(
      `This will sign out "${device.display_name || device.device_id}". Enter your password to confirm.`
    );
    setPasswordInput('');
    setPasswordError(null);
    setIsPasswordPromptOpen(true);
  };

  const handleConfirmDeleteSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput || pendingDeviceIds.length === 0) return;
    setIsProcessingDelete(true);
    setPasswordError(null);
    try {
      const client = await ensureMatrixReady();
      if (!client) throw new Error('Matrix client unavailable');
      await matrixWithPasswordAuth(passwordInput, (auth) =>
        client.deleteMultipleDevices(pendingDeviceIds, auth)
      );
      const count = pendingDeviceIds.length;
      setSessionFeedbackMessage(`${count} session${count > 1 ? 's' : ''} removed successfully.`);
      setIsPasswordPromptOpen(false);
      setPasswordInput('');
      await loadSessions();
    } catch (err: any) {
      setPasswordError(err?.message || 'Incorrect password');
    } finally {
      setIsProcessingDelete(false);
    }
  };

  useEffect(() => {
    setIsFriend(isInitialFriend);
    setErrorMessage(null);
    setIsSending(false);
    if (user?.userName) {
      setDisplayNameInput(user.userName);
    }
  }, [isInitialFriend, user]);

  if (!user) return null;

  const isCurrentUser = Boolean(user.isCurrentUser);

  const handleAddFriend = async () => {
    setIsSending(true);
    setErrorMessage(null);
    try {
      const targetUserId = user.userId.startsWith('@') ? user.userId : `@${user.userId}:matrix.org`;
      await matrixCreateDirectRoom(targetUserId);
      setIsFriend(true);
    } catch {
      setErrorMessage('Failed to send request.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;
    if (triggerHaptic) triggerHaptic();
    if (onUpdateDisplayName) {
      onUpdateDisplayName(displayNameInput.trim());
    }
    setSavedSuccess(true);
    setIsEditMode(false);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (triggerHaptic) triggerHaptic();
      if (onUpdateAvatarUrl) {
        onUpdateAvatarUrl(file);
        setAvatarSuccessMsg(true);
        setTimeout(() => setAvatarSuccessMsg(false), 3000);
      }
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    if (triggerHaptic) triggerHaptic();
    if (onUpdateAvatarUrl) {
      onUpdateAvatarUrl(url);
      setAvatarSuccessMsg(true);
      setTimeout(() => setAvatarSuccessMsg(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[68] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div
        className={`relative z-10 w-full sm:max-w-lg border rounded-t-[28px] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh] ${
          themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-[#dbdee1]' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="h-20 sm:h-24 w-full bg-gradient-to-r from-[#5865f2] via-purple-600 to-indigo-600 relative shrink-0">
          <button
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] absolute top-3 left-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors z-20 flex items-center justify-center cursor-pointer shadow"
            title="Navigate Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {isCurrentUser && (
            <button
              onClick={() => {
                triggerHaptic?.();
                onOpenSettings?.();
              }}
              className="min-w-[36px] min-h-[36px] absolute top-3 right-3 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors z-20 flex items-center justify-center cursor-pointer shadow"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 pt-0 pb-3 border-b border-white/5 relative shrink-0">
          <div className="flex items-center gap-3.5 -mt-8">
              <div
              className="relative group cursor-pointer shrink-0"
              onClick={() => {
                if (isCurrentUser) {
                  if (triggerHaptic) triggerHaptic();
                  fileInputRef.current?.click();
                }
              }}
              title={isCurrentUser ? 'Click to change avatar photo' : undefined}
            >
              <Avatar
                mxcUrl={user.userAvatar}
                fallbackText={user.userName[0]}
                fallbackBg={getHashColor(user.userId)}
                className="w-16 h-16 rounded-full ring-4 ring-[#313338] shadow-lg"
              />
              {isCurrentUser && (
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Camera className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-4">
              <h2 className={`text-base sm:text-lg font-bold truncate leading-tight ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {user.userName}
              </h2>
              <p className="text-[11px] text-[#949ba4] font-mono truncate">
                {user.userId.startsWith('@') ? user.userId : `@${user.userId}:matrix.org`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
          {savedSuccess && (
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </div>
          )}
          {avatarSuccessMsg && (
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
              <Sparkles className="w-4 h-4" />
              <span>Profile photo updated across all rooms!</span>
            </div>
          )}

          {currentTab === 'account' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {isCurrentUser && (
                <div className={`p-3.5 border rounded-2xl ${themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'}`}>
                   <button
                        type="button"
                        onClick={() => {
                          triggerHaptic?.();
                          fileInputRef.current?.click();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Custom Photo</span>
                      </button>
                </div>
              )}

              <form onSubmit={handleSaveAccount} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    disabled={!isCurrentUser || !isEditMode}
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder="Enter your display name"
                    className={`w-full text-xs sm:text-sm px-3 py-2 rounded-xl border focus:outline-hidden focus:border-[#5865f2] transition-all ${
                      !isEditMode ? 'opacity-70 cursor-default grayscale-[0.3]' : ''
                    } ${
                      themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-1">
                    Matrix User ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.userId.startsWith('@') ? user.userId : `@${user.userId}:matrix.org`}
                    className={`w-full text-xs sm:text-sm px-3 py-2 rounded-xl border cursor-not-allowed opacity-60 ${
                      themeMode === 'dark' ? 'bg-[#1e1f22]/60 text-[#949ba4] border-[#3f4147]' : 'bg-slate-200 text-slate-500 border-slate-300'
                    }`}
                  />
                </div>

                    <div className="pt-2 flex items-center justify-between">
                      {isCurrentUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (triggerHaptic) triggerHaptic();
                            setShowLogoutConfirm(true);
                          }}
                          className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Log Out</span>
                        </button>
                      ) : (
                        <div />
                      )}
                      
                      {!hasChanges ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isEditMode) {
                              if (triggerHaptic) triggerHaptic();
                              setIsEditMode(true);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 ${
                            isEditMode 
                              ? 'bg-[#4e5058] text-[#949ba4] cursor-default opacity-70' 
                              : 'bg-[#4e5058] hover:bg-[#6d6f78] active:scale-95 text-white cursor-pointer'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 animate-in zoom-in-95 duration-200"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </button>
                      )}
                    </div>
                </form>

              {!isCurrentUser && (
                <div className="pt-2">
                  <button
                    onClick={handleAddFriend}
                    disabled={isFriend || isSending}
                    className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-semibold shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 ${
                      isFriend
                        ? 'bg-[#4e5058] text-[#949ba4] opacity-50 cursor-not-allowed pointer-events-none'
                        : isSending
                        ? 'bg-[#5865f2]/70 text-white cursor-wait'
                        : 'bg-[#5865f2] hover:bg-[#4752c4] text-white cursor-pointer'
                    }`}
                  >
                    {isSending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : isFriend ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Request Sent</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Add Friend</span>
                      </>
                    )}
                  </button>
                  {errorMessage && (
                    <p className="text-xs text-red-400 mt-2 text-center font-medium">{errorMessage}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {currentTab === 'security' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              <div
                className={`p-4 border rounded-2xl space-y-3.5 ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#5865f2]/20 text-[#5865f2]">
                      <Shield className="w-4 h-4" />
                    </div>
                    <h4 className={`text-xs sm:text-sm font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Encryption
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={fetchEncryptionData}
                      disabled={isLoadingSummary}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c] text-[#949ba4] hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                      title="Refresh encryption status"
                      aria-label="Refresh encryption status"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSummary ? 'animate-spin text-[#5865f2]' : ''}`} />
                    </button>
                    {encryptionSummary?.cryptoReady ? (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-red-400 font-mono font-bold bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
                        Not ready
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                      Session ID
                    </span>
                    <span className={`font-mono text-xs select-text ${themeMode === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                      {encryptionSummary?.deviceId || '(none)'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                        Session key
                      </span>
                      {encryptionSummary?.fingerprint && (
                        <button
                          type="button"
                          onClick={handleCopyFingerprint}
                          className="text-[11px] text-[#5865f2] hover:text-[#4752c4] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {copiedKey ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div
                      className={`p-2.5 rounded-xl border font-mono text-[11px] break-all select-text leading-relaxed ${
                        themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147] text-emerald-400' : 'bg-slate-100 border-slate-300 text-emerald-600'
                      }`}
                    >
                      {encryptionSummary?.fingerprint || '(no device key)'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                      Sync state
                    </span>
                    <span className={`font-mono text-xs font-semibold ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-700'}`}>
                      {encryptionSummary?.syncState || 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">
                      Cross-signing
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        encryptionSummary?.crossSigningReady ? 'text-emerald-400' : 'text-[#949ba4]'
                      }`}
                    >
                      {encryptionSummary?.crossSigningReady ? 'Set up' : 'Not set up'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      if (triggerHaptic) triggerHaptic();
                      if (onOpenE2EEDebug) {
                        onOpenE2EEDebug();
                      } else {
                        setIsDebugOpen(true);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer active:scale-98 ${
                      themeMode === 'dark'
                        ? 'bg-[#1e1f22] hover:bg-[#35373c] border-[#3f4147] text-white'
                        : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  >
                    <Bug className="w-3.5 h-3.5 text-[#5865f2]" />
                    <span>E2EE Debug</span>
                  </button>
                </div>
              </div>

              {/* Privacy Card */}
              <div
                className={`p-4 border rounded-2xl space-y-3.5 ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#5865f2]/20 text-[#5865f2]">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <h4 className={`text-xs sm:text-sm font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Privacy
                  </h4>
                </div>

                <div
                  onClick={() => {
                    if (triggerHaptic) triggerHaptic();
                    setLinkPreviewsEnabled(!linkPreviewsEnabled);
                  }}
                  className={`flex items-center justify-between min-h-[44px] py-1 cursor-pointer select-none rounded-xl transition-colors ${
                    themeMode === 'dark' ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <div className="pr-4 flex-1">
                    <h5 className={`text-xs sm:text-sm font-semibold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Link previews
                    </h5>
                    <p className={`text-[11px] leading-relaxed mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                      Show a title and image for links in messages. Previews are fetched through your homeserver, which can see the link.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={linkPreviewsEnabled}
                    aria-label="Link previews"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (triggerHaptic) triggerHaptic();
                      setLinkPreviewsEnabled(!linkPreviewsEnabled);
                    }}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
                      linkPreviewsEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        linkPreviewsEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Sessions Card */}
              <div
                className={`p-4 border rounded-2xl space-y-3.5 ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#5865f2]/20 text-[#5865f2]">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className={`text-xs sm:text-sm font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Sessions
                      </h4>
                      <p className="text-[10px] text-[#949ba4]">
                        Devices logged into this Matrix account
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadSessions}
                      disabled={isLoadingSessions}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c] text-[#949ba4] hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                      title="Refresh sessions"
                      aria-label="Refresh sessions"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin text-[#5865f2]' : ''}`} />
                    </button>
                    {sessionsList.filter((d) => d.device_id !== currentDeviceId).length > 0 && (
                      <button
                        type="button"
                        onClick={handleRemoveOtherSessions}
                        className="px-2.5 sm:px-3 py-1 rounded-xl border border-red-500/60 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Remove other sessions
                      </button>
                    )}
                  </div>
                </div>

                {isManaged && (
                  <p className="text-[11px] text-[#949ba4] italic">
                    Sessions are managed on your account page.
                  </p>
                )}

                {sessionFeedbackMessage && (
                  <div className="p-2 bg-[#5865f2]/20 border border-[#5865f2]/40 text-[#5865f2] rounded-xl text-xs flex items-center justify-between">
                    <span>{sessionFeedbackMessage}</span>
                    <button
                      type="button"
                      onClick={() => setSessionFeedbackMessage(null)}
                      className="text-xs opacity-70 hover:opacity-100 ml-2 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {isLoadingSessions && sessionsList.length === 0 ? (
                  <div className={`p-4 border rounded-xl text-center text-xs ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]' : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}>
                    Loading sessions...
                  </div>
                ) : sessionsList.length === 0 ? (
                  <div className={`p-4 border rounded-xl text-center text-xs ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147] text-[#949ba4]' : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}>
                    No active sessions found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessionsList.map((device) => {
                      const isCurrent = device.device_id === currentDeviceId;
                      return (
                        <div
                          key={device.device_id}
                          className={`p-3 border rounded-xl flex items-center justify-between gap-3 ${
                            themeMode === 'dark'
                              ? isCurrent ? 'bg-[#1e1f22] border-[#5865f2]/40 ring-1 ring-[#5865f2]/20' : 'bg-[#1e1f22] border-[#3f4147]'
                              : isCurrent ? 'bg-slate-100 border-[#5865f2]/40 ring-1 ring-[#5865f2]/20' : 'bg-slate-100 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg shrink-0 ${
                              isCurrent ? 'bg-[#23a55a]/20 text-[#23a55a]' : 'bg-[#404249]/40 text-[#949ba4]'
                            }`}>
                              {device.display_name?.toLowerCase().includes('phone') || device.display_name?.toLowerCase().includes('android') || device.display_name?.toLowerCase().includes('ios') ? (
                                <Smartphone className="w-4 h-4" />
                              ) : (
                                <Laptop className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className={`font-bold text-xs truncate ${
                                  themeMode === 'dark' ? 'text-white' : 'text-slate-900'
                                }`}>
                                  {device.display_name || 'Unnamed session'}
                                </h5>
                                {isCurrent && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#23a55a]/20 text-[#23a55a] border border-[#23a55a]/40 shrink-0">
                                    This device
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#949ba4] font-mono flex-wrap">
                                <span className="truncate">ID: {device.device_id}</span>
                                {device.last_seen_ip && (
                                  <>
                                    <span>•</span>
                                    <span>IP: {device.last_seen_ip}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span>{formatRelativeTime(device.last_seen_ts)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1">
                            {isManaged ? (
                              <button
                                type="button"
                                onClick={() => handleManageSession(device)}
                                className="px-2.5 py-1 rounded-lg bg-[#5865f2]/20 hover:bg-[#5865f2]/30 text-[#5865f2] text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span>Manage</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            ) : !isCurrent ? (
                              <button
                                type="button"
                                onClick={() => handleManageSession(device)}
                                className="p-1.5 rounded-lg text-[#949ba4] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Remove this session"
                                aria-label={`Remove session ${device.display_name || device.device_id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Password Row */}
              <div
                className={`p-4 border rounded-2xl flex items-center justify-between gap-3 ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#5865f2]/20 text-[#5865f2]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs sm:text-sm font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Password
                    </h4>
                    <p className="text-[10px] text-[#949ba4]">Update your Matrix account password</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenPasswordChange}
                  className="px-3.5 py-1.5 rounded-xl bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Delete Account Row */}
              <button
                type="button"
                onClick={() => {
                  if (triggerHaptic) triggerHaptic();
                  setIsDeleteModalOpen(true);
                }}
                style={{ minHeight: '44px' }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#5865f2]/20 border border-[#5865f2]/40 text-[#f23f43] hover:bg-[#5865f2]/30 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span>Delete account</span>
              </button>
            </div>
          )}

          {currentTab === 'custom' && (() => {
            const fontSizes = [12, 14, 15, 16, 18, 20, 24];
            const currentSize = chatFontSize || 16;
            const fontIndex = fontSizes.indexOf(currentSize);
            const sliderIndex = fontIndex !== -1 ? fontIndex : 3;
            const sliderPct = (sliderIndex / 6) * 100;

            return (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Chat Font Size Card */}
              <div
                className={`p-3.5 border rounded-2xl flex flex-col gap-3 ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#5865f2]/20 text-[#5865f2]">
                      <Type className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold">Chat Font Size</h4>
                      <p className="text-[10px] text-[#949ba4]">Adjust message text size</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic?.();
                      onChatFontSizeChange?.(16);
                    }}
                    className="text-xs text-[#5865f2] hover:text-[#4752c4] hover:underline font-semibold cursor-pointer transition-colors"
                  >
                    Reset
                  </button>
                </div>

                <div className="px-1 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={6}
                    step={1}
                    value={sliderIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      onChatFontSizeChange?.(fontSizes[idx]);
                    }}
                    className="chat-size-slider w-full cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #5865f2 ${sliderPct}%, #4e5058 ${sliderPct}%)`,
                    }}
                    aria-label="Chat font size"
                  />

                  <div className="flex justify-between items-center mt-1.5 px-0.5 select-none">
                    {fontSizes.map((size, idx) => {
                      const isSelected = idx === sliderIndex;
                      return (
                        <span
                          key={size}
                          onClick={() => onChatFontSizeChange?.(size)}
                          className={`text-[10px] cursor-pointer transition-colors ${
                            isSelected
                              ? 'text-white font-bold'
                              : themeMode === 'dark'
                              ? 'text-[#949ba4] hover:text-[#b5bac1]'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {size}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147]' : 'bg-white border-slate-200'
                  }`}
                  style={{ fontSize: 'var(--chat-font-size)' }}
                >
                  <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
                    {user?.userName?.[0] || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-[#23a55a]">
                        {user?.userName || 'User'}
                      </span>
                      <span className="text-[10px] text-[#949ba4]">Today at 12:00 PM</span>
                    </div>
                    <p
                      className={`mt-0.5 leading-relaxed break-words ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-700'}`}
                      style={{ fontSize: 'var(--chat-font-size)' }}
                    >
                      This is how your chat text will look.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-3.5 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold">Theme Appearance</h4>
                    <p className="text-[10px] text-[#949ba4]">Switch between dark and light</p>
                  </div>
                </div>
                <div className={`flex items-center p-1 rounded-xl border ${themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147]' : 'bg-slate-200 border-slate-300'}`}>
                  <button
                    type="button"
                    onClick={() => onToggleTheme?.('dark')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      themeMode === 'dark' ? 'bg-[#5865f2] text-white' : 'text-slate-600'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTheme?.('light')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      themeMode === 'light' ? 'bg-[#5865f2] text-white' : 'text-slate-600'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              <div
                className={`p-3.5 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <Vibrate className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold">Haptic Feedback</h4>
                    <p className="text-[10px] text-[#949ba4]">Vibration feedback on taps</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleHaptic}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    hapticEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      hapticEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {onOpenNotifications && (
                <div
                  className={`p-3.5 border rounded-2xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#5865f2]/20 text-[#5865f2]">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold">Notifications & Matrix Push</h4>
                      <p className="text-[10px] text-[#949ba4]">In-app alerts, system push & reactions</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNotifications();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold text-xs shadow transition-all cursor-pointer"
                  >
                    Configure
                  </button>
                </div>
              )}
            </div>
            );
          })()}
        </div>

        <div
          className={`p-2.5 border-t shrink-0 ${
            themeMode === 'dark' ? 'bg-[#232428] border-[#202225]' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <FloatingBottomNav
            activeTab={currentTab}
            onSelectTab={(tab) => {
              if (triggerHaptic) triggerHaptic();
              setCurrentTab(tab);
            }}
            themeMode={themeMode}
            triggerHaptic={triggerHaptic}
            isEmbedded={true}
          />
        </div>

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
            <div
              className={`w-full max-w-sm p-5 border rounded-2xl shadow-2xl space-y-3.5 ${
                themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <h3 className="text-base font-bold">Log Out Confirmation</h3>
              <p className="text-xs text-[#949ba4]">
                Are you sure you want to end your Matrix encrypted session?
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#949ba4] hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    onClose();
                    onLogout?.();
                  }}
                  className="px-4 py-1.5 rounded-xl bg-[#da373c] hover:bg-[#ba2f34] text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <E2EEDebugModal
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        activeRoomId={activeRoomId}
      />

      {/* Remove Sessions Password Confirmation Modal */}
      {isPasswordPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => !isProcessingDelete && setIsPasswordPromptOpen(false)} />
          <div
            className={`relative z-10 w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${
              themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold">Confirm Session Removal</h3>
              </div>
              <button
                type="button"
                disabled={isProcessingDelete}
                onClick={() => setIsPasswordPromptOpen(false)}
                className="p-1 rounded-lg text-[#949ba4] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`text-xs ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-600'}`}>
              {pendingRemoveDescription}
            </p>

            <form onSubmit={handleConfirmDeleteSessions} className="space-y-4 pt-1">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  Matrix Account Password
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  value={passwordInput}
                  disabled={isProcessingDelete}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter your password to authorize"
                  className={`w-full text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                  }`}
                />
              </div>

              {passwordError && (
                <div className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isProcessingDelete}
                  onClick={() => setIsPasswordPromptOpen(false)}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    themeMode === 'dark' ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingDelete || !passwordInput}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#da373c] hover:bg-[#ba2f34] disabled:opacity-50 active:scale-95 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {isProcessingDelete && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isProcessingDelete ? 'Removing...' : 'Remove'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onLogout={onLogout}
        themeMode={themeMode}
        triggerHaptic={triggerHaptic}
      />

      {/* Password Change Dialog */}
      {isPasswordChangeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => !isChangingPassword && setIsPasswordChangeOpen(false)} />
          <div
            className={`relative z-10 w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${
              themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold">Change Account Password</h3>
              </div>
              <button
                type="button"
                disabled={isChangingPassword}
                onClick={() => setIsPasswordChangeOpen(false)}
                className="p-1 rounded-lg text-[#949ba4] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordChangeSubmit} className="space-y-4 pt-1">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  Current Password
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  value={currentPasswordInput}
                  disabled={isChangingPassword}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  placeholder="Enter current password"
                  className={`w-full text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPasswordInput}
                  disabled={isChangingPassword}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  className={`w-full text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPasswordInput}
                  disabled={isChangingPassword}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Confirm new password"
                  className={`w-full text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                  }`}
                />
              </div>

              {passwordChangeError && (
                <div className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordChangeError}</span>
                </div>
              )}

              {passwordChangeSuccess && (
                <div className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{passwordChangeSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isChangingPassword}
                  onClick={() => setIsPasswordChangeOpen(false)}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    themeMode === 'dark' ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword || !currentPasswordInput || !newPasswordInput}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 active:scale-95 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {isChangingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
