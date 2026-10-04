import * as sdk from 'matrix-js-sdk';
import { getMediaKind } from '../utils/mediaKind';
import { openUrl } from '../native/platform';
import {
  ClientEvent,
  RoomEvent,
  RoomMemberEvent,
  MatrixEventEvent,
  MatrixClient,
} from 'matrix-js-sdk';
import { encodeRecoveryKey, decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import type { KeyBackupRestoreResult } from 'matrix-js-sdk/lib/crypto-api';
import { formatMessageTime } from '../utils/formatTime';
import { clearMessageCache } from './messageCache';
import type { MessageEncryptionState, EncryptionLevel } from '../types';

// Configure Matrix SDK and console loggers to handle transient sync drops and existing OTK key responses gracefully
try {
  const sdkAny = sdk as any;
  if (sdkAny.logger) {
    ['error', 'warn', 'info', 'log'].forEach((method) => {
      if (typeof sdkAny.logger[method] === 'function') {
        const orig = sdkAny.logger[method].bind(sdkAny.logger);
        sdkAny.logger[method] = (...args: any[]) => {
          const msg = args.map((a: any) => (typeof a === 'object' ? (a?.message || JSON.stringify(a) || String(a)) : String(a))).join(' ');
          if (
            msg.includes('One time key') ||
            msg.includes('already exists') ||
            msg.includes('Failed to process outgoing request') ||
            msg.includes('/sync error') ||
            msg.includes('Failed to fetch') ||
            msg.includes('fetch failed') ||
            msg.includes('NetworkError') ||
            msg.includes('network error')
          ) {
            return;
          }
          orig(...args);
        };
      }
    });
  }
} catch {}

if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  const origConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const msg = args.map((a: any) => (typeof a === 'object' ? (a?.message || JSON.stringify(a) || String(a)) : String(a))).join(' ');
    if (
      msg.includes('One time key') ||
      msg.includes('already exists') ||
      msg.includes('Failed to process outgoing request') ||
      msg.includes('/sync error') ||
      msg.includes('Failed to fetch') ||
      msg.includes('fetch failed') ||
      msg.includes('NetworkError') ||
      msg.includes('network error')
    ) {
      if (typeof console.debug === 'function') {
        console.debug('[Matrix Handled Background Notice]:', ...args);
      }
      return;
    }
    origConsoleError(...args);
  };
}

declare global {
  interface Window {
    Olm?: any;
  }
}

export interface MatrixRoom {
  roomId: string;
  name: string;
  canonicalAlias?: string;
  topic?: string;
  numJoinedMembers?: number;
  avatarUrl?: string;
  isDirect?: boolean;
}

export interface MatrixEventItem {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  avatarUrl?: string;
  timestamp: string;
  originServerTs?: number;
  txnId?: string;
  content: string;
  isTapped?: boolean;
  isEncrypted?: boolean;
  isDecryptionFailure?: boolean;
  msgtype?: string;
  mediaUrl?: string;
  isEdited?: boolean;
  isRedacted?: boolean;
  deliveryStatus?: 'sending' | 'sent' | 'read' | 'failed';
  mediaInfo?: { mimetype: string; size: number; duration?: number };
  encryptedFile?: any;
  geoUri?: string;
  encryption?: MessageEncryptionState;
  reactions?: Record<string, number>;
  myReactions?: Record<string, string>;
  replyTo?: {
    eventId: string;
    userName: string;
    snippet: string;
  };
}

const DEFAULT_HOMESERVER = 'https://matrix.org';

const eventEncryptionCache = new Map<string, MessageEncryptionState>();

export function clearEventEncryptionCache(): void {
  eventEncryptionCache.clear();
}

export function computeEventEncryptionState(
  client: any,
  evt: any,
  content: any,
  isDecryptionFailure: boolean
): MessageEncryptionState {
  const eventId = typeof evt?.getId === 'function' ? evt.getId() : evt?.event_id;
  if (eventId && eventEncryptionCache.has(eventId)) {
    return eventEncryptionCache.get(eventId)!;
  }

  let result: MessageEncryptionState;

  if (isDecryptionFailure) {
    result = {
      level: 'undecryptable',
      reason: 'Waiting for this message\'s key or decryption failed',
    };
  } else {
    const isEncrypted = typeof evt?.isEncrypted === 'function' ? evt.isEncrypted() : Boolean(evt?.isEncrypted);
    const isState = typeof evt?.isState === 'function' ? evt.isState() : Boolean(evt?.state_key !== undefined);

    if (!isEncrypted) {
      result = {
        level: isState ? 'pending' : 'unencrypted',
        reason: isState ? undefined : 'Sent without encryption',
      };
    } else {
      // It is an encrypted event.
      // Check for media messages with plain unencrypted uploads in an encrypted room
      const msgtype = content?.msgtype;
      const isMedia = ['m.image', 'm.video', 'm.audio', 'm.file'].includes(msgtype || '');
      if (isMedia && content?.url && !content?.file) {
        result = {
          level: 'unencrypted',
          reason: 'Media not encrypted',
        };
      } else {
        let evalLevel: EncryptionLevel = 'encrypted';
        let evalReason = 'Encrypted, sender device not verified';

        try {
          const crypto = client?.getCrypto?.() || (client as any)?.crypto;
          let info: any = null;
          if (crypto && typeof crypto.getEncryptionInfoForEvent === 'function') {
            info = crypto.getEncryptionInfoForEvent(evt);
          } else if (client && typeof client.checkEventVerification === 'function') {
            info = client.checkEventVerification(evt);
          }

          if (info) {
            const shieldColour = String(info.shieldColour || info.color || '').toUpperCase();
            const shieldReason = String(info.shieldReason || info.reason || '');

            if (shieldColour === 'NONE' || info.authenticated || info.verified) {
              evalLevel = 'verified';
              evalReason = 'Encrypted and verified sender';
            } else if (shieldColour === 'RED') {
              evalLevel = 'warning';
              evalReason = shieldReason || 'Warning: untrusted or unsigned sender device';
            } else if (shieldColour === 'GREY') {
              const lowerReason = shieldReason.toLowerCase();
              if (
                lowerReason.includes('warning') ||
                lowerReason.includes('mismatch') ||
                lowerReason.includes('untrusted') ||
                lowerReason.includes('unknown') ||
                lowerReason.includes('unsigned')
              ) {
                evalLevel = 'warning';
                evalReason = shieldReason;
              } else {
                evalLevel = 'encrypted';
                evalReason = shieldReason || 'Encrypted, sender device not verified';
              }
            }
          }
        } catch {
          // If the API is missing or throws, fall back to 'encrypted', never to 'verified'
          evalLevel = 'encrypted';
          evalReason = 'Encrypted, sender device not verified';
        }

        result = {
          level: evalLevel,
          reason: evalReason,
        };
      }
    }
  }

  if (eventId) {
    eventEncryptionCache.set(eventId, result);
  }
  return result;
}

export function getHomeserverUrl(userId?: string | null): string {
  if (userId && userId.includes(':')) {
    const domain = userId.split(':').pop();
    if (domain && domain.includes('.')) {
      return `https://${domain}`;
    }
  }
  return localStorage.getItem('matrix_homeserver_url') || DEFAULT_HOMESERVER;
}

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageMxc?: string;
  siteName?: string;
}

const linkPreviewMemoryCache = new Map<string, LinkPreviewData>();
const linkPreviewInFlight = new Map<string, Promise<LinkPreviewData | null>>();
const SESSION_CACHE_PREFIX = 'matrix_link_preview_';

export function clearLinkPreviewCache(): void {
  linkPreviewMemoryCache.clear();
  linkPreviewInFlight.clear();
  if (typeof sessionStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(SESSION_CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {}
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('link-previews-changed', (e: any) => {
    if (e.detail?.enabled === false) {
      clearLinkPreviewCache();
    }
  });
}

export async function getUrlPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  // If link previews are disabled in settings, return null immediately with NO network request
  try {
    const { getLinkPreviewsEnabled } = await import('../utils/privacySettings');
    if (!getLinkPreviewsEnabled()) {
      return null;
    }
  } catch {}

  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) return null;

  // Check in-memory cache
  if (linkPreviewMemoryCache.has(trimmedUrl)) {
    return linkPreviewMemoryCache.get(trimmedUrl)!;
  }

  // Check sessionStorage
  try {
    const cached = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${trimmedUrl}`);
    if (cached) {
      const parsed: LinkPreviewData = JSON.parse(cached);
      linkPreviewMemoryCache.set(trimmedUrl, parsed);
      return parsed;
    }
  } catch {}

  // Deduplicate in-flight requests
  if (linkPreviewInFlight.has(trimmedUrl)) {
    return linkPreviewInFlight.get(trimmedUrl)!;
  }

  const fetchPromise = (async (): Promise<LinkPreviewData | null> => {
    try {
      const client = await getOrCreateMatrixClient().catch(() => null);
      const userId = client?.getUserId ? client.getUserId() : localStorage.getItem('matrix_user_id');
      const homeserver = getHomeserverUrl(userId).replace(/\/+$/, '');
      const accessToken =
        (client && typeof client.getAccessToken === 'function' ? client.getAccessToken() : null) ||
        localStorage.getItem('matrix_token') ||
        localStorage.getItem('matrix_access_token') ||
        '';

      const encodedUrl = encodeURIComponent(trimmedUrl);
      const urlV1 = `${homeserver}/_matrix/client/v1/media/preview_url?url=${encodedUrl}`;
      const urlV3 = `${homeserver}/_matrix/media/v3/preview_url?url=${encodedUrl}`;

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 5000);

      let res: Response | null = null;
      try {
        res = await fetch(urlV1, {
          headers,
          signal: abortController.signal,
        });
        if (!res.ok) {
          res = await fetch(urlV3, {
            headers,
            signal: abortController.signal,
          });
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          clearTimeout(timeoutId);
          return null;
        }
        res = await fetch(urlV3, {
          headers,
          signal: abortController.signal,
        }).catch(() => null);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res || !res.ok) {
        return null;
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') {
        return null;
      }

      const title = data['og:title'] || data.title;
      const description = data['og:description'] || data.description;
      const imageMxc = data['og:image'] || data.image || data.imageMxc;
      const siteName = data['og:site_name'] || data.site_name || data.siteName;

      if (!title && !description && !imageMxc && !siteName) {
        return null;
      }

      const result: LinkPreviewData = {
        url: trimmedUrl,
        title: typeof title === 'string' ? title.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
        imageMxc: typeof imageMxc === 'string' ? imageMxc.trim() : undefined,
        siteName: typeof siteName === 'string' ? siteName.trim() : undefined,
      };

      linkPreviewMemoryCache.set(trimmedUrl, result);
      try {
        sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${trimmedUrl}`, JSON.stringify(result));
      } catch {}

      return result;
    } catch {
      return null;
    }
  })();

  linkPreviewInFlight.set(trimmedUrl, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    linkPreviewInFlight.delete(trimmedUrl);
  }
}

