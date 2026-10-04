import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Smartphone,
  Radio,
  Volume2,
  Vibrate,
  Shield,
  MessageSquare,
  CheckCheck,
  Trash2,
  Send,
  Eye,
  Sliders,
  Terminal,
} from 'lucide-react';
import {
  NotificationSettings,
  AppNotificationItem,
  loadNotificationSettings,
  saveNotificationSettings,
  requestSystemNotificationPermission,
  playNotificationSound,
  triggerHapticNotification,
  dispatchSystemNotification,
} from '../services/notifications';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { resolveMxcToHttp } from '../services/matrix';
import { MatrixAvatar } from './MatrixAvatar';
import { getPushSubscription } from '../services/webPush';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotificationItem[];
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onNotificationClick: (item: AppNotificationItem) => void;
  onSendTestNotification?: () => void;
  matrixClient?: any;
  matrixToken?: string | null;
  themeMode?: 'dark' | 'light';
  triggerHaptic?: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearAll,
  onNotificationClick,
  onSendTestNotification,
  matrixClient,
  matrixToken,
  themeMode = 'dark',
  triggerHaptic,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'notifications-modal');
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings'>('inbox');
  const [filterType, setFilterType] = useState<'all' | 'mentions' | 'reactions'>('all');
  const [settings, setSettings] = useState<NotificationSettings>(loadNotificationSettings);
  const [systemPermission, setSystemPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [matrixSyncSuccess, setMatrixSyncSuccess] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadNotificationSettings());
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setSystemPermission(Notification.permission);
      }
      
      // Collect debug info
      (async () => {
        let swReg: any = null;
        if ('serviceWorker' in navigator) {
          swReg = await navigator.serviceWorker.getRegistration();
        }
        
        let sub: any = null;
        try {
          sub = await getPushSubscription();
        } catch {}
        
        let pushers: any = null;
        if (matrixClient && typeof matrixClient.getPushers === 'function') {
          try {
            pushers = await matrixClient.getPushers();
          } catch {}
        }
        
        setDebugInfo({
          swRegistered: !!swReg,
          permission: Notification.permission,
          subscriptionEndpoint: sub ? sub.endpoint : 'Not Subscribed',
          pushers: pushers ? JSON.stringify(pushers) : 'None',
        });
      })();
    }
  }, [isOpen, matrixClient]);

  if (!isOpen) return null;

  const handleUpdateSetting = async <K extends keyof NotificationSettings>(
    key: K,
    val: NotificationSettings[K]
  ) => {
    if (triggerHaptic) triggerHaptic();
    const next = { ...settings, [key]: val };
    setSettings(next);
    saveNotificationSettings(next, matrixClient, matrixToken);
    setMatrixSyncSuccess(true);
    setTimeout(() => setMatrixSyncSuccess(false), 3000);
  };

  const handleRequestPermission = async () => {
    if (triggerHaptic) triggerHaptic();
    const perm = await requestSystemNotificationPermission();
    setSystemPermission(perm);
    if (perm === 'granted') {
      handleUpdateSetting('systemNotifications', true);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredNotifications = notifications.filter((n) => {
    if (filterType === 'mentions') return n.type === 'mention';
    if (filterType === 'reactions') return n.type === 'reaction';
    return true;
  });

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative w-full max-w-2xl h-full sm:h-[88vh] border rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 ${
          themeMode === 'dark'
            ? 'bg-[#313338] border-[#3f4147] text-[#dbdee1]'
            : 'bg-white border-slate-200 text-slate-950'
        }`}
      >
        <div
          className={`h-14 px-4 border-b flex items-center justify-between shrink-0 shadow-xs ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225]' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (triggerHaptic) triggerHaptic();
                onClose();
              }}
              className="min-w-[40px] min-h-[40px] -ml-1 rounded-xl flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
              title="Navigate Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-[#dbdee1]" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#5865f2]/20 text-[#5865f2] shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <h2 className={`font-bold text-base sm:text-lg truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="w-5 h-5 rounded-full text-[11px] font-bold bg-[#f23f43] text-white flex items-center justify-center shrink-0 shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#1e1f22] p-1 rounded-xl border border-[#3f4147]/60">
            <button
              onClick={() => {
                if (triggerHaptic) triggerHaptic();
                setActiveTab('inbox');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[32px] ${
                activeTab === 'inbox'
                  ? 'bg-[#5865f2] text-white shadow-xs'
                  : 'text-[#949ba4] hover:text-white'
              }`}
            >
              Inbox
            </button>
            <button
              onClick={() => {
                if (triggerHaptic) triggerHaptic();
                setActiveTab('settings');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[32px] flex items-center gap-1 ${
                activeTab === 'settings'
                  ? 'bg-[#5865f2] text-white shadow-xs'
                  : 'text-[#949ba4] hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>

        {activeTab === 'inbox' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0 ${
                themeMode === 'dark' ? 'bg-[#2b2d31]/50 border-[#232428]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                {(['all', 'mentions', 'reactions'] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => {
                      if (triggerHaptic) triggerHaptic();
                      setFilterType(ft);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer min-h-[30px] ${
                      filterType === ft
                        ? 'bg-[#5865f2] text-white'
                        : themeMode === 'dark'
                        ? 'bg-[#1e1f22] text-[#949ba4] hover:text-white'
                        : 'bg-slate-200 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {ft}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && (
                  <button
                    onClick={() => {
                      if (triggerHaptic) triggerHaptic();
                      onMarkAllAsRead();
                    }}
                    className="p-1.5 rounded-lg text-[#949ba4] hover:text-white transition-colors cursor-pointer"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      if (triggerHaptic) triggerHaptic();
                      onClearAll();
                    }}
                    className="p-1.5 rounded-lg text-[#949ba4] hover:text-red-400 transition-colors cursor-pointer"
                    title="Clear notification list"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 no-scrollbar pb-safe">
              {filteredNotifications.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center text-[#949ba4]">
                  <div className="w-14 h-14 rounded-2xl bg-[#1e1f22] border border-[#3f4147] flex items-center justify-center mb-3 text-[#5865f2]">
                    <Bell className="w-7 h-7" />
                  </div>
                  <h4 className={`text-base font-bold mb-1 ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    All caught up!
                  </h4>
                  <p className="text-xs max-w-sm">
                    No new notifications right now. When people mention you, react, or send messages, they'll show up here.
                  </p>
                </div>
              ) : (
                filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (triggerHaptic) triggerHaptic();
                      onNotificationClick(item);
                      onClose();
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 group relative ${
                      item.isRead
                        ? themeMode === 'dark'
                          ? 'bg-[#2b2d31]/60 border-[#383a40]/50 hover:bg-[#35373c]'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        : themeMode === 'dark'
                        ? 'bg-[#2b2d31] border-[#5865f2]/40 shadow-xs hover:bg-[#35373c]'
                        : 'bg-indigo-50/40 border-[#5865f2]/30 hover:bg-indigo-50'
                    }`}
                  >
                    {!item.isRead && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#5865f2]" />
                    )}
                    <div className="relative shrink-0 ml-1">
                      <MatrixAvatar
                        mxcUrl={item.senderAvatar}
                        name={item.senderName}
                        size={40}
                        className="ring-1 ring-black/30"
                      />
                      {item.reactionEmoji && (
                        <span className="absolute -bottom-1 -right-1 text-sm bg-[#1e1f22] rounded-full p-0.5 border border-[#3f4147]">
                          {item.reactionEmoji}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`text-xs sm:text-sm font-bold truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] text-[#949ba4] shrink-0 font-medium">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <p className={`text-xs line-clamp-2 leading-relaxed ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-700'}`}>
                        {item.body}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-[#949ba4] mt-1.5">
                        <span className="font-semibold text-[#5865f2]">#{item.roomName}</span>
                        <span>•</span>
                        <span>Matrix Encrypted Timeline</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar pb-safe">
            {!import.meta.env.VITE_VAPID_PUBLIC_KEY && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-3">
                <Shield className="w-5 h-5" />
                <span>Push notifications are not configured.</span>
              </div>
            )}
            {matrixSyncSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4" />
                <span>Matrix push rules updated and synchronized with homeserver!</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  In-App Notifications
                </h3>
                <p className="text-[11px] text-[#949ba4] mt-0.5">
                  Configure alerts and behavior while Vibe is active on your screen.
                </p>
              </div>

              <div
                className={`p-4 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="p-2.5 rounded-xl bg-[#5865f2]/20 text-[#5865f2] shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Get notifications within Vibe
                    </h4>
                    <p className="text-xs text-[#949ba4] mt-0.5">
                      Show in-app banner alerts and unread badges while using the workspace.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateSetting('inAppNotifications', !settings.inAppNotifications)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.inAppNotifications ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                  }`}
                  role="switch"
                  aria-checked={settings.inAppNotifications}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      settings.inAppNotifications ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="w-4 h-4 text-[#5865f2]" />
                    <span className="text-xs font-semibold">Notification Sound</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateSetting('soundEnabled', !settings.soundEnabled);
                      if (!settings.soundEnabled) playNotificationSound();
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      settings.soundEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        settings.soundEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div
                  className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Vibrate className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold">Haptic Feedback</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateSetting('vibrateEnabled', !settings.vibrateEnabled);
                      if (!settings.vibrateEnabled) triggerHapticNotification();
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      settings.vibrateEnabled ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        settings.vibrateEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className={`h-px ${themeMode === 'dark' ? 'bg-[#3f4147]' : 'bg-slate-200'}`} />

            <div className="space-y-3">
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  System Notifications
                </h3>
                <p className="text-[11px] text-[#949ba4] mt-0.5">
                  Native push notifications delivered to your device when the app is in the background.
                </p>
              </div>

              <div
                className={`p-4 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Get notifications outside of Vibe
                    </h4>
                    <p className="text-xs text-[#949ba4] mt-0.5">
                      Receive native OS system push notifications on your phone or desktop.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateSetting('systemNotifications', !settings.systemNotifications)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.systemNotifications ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                  }`}
                  role="switch"
                  aria-checked={settings.systemNotifications}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      settings.systemNotifications ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {systemPermission !== 'granted' && (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Shield className="w-4 h-4 shrink-0" />
                    <span>Device push notifications require system permission.</span>
                  </div>
                  <button
                    onClick={handleRequestPermission}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg shrink-0 cursor-pointer text-[11px] shadow-sm active:scale-95"
                  >
                    Enable Push
                  </button>
                </div>
              )}

              <div
                className={`p-4 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Notify on every new message in conversations
                    </h4>
                    <p className="text-xs text-[#949ba4] mt-0.5">
                      When enabled, all timeline messages send push notifications. When disabled, only @mentions and direct messages notify you.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateSetting('notifyEveryMessage', !settings.notifyEveryMessage)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.notifyEveryMessage ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                  }`}
                  role="switch"
                  aria-checked={settings.notifyEveryMessage}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      settings.notifyEveryMessage ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div
                className={`p-3.5 border rounded-xl flex items-center justify-between ${
                  themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Eye className="w-4 h-4 text-[#5865f2]" />
                  <span className="text-xs font-semibold">Show Message Preview in System Push</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateSetting('showPreview', !settings.showPreview)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    settings.showPreview ? 'bg-[#5865f2]' : 'bg-[#3f4147]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      settings.showPreview ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className={`h-px ${themeMode === 'dark' ? 'bg-[#3f4147]' : 'bg-slate-200'}`} />

            <div className="space-y-3">
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  Reaction Notifications
                </h3>
                <p className="text-[11px] text-[#949ba4] mt-0.5">
                  Choose when you want to receive alerts when others react to your messages.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  {
                    id: 'all',
                    label: 'All Messages',
                    desc: 'Get notified whenever someone reacts to your messages in any channel or conversation.',
                  },
                  {
                    id: 'dm_only',
                    label: 'Only Direct Messages',
                    desc: 'Only receive reaction notifications in 1-on-1 private direct message rooms.',
                  },
                  {
                    id: 'never',
                    label: 'Never',
                    desc: 'Silence all emoji reaction notifications completely.',
                  },
                ].map((opt) => {
                  const isSelected = settings.reactionNotifications === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleUpdateSetting('reactionNotifications', opt.id as any)}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? themeMode === 'dark'
                            ? 'bg-[#5865f2]/15 border-[#5865f2] text-white shadow-xs'
                            : 'bg-indigo-50 border-[#5865f2] text-slate-900 shadow-xs'
                          : themeMode === 'dark'
                          ? 'bg-[#2b2d31] border-[#3f4147] text-[#949ba4] hover:bg-[#35373c]'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-[#5865f2]' : ''}`}>
                          {opt.label}
                        </div>
                        <p className="text-[11px] text-[#949ba4] mt-0.5 leading-relaxed">{opt.desc}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-[#5865f2] bg-[#5865f2]' : 'border-[#4e5058]'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`h-px ${themeMode === 'dark' ? 'bg-[#3f4147]' : 'bg-slate-200'}`} />

            <div className={`p-4 border rounded-2xl ${themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147]' : 'bg-slate-100 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#5865f2]" />
                  <span>Push Notification Debug</span>
                </span>
              </div>
              {debugInfo && (
                <div className="space-y-1 text-[11px] font-mono text-[#949ba4]">
                  <div>SW Registered: <span className="text-white">{debugInfo.swRegistered ? 'Yes' : 'No'}</span></div>
                  <div>Permission: <span className="text-white">{debugInfo.permission}</span></div>
                  <div className="truncate">Endpoint: <span className="text-white">{debugInfo.subscriptionEndpoint}</span></div>
                  <div className="truncate">Pushers: <span className="text-white">{debugInfo.pushers}</span></div>
                </div>
              )}
              <div className="mt-3 p-2 bg-[#5865f2]/10 rounded-lg text-[10px] text-[#5865f2] border border-[#5865f2]/20">
                <strong>Send Test:</strong> Message this account from another account with the app closed to test background pushes.
              </div>
            </div>

            <div className={`p-4 border rounded-2xl ${themeMode === 'dark' ? 'bg-[#1e1f22] border-[#3f4147]' : 'bg-slate-100 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-[#5865f2]" />
                  <span>Matrix Push Rules Engine Status</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Synchronized
                </span>
              </div>
              <div className="space-y-1 text-[11px] font-mono text-[#949ba4]">
                <div>Homeserver: <span className="text-white">https://matrix.org</span></div>
                <div>Push Rule <span className="text-[#5865f2]">.m.rule.message</span>: <span className="text-white">{settings.notifyEveryMessage ? 'Enabled (All Messages)' : 'Mentions Only'}</span></div>
                <div>Push Rule <span className="text-[#5865f2]">.m.rule.room_one_to_one</span>: <span className="text-white">Enabled</span></div>
                <div>Reaction Filter: <span className="text-white">{settings.reactionNotifications}</span></div>
                <div>System Push API: <span className="text-white">{typeof window !== 'undefined' && 'Notification' in window ? 'Supported' : 'Unavailable'}</span></div>
              </div>
            </div>
          </div>
        )}

        <div
          className={`px-4 py-3 border-t flex items-center justify-between text-xs text-[#949ba4] shrink-0 pb-safe ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225]' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div />
          <button
            onClick={() => {
              if (triggerHaptic) triggerHaptic();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-[#383a40] hover:bg-[#404249] active:scale-95 text-white font-semibold transition-all cursor-pointer min-h-[36px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
