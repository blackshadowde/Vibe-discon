import { Message } from '../types';

const DB_NAME = 'matrix_message_cache';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let dbPromise: Promise<IDBDatabase> | null = null;
let lastSuccessfulSyncTime: number | null = null;

export function recordSuccessfulSync(): void {
  lastSuccessfulSyncTime = Date.now();
  try {
    localStorage.setItem('matrix_last_successful_sync_time', String(lastSuccessfulSyncTime));
  } catch {}
}

export function getLastSuccessfulSyncTime(): number | null {
  if (lastSuccessfulSyncTime !== null) return lastSuccessfulSyncTime;
  try {
    const stored = localStorage.getItem('matrix_last_successful_sync_time');
    if (stored) {
      const parsed = Number(stored);
      if (!isNaN(parsed) && parsed > 0) {
        lastSuccessfulSyncTime = parsed;
        return parsed;
      }
    }
  } catch {}
  return null;
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported'));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveCachedMessages(userId: string, roomId: string, messages: Message[]): Promise<void> {
  if (!userId || !roomId || !messages) return;
  try {
    const db = await getDB();
    const cacheKey = `${userId}:${roomId}`;
    // Keep only the last 100 messages
    const slicedMessages = messages.slice(-100);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        key: cacheKey,
        userId,
        roomId,
        messages: slicedMessages,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[MessageCache] saveCachedMessages error:', err);
  }
}

export async function getCachedMessages(userId: string, roomId: string): Promise<Message[]> {
  if (!userId || !roomId) return [];
  try {
    const db = await getDB();
    const cacheKey = `${userId}:${roomId}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const result = req.result;
        if (result && Array.isArray(result.messages)) {
          resolve(result.messages);
        } else {
          resolve([]);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[MessageCache] getCachedMessages error:', err);
    return [];
  }
}

export async function clearMessageCache(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[MessageCache] clearMessageCache error:', err);
  }
}

export async function checkAndLogStoragePersist(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log('[Storage Persist Result]:', isPersisted);
      return isPersisted;
    } catch (err) {
      console.warn('[Storage Persist] error:', err);
      return false;
    }
  }
  return false;
}

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persisted === 'function') {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}