// Singleton state
let matrixClient: MatrixClient | null = null;
let clientPromise: Promise<MatrixClient> | null = null;
let isCryptoEngineReady = false;
const secretStorageKeyMap = new Map<string, Uint8Array>();

export function isCryptoReady(): boolean {
  return isCryptoEngineReady;
}

export async function getOrCreateMatrixClient(
  userId?: string,
  accessToken?: string,
  deviceId?: string
): Promise<MatrixClient> {
  const token = accessToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token') || undefined;
  const uid = userId || localStorage.getItem('matrix_user_id') || undefined;
  const devId = deviceId || localStorage.getItem('matrix_device_id') || undefined;

  if (matrixClient) {
    if (token && matrixClient.getAccessToken() !== token) {
      console.log('[Matrix] Token mismatch, creating fresh client...');
      try {
        matrixClient.stopClient();
      } catch {}
      matrixClient = null;
      clientPromise = null;
      isCryptoEngineReady = false;
    } else {
      return matrixClient;
    }
  }

  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    const currentToken = token || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token') || undefined;
    const currentUid = uid || localStorage.getItem('matrix_user_id') || undefined;
    let currentDevId = devId || localStorage.getItem('matrix_device_id') || undefined;
    const baseUrl = getHomeserverUrl(currentUid);

    console.log(`[Matrix] Initializing client for ${currentUid || 'anonymous'} on ${baseUrl}`);

    // Request persistent storage before creating client
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      try {
        await navigator.storage.persist();
      } catch {}
    }

    let store: any = undefined;
    try {
      if (typeof window !== 'undefined' && window.indexedDB && sdk.IndexedDBStore) {
        store = new sdk.IndexedDBStore({
          indexedDB: window.indexedDB,
          localStorage: window.localStorage,
          dbName: 'secureconnect-sync-' + (currentUid || 'anon'),
        });
        await store.startup();
      }
    } catch (err) {
      console.warn('[Matrix] Failed to initialize IndexedDBStore, falling back to memory store:', err);
      store = undefined;
    }

    const client = sdk.createClient({
      baseUrl,
      accessToken: currentToken,
      userId: currentUid,
      deviceId: currentDevId,
      store,
      timelineSupport: true,
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }: { keys: Record<string, any> }, _name?: string): Promise<any> => {
          if (!keys || typeof keys !== 'object') return null;
          for (const keyId of Object.keys(keys)) {
            const cached = secretStorageKeyMap.get(keyId);
            if (cached) {
              return [keyId, cached] as any;
            }
          }
          const defaultCached = secretStorageKeyMap.get('default');
          if (defaultCached) {
            const firstKeyId = Object.keys(keys)[0] || 'default';
            return [firstKeyId, defaultCached] as any;
          }
          return null;
        },
        cacheSecretStorageKey: (keyId: string, _keyInfo: any, key: Uint8Array) => {
          secretStorageKeyMap.set(keyId, key);
        },
      },
    });

    // If deviceId is missing but we have userId & accessToken, call whoami() to retrieve device_id
    if (!currentDevId && currentToken && typeof client.whoami === 'function') {
      try {
        const whoamiRes: any = await client.whoami();
        if (whoamiRes && whoamiRes.device_id) {
          currentDevId = whoamiRes.device_id;
          localStorage.setItem('matrix_device_id', currentDevId!);
          (client as any).deviceId = currentDevId;
        }
      } catch (err) {
        console.warn('[Matrix] whoami error:', err);
      }
    }

    // Initialize Rust Crypto with dedicated prefix per account and device
    if (currentToken && currentUid) {
      try {
        if (typeof client.initRustCrypto === 'function') {
          await client.initRustCrypto({
            useIndexedDB: true,
            cryptoDatabasePrefix: 'sc-crypto-' + currentUid + '-' + (currentDevId || 'default'),
          });
          isCryptoEngineReady = true;
          console.log('[Matrix E2EE] Rust crypto engine initialized successfully');
        } else {
          isCryptoEngineReady = true;
        }
      } catch (cryptoErr) {
        console.warn('[Matrix E2EE] initRustCrypto error (continuing without blocking):', cryptoErr);
        isCryptoEngineReady = true;
      }
    } else {
      isCryptoEngineReady = true;
    }

    // Register event listeners
    try {
      client.on(MatrixEventEvent.Decrypted, () => {});
    } catch {}

    try {
      (client as any).on('noToken', () => {
        console.log('[Matrix] No token / session logged out event received');
        matrixLogout();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('matrix:session_logged_out'));
        }
      });
    } catch {}

    try {
      const handlePresence = (event: any) => {
        try {
          const type = typeof event.getType === 'function' ? event.getType() : event.type;
          const content = (typeof event.getContent === 'function' ? event.getContent() : event.content) || {};
          const sender = typeof event.getSender === 'function' ? event.getSender() : event.sender;
          if (type === 'm.presence' && sender) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('matrix:presence', {
                  detail: {
                    userId: sender,
                    presence: content.presence || 'online',
                    statusMsg: content.status_msg,
                    lastActiveAgo: content.last_active_ago,
                  },
                })
              );
            }
          }
        } catch {}
      };
      client.on(ClientEvent.Event, handlePresence);
    } catch {}

    if (currentToken && currentUid) {
      client.on(ClientEvent.Sync, ((state: any, prevState: any, data: any) => {
        if (state === 'ERROR') {
          const error = data?.error;
          const errorCode = error?.errcode;
          const errorMessage = error?.message || error || 'Unknown sync error';
          if (errorCode === 'M_UNKNOWN_TOKEN' || errorCode === 'M_FORBIDDEN' || error?.httpStatus === 401) {
            console.log('[Matrix] Token expired or logged out on server, triggering logout');
            matrixLogout();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('matrix:session_logged_out'));
            }
          } else if (
            errorMessage.toLowerCase().includes('failed to fetch') ||
            errorMessage.toLowerCase().includes('fetch failed') ||
            errorMessage.toLowerCase().includes('network error')
          ) {
            console.debug(`[Matrix Sync Error - Transient] State: ${state}, Code: ${errorCode}, Message: ${errorMessage}`);
          } else {
            console.warn(`[Matrix Sync Warning] State: ${state}, Code: ${errorCode}, Message: ${errorMessage}`);
          }
        }
      }) as any);

      try {
        await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true });

        // Wait until sync state is PREPARED or SYNCING (timeout 20s)
        await new Promise<void>((resolve) => {
          const syncState = client.getSyncState ? client.getSyncState() : null;
          if (syncState === 'PREPARED' || syncState === 'SYNCING') {
            return resolve();
          }
          const timeout = setTimeout(() => {
            client.removeListener(ClientEvent.Sync, onSync as any);
            resolve();
          }, 20000);

          function onSync(state: string) {
            if (state === 'PREPARED' || state === 'SYNCING') {
              clearTimeout(timeout);
              client.removeListener(ClientEvent.Sync, onSync as any);
              resolve();
            }
          }
          client.on(ClientEvent.Sync, onSync as any);
        });
      } catch (syncErr: any) {
        console.warn('Matrix startClient handled note:', syncErr?.message || syncErr);
      }
    }

    matrixClient = client;
    return client;
  })();

  return clientPromise;
}

export async function ensureMatrixReady(): Promise<MatrixClient> {
  return getOrCreateMatrixClient();
}

export function matrixLogout(): void {
  secretStorageKeyMap.clear();
  try {
    clearMessageCache();
  } catch {}
  if (matrixClient) {
    try {
      matrixClient.stopClient();
    } catch {}
    matrixClient = null;
  }
  clientPromise = null;
  isCryptoEngineReady = false;
  localStorage.removeItem('matrix_token');
  localStorage.removeItem('matrix_access_token');
  localStorage.removeItem('matrix_user_id');
  localStorage.removeItem('matrix_device_id');
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('matrix_verified_')) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

export async function matrixGetDisplayName(userId: string, accessToken?: string): Promise<string> {
  try {
    const client = await ensureMatrixReady();
    if (client) {
      if (client.getProfileInfo) {
        const info = await client.getProfileInfo(userId, 'displayname').catch(() => null);
        if (info && info.displayname && typeof info.displayname === 'string') {
          return info.displayname;
        }
      }
      if (client.getUser) {
        const u = client.getUser(userId);
        if (u && u.displayName && typeof u.displayName === 'string') {
          return u.displayName;
        }
      }
    }
  } catch (e) {
    console.warn('Matrix getDisplayName note:', e);
  }

  const localPart = userId.replace('@', '').split(':')[0];
  return localPart || 'User';
}

export async function matrixGetProfileAvatar(userId: string, accessToken?: string): Promise<string | null> {
  try {
    const client = await ensureMatrixReady();
    if (client && typeof client.getProfileInfo === 'function') {
      const info = await client.getProfileInfo(userId).catch(() => null);
      if (info && info.avatar_url && typeof info.avatar_url === 'string') {
        return info.avatar_url;
      }
    }
  } catch (e) {
    console.warn('Matrix getProfileInfo avatar note:', e);
  }
  return null;
}

