import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  User,
  Shield,
  Trash2,
  Sliders,
  Camera,
  Check,
  Lock,
  Moon,
  Sun,
  Vibrate,
  LogOut,
  Upload,
  Sparkles,
  Bell,
  Bug,
  Laptop,
  Smartphone,
  RefreshCw,
  X,
  KeyRound,
  AlertCircle,
  ChevronRight,
  Database,
  History,
  ExternalLink,
  FolderDown,
} from 'lucide-react';
import { DownloadsSettingsView } from './DownloadsSettingsView';
import {
  isLinkPreviewsEnabled,
  setLinkPreviewsEnabled,
  isEncryptedLinkPreviewsEnabled,
  setEncryptedLinkPreviewsEnabled,
} from '../utils/linkPreviewSettings';
// Removed FirebaseUser import
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

import { E2EEDebugModal } from './E2EEDebugModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { EncryptionKeysModal } from './EncryptionKeysModal';
import { BackupMessagesModal } from './BackupMessagesModal';
import { RestoreMessageHistoryModal } from './RestoreMessageHistoryModal';
import { ensureMatrixReady, matrixWithPasswordAuth, getKeysOverview, getBackupStatus, BackupStatus } from '../services/matrix';
import { Avatar } from './Avatar';

interface MatrixDeviceItem {
  device_id: string;
  display_name?: string;
  last_seen_ip?: string;
  last_seen_ts?: number;
}

function formatRelativeTime(ts?: number): string {
  if (!ts) return 'Unknown';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'account' | 'security' | 'custom' | 'management' | 'downloads';
  matrixUserId: string;
  matrixDisplayName: string;
  onUpdateDisplayName: (name: string) => void;
  currentUser: any | null;
  onLogout: () => void;
  hapticEnabled: boolean;
  onToggleHaptic: () => void;
  themeMode: 'dark' | 'light';
  onToggleTheme: (mode: 'dark' | 'light') => void;
  triggerHaptic: () => void;
  userAvatarUrl?: string;
  onUpdateAvatarUrl?: (fileOrUrl: File | string) => void;
  onOpenNotifications?: () => void;
  activeRoomId?: string;
  matrixToken?: string | null;
  chatFontSize?: number;
  onChatFontSizeChange?: (size: number) => void;
  onOpenAbout?: () => void;
}


const FONT_SIZES = [12, 14, 15, 16, 18, 20, 24];

