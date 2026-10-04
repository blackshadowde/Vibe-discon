import { getHomeserverUrl } from './matrix';
import { haptic, isNative } from '../native/platform';

export interface NotificationSettings {
  inAppNotifications: boolean;
  systemNotifications: boolean;
  notifyEveryMessage: boolean;
  reactionNotifications: 'all' | 'dm_only' | 'never';
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  showPreview: boolean;
}

export interface AppNotificationItem {
  id: string;
  type: 'message' | 'mention' | 'reaction' | 'system';
  title: string;
  body: string;
  senderName: string;
  senderId: string;
  senderAvatar?: string;
  roomId: string;
  roomName: string;
  timestamp: number;
  isRead: boolean;
  reactionEmoji?: string;
}

const SETTINGS_STORAGE_KEY = 'discordia_notification_settings';
const NOTIFICATIONS_STORAGE_KEY = 'discordia_notifications_list';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  inAppNotifications: true,
  systemNotifications: true,
  notifyEveryMessage: false,
  reactionNotifications: 'dm_only',
  soundEnabled: true,
  vibrateEnabled: true,
  showPreview: true,
};


export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to load notification settings:', e);
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

export function saveNotificationSettings(
  settings: NotificationSettings,
  matrixClient?: any,
  accessToken?: string | null
): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    syncNotificationRulesWithMatrix(settings, matrixClient, accessToken).catch((err) => {
      console.warn('Matrix push rule sync note:', err);
    });
  } catch (e) {
    console.error('Failed to save notification settings:', e);
  }
}

export function loadNotifications(): AppNotificationItem[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // One-time cleanup of fake entries
        const filtered = parsed.filter(n => 
          n.id !== 'notif-1' && 
          n.id !== 'notif-2' && 
          n.senderId !== '@matrix-dev:matrix.org' && 
          n.senderId !== '@alice:matrix.org'
        );
        if (filtered.length !== parsed.length) {
          localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(filtered));
        }
        return filtered;
      }
    }
  } catch {}
  return [];
}

export function saveNotifications(notifications: AppNotificationItem[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  } catch (e) {
    console.warn('Failed to save notifications:', e);
  }
}

export function playNotificationSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.09);
    gain2.gain.setValueAtTime(0.16, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.32);
  } catch {}
}

export function triggerHapticNotification(): void {
  haptic().catch(() => {});
}

export async function requestSystemNotificationPermission(): Promise<NotificationPermission> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const status = await PushNotifications.requestPermissions();
      return status.receive === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

export function dispatchSystemNotification(
  notification: AppNotificationItem,
  settings: NotificationSettings,
  onClick?: () => void
): boolean {
  if (isNative()) {
    return false; // Native background push notification is fully handled by OS + Capacitor push listeners
  }
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (!settings.systemNotifications) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    const bodyText = settings.showPreview ? notification.body : 'New message in ' + notification.roomName;
    const sysNotif = new Notification(notification.title, {
      body: bodyText,
      icon: notification.senderAvatar || '/icon-192.png',
      badge: '/icon-192.png',
      tag: `discordia-${notification.roomId}-${notification.id}`,
    });
    sysNotif.onclick = () => {
      window.focus();
      sysNotif.close();
      if (onClick) onClick();
    };
    return true;
  } catch (err) {
    console.warn('System notification error:', err);
    return false;
  }
}

export async function syncNotificationRulesWithMatrix(
  settings: NotificationSettings,
  client?: any,
  accessToken?: string | null
): Promise<{ success: boolean; rulesSynced: string[] }> {
  const token = accessToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
  const userId = localStorage.getItem('matrix_user_id');
  const rulesSynced: string[] = [];
  let clientSuccess = true;
  if (client) {
    try {
      if (typeof client.setPushRuleEnabled === 'function') {
        await client.setPushRuleEnabled('global', 'underride', '.m.rule.message', settings.notifyEveryMessage).catch(() => { clientSuccess = false; });
        rulesSynced.push('.m.rule.message (' + (settings.notifyEveryMessage ? 'all' : 'mentions only') + ')');
        const dmEnabled = settings.inAppNotifications || settings.systemNotifications;
        await client.setPushRuleEnabled('global', 'underride', '.m.rule.room_one_to_one', dmEnabled).catch(() => { clientSuccess = false; });
        rulesSynced.push('.m.rule.room_one_to_one (' + (dmEnabled ? 'enabled' : 'disabled') + ')');
        const reactionRuleEnabled = settings.reactionNotifications !== 'never';
        await client.setPushRuleEnabled('global', 'override', '.m.rule.reaction', reactionRuleEnabled).catch(() => { clientSuccess = false; });
        rulesSynced.push('.m.rule.reaction (' + settings.reactionNotifications + ')');
      }
    } catch (e) {
      console.warn('Matrix SDK push rule mapping note:', e);
      clientSuccess = false;
    }
  }

  let restSuccess = true;
  if (token) {
    try {
      const homeserver = getHomeserverUrl(userId);
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const response = await fetch(
        `${homeserver}/_matrix/client/v3/pushrules/global/underride/.m.rule.message/enabled`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ enabled: settings.notifyEveryMessage }),
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to update push rules: ${response.statusText}`);
      }
      if (!rulesSynced.includes('.m.rule.message')) {
        rulesSynced.push('.m.rule.message');
      }
    } catch (e) {
      console.warn('REST push rule note:', e);
      restSuccess = false;
    }
  }
  return { success: clientSuccess && restSuccess, rulesSynced };
}

export function evaluateEventForNotification(
  event: {
    type: string;
    sender: string;
    content: any;
    roomId?: string;
  },
  currentUserId: string,
  currentRoomId: string,
  isDirectRoom: boolean,
  settings: NotificationSettings,
  isAppForeground: boolean
): { shouldNotify: boolean; type: 'message' | 'mention' | 'reaction'; previewText: string } {
  if (event.sender === currentUserId) {
    return { shouldNotify: false, type: 'message', previewText: '' };
  }
  if (isAppForeground && !settings.inAppNotifications && !settings.systemNotifications) {
    return { shouldNotify: false, type: 'message', previewText: '' };
  }
  const cleanCurrentId = currentUserId.replace('@', '').split(':')[0].toLowerCase();
  if (event.type === 'm.reaction') {
    if (settings.reactionNotifications === 'never') {
      return { shouldNotify: false, type: 'reaction', previewText: '' };
    }
    if (settings.reactionNotifications === 'dm_only' && !isDirectRoom) {
      return { shouldNotify: false, type: 'reaction', previewText: '' };
    }
    const relKey = event.content?.['m.relates_to']?.key || 'reaction';
    return {
      shouldNotify: true,
      type: 'reaction',
      previewText: `Reacted with ${relKey}`,
    };
  }
  if (event.type === 'm.room.message' || event.type === 'm.room.encrypted') {
    const body = event.content?.body || 'Encrypted message';
    const bodyLower = body.toLowerCase();
    const isMention = bodyLower.includes(`@${cleanCurrentId}`) || bodyLower.includes(currentUserId.toLowerCase());
    if (isAppForeground && event.roomId === currentRoomId) {
      return { shouldNotify: false, type: 'message', previewText: '' };
    }
    if (isMention) {
      return { shouldNotify: true, type: 'mention', previewText: body };
    }
    if (isDirectRoom) {
      return { shouldNotify: true, type: 'message', previewText: body };
    }
    if (settings.notifyEveryMessage) {
      return { shouldNotify: true, type: 'message', previewText: body };
    }
  }
  return { shouldNotify: false, type: 'message', previewText: '' };
}