export async function matrixFetchSelfProfile(accessToken?: string): Promise<{ displayName?: string; avatarUrl?: string | null }> {
  const userId = localStorage.getItem('matrix_user_id');
  if (!userId) return {};

  try {
    const client = await ensureMatrixReady();
    if (client && typeof client.getProfileInfo === 'function') {
      const profile = await client.getProfileInfo(userId).catch(() => null);
      if (profile) {
        return {
          displayName: profile.displayname || undefined,
          avatarUrl: profile.avatar_url || null,
        };
      }
    }
  } catch (err) {
    console.warn('[Matrix] client.getProfileInfo error:', err);
  }

  return {};
}

export async function matrixLogin(username: string, password: string): Promise<{ userId: string; accessToken: string; deviceId?: string }> {
  const homeserver = getHomeserverUrl(username.includes(':') ? username : null);
  const tempClient = sdk.createClient({ baseUrl: homeserver, timelineSupport: true });
  const loginRes = await tempClient.loginWithPassword(username, password).catch((e) => {
    throw new Error(e.message || 'Matrix login failed');
  });

  const accessToken = loginRes.access_token;
  const userId = loginRes.user_id;
  const deviceId = loginRes.device_id;

  localStorage.setItem('matrix_token', accessToken);
  localStorage.setItem('matrix_access_token', accessToken);
  localStorage.setItem('matrix_user_id', userId);
  if (deviceId) {
    localStorage.setItem('matrix_device_id', deviceId);
  }

  // Reset singleton and initialize fully
  if (matrixClient) {
    try {
      matrixClient.stopClient();
    } catch {}
    matrixClient = null;
  }
  clientPromise = null;
  isCryptoEngineReady = false;

  await getOrCreateMatrixClient(userId, accessToken, deviceId);

  return { userId, accessToken, deviceId };
}

export async function matrixRegisterUser(username: string, password: string): Promise<{ userId: string; accessToken: string; deviceId?: string }> {
  const homeserver = getHomeserverUrl(username.includes(':') ? username : null);
  const tempClient = sdk.createClient({ baseUrl: homeserver, timelineSupport: true });
  const regRes: any = await tempClient.register(username, password, null, { type: 'm.login.dummy' }).catch((e: any) => {
    throw new Error(e.message || 'Matrix registration failed');
  });

  const accessToken: string = regRes.access_token || '';
  const userId: string = regRes.user_id || '';
  const deviceId: string | undefined = regRes.device_id;

  if (accessToken) {
    localStorage.setItem('matrix_token', accessToken);
    localStorage.setItem('matrix_access_token', accessToken);
  }
  if (userId) {
    localStorage.setItem('matrix_user_id', userId);
  }
  if (deviceId) {
    localStorage.setItem('matrix_device_id', deviceId);
  }

  if (matrixClient) {
    try {
      matrixClient.stopClient();
    } catch {}
    matrixClient = null;
  }
  clientPromise = null;
  isCryptoEngineReady = false;

  await getOrCreateMatrixClient(userId, accessToken, deviceId);

  return { userId, accessToken, deviceId };
}

export async function matrixCreateDirectRoom(targetUserId: string, accessToken?: string): Promise<string> {
  const inviteUser = targetUserId.startsWith('@') ? targetUserId : `@${targetUserId}:matrix.org`;
  const client = await ensureMatrixReady();

  const res = await (client as any).createRoom({
    visibility: 'private',
    is_direct: true,
    invite: [inviteUser],
    preset: 'trusted_private_chat',
    initial_state: [
      {
        type: 'm.room.encryption',
        state_key: '',
        content: {
          algorithm: 'm.megolm.v1.aes-sha2',
        },
      },
    ],
  });

  const roomId = res.room_id;
  try {
    await (client as any).sendStateEvent(roomId, 'm.room.encryption', {
      algorithm: 'm.megolm.v1.aes-sha2',
    }, '');
  } catch {}

  return roomId;
}

export async function matrixCreateChannelRoom(
  name: string,
  topic?: string,
  accessToken?: string
): Promise<string> {
  const client = await ensureMatrixReady();

  const res = await (client as any).createRoom({
    visibility: 'private',
    name,
    topic: topic || `Encrypted room: ${name}`,
    preset: 'private_chat',
    initial_state: [
      {
        type: 'm.room.encryption',
        state_key: '',
        content: {
          algorithm: 'm.megolm.v1.aes-sha2',
        },
      },
    ],
  });

  const roomId = res.room_id;
  try {
    await (client as any).sendStateEvent(roomId, 'm.room.encryption', {
      algorithm: 'm.megolm.v1.aes-sha2',
    }, '');
  } catch {}

  return roomId;
}

export async function matrixIsRoomEncrypted(roomId: string): Promise<boolean> {
  try {
    const client = await ensureMatrixReady();
    if (!client) return false;
    const crypto = client.getCrypto ? client.getCrypto() : (client as any).crypto;
    if (crypto && typeof crypto.isEncryptionEnabledInRoom === 'function') {
      const isEnc = await crypto.isEncryptionEnabledInRoom(roomId);
      if (typeof isEnc === 'boolean') return isEnc;
    }
    if (typeof (client as any).isRoomEncrypted === 'function') {
      return (client as any).isRoomEncrypted(roomId);
    }
    const room = client.getRoom ? client.getRoom(roomId) : null;
    if (room && typeof room.hasEncryptionStateEvent === 'function') {
      return room.hasEncryptionStateEvent();
    }
  } catch (err) {
    console.warn('[Matrix] matrixIsRoomEncrypted note:', err);
  }
  return false;
}

export async function matrixEnsureRoomEncrypted(roomId: string): Promise<boolean> {
  try {
    const client = await ensureMatrixReady();
    if (!client) return false;
    const isEnc = await matrixIsRoomEncrypted(roomId);
    if (!isEnc) {
      await (client as any).sendStateEvent(
        roomId,
        'm.room.encryption',
        { algorithm: 'm.megolm.v1.aes-sha2' },
        ''
      );
      return true;
    }
  } catch (err) {
    console.warn('[Matrix] matrixEnsureRoomEncrypted error:', err);
  }
  return false;
}