// Helper to generate a consistent color from a string
const getHashColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
  return colors[Math.abs(hash) % colors.length];
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'account',
  matrixUserId,
  matrixDisplayName,
  onUpdateDisplayName,
  currentUser,
  onLogout,
  hapticEnabled,
  onToggleHaptic,
  themeMode,
  onToggleTheme,
  triggerHaptic,
  userAvatarUrl,
  onUpdateAvatarUrl,
  onOpenNotifications,
  activeRoomId,
  matrixToken,
  chatFontSize,
  onChatFontSizeChange,
  onOpenAbout,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'settings-modal');
  const [activeTab, setActiveTab] = useState<'account' | 'security' | 'custom' | 'management' | 'downloads'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  const [displayNameInput, setDisplayNameInput] = useState(matrixDisplayName);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [avatarSuccessMsg, setAvatarSuccessMsg] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRealMatrixSession = Boolean(
    (matrixToken || localStorage.getItem('matrix_token')) && matrixUserId
  );

  const [sessionsList, setSessionsList] = useState<MatrixDeviceItem[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionFeedbackMessage, setSessionFeedbackMessage] = useState<string | null>(null);

  // UIA Password Modal State
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([]);
  const [pendingRemoveDescription, setPendingRemoveDescription] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const [isEncryptionKeysOpen, setIsEncryptionKeysOpen] = useState(false);
  const [keysOverviewStatus, setKeysOverviewStatus] = useState<'Ready' | 'Not set up' | 'Problem'>('Not set up');
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  const [linkPreviewsEnabled, setLocalLinkPreviewsEnabled] = useState(isLinkPreviewsEnabled);
  const [encryptedLinkPreviewsEnabled, setLocalEncryptedLinkPreviewsEnabled] = useState(isEncryptedLinkPreviewsEnabled);

  useEffect(() => {
    if (isOpen) {
      setLocalLinkPreviewsEnabled(isLinkPreviewsEnabled());
      setLocalEncryptedLinkPreviewsEnabled(isEncryptedLinkPreviewsEnabled());
    }
  }, [isOpen]);

  const loadKeysOverview = useCallback(async () => {
    try {
      const overview = await getKeysOverview();
      setKeysOverviewStatus(overview.status);
    } catch {
      setKeysOverviewStatus('Problem');
    }
  }, []);

  const loadBackupStatus = useCallback(async () => {
    try {
      const status = await getBackupStatus();
      setBackupStatus(status);
    } catch {
      setBackupStatus(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'security') {
      loadKeysOverview();
      loadBackupStatus();
    }
  }, [isOpen, activeTab, loadKeysOverview, loadBackupStatus]);

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    } catch (err: any) {
      setPasswordChangeError(err?.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const loadSessions = useCallback(async () => {
    if (!isRealMatrixSession) return;
    setIsLoadingSessions(true);
    try {
      const client = await ensureMatrixReady();
      if (client && typeof client.getDevices === 'function') {
        const res = await client.getDevices();
        const curDevId = client.getDeviceId() || localStorage.getItem('matrix_device_id') || '';
        setCurrentDeviceId(curDevId);
        const rawList: MatrixDeviceItem[] = res?.devices || [];
        const sorted = [...rawList].sort((a, b) => {
          if (a.device_id === curDevId) return -1;
          if (b.device_id === curDevId) return 1;
          return (b.last_seen_ts || 0) - (a.last_seen_ts || 0);
        });
        setSessionsList(sorted);
      }
    } catch (err: any) {
      console.warn('[Matrix] Load sessions error:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [isRealMatrixSession]);

  useEffect(() => {
    if (isOpen && activeTab === 'security' && isRealMatrixSession) {
      loadSessions();
    }
  }, [isOpen, activeTab, isRealMatrixSession, loadSessions]);

  const handleOpenRemoveOtherSessions = () => {
    triggerHaptic();
    const otherDevices = sessionsList.filter((d) => d.device_id !== currentDeviceId);
    if (otherDevices.length === 0) {
      setSessionFeedbackMessage('No other sessions');
      setTimeout(() => setSessionFeedbackMessage(null), 4000);
      return;
    }
    setPendingRemoveIds(otherDevices.map((d) => d.device_id));
    setPendingRemoveDescription('This signs those sessions out. This device stays signed in.');
    setPasswordInput('');
    setPasswordError(null);
    setIsPasswordPromptOpen(true);
  };

  const handleOpenRemoveSingleSession = (device: MatrixDeviceItem) => {
    triggerHaptic();
    setPendingRemoveIds([device.device_id]);
    setPendingRemoveDescription(`This signs out "${device.display_name || 'Unnamed session'}" (${device.device_id}).`);
    setPasswordInput('');
    setPasswordError(null);
    setIsPasswordPromptOpen(true);
  };

  const handleConfirmDeleteSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    if (!pendingRemoveIds || pendingRemoveIds.length === 0) {
      setSessionFeedbackMessage('No other sessions');
      setIsPasswordPromptOpen(false);
      return;
    }

    setIsProcessingDelete(true);
    setPasswordError(null);

    try {
      const client = await ensureMatrixReady();
      if (!client) throw new Error('Matrix client not initialized');

      const myUserId = client.getUserId() || (matrixUserId.startsWith('@') ? matrixUserId : `@${matrixUserId}:matrix.org`);
      let authSession = '';

      // First attempt to get UIA session ID
      try {
        await (client as any).deleteMultipleDevices(pendingRemoveIds);
      } catch (e: any) {
        if (e?.data?.session) {
          authSession = e.data.session;
        } else if (e?.httpStatus === 401 && e?.data?.session) {
          authSession = e.data.session;
        } else if (e?.errcode === 'M_FORBIDDEN' || e?.data?.errcode === 'M_FORBIDDEN') {
          throw new Error('Incorrect password');
        }
      }

      const authDict: any = {
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: myUserId,
        },
        password: passwordInput,
      };
      if (authSession) {
        authDict.session = authSession;
      }

      await (client as any).deleteMultipleDevices(pendingRemoveIds, authDict);

      // On success
      const count = pendingRemoveIds.length;
      setSessionFeedbackMessage(`${count} ${count === 1 ? 'session' : 'sessions'} removed`);
      setTimeout(() => setSessionFeedbackMessage(null), 5000);
      setIsPasswordPromptOpen(false);
      setPasswordInput('');
      setPendingRemoveIds([]);
      await loadSessions();
    } catch (err: any) {
      console.warn('[Matrix Sessions] Delete devices error:', err);
      if (
        err?.message === 'Incorrect password' ||
        err?.data?.errcode === 'M_FORBIDDEN' ||
        err?.errcode === 'M_FORBIDDEN' ||
        err?.data?.error?.toLowerCase().includes('password') ||
        err?.message?.toLowerCase().includes('invalid password')
      ) {
        setPasswordError('Incorrect password');
      } else {
        setPasswordError(err?.data?.error || err?.message || 'Failed to remove session');
      }
    } finally {
      setIsProcessingDelete(false);
    }
  };

  if (!isOpen) return null;

  const currentDp = userAvatarUrl || currentUser?.photoURL || null;

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic();
    onUpdateDisplayName(displayNameInput.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTabSwitch = (tab: typeof activeTab) => {
    triggerHaptic();
    setActiveTab(tab);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      triggerHaptic();
      if (onUpdateAvatarUrl) {
        onUpdateAvatarUrl(file);
        setAvatarSuccessMsg(true);
        setTimeout(() => setAvatarSuccessMsg(false), 3000);
      }
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    triggerHaptic();
    if (onUpdateAvatarUrl) {
      onUpdateAvatarUrl(url);
      setAvatarSuccessMsg(true);
      setTimeout(() => setAvatarSuccessMsg(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <div
        className={`relative z-10 w-full max-w-4xl h-full sm:h-[88vh] border rounded-none sm:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden ${
          themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-[#dbdee1]' : 'bg-white border-slate-200 text-slate-950'
        }`}
      >
        <div
          className={`md:hidden p-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225]' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            onClick={() => {
              triggerHaptic();
              onClose();
            }}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              themeMode === 'dark' ? 'text-[#949ba4] hover:text-white hover:bg-[#35373c]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title="Navigate Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'account', label: 'Account', icon: User },
              { id: 'security', label: 'Security', icon: Shield },
              { id: 'downloads', label: 'Downloads', icon: FolderDown },
              { id: 'custom', label: 'Custom', icon: Sliders },
              { id: 'management', label: 'Manage', icon: Trash2 },
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabSwitch(tab.id as any)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#5865f2] text-white shadow-xs'
                      : themeMode === 'dark'
                      ? 'text-[#949ba4] hover:text-white hover:bg-[#35373c]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title={tab.label}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span className={isActive ? 'inline' : 'hidden xs:inline'}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={`hidden md:flex md:w-64 border-r p-4 flex-col justify-between shrink-0 ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 px-2 mb-3">
              <button
                onClick={() => {
                  triggerHaptic();
                  onClose();
                }}
                className="p-1 -ml-1 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
                title="Navigate Back"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'
              }`}>
                User Settings
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {[
                { id: 'account', label: 'Account Information', icon: User },
                { id: 'security', label: 'Sign-in & Security', icon: Shield },
                { id: 'downloads', label: 'Downloads & Storage', icon: FolderDown },
                { id: 'custom', label: 'Customisation', icon: Sliders },
                { id: 'management', label: 'Account Management', icon: Trash2 },
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabSwitch(tab.id as any)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-[44px] ${
                      isActive
                        ? themeMode === 'dark' ? 'bg-[#404249] text-white shadow-xs' : 'bg-slate-200 text-slate-900 shadow-xs'
                        : themeMode === 'dark' ? 'text-[#b5bac1] hover:bg-[#35373c] hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <IconComponent className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
              {onOpenNotifications && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    onClose();
                    onOpenNotifications();
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-[44px] mt-2 border border-[#5865f2]/40 text-[#5865f2] bg-[#5865f2]/10 hover:bg-[#5865f2]/20`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-[#5865f2]" />
                    <span>Notifications & Push</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#5865f2] text-white">NEW</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setIsDebugOpen(true);
                }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-[44px] mt-2 border border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
              >
                <div className="flex items-center gap-2.5">
                  <Bug className="w-4 h-4 text-emerald-400" />
                  <span>E2EE Debug</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">DIAG</span>
              </button>
            </nav>
          </div>
        </div>

        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${themeMode === 'dark' ? 'bg-[#313338]' : 'bg-white'}`}>
          <div
            className={`h-14 px-6 border-b hidden md:flex items-center gap-3 shrink-0 ${
              themeMode === 'dark' ? 'border-[#202225] bg-[#313338]' : 'border-slate-200 bg-white'
            }`}
          >
            <button
              onClick={() => {
                triggerHaptic();
                onClose();
              }}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                themeMode === 'dark' ? 'text-[#949ba4] hover:text-white hover:bg-[#35373c]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Navigate Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className={`font-bold text-base sm:text-lg capitalize ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {activeTab === 'account' && 'Account Information'}
              {activeTab === 'security' && 'How you sign into your account'}
              {activeTab === 'downloads' && 'Downloads & Storage'}
              {activeTab === 'custom' && 'Customisation & Appearance'}
              {activeTab === 'management' && 'Account Management'}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar pb-safe">
            {savedSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Settings saved successfully!</span>
              </div>
            )}
            {avatarSuccessMsg && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
                <Sparkles className="w-4 h-4" />
                <span>Profile picture updated globally across all views!</span>
              </div>
            )}

            {activeTab === 'account' && (
              <form onSubmit={handleSaveAccount} className="space-y-6 max-w-xl">
                <div
                  className={`p-4 border rounded-2xl flex flex-col sm:flex-row items-center gap-4 ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div
                    className="relative group cursor-pointer"
                    onClick={() => {
                      triggerHaptic();
                      fileInputRef.current?.click();
                    }}
                    title="Click to Upload Custom Avatar Image"
                  >
                    <Avatar 
                      mxcUrl={userAvatarUrl} 
                      fallbackText={matrixDisplayName[0]} 
                      fallbackBg={getHashColor(matrixUserId)}
                      className="w-20 h-20 rounded-full ring-4 ring-[#5865f2] shadow-lg transition-transform group-hover:scale-105"
                      onClick={() => {
                        triggerHaptic();
                        fileInputRef.current?.click();
                      }}
                    />
                    <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1 cursor-pointer">
                      <Camera className="w-5 h-5" />
                      <span>Upload</span>
                    </div>
                  </div>
                  <div className="text-center sm:text-left flex-1">
                    <h4 className={`font-bold text-base ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>{matrixDisplayName}</h4>
                    <p className={`text-xs font-mono mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>@{matrixUserId}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic();
                          fileInputRef.current?.click();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Photo</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`p-4 border rounded-2xl ${themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'}`}>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      className={`w-full text-sm px-3.5 py-2.5 rounded-xl border focus:outline-hidden focus:border-[#5865f2] ${
                        themeMode === 'dark' ? 'bg-[#1e1f22] text-white border-[#3f4147]' : 'bg-slate-100 text-slate-900 border-slate-300'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                      Username / Matrix ID
                    </label>
                    <input
                      type="text"
                      disabled
                      value={matrixUserId}
                      className={`w-full text-sm px-3.5 py-2.5 rounded-xl border cursor-not-allowed ${
                        themeMode === 'dark' ? 'bg-[#1e1f22]/60 text-[#949ba4] border-[#3f4147]' : 'bg-slate-200 text-slate-500 border-slate-300'
                      }`}
                    />
                  </div>

                </div>

                <div className={`pt-4 border-t flex justify-end items-center gap-4 ${themeMode === 'dark' ? 'border-[#3f4147]' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setShowLogoutConfirm(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer min-h-[44px]"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                  <button
                    type="submit"
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white font-semibold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6 max-w-xl">
                {/* Encryption & Keys Card */}
                <div
                  onClick={() => {
                    triggerHaptic();
                    setIsEncryptionKeysOpen(true);
                  }}
                  className={`p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-sm truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Encryption & Keys
                      </h4>
                      <p className={`text-xs truncate mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                        Message backup, devices and recovery key
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        keysOverviewStatus === 'Ready'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : keysOverviewStatus === 'Not set up'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }`}
                    >
                      {keysOverviewStatus}
                    </span>
                    <ChevronRight className="w-5 h-5 text-[#949ba4]" />
                  </div>
                </div>

                {/* Message Backup Card */}
                <div
                  onClick={() => {
                    triggerHaptic();
                    setIsBackupModalOpen(true);
                  }}
                  className={`p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-sm truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Message backup
                      </h4>
                      <p className={`text-xs truncate mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                        {backupStatus?.backupEnabledOnThisDevice
                          ? 'Active on this device'
                          : backupStatus?.serverBackupExists
                          ? 'Backup exists on server'
                          : 'Back up your encrypted messages securely'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        backupStatus?.backupEnabledOnThisDevice || backupStatus?.serverBackupExists
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {backupStatus?.backupEnabledOnThisDevice || backupStatus?.serverBackupExists
                        ? 'Active'
                        : 'Not set up'}
                    </span>
                    <ChevronRight className="w-5 h-5 text-[#949ba4]" />
                  </div>
                </div>

                {/* Restore Message History Card */}
                <div
                  onClick={() => {
                    triggerHaptic();
                    setIsRestoreModalOpen(true);
                  }}
                  className={`p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
                      <History className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-sm truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Restore message history
                      </h4>
                      <p className={`text-xs truncate mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                        {backupStatus?.backupEnabledOnThisDevice
                          ? 'History key loaded on this device'
                          : 'Restore encrypted message keys using recovery key'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        backupStatus?.backupEnabledOnThisDevice
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : backupStatus?.serverBackupExists
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      {backupStatus?.backupEnabledOnThisDevice
                        ? 'Ready'
                        : backupStatus?.serverBackupExists
                        ? 'Backup available'
                        : 'No backup'}
                    </span>
                    <ChevronRight className="w-5 h-5 text-[#949ba4]" />
                  </div>
                </div>

                {/* Link Previews Settings Card */}
                <div
                  className={`p-5 border rounded-2xl space-y-4 ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        Link Previews
                      </h4>
                      <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                        Rich media and website summaries
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-1">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h5 className={`text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-800'}`}>
                          Enable Link Previews
                        </h5>
                        <p className={`text-xs mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                          Fetch titles and thumbnails when sending or viewing URLs
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={linkPreviewsEnabled}
                        onClick={() => {
                          triggerHaptic();
                          const next = !linkPreviewsEnabled;
                          setLocalLinkPreviewsEnabled(next);
                          setLinkPreviewsEnabled(next);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          linkPreviewsEnabled ? 'bg-[#5865f2]' : 'bg-[#4e5058]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            linkPreviewsEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-[#3f4147]/50">
                      <div>
                        <h5 className={`text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-800'}`}>
                          Link previews in encrypted chats
                        </h5>
                        <p className={`text-xs mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                          Allow homeserver to generate link previews in end-to-end encrypted rooms. Note: the homeserver will see the previewed URL.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={encryptedLinkPreviewsEnabled}
                        disabled={!linkPreviewsEnabled}
                        onClick={() => {
                          triggerHaptic();
                          const next = !encryptedLinkPreviewsEnabled;
                          setLocalEncryptedLinkPreviewsEnabled(next);
                          setEncryptedLinkPreviewsEnabled(next);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          !linkPreviewsEnabled ? 'opacity-50 cursor-not-allowed bg-[#4e5058]' : encryptedLinkPreviewsEnabled ? 'bg-[#5865f2]' : 'bg-[#4e5058]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            encryptedLinkPreviewsEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-5 border rounded-2xl space-y-4 ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#5865f2]/20 text-[#5865f2]">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>Change Password</h4>
                      <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>Update your account password securely</p>
                    </div>
                  </div>

                  <form onSubmit={handlePasswordChangeSubmit} className="space-y-3 pt-1">
                    <div>
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                        Current Password
                      </label>
                      <input
                        type="password"
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
                      <div className="px-3 py-2 rounded-xl bg-red-500/25 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{passwordChangeError}</span>
                      </div>
                    )}

                    {passwordChangeSuccess && (
                      <div className="px-3 py-2 rounded-xl bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{passwordChangeSuccess}</span>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isChangingPassword || !currentPasswordInput || !newPasswordInput || !confirmPasswordInput}
                        className="min-h-[38px] px-5 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 active:scale-95 text-white text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
                      >
                        {isChangingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>{isChangingPassword ? 'Updating...' : 'Update Password'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                <div
                  className={`p-4 border rounded-2xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <Bug className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>E2EE Debug</h4>
                      <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>Read-only Megolm cryptographic session diagnostics & device keys</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setIsDebugOpen(true);
                    }}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  >
                    Open Debug Panel
                  </button>
                </div>

                {/* Real Matrix Sessions Section */}
                {isRealMatrixSession && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                          Active Sessions
                        </h4>
                        <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                          Devices logged into this Matrix account
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadSessions()}
                          disabled={isLoadingSessions}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            themeMode === 'dark' ? 'text-[#949ba4] hover:text-white hover:bg-[#35373c]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                          }`}
                          title="Refresh sessions"
                        >
                          <RefreshCw className={`w-4 h-4 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                        </button>
                        {sessionsList.filter((d) => d.device_id !== currentDeviceId).length > 0 && (
                          <button
                            type="button"
                            onClick={handleOpenRemoveOtherSessions}
                            className="px-3 py-1.5 rounded-xl border border-red-500/60 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Remove other sessions
                          </button>
                        )}
                      </div>
                    </div>

                    {sessionFeedbackMessage && (
                      <div className="px-3.5 py-2 rounded-xl bg-[#5865f2]/15 border border-[#5865f2]/40 text-[#5865f2] text-xs font-medium animate-in fade-in flex items-center justify-between">
                        <span>{sessionFeedbackMessage}</span>
                        <button
                          type="button"
                          onClick={() => setSessionFeedbackMessage(null)}
                          className="text-xs opacity-70 hover:opacity-100 ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {isLoadingSessions && sessionsList.length === 0 ? (
                      <div className={`p-6 border rounded-2xl text-center text-xs ${
                        themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147] text-[#949ba4]' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        Loading active sessions...
                      </div>
                    ) : sessionsList.length === 0 ? (
                      <div className={`p-6 border rounded-2xl text-center text-xs ${
                        themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147] text-[#949ba4]' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        No active sessions found.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {sessionsList.map((device) => {
                          const isCurrent = device.device_id === currentDeviceId;
                          return (
                            <div
                              key={device.device_id}
                              className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 ${
                                themeMode === 'dark'
                                  ? isCurrent ? 'bg-[#2b2d31] border-[#5865f2]/40 ring-1 ring-[#5865f2]/20' : 'bg-[#2b2d31] border-[#3f4147]'
                                  : isCurrent ? 'bg-slate-50 border-[#5865f2]/40 ring-1 ring-[#5865f2]/20' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`p-2.5 rounded-xl shrink-0 ${
                                  isCurrent ? 'bg-[#23a55a]/20 text-[#23a55a]' : 'bg-[#404249]/40 text-[#949ba4]'
                                }`}>
                                  {device.display_name?.toLowerCase().includes('phone') || device.display_name?.toLowerCase().includes('android') || device.display_name?.toLowerCase().includes('ios') ? (
                                    <Smartphone className="w-5 h-5" />
                                  ) : (
                                    <Laptop className="w-5 h-5" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className={`font-bold text-xs sm:text-sm truncate ${
                                      themeMode === 'dark' ? 'text-white' : 'text-slate-900'
                                    }`}>
                                      {device.display_name || 'Unnamed session'}
                                    </h5>
                                    {isCurrent && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#23a55a]/20 text-[#23a55a] border border-[#23a55a]/40 shrink-0">
                                        This device
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-[#949ba4] font-mono flex-wrap">
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

                              {!isCurrent && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRemoveSingleSession(device)}
                                  className="p-2 rounded-xl text-[#949ba4] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                                  title="Remove this session"
                                  aria-label={`Remove session ${device.display_name || device.device_id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'downloads' && (
              <DownloadsSettingsView themeMode={themeMode} />
            )}

            {activeTab === 'custom' && (() => {
              const currentFontSize = chatFontSize || 16;
              const currentFontIndex = FONT_SIZES.indexOf(currentFontSize);
              const sliderIndex = currentFontIndex !== -1 ? currentFontIndex : 3;
              const sliderPct = (sliderIndex / 6) * 100;

              return (
              <div className="space-y-6 max-w-xl">
                {/* Chat Font Scaling Card */}
                <div
                  className={`p-4 border rounded-2xl ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <label className={`block text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                      Chat Font Scaling
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic();
                        if (onChatFontSizeChange) onChatFontSizeChange(16);
                      }}
                      className="text-xs text-[#5865f2] hover:text-[#4752c4] hover:underline font-medium cursor-pointer transition-colors"
                    >
                      Reset to default
                    </button>
                  </div>

                  <div className="px-1 py-1">
                    <input
                      type="range"
                      min={0}
                      max={6}
                      step={1}
                      value={sliderIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        if (onChatFontSizeChange) onChatFontSizeChange(FONT_SIZES[idx]);
                      }}
                      className="chat-font-slider w-full cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #5865f2 ${sliderPct}%, #4e5058 ${sliderPct}%)`,
                      }}
                      aria-label="Chat font size"
                    />

                    {/* 7 size labels evenly spaced */}
                    <div className="flex justify-between items-center mt-2 px-0.5 text-xs select-none">
                      {FONT_SIZES.map((size, idx) => {
                        const isSelected = idx === sliderIndex;
                        return (
                          <span
                            key={size}
                            onClick={() => {
                              if (onChatFontSizeChange) onChatFontSizeChange(size);
                            }}
                            className={`cursor-pointer transition-colors ${
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

                  {/* Live preview box */}
                  <div className="mt-4 p-3.5 rounded-xl bg-[#1e1f22] border border-[#3f4147] flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
                      V
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-[#5865f2] text-sm">Vibe</span>
                        <span className="text-[10px] text-[#949ba4]">Today at 12:00 PM</span>
                      </div>
                      <p
                        className="mt-1 text-[#dbdee1] leading-relaxed break-words"
                        style={{ fontSize: 'var(--chat-font-size)' }}
                      >
                        This is how your chat text will look.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 border rounded-2xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                      <Vibrate className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>Haptic Feedback</h4>
                      <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>Enable vibrations on button taps and actions</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleHaptic();
                      triggerHaptic();
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      hapticEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                    }`}
                    role="switch"
                    aria-checked={hapticEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        hapticEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div
                  className={`p-4 border rounded-2xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                      {themeMode === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>Theme Preference</h4>
                      <p className={`text-xs ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>Switch between dark and light appearance</p>
                    </div>
                  </div>
                  <div className={`flex items-center p-1 rounded-xl border ${themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147]' : 'bg-slate-200 border-slate-300'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTheme('dark');
                        triggerHaptic();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        themeMode === 'dark' ? 'bg-[#5865f2] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTheme('light');
                        triggerHaptic();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        themeMode === 'light' ? 'bg-[#5865f2] text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Light
                    </button>
                  </div>
                </div>

                {/* About Vibe Card */}
                <div
                  onClick={() => {
                    triggerHaptic();
                    onOpenAbout?.();
                  }}
                  className={`p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:border-[#5865f2] ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="p-2.5 rounded-xl bg-[#5865f2]/20 text-[#5865f2] shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-sm truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        About Vibe
                      </h4>
                      <p className={`text-xs truncate mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                        Version, team and how Vibe keeps you safe
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <ChevronRight className="w-5 h-5 text-[#949ba4]" />
                  </div>
                </div>
              </div>
            );
          })()}

            {activeTab === 'management' && (
              <div className="space-y-4 max-w-xl">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-red-400 text-sm">Delete Account</h4>
                    <p className={`text-xs mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-600'}`}>Permanently erase your account data and rooms.</p>
                  </div>
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setIsDeleteAccountOpen(true);
                    }}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-[#da373c] hover:bg-[#ba2f34] active:scale-95 text-white text-xs font-semibold transition-all cursor-pointer shrink-0"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <E2EEDebugModal
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        activeRoomId={activeRoomId}
      />

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-md p-6 border rounded-2xl shadow-2xl space-y-4 ${
              themeMode === 'dark' ? 'bg-[#313338] border-[#3f4147] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <h3 className="text-lg font-bold">Log Out Confirmation</h3>
            <p className={`text-sm ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-600'}`}>
              Are you sure you want to log out?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setShowLogoutConfirm(false);
                }}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  themeMode === 'dark' ? 'bg-[#4e5058] hover:bg-[#6d6f78] text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setShowLogoutConfirm(false);
                  onClose();
                  onLogout();
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#da373c] hover:bg-[#ba2f34] active:scale-95 text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer"
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}

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

      <DeleteAccountModal
        isOpen={isDeleteAccountOpen}
        onClose={() => setIsDeleteAccountOpen(false)}
        onLogout={() => {
          setIsDeleteAccountOpen(false);
          onClose();
          onLogout();
        }}
        themeMode={themeMode}
        triggerHaptic={triggerHaptic}
      />

      <EncryptionKeysModal
        isOpen={isEncryptionKeysOpen}
        onClose={() => setIsEncryptionKeysOpen(false)}
        themeMode={themeMode}
        onOpenE2EEDebug={() => setIsDebugOpen(true)}
      />

      <BackupMessagesModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onSuccess={() => {
          loadKeysOverview();
          loadBackupStatus();
        }}
        themeMode={themeMode}
      />

      <RestoreMessageHistoryModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onSuccess={() => {
          loadKeysOverview();
          loadBackupStatus();
        }}
        themeMode={themeMode}
      />
    </div>
  );
};