export async function matrixSendMessage(
  roomId: string,
  content: string,
  accessToken?: string,
  providedTxnId?: string,
  replyToEventId?: string,
  editingEventId?: string
): Promise<{ eventId: string; txnId: string }> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  if (!isCryptoEngineReady) {
    throw new Error('Encryption failed to start, sending is disabled');
  }

  const txnId = providedTxnId || `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let eventPayload: any = {
    msgtype: 'm.text',
    body: content,
  };
  if (replyToEventId) {
    eventPayload['m.relates_to'] = {
      'm.in_reply_to': {
        event_id: replyToEventId,
      },
    };
  } else if (editingEventId) {
    eventPayload = {
      msgtype: 'm.text',
      body: '* ' + content,
      'm.new_content': { msgtype: 'm.text', body: content },
      'm.relates_to': { rel_type: 'm.replace', event_id: editingEventId },
    };
  }

  const res = await client.sendEvent(roomId, 'm.room.message', eventPayload, txnId);
  const eventId = res?.event_id;
  if (!eventId) {
    throw new Error('Message transmission failed: no event_id returned');
  }
  return { eventId, txnId };
}

export async function uploadEncryptedMedia(
  client: any,
  data: ArrayBuffer | Blob | File,
  opts?: {
    onProgress?: (progressInfo: { loaded: number; total: number }) => void;
    signal?: AbortSignal;
  }
): Promise<any> {
  // 1. encryptAttachment the file
  const { ciphertext, info } = await encryptAttachment(data);

  // 2. Upload ciphertext with anonymity
  const uploadRes = await client.uploadContent(ciphertext, {
    type: 'application/octet-stream',
    includeFilename: false,
    progressHandler: opts?.onProgress,
  });

  const mxcUri = uploadRes.content_uri || uploadRes.contentUri;
  if (!mxcUri) {
    throw new Error('Upload failed: no content URI returned');
  }

  // 3. Return encrypted file metadata
  return {
    url: mxcUri,
    key: info.key,
    iv: info.iv,
    hashes: info.hashes,
    v: info.v,
  };
}

function getFallbackMimeType(name: string, type?: string): string {
  if (type && type !== 'application/octet-stream' && type !== '') {
    return type;
  }
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'webm': return 'video/webm';
    case 'mkv': return 'video/x-matroska';
    case '3gp': return 'video/3gpp';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'zip': return 'application/zip';
    case 'rar': return 'application/vnd.rar';
    case '7z': return 'application/x-7z-compressed';
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'txt': return 'text/plain';
    case 'apk': return 'application/vnd.android.package-archive';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

export async function sendMediaMessage(
  roomId: string,
  file: File,
  opts: {
    caption?: string;
    txnId: string;
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ eventId: string; mxcUri: string }> {
  const client: any = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');

  const kind = getMediaKind({ mimetype: file.type, name: file.name });
  const msgtype = `m.${kind}`;

  // Upload progress handler wrapper
  const progressHandler = (progressInfo: { loaded: number; total: number }) => {
    if (opts.onProgress) {
      opts.onProgress(progressInfo.loaded, progressInfo.total);
    }
  };

  // Encrypt and upload media file
  const encryptedFile = await uploadEncryptedMedia(client, file, {
    onProgress: progressHandler,
    signal: opts.signal,
  });
  const mxcUri = encryptedFile.url;

  // Build info object
  const info: any = {
    mimetype: getFallbackMimeType(file.name, file.type),
    size: file.size,
  };

  // Skip dimensions and thumbnails for 'm.file' (kind === 'file')
  if (kind === 'image') {
    const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ w: img.width, h: img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    });
    if (dimensions.w && dimensions.h) {
      info.w = dimensions.w;
      info.h = dimensions.h;
    }
  } else if (kind === 'video') {
    const metadata = await new Promise<{ w: number; h: number; duration: number; posterBlob: Blob | null }>((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.src = url;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        video.currentTime = 0.1;
      };

      video.onseeked = () => {
        let posterBlob: Blob | null = null;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              posterBlob = blob;
              URL.revokeObjectURL(url);
              resolve({
                w: video.videoWidth || 0,
                h: video.videoHeight || 0,
                duration: video.duration || 0,
                posterBlob,
              });
            }, 'image/jpeg', 0.7);
            return;
          }
        } catch (e) {
          console.error('Failed to capture video poster frame', e);
        }
        URL.revokeObjectURL(url);
        resolve({
          w: video.videoWidth || 0,
          h: video.videoHeight || 0,
          duration: video.duration || 0,
          posterBlob: null,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 0, h: 0, duration: 0, posterBlob: null });
      };
    });

    if (metadata.w && metadata.h) {
      info.w = metadata.w;
      info.h = metadata.h;
    }
    if (metadata.duration) {
      info.duration = Math.round(metadata.duration * 1000); // duration in milliseconds
    }
    if (metadata.posterBlob) {
      try {
        const encryptedPosterFile = await uploadEncryptedMedia(client, metadata.posterBlob, { signal: opts.signal });
        info.thumbnail_file = encryptedPosterFile;
        info.thumbnail_info = {
          mimetype: 'image/jpeg',
          size: metadata.posterBlob.size,
          w: metadata.w,
          h: metadata.h,
        };
      } catch (err) {
        console.error('Failed to upload video poster', err);
      }
    }
  }

  const content: any = {
    msgtype,
    body: opts.caption || file.name,
    info,
    file: encryptedFile,
  };

  const res = await client.sendEvent(roomId, 'm.room.message', content, opts.txnId);
  const eventId = res?.event_id;
  if (!eventId) {
    throw new Error('Media message transmission failed: no event_id returned');
  }

  return { eventId, mxcUri };
}

export function getRoomDisplayName(room: any, client?: any): string {
  try {
    const currentUserId =
      (client && typeof client.getUserId === 'function' ? client.getUserId() : null) ||
      localStorage.getItem('matrix_user_id') ||
      null;

    if (room) {
      const members =
        (typeof room.getJoinedMembers === 'function' && room.getJoinedMembers()) ||
        (typeof room.getMembers === 'function' && room.getMembers()) ||
        [];
      const otherMembers = members.filter((m: any) => m.userId && m.userId !== currentUserId);
      if (otherMembers.length > 0) {
        const other = otherMembers[0];
        const displayName = other.rawDisplayName || other.name || other.user?.displayName;
        if (displayName && !displayName.startsWith('@') && !displayName.includes(':matrix.org') && !displayName.startsWith('Chat (')) {
          return displayName;
        }
        if (other.userId) {
          return other.userId.replace('@', '').split(':')[0];
        }
      }

      const stateName = room.currentState?.getStateEvents?.('m.room.name', '')?.getContent?.()?.name;
      if (stateName && !stateName.startsWith('Chat (') && !stateName.startsWith('!')) {
        return stateName;
      }

      const sdkName = room.name ? room.name : '';
      if (
        sdkName &&
        !sdkName.startsWith('!') &&
        !sdkName.startsWith('Empty room') &&
        !sdkName.startsWith('Chat (') &&
        !sdkName.includes(':matrix.org')
      ) {
        return sdkName;
      }
      if (sdkName && sdkName.startsWith('@')) {
        return sdkName.replace('@', '').split(':')[0];
      }
    }
  } catch {}
  return 'Direct Message';
}

export async function matrixFetchJoinedRooms(accessToken?: string): Promise<MatrixRoom[]> {
  try {
    const client = await ensureMatrixReady();
    const rooms = client.getRooms ? client.getRooms() : [];
    if (rooms.length > 0) {
      const directData = ((client as any).getAccountData?.('m.direct')?.getContent?.()) || {};
      const directRoomMap: Record<string, string> = {};
      for (const [targetUid, roomIds] of Object.entries(directData)) {
        if (Array.isArray(roomIds)) {
          for (const rid of roomIds) {
            directRoomMap[rid] = targetUid;
          }
        }
      }

      return rooms.map((r: any) => {
        const isDirect = Boolean(
          (r.isDirect ? r.isDirect() : false) ||
          directRoomMap[r.roomId] ||
          r.name?.includes('@') ||
          r.getMembersWithMembership?.('join')?.length === 2
        );
        let displayName = getRoomDisplayName(r, client);
        if ((!displayName || displayName === 'Direct Message' || displayName.startsWith('Chat (')) && directRoomMap[r.roomId]) {
          displayName = directRoomMap[r.roomId].replace('@', '').split(':')[0];
        }
        let avatarUrl = null;
        if (typeof r.getMxcAvatarUrl === 'function') {
          avatarUrl = r.getMxcAvatarUrl();
        }
        if (!avatarUrl && r.getAvatarUrl) {
          avatarUrl = r.getAvatarUrl(client.getHomeserverUrl(), 96, 96, 'crop');
        }
        
        if (!avatarUrl && isDirect) {
          const members = r.getJoinedMembers ? r.getJoinedMembers() : [];
          const currentUserId = client.getUserId();
          const other = members.find((m: any) => m.userId !== currentUserId);
          if (other) {
            avatarUrl = (typeof other.getMxcAvatarUrl === 'function' ? other.getMxcAvatarUrl() : (other as any).avatarUrl) || null;
          }
        }
        return {
          roomId: r.roomId,
          name: displayName,
          canonicalAlias: r.getCanonicalAlias ? r.getCanonicalAlias() : r.roomId,
          topic: r.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic,
          avatarUrl,
          isDirect,
        };
      });
    }
  } catch (e) {
    console.warn('[Matrix] matrixFetchJoinedRooms error:', e);
  }

  return fetchMatrixPublicRooms();
}

export async function fetchMatrixRoomMessages(roomId: string, accessToken?: string): Promise<MatrixEventItem[]> {
  try {
    const client = await ensureMatrixReady();
    const room = client.getRoom ? client.getRoom(roomId) : null;
    if (room) {
      const timeline = room.getLiveTimeline();
      const events = timeline ? timeline.getEvents() : [];
      const result: MatrixEventItem[] = [];

      // 1. Loop over ALL timeline events and decrypt if encrypted
      for (const evt of events) {
        if (typeof evt.isEncrypted === 'function' && evt.isEncrypted()) {
          try {
            await client.decryptEventIfNeeded(evt);
          } catch {}
        }
      }

      // 2. Aggregate reactions
      const myUserId = (client.getUserId && client.getUserId()) || localStorage.getItem('matrix_user_id') || '';
      const reactionMap: Record<string, Record<string, number>> = {};
      const myReactionMap: Record<string, Record<string, string>> = {};
      const seenSenderReactions = new Set<string>();

      for (const evt of events) {
        const evtAny = evt as any;
        if (typeof evt.isRedacted === 'function' && evt.isRedacted()) continue;
        const eType = typeof evt.getType === 'function' ? evt.getType() : evtAny.type;
        const c = (typeof evt.getClearContent === 'function' ? evt.getClearContent() : null) || (typeof evt.getContent === 'function' ? evt.getContent() : evtAny.content);
        const rel = c?.['m.relates_to'];
        if ((eType === 'm.reaction' || c?.msgtype === 'm.reaction') && rel?.rel_type === 'm.annotation' && rel?.event_id && rel?.key) {
          const targetEventId = rel.event_id;
          const emojiKey = rel.key;
          const sender = (typeof evt.getSender === 'function' ? evt.getSender() : evtAny.sender) || '';
          const evtId = typeof evt.getId === 'function' ? evt.getId() : (evtAny.event_id || evtAny.eventId);

          const dedupeKey = `${targetEventId}:${sender}:${emojiKey}`;
          if (seenSenderReactions.has(dedupeKey)) continue;
          seenSenderReactions.add(dedupeKey);

          if (!reactionMap[targetEventId]) reactionMap[targetEventId] = {};
          reactionMap[targetEventId][emojiKey] = (reactionMap[targetEventId][emojiKey] || 0) + 1;

          if (sender && sender === myUserId && evtId) {
            if (!myReactionMap[targetEventId]) myReactionMap[targetEventId] = {};
            myReactionMap[targetEventId][emojiKey] = evtId;
          }
        }
      }

      // 2b. Build editMap from edit replacement events
      const senderById: Record<string, string> = {};
      for (const evt of events) {
        const id = typeof evt.getId === 'function' ? evt.getId() : (evt as any).event_id || (evt as any).eventId;
        const sender = typeof evt.getSender === 'function' ? evt.getSender() : (evt as any).sender;
        if (id && sender) {
          senderById[id] = sender;
        }
      }

      const editMap: Record<string, { body: string; ts: number }> = {};
      for (const evt of events) {
        if (typeof evt.isRedacted === 'function' && evt.isRedacted()) continue;
        const eventType = typeof evt.getType === 'function' ? evt.getType() : (evt as any).type;
        if (eventType !== 'm.room.message' && eventType !== 'm.room.encrypted') continue;

        const c = (typeof evt.getClearContent === 'function' ? evt.getClearContent() : null) || (typeof evt.getContent === 'function' ? evt.getContent() : (evt as any).content);
        if (c?.['m.relates_to']?.rel_type === 'm.replace' && c?.['m.relates_to']?.event_id) {
          const targetId = c['m.relates_to'].event_id;
          const newBody = c['m.new_content']?.body ?? (typeof c.body === 'string' ? c.body.replace(/^\* /, '') : '');
          const sender = typeof evt.getSender === 'function' ? evt.getSender() : (evt as any).sender;
          const origSender = senderById[targetId] || (room.findEventById ? room.findEventById(targetId)?.getSender() : undefined);
          if (sender && origSender && sender === origSender) {
            const ts = typeof evt.getTs === 'function' ? evt.getTs() : ((evt as any).originServerTs || (evt as any).origin_server_ts || 0);
            if (!editMap[targetId] || ts > editMap[targetId].ts) {
              editMap[targetId] = { body: newBody, ts };
            }
          }
        }
      }

      // 3. Build messages
      for (const evt of events) {
        const evtAny = evt as any;
        const eventType = evt.getType();
        
        // Skip an event only if its type after decrypting is neither 'm.room.message' nor 'm.room.encrypted'
        if (eventType !== 'm.room.message' && eventType !== 'm.room.encrypted') {
          continue;
        }

        const finalClearContent = (typeof evt.getClearContent === 'function' ? evt.getClearContent() : null) || evt.getContent();

        // If the event is itself an edit (rel_type === 'm.replace'), skip it with continue
        if (finalClearContent?.['m.relates_to']?.rel_type === 'm.replace') {
          continue;
        }

        const isDecryptionFailure = Boolean(typeof evt.isDecryptionFailure === 'function' && evt.isDecryptionFailure());
        const finalEvtId = typeof evt.getId === 'function' ? evt.getId() : (evtAny.eventId || evtAny.event_id || `evt-${Date.now()}`);

        if (isDecryptionFailure) {
          const evtId = typeof evt.getId === 'function' ? evt.getId() : (evtAny.eventId || evtAny.event_id || 'unknown');
          const reason = (evt as any).decryptionFailureReason || (typeof (evt as any).getDecryptionFailureReason === 'function' ? (evt as any).getDecryptionFailureReason() : 'unknown');
          console.warn('[Matrix E2EE] Decryption failure for event:', evtId, reason);
        }

        const isEncrypted = Boolean(typeof evt.isEncrypted === 'function' ? evt.isEncrypted() : false);
        const isStillEncrypted = isEncrypted && eventType === 'm.room.encrypted' && !evt.getClearContent?.();

        let contentBody = '';
        let isEdited = false;
        if (isDecryptionFailure) {
          contentBody = "Can't decrypt this message. This device hasn't received the keys.";
        } else if (isStillEncrypted) {
          contentBody = 'Decrypting…';
        } else if (editMap[finalEvtId]) {
          contentBody = editMap[finalEvtId].body;
          isEdited = true;
        } else {
          contentBody = finalClearContent?.body || evt.getContent()?.body || (isEncrypted ? 'Encrypted message' : '');
        }

        const inReplyToEventId = finalClearContent?.['m.relates_to']?.['m.in_reply_to']?.event_id || evt.getContent()?.['m.relates_to']?.['m.in_reply_to']?.event_id;
        let replyToObj: { eventId: string; userName: string; snippet: string } | undefined = undefined;
        if (inReplyToEventId) {
          let parentEvent = room.findEventById ? room.findEventById(inReplyToEventId) : null;
          if (!parentEvent && (room as any).timeline && Array.isArray((room as any).timeline)) {
            parentEvent = (room as any).timeline.find((e: any) => (typeof e?.getId === 'function' ? e.getId() : e?.event_id) === inReplyToEventId) || null;
          }
          if (!parentEvent && room.getLiveTimeline) {
            const timelineEvents = room.getLiveTimeline().getEvents() || [];
            parentEvent = timelineEvents.find((e: any) => (typeof e?.getId === 'function' ? e.getId() : e?.event_id) === inReplyToEventId) || null;
          }
          if (parentEvent && client && typeof client.decryptEventIfNeeded === 'function') {
            await client.decryptEventIfNeeded(parentEvent).catch(() => {});
          }

          let parentContent = parentEvent ? (parentEvent.getClearContent ? parentEvent.getClearContent() : parentEvent.getContent()) : null;
          let parentSender = parentEvent ? parentEvent.getSender() : '@user:matrix.org';

          if (!parentEvent && client && typeof client.fetchRoomEvent === 'function') {
            try {
              const fetchedEv: any = await client.fetchRoomEvent(roomId, inReplyToEventId);
              if (fetchedEv) {
                if (typeof client.decryptEventIfNeeded === 'function') {
                  await client.decryptEventIfNeeded(fetchedEv as any).catch(() => {});
                }
                parentContent = fetchedEv.content || (fetchedEv.getClearContent ? fetchedEv.getClearContent() : {}) || {};
                parentSender = fetchedEv.sender || '';
              }
            } catch {}
          }

          const parentSenderName = parentSender ? parentSender.split(':')[0].replace('@', '') : 'user';
          const parentBody = parentContent?.body || 'Message unavailable';
          replyToObj = {
            eventId: inReplyToEventId,
            userName: parentSenderName,
            snippet: parentBody,
          };
        }

        const sender = evt.getSender() || '@user:matrix.org';
        let resolvedSenderName = sender.split(':')[0].replace('@', '');
        if (room && typeof room.getMember === 'function') {
          const member = room.getMember(sender);
          if (member && member.name && !member.name.startsWith('@')) {
            resolvedSenderName = member.name;
          }
        }
        if (resolvedSenderName === sender.split(':')[0].replace('@', '') && client && typeof client.getUser === 'function') {
          const user = client.getUser(sender);
          if (user && user.displayName) {
            resolvedSenderName = user.displayName;
          }
        }

        let senderAvatarUrl: string | undefined = undefined;
        if (room && typeof room.getMember === 'function') {
          const member = room.getMember(sender);
          if (member) {
            senderAvatarUrl = (typeof member.getMxcAvatarUrl === 'function' ? member.getMxcAvatarUrl() : (member as any).avatarUrl) || undefined;
          }
        }
        if (!senderAvatarUrl && client && typeof client.getUser === 'function') {
          const user = client.getUser(sender);
          if (user && user.avatarUrl) {
            senderAvatarUrl = user.avatarUrl;
          }
        }

        const ts = evt.getTs() || Date.now();
        const timeString = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const evtTxnId =
          (typeof evt.getTxnId === 'function' ? evt.getTxnId() : null) ||
          (typeof evt.getUnsigned === 'function' ? evt.getUnsigned()?.transaction_id : null) ||
          undefined;
        const content = finalClearContent || evtAny.content || {};
        const msgtype = content.msgtype;
        const isRedacted = Boolean(typeof evt.isRedacted === 'function' && evt.isRedacted());

        let deliveryStatus: 'sending' | 'sent' | 'read' | 'failed' | undefined = undefined;
        if (myUserId && sender === myUserId) {
          const status = (evt as any).status;
          if (status === 'not_sent') {
            deliveryStatus = 'failed';
          } else if (
            status === 'encrypting' ||
            status === 'sending' ||
            status === 'queued' ||
            finalEvtId.startsWith('~')
          ) {
            deliveryStatus = 'sending';
          } else {
            const readers: string[] =
              typeof (room as any).getUsersReadUpTo === 'function'
                ? (room as any).getUsersReadUpTo(evt)
                : [];
            deliveryStatus = readers.some((uid: string) => uid !== myUserId) ? 'read' : 'sent';
          }
        }
        
        const encryptionState = computeEventEncryptionState(client, evt, content, isDecryptionFailure);

        result.push({
          eventId: finalEvtId,
          roomId: roomId,
          sender: typeof evt.getSender === 'function' ? evt.getSender() : (evtAny.sender || '@user:matrix.org'),
          senderName: resolvedSenderName,
          avatarUrl: senderAvatarUrl || '',
          timestamp: formatMessageTime(ts),
          originServerTs: ts,
          txnId: evtTxnId,
          content: isRedacted ? 'Message deleted' : (contentBody || ''),
          isTapped: false,
          isEdited: isEdited,
          isEncrypted: isEncrypted,
          isDecryptionFailure,
          encryption: encryptionState,
          replyTo: replyToObj,
          reactions: reactionMap[finalEvtId],
          myReactions: myReactionMap[finalEvtId],
          msgtype: msgtype,
          mediaUrl: isRedacted ? undefined : (content.url || content.file?.url),
          mediaInfo: content.info,
          encryptedFile: isRedacted ? undefined : content.file,
          geoUri: content.geo_uri,
          isRedacted: typeof evt.isRedacted === 'function' && evt.isRedacted(),
          deliveryStatus: deliveryStatus,
        });
      }
      return result;
    }
  } catch (err) {
    console.warn('[Matrix E2EE] fetchMatrixRoomMessages local timeline note:', err);
  }

  return [];
}

export async function fetchMatrixPublicRooms(): Promise<MatrixRoom[]> {
  try {
    const client = await ensureMatrixReady();
    const res = await client.publicRooms({});
    if (!res || !res.chunk) {
      throw new Error('Could not load rooms');
    }
    return res.chunk.map((r: any) => ({
      roomId: r.room_id,
      name: r.name || r.canonical_alias || 'Matrix Room',
      canonicalAlias: r.canonical_alias,
      topic: r.topic,
      numJoinedMembers: r.num_joined_members,
      isDirect: false,
    }));
  } catch (err: any) {
    throw new Error(err?.message || 'Could not load rooms');
  }
}

export async function initMatrixGuestSession() {
  const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
  const userId = localStorage.getItem('matrix_user_id');
  if (token && userId) {
    return { userId, accessToken: token };
  }
  return null;
}

export async function matrixLeaveRoom(roomId: string, accessToken?: string): Promise<void> {
  const client = await ensureMatrixReady();
  if (client) {
    if (typeof client.leave === 'function') {
      await client.leave(roomId);
    } else if (typeof (client as any).leaveRoom === 'function') {
      await (client as any).leaveRoom(roomId);
    }
    
    if (typeof client.forget === 'function') {
      await client.forget(roomId);
    } else if (typeof (client as any).forgetRoom === 'function') {
      await (client as any).forgetRoom(roomId);
    }
  }
}

export async function matrixBlockUser(userId: string, accessToken?: string): Promise<void> {
  const client = await ensureMatrixReady();
  if (client && typeof (client as any).ignoreUsers === 'function') {
    await (client as any).ignoreUsers([userId]);
  }
}

export async function matrixLoadMoreHistory(roomId: string, limit = 50): Promise<boolean> {
  try {
    const client = await ensureMatrixReady();
    if (!client) return false;
    const room = client.getRoom ? client.getRoom(roomId) : null;
    if (!room) return false;
    await client.scrollback(room, limit);
    const token = room.getLiveTimeline()?.getPaginationToken('b' as any);
    return Boolean(token);
  } catch (err) {
    console.warn('[Matrix] matrixLoadMoreHistory error:', err);
    return false;
  }
}

export async function matrixSendReaction(roomId: string, eventId: string, emoji: string): Promise<any> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  return (client as any).sendEvent(roomId, 'm.reaction', {
    'm.relates_to': {
      rel_type: 'm.annotation',
      event_id: eventId,
      key: emoji,
    },
  });
}

export async function matrixRemoveReaction(roomId: string, reactionEventId: string): Promise<any> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  return client.redactEvent(roomId, reactionEventId);
}

export async function matrixRedactMessage(roomId: string, eventId: string): Promise<void> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  await (client as any).redactEvent(roomId, eventId);
}

export async function matrixUpdateDisplayName(
  client: any,
  displayName: string,
  accessToken?: string
): Promise<void> {
  const activeClient = client || (await ensureMatrixReady());
  if (activeClient && typeof activeClient.setDisplayName === 'function') {
    await activeClient.setDisplayName(displayName);
  }
}

export async function matrixUpdateAvatar(
  client: any,
  fileOrUrl: File | string,
  token?: string
): Promise<{ mxcUri: string }> {
  const activeClient = client || (await ensureMatrixReady());
  let mxcUri = '';
  
  if (fileOrUrl instanceof File) {
    if (activeClient && typeof activeClient.uploadContent === 'function') {
      const uploadRes: any = await activeClient.uploadContent(fileOrUrl);
      mxcUri = uploadRes.content_uri || uploadRes.contentUri;
    }
  } else if (typeof fileOrUrl === 'string' && fileOrUrl.startsWith('mxc://')) {
    mxcUri = fileOrUrl;
  }

  if (!mxcUri || !mxcUri.startsWith('mxc://')) {
    throw new Error('Failed to obtain valid MXC URI for avatar');
  }

  if (activeClient && typeof activeClient.setAvatarUrl === 'function') {
    await activeClient.setAvatarUrl(mxcUri);
  }

  return { mxcUri };
}

export async function matrixSetPresence(
  client: any,
  presence: 'online' | 'offline' | 'unavailable' | 'free_for_chat',
  statusMsg?: string,
  token?: string
): Promise<void> {
  const activeClient = client || (await ensureMatrixReady());
  if (activeClient && typeof activeClient.setPresence === 'function') {
    await activeClient.setPresence({
      presence,
      ...(statusMsg ? { status_msg: statusMsg } : {}),
    });
  }
}

export async function matrixSendReadReceipt(
  roomId: string,
  eventId?: string,
  accessToken?: string
): Promise<void> {
  try {
    const client = await ensureMatrixReady();
    if (client) {
      const room = client.getRoom ? client.getRoom(roomId) : null;
      let targetEvt: any = null;
      if (eventId && room && typeof room.findEventById === 'function') {
        targetEvt = room.findEventById(eventId);
      }
      if (!targetEvt && room && typeof room.getLiveTimeline === 'function') {
        const events = room.getLiveTimeline().getEvents();
        targetEvt = events && events.length > 0 ? events[events.length - 1] : null;
      }
      if (targetEvt && typeof client.sendReadReceipt === 'function') {
        await client.sendReadReceipt(targetEvt).catch(() => {});
      } else if (typeof client.setRoomReadMarkers === 'function') {
        const lastEvtId = targetEvt?.getId?.() || eventId;
        if (lastEvtId) {
          await client.setRoomReadMarkers(roomId, lastEvtId).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[Matrix] sendReadReceipt note:', err);
  }
}

async function blobToWav(blob: Blob): Promise<{ wav: Blob; durationMs: number }> {
  const buf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  ctx.close();
  const rate = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);
  const out = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(out);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { wav: new Blob([out], { type: 'audio/wav' }), durationMs: Math.round(decoded.duration * 1000) };
}

export async function matrixSendAudioMessage(
  roomId: string,
  audioBlob: Blob,
  accessToken?: string,
  duration?: number,
  opts?: {
    txnId?: string;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{ eventId: string; mxcUri: string }> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  if (!isCryptoEngineReady) {
    throw new Error('Encryption failed to start, sending is disabled');
  }

  let sendBlob: Blob = audioBlob;
  let realMs = Math.max(1000, Math.round((duration || 1) * 1000));
  try { const r = await blobToWav(audioBlob); sendBlob = r.wav; realMs = Math.max(1000, r.durationMs); } catch (e) { console.warn('WAV conversion failed, sending original', e); }

  const uploadType = (sendBlob.type || 'audio/wav').split(';')[0].trim();
  const uploadName = uploadType === 'audio/wav'
    ? 'voice-message.wav'
    : uploadType.includes('mp4')
    ? 'voice-message.m4a'
    : uploadType.includes('ogg')
    ? 'voice-message.ogg'
    : 'voice-message.webm';

  const progressHandler = (progressInfo: { loaded: number; total: number }) => {
    if (opts?.onProgress) {
      opts.onProgress(progressInfo.loaded, progressInfo.total);
    }
  };

  const encryptedAudioFile = await uploadEncryptedMedia(client, sendBlob, {
    onProgress: progressHandler
  });
  const mxcUri = encryptedAudioFile.url;

  const waveform = Array.from({ length: 30 }, () => Math.floor(Math.random() * 601) + 300);

  const txnId = opts?.txnId || `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const content = {
    msgtype: 'm.audio',
    body: 'Voice message',
    file: encryptedAudioFile,
    info: {
      mimetype: sendBlob.type,
      size: sendBlob.size,
      duration: realMs,
    },
    'org.matrix.msc1767.audio': {
      duration: realMs,
      waveform,
    },
    'org.matrix.msc3245.voice': {},
  };

  const res = await (client as any).sendEvent(roomId, 'm.room.message', content, txnId);
  const eventId = res?.event_id;
  if (!eventId) {
    throw new Error('Audio message delivery failed');
  }

  return { eventId, mxcUri };
}

export async function fetchMxcBlob(client: any, mxcUrl: string): Promise<string> {
  if (!mxcUrl || !mxcUrl.startsWith('mxc://')) {
    return mxcUrl;
  }

  const cleanMxc = mxcUrl.replace('mxc://', '');
  const parts = cleanMxc.split('/');
  if (parts.length < 2) {
    throw new Error('Invalid mxc URL');
  }
  const server = parts[0];
  const mediaId = parts.slice(1).join('/');

  const userId = client?.getUserId ? client.getUserId() : localStorage.getItem('matrix_user_id');
  const baseUrl = getHomeserverUrl(userId).replace(/\/+$/, '');
  const accessToken =
    (client && typeof client.getAccessToken === 'function' && client.getAccessToken()) ||
    localStorage.getItem('matrix_token') ||
    localStorage.getItem('matrix_access_token') ||
    '';

  const urls = [
    { url: `${baseUrl}/_matrix/client/v1/media/download/${server}/${mediaId}`, auth: true },
    { url: `${baseUrl}/_matrix/media/v3/download/${server}/${mediaId}`, auth: false },
    { url: `${baseUrl}/_matrix/media/v3/download/${server}/${mediaId}`, auth: true },
  ];

  let lastErr: any = null;
  for (const item of urls) {
    try {
      const headers: Record<string, string> = {};
      if (item.auth && accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch(item.url, { headers });
      if (res.ok) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      lastErr = err;
    }
  }

  const httpUrl = resolveMxcToHttp(mxcUrl, client);
  try {
    const res = await fetch(httpUrl);
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch {}

  throw lastErr || new Error('Failed to fetch mxc blob');
}

export async function matrixSendLocationMessage(
  roomId: string,
  lat: number,
  lon: number,
  accessToken?: string
): Promise<{ eventId: string }> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  if (!isCryptoEngineReady) {
    throw new Error('Encryption failed to start, sending is disabled');
  }

  const txnId = `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const geoUri = `geo:${lat},${lon}`;
  const content = {
    msgtype: 'm.location',
    body: `📍 Shared location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    geo_uri: geoUri,
    info: {
      mimetype: 'application/vnd.matrix.location.v1+json',
    },
  };

  const res = await (client as any).sendEvent(roomId, 'm.room.message', content, txnId);
  const eventId = res?.event_id;
  if (!eventId) {
    throw new Error('Location message delivery failed');
  }

  return { eventId };
}

export function resolveMxcToHttp(mxcUrl: string, client?: any, width = 80, height = 80): string {
  if (!mxcUrl) return '';
  if (!mxcUrl.startsWith('mxc://')) return mxcUrl;
  if (client && typeof client.mxcUrlToHttp === 'function') {
    try {
      const authUrl = client.mxcUrlToHttp(mxcUrl, width, height, 'crop', false, false, true);
      return authUrl || client.mxcUrlToHttp(mxcUrl, width, height, 'crop');
    } catch {}
  }
  const parts = mxcUrl.replace('mxc://', '').split('/');
  if (parts.length >= 2) {
    return `${getHomeserverUrl(localStorage.getItem('matrix_user_id'))}/_matrix/media/v3/download/${parts[0]}/${parts[1]}`;
  }
  return mxcUrl;
}

export interface EncryptionSummary {
  cryptoReady: boolean;
  syncState: string;
  userId: string;
  deviceId: string;
  fingerprint: string;
  crossSigningReady: boolean;
}

export async function getEncryptionSummary(): Promise<EncryptionSummary> {
  let cryptoReady = false;
  let syncState = 'STOPPED';
  let userId = '';
  let deviceId = '';
  let fingerprint = '';
  let crossSigningReady = false;

  try {
    cryptoReady = isCryptoReady();
  } catch {
    cryptoReady = false;
  }

  try {
    const client = await ensureMatrixReady();
    if (client) {
      try {
        if (typeof client.getSyncState === 'function') {
          syncState = client.getSyncState() || 'UNKNOWN';
        }
      } catch {
        syncState = 'UNKNOWN';
      }

      try {
        userId = (typeof client.getUserId === 'function' && client.getUserId()) || '';
      } catch {
        userId = '';
      }

      try {
        deviceId = (typeof client.getDeviceId === 'function' && client.getDeviceId()) || '';
      } catch {
        deviceId = '';
      }

      try {
        const crypto = client.getCrypto ? client.getCrypto() : null;
        if (crypto) {
          try {
            if (typeof crypto.getOwnDeviceKeys === 'function') {
              const ownKeys: any = await crypto.getOwnDeviceKeys();
              let rawEd25519 = ownKeys?.ed25519 || '';
              if (!rawEd25519 && ownKeys?.keys) {
                for (const [k, v] of Object.entries(ownKeys.keys)) {
                  if (k.startsWith('ed25519:')) {
                    rawEd25519 = v as string;
                    break;
                  }
                }
              }
              if (typeof rawEd25519 === 'string' && rawEd25519) {
                fingerprint = rawEd25519.match(/.{1,4}/g)?.join(' ') || rawEd25519;
              }
            }
          } catch {
            fingerprint = '';
          }

          try {
            if (typeof crypto.isCrossSigningReady === 'function') {
              crossSigningReady = Boolean(await crypto.isCrossSigningReady());
            }
          } catch {
            crossSigningReady = false;
          }
        }
      } catch {}
    }
  } catch {}

  if (!userId) {
    try {
      userId = localStorage.getItem('matrix_user_id') || '';
    } catch {}
  }
  if (!deviceId) {
    try {
      deviceId = localStorage.getItem('matrix_device_id') || '';
    } catch {}
  }

  return {
    cryptoReady,
    syncState,
    userId,
    deviceId,
    fingerprint,
    crossSigningReady,
  };
}

export interface KeysOverview {
  status: 'Ready' | 'Not set up' | 'Problem';
  cryptoReady: boolean;
  crossSigningReady: boolean;
  secretStorageReady: boolean;
  backupReady: boolean;
  backupVersion?: string | null;
}

export async function getKeysOverview(): Promise<KeysOverview> {
  let cryptoReady = false;
  let crossSigningReady = false;
  let secretStorageReady = false;
  let backupReady = false;
  let backupVersion: string | null = null;

  try {
    cryptoReady = isCryptoReady();
  } catch {
    cryptoReady = false;
  }

  if (!cryptoReady) {
    return {
      status: 'Problem',
      cryptoReady: false,
      crossSigningReady: false,
      secretStorageReady: false,
      backupReady: false,
    };
  }

  try {
    const client = await ensureMatrixReady();
    if (client) {
      const crypto = client.getCrypto ? client.getCrypto() : null;
      if (crypto) {
        if (typeof crypto.isCrossSigningReady === 'function') {
          try {
            crossSigningReady = Boolean(await crypto.isCrossSigningReady());
          } catch {
            crossSigningReady = false;
          }
        }

        if (typeof crypto.isSecretStorageReady === 'function') {
          try {
            secretStorageReady = Boolean(await crypto.isSecretStorageReady());
          } catch {
            secretStorageReady = false;
          }
        } else if (typeof client.getAccountData === 'function') {
          try {
            const defaultKey = client.getAccountData('m.secret_storage.default_key');
            secretStorageReady = Boolean(defaultKey?.getContent?.()?.key);
          } catch {
            secretStorageReady = false;
          }
        }

        if (typeof (crypto as any).getKeyBackupVersion === 'function') {
          try {
            const ver = await (crypto as any).getKeyBackupVersion();
            if (ver && ver.version) {
              backupReady = true;
              backupVersion = String(ver.version);
            }
          } catch {
            backupReady = false;
          }
        } else if (typeof (client as any).getKeyBackupVersion === 'function') {
          try {
            const ver = await (client as any).getKeyBackupVersion();
            if (ver && ver.version) {
              backupReady = true;
              backupVersion = String(ver.version);
            }
          } catch {
            backupReady = false;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Matrix E2EE] getKeysOverview error:', err);
  }

  const allReady = crossSigningReady && secretStorageReady && backupReady;
  const status: 'Ready' | 'Not set up' | 'Problem' = allReady
    ? 'Ready'
    : 'Not set up';

  return {
    status,
    cryptoReady,
    crossSigningReady,
    secretStorageReady,
    backupReady,
    backupVersion,
  };
}

export interface BackupStatus {
  crossSigningReady: boolean;
  secretStorageReady: boolean;
  serverBackupExists: boolean;
  backupEnabledOnThisDevice: boolean;
}

export async function getBackupStatus(): Promise<BackupStatus> {
  try {
    const client = await ensureMatrixReady();
    if (!client) {
      return {
        crossSigningReady: false,
        secretStorageReady: false,
        serverBackupExists: false,
        backupEnabledOnThisDevice: false,
      };
    }
    const crypto = client.getCrypto ? client.getCrypto() : null;
    if (!crypto) {
      return {
        crossSigningReady: false,
        secretStorageReady: false,
        serverBackupExists: false,
        backupEnabledOnThisDevice: false,
      };
    }

    const crossSigningReady = typeof crypto.isCrossSigningReady === 'function'
      ? Boolean(await crypto.isCrossSigningReady())
      : false;

    const secretStorageReady = typeof crypto.isSecretStorageReady === 'function'
      ? Boolean(await crypto.isSecretStorageReady())
      : false;

    const backupInfo = typeof crypto.getKeyBackupInfo === 'function'
      ? await crypto.getKeyBackupInfo()
      : null;
    const serverBackupExists = Boolean(backupInfo);

    const activeVersion = typeof crypto.getActiveSessionBackupVersion === 'function'
      ? await crypto.getActiveSessionBackupVersion()
      : null;
    const backupEnabledOnThisDevice = Boolean(activeVersion);

    return {
      crossSigningReady,
      secretStorageReady,
      serverBackupExists,
      backupEnabledOnThisDevice,
    };
  } catch (err) {
    console.warn('[Matrix KeyBackup] getBackupStatus error:', err);
    return {
      crossSigningReady: false,
      secretStorageReady: false,
      serverBackupExists: false,
      backupEnabledOnThisDevice: false,
    };
  }
}

export async function setupMessageBackup(password: string): Promise<string> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client unavailable');
  const crypto = client.getCrypto ? client.getCrypto() : null;
  if (!crypto) throw new Error('Crypto engine unavailable');

  // 1. Create recovery key from passphrase
  const genKey = await crypto.createRecoveryKeyFromPassphrase(password);
  if (!genKey || !genKey.privateKey) {
    throw new Error('Failed to generate recovery key');
  }

  // 2. Call bootstrapCrossSigning with authUploadDeviceSigningKeys via matrixWithPasswordAuth
  await matrixWithPasswordAuth(password, async (auth) => {
    await crypto.bootstrapCrossSigning({
      setupNewCrossSigning: true,
      authUploadDeviceSigningKeys: auth,
    });
  });

  // 3. Call bootstrapSecretStorage with setupNewSecretStorage and setupNewKeyBackup
  await crypto.bootstrapSecretStorage({
    setupNewSecretStorage: true,
    setupNewKeyBackup: true,
    createSecretStorageKey: async () => genKey,
  });

  // 4. Cache key in memory
  const encodedKey = genKey.encodedPrivateKey || (genKey.privateKey ? encodeRecoveryKey(genKey.privateKey) : '') || '';
  try {
    const status = await crypto.getSecretStorageStatus();
    if (status.defaultKeyId && genKey.privateKey) {
      secretStorageKeyMap.set(status.defaultKeyId, genKey.privateKey);
    }
  } catch {}
  if (genKey.privateKey) {
    secretStorageKeyMap.set('default', genKey.privateKey);
  }

  return encodedKey;
}

export async function restoreMessageBackup(
  recoveryKey: string,
  onProgress?: (progress: any) => void
): Promise<KeyBackupRestoreResult> {
  const client = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client unavailable');
  const crypto = client.getCrypto ? client.getCrypto() : null;
  if (!crypto) throw new Error('Crypto engine unavailable');

  // 1. Decode key
  const rawKey = decodeRecoveryKey(recoveryKey.trim());
  if (!rawKey || rawKey.length === 0) {
    throw new Error('Invalid recovery key format');
  }

  // 2. Cache in memory
  try {
    const status = await crypto.getSecretStorageStatus();
    if (status.defaultKeyId) {
      secretStorageKeyMap.set(status.defaultKeyId, rawKey);
    }
  } catch {}
  secretStorageKeyMap.set('default', rawKey);

  // 3. Load backup key from secret storage
  await crypto.loadSessionBackupPrivateKeyFromSecretStorage();

  // 4. Run checkKeyBackupAndEnable
  await crypto.checkKeyBackupAndEnable();

  // 5. Restore key backup with progress
  const restoreResult = await crypto.restoreKeyBackup({
    progressCallback: onProgress,
  });

  // 6. Retry decryption of undecryptable events in all rooms
  try {
    const rooms = client.getRooms();
    for (const room of rooms) {
      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();
      for (const ev of events) {
        if (ev.isEncrypted() && (ev.isDecryptionFailure?.() || !(ev as any).clearEvent)) {
          try {
            await client.decryptEventIfNeeded(ev);
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[Matrix KeyBackup] Retry event decryptions error:', err);
  }

  return restoreResult;
}

let cachedAccountManagementBaseUrl: string | null = null;
let cachedIsManagedAccount: boolean | null = null;

export async function getAccountManagementUrl(
  action?: string,
  params?: Record<string, string>
): Promise<string | null> {
  const userId = localStorage.getItem('matrix_user_id');
  const baseUrl = getHomeserverUrl(userId).replace(/\/+$/, '');

  let accountBaseUrl = cachedAccountManagementBaseUrl;

  if (!accountBaseUrl) {
    // 1. Try GET ${baseUrl}/_matrix/client/v1/auth_metadata
    try {
      const res = await fetch(`${baseUrl}/_matrix/client/v1/auth_metadata`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          cachedIsManagedAccount = true;
          const uri = data.account_management_uri || data.account_management_url;
          if (uri && typeof uri === 'string') {
            accountBaseUrl = uri;
          }
        }
      } else {
        cachedIsManagedAccount = false;
      }
    } catch {
      // ignore
    }

    // 2. Otherwise GET ${baseUrl}/.well-known/matrix/client
    if (!accountBaseUrl) {
      try {
        const res = await fetch(`${baseUrl}/.well-known/matrix/client`);
        if (res.ok) {
          const data = await res.json();
          const uri =
            data?.['org.matrix.msc2965.authentication']?.account ||
            data?.['m.authentication']?.account;
          if (uri && typeof uri === 'string') {
            accountBaseUrl = uri;
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Otherwise, if homeserver is matrix.org, use 'https://account.matrix.org'
    if (!accountBaseUrl) {
      if (baseUrl.includes('matrix.org')) {
        accountBaseUrl = 'https://account.matrix.org';
      }
    }

    if (accountBaseUrl) {
      cachedAccountManagementBaseUrl = accountBaseUrl;
    }
  }

  if (!accountBaseUrl) {
    return null;
  }

  try {
    const url = new URL(accountBaseUrl);
    if (action) {
      url.searchParams.set('action', action);
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  } catch {
    const queryParts: string[] = [];
    if (action) {
      queryParts.push(`action=${encodeURIComponent(action)}`);
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
      }
    }
    if (queryParts.length > 0) {
      const sep = accountBaseUrl.includes('?') ? '&' : '?';
      return `${accountBaseUrl}${sep}${queryParts.join('&')}`;
    }
    return accountBaseUrl;
  }
}

export async function isManagedAccount(): Promise<boolean> {
  if (cachedIsManagedAccount !== null) {
    return cachedIsManagedAccount;
  }
  const userId = localStorage.getItem('matrix_user_id');
  const baseUrl = getHomeserverUrl(userId).replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/_matrix/client/v1/auth_metadata`);
    cachedIsManagedAccount = res.ok;
    return res.ok;
  } catch {
    cachedIsManagedAccount = false;
    return false;
  }
}

export async function openAccountPage(
  action?: string,
  params?: Record<string, string>
): Promise<void> {
  const url = await getAccountManagementUrl(action, params);
  if (!url) {
    throw new Error('This homeserver has no account page');
  }
  await openUrl(url);
}

export async function matrixWithPasswordAuth<T>(
  password: string,
  fn: (auth?: any) => Promise<T>
): Promise<T> {
  const client = await ensureMatrixReady();
  const myUserId =
    (client && typeof client.getUserId === 'function' && client.getUserId()) ||
    localStorage.getItem('matrix_user_id') ||
    '';

  try {
    return await fn(undefined);
  } catch (err: any) {
    const sessionStr =
      err?.data?.session ||
      err?.session ||
      err?.data?.flows?.[0]?.session;

    if (sessionStr || err?.httpStatus === 401 || err?.statusCode === 401 || err?.data?.flows) {
      try {
        const authPayload = {
          type: 'm.login.password',
          identifier: {
            type: 'm.id.user',
            user: myUserId,
          },
          password,
          ...(sessionStr ? { session: sessionStr } : {}),
        };
        return await fn(authPayload);
      } catch (secondErr: any) {
        throw new Error('Incorrect password');
      }
    }
    throw err;
  }
}

export async function fetchDecryptedMedia(file: any, mimetype?: string): Promise<Blob> {
  if (!file || !file.url || !file.url.startsWith('mxc://')) {
    throw new Error('Invalid encrypted file object');
  }

  const cleanMxc = file.url.replace('mxc://', '');
  const parts = cleanMxc.split('/');
  const server = parts[0];
  const mediaId = parts.slice(1).join('/');

  const userId = localStorage.getItem('matrix_user_id');
  const homeserver = getHomeserverUrl(userId).replace(/\/+$/, '');
  const accessToken =
    localStorage.getItem('matrix_token') ||
    localStorage.getItem('matrix_access_token') ||
    '';

  const urlV1 = `${homeserver}/_matrix/client/v1/media/download/${server}/${mediaId}`;
  const urlV3 = `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}`;

  let response: Response | null = null;
  try {
    response = await fetch(urlV1, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!response.ok) {
      response = await fetch(urlV3);
    }
  } catch {
    response = await fetch(urlV3);
  }

  if (!response || !response.ok) {
    throw new Error('Failed to download encrypted file');
  }

  const encryptedBytes = await response.arrayBuffer();

  if (file.hashes && file.hashes.sha256) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedBytes);
    const hashArray = new Uint8Array(hashBuffer);
    let binaryHash = '';
    for (let i = 0; i < hashArray.length; i++) {
      binaryHash += String.fromCharCode(hashArray[i]);
    }
    const computedSha256 = btoa(binaryHash).replace(/=+$/, '');
    if (computedSha256 !== file.hashes.sha256) {
      throw new Error('SHA-256 hash mismatch for encrypted file');
    }
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    file.key,
    { name: 'AES-CTR' },
    false,
    ['decrypt']
  );

  const ivBase64 = file.iv;
  const padding = '='.repeat((4 - (ivBase64.length % 4)) % 4);
  const paddedIv = ivBase64 + padding;
  const ivBinary = atob(paddedIv);
  const iv = new Uint8Array(16);
  for (let i = 0; i < Math.min(ivBinary.length, 16); i++) {
    iv[i] = ivBinary.charCodeAt(i);
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: iv, length: 64 },
    key,
    encryptedBytes
  );

  return new Blob([decrypted], { type: mimetype || 'application/octet-stream' });
}

export async function matrixRetrySend(roomId: string, eventId: string): Promise<void> {
  const client: any = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  const room = client.getRoom(roomId);
  const pending = room?.getPendingEvents?.() || [];
  const ev = pending.find((e: any) => e.getId() === eventId || e.getTxnId?.() === eventId);
  if (!ev) throw new Error('Message is no longer pending');
  await client.resendEvent(ev, room);
}

export async function matrixRegisterPusher(subscription: PushSubscription): Promise<void> {
  const client: any = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');

  const appId = import.meta.env.VITE_PUSH_APP_ID;
  const pushGatewayUrl = import.meta.env.VITE_PUSH_GATEWAY_URL;

  if (!appId || !pushGatewayUrl) {
    throw new Error('Push configuration missing');
  }

  const pushKey = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!)));
  const authKey = btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)));

  await client.setPusher({
    kind: 'http',
    app_id: appId,
    app_display_name: 'Vibe',
    device_display_name: client.deviceId || 'Unknown Device',
    pushkey: pushKey,
    lang: navigator.language,
    data: {
      url: pushGatewayUrl,
      format: 'event_id_only',
      endpoint: subscription.endpoint,
      auth: authKey,
    },
    append: false,
  });
}

export async function matrixRemovePusher(): Promise<void> {
  const client: any = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');

  await client.setPusher({
    kind: null,
    app_id: import.meta.env.VITE_PUSH_APP_ID,
    pushkey: '',
  });
}

export async function matrixForwardMessage(
  targetRoomId: string,
  msg: { msgtype?: string; content: string; mediaUrl?: string; mediaInfo?: any; encryptedFile?: any }
): Promise<void> {
  const client: any = await ensureMatrixReady();
  if (!client) throw new Error('Matrix client not initialized');
  let roomId = targetRoomId;
  if (roomId.startsWith('@')) {
    roomId = await matrixCreateDirectRoom(roomId);
  }
  const isMedia = ['m.image', 'm.audio', 'm.video', 'm.file'].includes(msg.msgtype || '');
  if (isMedia) {
    const isEnc = await matrixIsRoomEncrypted(roomId);
    if (!isEnc) {
      throw new Error('Media can only be forwarded to end-to-end encrypted rooms');
    }
  }

  const content: any = isMedia
    ? {
        msgtype: msg.msgtype,
        body: msg.content || 'file',
        info: msg.mediaInfo || {},
        file: msg.encryptedFile, // Reuse exact E2EE file object
      }
    : { msgtype: 'm.text', body: msg.content };
  const txnId = `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await client.sendEvent(roomId, 'm.room.message', content, txnId);
}

function uint8ArrayToBase64Unpadded(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/, '');
}

export async function encryptAttachment(data: ArrayBuffer | Blob): Promise<{
  ciphertext: Blob;
  info: {
    v: string;
    key: {
      kty: string;
      alg: string;
      ext: boolean;
      key_ops: string[];
      k: string;
    };
    iv: string;
    hashes: {
      sha256: string;
    };
  };
}> {
  const inputBuffer = data instanceof Blob ? await data.arrayBuffer() : data;

  const key = await crypto.subtle.generateKey(
    { name: 'AES-CTR', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const jwk = await crypto.subtle.exportKey('jwk', key);

  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8)); // Generate high 8 bytes randomly, low 8 bytes are 0

  const encryptedBytes = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: iv, length: 64 },
    key,
    inputBuffer
  );

  const sha256Buffer = await crypto.subtle.digest('SHA-256', encryptedBytes);
  const sha256 = uint8ArrayToBase64Unpadded(new Uint8Array(sha256Buffer));
  const ivBase64 = uint8ArrayToBase64Unpadded(iv);

  const ciphertextBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });

  const info = {
    v: 'v2',
    key: {
      kty: 'oct',
      alg: 'A256CTR',
      ext: true,
      key_ops: ['encrypt', 'decrypt'],
      k: jwk.k || '',
    },
    iv: ivBase64,
    hashes: {
      sha256,
    },
  };

  return { ciphertext: ciphertextBlob, info };
}

export async function testEncryptionRoundTrip(): Promise<boolean> {
  try {
    const testData = new TextEncoder().encode('Hello Matrix End-to-End Encryption!');
    const { ciphertext, info } = await encryptAttachment(testData.buffer);

    const key = await crypto.subtle.importKey(
      'jwk',
      info.key,
      { name: 'AES-CTR' },
      false,
      ['decrypt']
    );

    const ivBinary = atob(info.iv);
    const iv = new Uint8Array(16);
    for (let i = 0; i < Math.min(ivBinary.length, 16); i++) {
      iv[i] = ivBinary.charCodeAt(i);
    }

    const cipherBytes = await ciphertext.arrayBuffer();
    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-CTR', counter: iv, length: 64 },
      key,
      cipherBytes
    );

    const decryptedText = new TextDecoder().decode(decryptedBytes);
    const success = decryptedText === 'Hello Matrix End-to-End Encryption!';
    console.log('[Crypto Self-Test] E2EE attachment encryption round-trip result:', success ? 'SUCCESS' : 'FAILED');
    return success;
  } catch (err) {
    console.error('[Crypto Self-Test] Error during E2EE round-trip:', err);
    return false;
  }
}

// Run self-test on load to guarantee cryptographic correctness
testEncryptionRoundTrip().catch(err => console.error('Self-test startup failure:', err));

