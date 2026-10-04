import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { isNative } from '../native/platform';
import { getOrCreateMatrixClient, getHomeserverUrl } from './matrix';
import { getMediaKind } from '../utils/mediaKind';

export interface DownloadRecord {
  eventId: string;
  fileName: string;
  path: string;
  folder: string;
  size: number;
  status: 'downloaded';
  downloadedAt: number;
  mimeType?: string;
  uri: string;
  localUrl: string;
  kind: string;
  isVoiceNote: boolean;
  savedToDevice?: boolean;
}

export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'downloaded' | 'failed';

export interface ActiveTaskState {
  eventId: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
  record?: DownloadRecord;
}

export const APP_FOLDERS = {
  IMAGES: 'Vibe/Images',
  VIDEOS: 'Vibe/Videos',
  AUDIO: 'Vibe/Audio',
  VOICE_NOTES: 'Vibe/Voice Notes',
  DOCUMENTS: 'Vibe/Documents',
} as const;

export interface FolderStats {
  name: string;
  folder: string;
  count: number;
  totalSize: number;
  files: DownloadRecord[];
}

const PREF_INDEX_KEY = 'vibe_download_index';
const LEGACY_PREF_INDEX_KEY = 'secureconnect_download_index';
const MAX_CONCURRENT_DOWNLOADS = 2;

// Memory caches
let indexCache: Record<string, DownloadRecord> | null = null;
const activeTasks = new Map<string, {
  abortController: AbortController;
  message: any;
  status: DownloadStatus;
  progress: number;
  error?: string;
  partialPath?: string;
  directory?: Directory;
}>();

const listeners = new Set<(eventId?: string) => void>();

function notify(eventId?: string) {
  listeners.forEach((cb) => {
    try {
      cb(eventId);
    } catch (e) {
      console.error('[DownloadManager] listener error:', e);
    }
  });
}

export function subscribeDownloadEvents(listener: (eventId?: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let cachedDirectory: Directory | null = null;

export async function getDownloadBaseDirectory(): Promise<Directory> {
  if (cachedDirectory) return cachedDirectory;
  if (!isNative()) {
    cachedDirectory = Directory.Data;
    return cachedDirectory;
  }
  try {
    // Check if Directory.External is supported
    await Filesystem.stat({ path: '', directory: Directory.External });
    cachedDirectory = Directory.External;
    return Directory.External;
  } catch {
    cachedDirectory = Directory.Data;
    return Directory.Data;
  }
}

export function resolveFolderForMessage(message: any): { folder: string; kind: string; isVoiceNote: boolean } {
  const mime = message?.mediaInfo?.mimetype || message?.driveAttachment?.mimeType || '';
  const name = message?.content || message?.driveAttachment?.name || '';
  const kind = getMediaKind({ msgtype: message?.msgtype, mimetype: mime, name });

  const isVoice = Boolean(
    message?.isVoice ||
    message?.['org.matrix.msc3245.voice'] ||
    message?.mediaInfo?.['org.matrix.msc3245.voice'] ||
    message?.rawEvent?.content?.['org.matrix.msc3245.voice'] ||
    (typeof name === 'string' && /voice\s*note|voice_message/i.test(name))
  );

  if (kind === 'image') {
    return { folder: APP_FOLDERS.IMAGES, kind, isVoiceNote: false };
  }
  if (kind === 'video') {
    return { folder: APP_FOLDERS.VIDEOS, kind, isVoiceNote: false };
  }
  if (kind === 'audio') {
    return {
      folder: isVoice ? APP_FOLDERS.VOICE_NOTES : APP_FOLDERS.AUDIO,
      kind,
      isVoiceNote: isVoice,
    };
  }
  return { folder: APP_FOLDERS.DOCUMENTS, kind: kind || 'file', isVoiceNote: false };
}

export function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return sanitized.length > 0 ? sanitized : `file-${Date.now()}`;
}

export async function getDownloadIndex(): Promise<Record<string, DownloadRecord>> {
  if (indexCache) return indexCache;
  try {
    let { value } = await Preferences.get({ key: PREF_INDEX_KEY });
    if (!value) {
      const legacy = await Preferences.get({ key: LEGACY_PREF_INDEX_KEY });
      value = legacy.value;
    }
    if (value) {
      indexCache = JSON.parse(value);
      return indexCache!;
    }
  } catch {
    const val = localStorage.getItem(PREF_INDEX_KEY) || localStorage.getItem(LEGACY_PREF_INDEX_KEY);
    if (val) {
      indexCache = JSON.parse(val);
      return indexCache!;
    }
  }
  indexCache = {};
  return indexCache;
}

export async function persistDownloadRecord(record: DownloadRecord): Promise<void> {
  const index = await getDownloadIndex();
  index[record.eventId] = record;
  const json = JSON.stringify(index);
  try {
    await Preferences.set({ key: PREF_INDEX_KEY, value: json });
  } catch {}
  try {
    localStorage.setItem(PREF_INDEX_KEY, json);
  } catch {}
  notify(record.eventId);
}

export async function removeDownloadRecord(eventId: string): Promise<void> {
  const index = await getDownloadIndex();
  if (index[eventId]) {
    delete index[eventId];
    const json = JSON.stringify(index);
    try {
      await Preferences.set({ key: PREF_INDEX_KEY, value: json });
    } catch {}
    try {
      localStorage.setItem(PREF_INDEX_KEY, json);
    } catch {}
    notify(eventId);
  }
}

export async function checkFileRecordValid(record: DownloadRecord): Promise<boolean> {
  if (!isNative()) {
    return Boolean(record.localUrl);
  }
  try {
    const directory = await getDownloadBaseDirectory();
    await Filesystem.stat({ path: record.path, directory });
    return true;
  } catch {
    return false;
  }
}

export async function getDownloadStatus(eventId: string): Promise<ActiveTaskState> {
  // Check active in-progress task first
  const active = activeTasks.get(eventId);
  if (active) {
    return {
      eventId,
      status: active.status,
      progress: active.progress,
      error: active.error,
    };
  }

  // Check saved index
  const index = await getDownloadIndex();
  const record = index[eventId];
  if (record) {
    const isValid = await checkFileRecordValid(record);
    if (isValid) {
      return {
        eventId,
        status: 'downloaded',
        progress: 100,
        record,
      };
    } else {
      // File missing on device -> reset to idle
      await removeDownloadRecord(eventId);
    }
  }

  return {
    eventId,
    status: 'idle',
    progress: 0,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

async function getUniqueFilePath(
  directory: Directory,
  folder: string,
  originalName: string
): Promise<{ fullPath: string; fileName: string }> {
  const clean = sanitizeFileName(originalName);
  const dotIndex = clean.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? clean.substring(0, dotIndex) : clean;
  const ext = dotIndex !== -1 ? clean.substring(dotIndex) : '';

  let candidate = clean;
  let counter = 1;

  while (true) {
    const fullPath = `${folder}/${candidate}`;
    try {
      await Filesystem.stat({ path: fullPath, directory });
      candidate = `${baseName} (${counter})${ext}`;
      counter++;
    } catch {
      return { fullPath, fileName: candidate };
    }
  }
}

const WRITE_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB base64 writing chunks

async function writeBufferInChunks(
  directory: Directory,
  path: string,
  buffer: ArrayBuffer,
  onProgress?: (pct: number) => void
): Promise<void> {
  const total = buffer.byteLength;
  const uint8 = new Uint8Array(buffer);
  let offset = 0;
  let isFirst = true;

  while (offset < total) {
    const nextOffset = Math.min(offset + WRITE_CHUNK_SIZE, total);
    const slice = uint8.subarray(offset, nextOffset);
    const base64Chunk = arrayBufferToBase64(slice);

    if (isFirst) {
      await Filesystem.writeFile({
        path,
        data: base64Chunk,
        directory,
        recursive: true,
      });
      isFirst = false;
    } else {
      await Filesystem.appendFile({
        path,
        data: base64Chunk,
        directory,
      });
    }

    offset = nextOffset;
    if (onProgress) {
      const writePct = 95 + Math.round((offset / total) * 5);
      onProgress(Math.min(100, writePct));
    }
  }
}

async function processQueue() {
  const runningCount = Array.from(activeTasks.values()).filter(
    (t) => t.status === 'downloading'
  ).length;

  if (runningCount >= MAX_CONCURRENT_DOWNLOADS) return;

  const nextTaskEntry = Array.from(activeTasks.entries()).find(
    ([, t]) => t.status === 'queued'
  );
  if (!nextTaskEntry) return;

  const [eventId] = nextTaskEntry;
  executeDownload(eventId);
}

async function executeDownload(eventId: string) {
  const task = activeTasks.get(eventId);
  if (!task) return;

  task.status = 'downloading';
  task.progress = 0;
  notify(eventId);

  const { message, abortController } = task;
  const signal = abortController.signal;

  let directory: Directory = Directory.Data;
  let allocatedPath: string | null = null;

  try {
    directory = await getDownloadBaseDirectory();
    task.directory = directory;

    const { folder, kind, isVoiceNote } = resolveFolderForMessage(message);
    const mimeType = message?.mediaInfo?.mimetype || message?.driveAttachment?.mimeType || 'application/octet-stream';
    const originalName = message?.content || message?.driveAttachment?.name || `file-${Date.now()}`;

    // Determine download URL
    const encryptedFile = message.encryptedFile;
    const mediaUrl = message.mediaUrl || message.driveAttachment?.thumbnailLink;

    let targetMxc = '';
    if (encryptedFile?.url) {
      targetMxc = encryptedFile.url;
    } else if (typeof mediaUrl === 'string' && mediaUrl.startsWith('mxc://')) {
      targetMxc = mediaUrl;
    }

    if (!targetMxc && !mediaUrl) {
      throw new Error('No media URL found on message');
    }

    const client = await getOrCreateMatrixClient().catch(() => null);
    const userId = client?.getUserId ? client.getUserId() : localStorage.getItem('matrix_user_id');
    const homeserver = getHomeserverUrl(userId).replace(/\/+$/, '');
    const accessToken =
      (client && typeof client.getAccessToken === 'function' ? client.getAccessToken() : null) ||
      localStorage.getItem('matrix_token') ||
      localStorage.getItem('matrix_access_token') ||
      '';

    let downloadUrl = mediaUrl;
    if (targetMxc) {
      const cleanMxc = targetMxc.replace('mxc://', '');
      const [server, ...mediaParts] = cleanMxc.split('/');
      const mediaId = mediaParts.join('/');
      downloadUrl = `${homeserver}/_matrix/client/v1/media/download/${server}/${mediaId}`;
    }

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    let response: Response = await fetch(downloadUrl, { headers, signal });
    if (!response.ok && targetMxc) {
      // Fall back to media v3
      const cleanMxc = targetMxc.replace('mxc://', '');
      const [server, ...mediaParts] = cleanMxc.split('/');
      const mediaId = mediaParts.join('/');
      const v3Url = `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}`;
      response = await fetch(v3Url, { signal });
    }

    if (!response || !response.ok) {
      throw new Error(`Download failed with status ${response?.status || 'network error'}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const totalExpected = contentLengthHeader
      ? parseInt(contentLengthHeader, 10)
      : (message?.mediaInfo?.size || 0);

    if (totalExpected > 100 * 1024 * 1024) {
      throw new Error('File exceeds 100 MB limit');
    }

    // Stream the response with 100ms throttled progress
    let encryptedBytes: Uint8Array;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      let lastUpdateTime = 0;

      while (true) {
        if (signal.aborted) throw new Error('Download cancelled');
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.length;
          if (receivedBytes > 100 * 1024 * 1024) {
            reader.cancel();
            throw new Error('File exceeds 100 MB limit');
          }
          chunks.push(value);

          const now = Date.now();
          if (now - lastUpdateTime >= 100) {
            lastUpdateTime = now;
            const pct = totalExpected > 0 ? Math.min(80, Math.round((receivedBytes / totalExpected) * 80)) : 40;
            task.progress = pct;
            notify(eventId);
          }
        }
      }

      encryptedBytes = new Uint8Array(receivedBytes);
      let pos = 0;
      for (const c of chunks) {
        encryptedBytes.set(c, pos);
        pos += c.length;
      }
    } else {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 100 * 1024 * 1024) {
        throw new Error('File exceeds 100 MB limit');
      }
      encryptedBytes = new Uint8Array(buffer);
      task.progress = 80;
      notify(eventId);
    }

    if (signal.aborted) throw new Error('Download cancelled');

    let decryptedBuffer: ArrayBuffer;

    if (encryptedFile) {
      // 80-95% Hash verification and AES-CTR decryption
      task.progress = 82;
      notify(eventId);

      if (encryptedFile.hashes && encryptedFile.hashes.sha256) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedBytes as unknown as BufferSource);
        const hashArray = new Uint8Array(hashBuffer);
        let binaryHash = '';
        for (let i = 0; i < hashArray.length; i++) {
          binaryHash += String.fromCharCode(hashArray[i]);
        }
        const computedSha256 = btoa(binaryHash).replace(/=+$/, '');
        if (computedSha256 !== encryptedFile.hashes.sha256) {
          throw new Error('SHA-256 hash mismatch for encrypted file');
        }
      }

      if (signal.aborted) throw new Error('Download cancelled');
      task.progress = 88;
      notify(eventId);

      const key = await crypto.subtle.importKey(
        'jwk',
        encryptedFile.key,
        { name: 'AES-CTR' },
        false,
        ['decrypt']
      );

      const ivBase64 = encryptedFile.iv;
      const padding = '='.repeat((4 - (ivBase64.length % 4)) % 4);
      const paddedIv = ivBase64 + padding;
      const ivBinary = atob(paddedIv);
      const iv = new Uint8Array(16);
      for (let i = 0; i < Math.min(ivBinary.length, 16); i++) {
        iv[i] = ivBinary.charCodeAt(i);
      }

      decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: iv, length: 64 },
        key,
        encryptedBytes as unknown as BufferSource
      );
      task.progress = 95;
      notify(eventId);
    } else {
      decryptedBuffer = encryptedBytes.buffer as ArrayBuffer;
      task.progress = 95;
      notify(eventId);
    }

    if (signal.aborted) throw new Error('Download cancelled');

    // 95-100% Write to app storage folder
    const unique = await getUniqueFilePath(directory, folder, originalName);
    allocatedPath = unique.fullPath;
    task.partialPath = allocatedPath;

    let localUrl = '';
    let uri = '';

    if (isNative()) {
      await writeBufferInChunks(directory, allocatedPath, decryptedBuffer, (pct) => {
        task.progress = pct;
        notify(eventId);
      });

      const uriResult = await Filesystem.getUri({ path: allocatedPath, directory });
      uri = uriResult.uri;
      localUrl = Capacitor.convertFileSrc(uri);
    } else {
      // Web fallback
      const blob = new Blob([decryptedBuffer], { type: mimeType });
      localUrl = URL.createObjectURL(blob);
      uri = localUrl;
      task.progress = 100;
      notify(eventId);
    }

    const record: DownloadRecord = {
      eventId,
      fileName: unique.fileName,
      path: allocatedPath,
      folder,
      size: decryptedBuffer.byteLength,
      status: 'downloaded',
      downloadedAt: Date.now(),
      mimeType,
      uri,
      localUrl,
      kind,
      isVoiceNote,
    };

    await persistDownloadRecord(record);
    activeTasks.delete(eventId);
    notify(eventId);
  } catch (err: any) {
    // If cancelled or failed, remove partial file
    if (allocatedPath && isNative()) {
      try {
        await Filesystem.deleteFile({ path: allocatedPath, directory });
      } catch {}
    }
    const isCancelled = err?.message === 'Download cancelled' || signal.aborted;
    if (isCancelled) {
      activeTasks.delete(eventId);
      notify(eventId);
    } else {
      console.error('[DownloadManager] Download failed for event', eventId, err);
      task.status = 'failed';
      task.error = err?.message || 'Download failed';
      notify(eventId);
    }
  } finally {
    processQueue();
  }
}

export function startDownload(message: any) {
  const eventId = message.id || message.eventId;
  if (!eventId) return;

  if (activeTasks.has(eventId)) {
    const t = activeTasks.get(eventId)!;
    if (t.status === 'failed') {
      activeTasks.delete(eventId);
    } else {
      return;
    }
  }

  const abortController = new AbortController();
  activeTasks.set(eventId, {
    abortController,
    message,
    status: 'queued',
    progress: 0,
  });

  notify(eventId);
  processQueue();
}

export function cancelDownload(eventId: string) {
  const task = activeTasks.get(eventId);
  if (task) {
    task.abortController.abort();
    activeTasks.delete(eventId);
    notify(eventId);
    processQueue();
  }
}

export async function markSavedToDevice(eventId: string): Promise<void> {
  const index = await getDownloadIndex();
  if (index[eventId]) {
    index[eventId].savedToDevice = true;
    await persistDownloadRecord(index[eventId]);
  }
}

export function ensureDownloaded(message: any): Promise<DownloadRecord> {
  const eventId = message?.id || message?.eventId;
  return new Promise(async (resolve, reject) => {
    const current = await getDownloadStatus(eventId);
    if (current.status === 'downloaded' && current.record) {
      resolve(current.record);
      return;
    }

    const unsub = subscribeDownloadEvents(async (updatedId) => {
      if (!updatedId || updatedId === eventId) {
        const state = await getDownloadStatus(eventId);
        if (state.status === 'downloaded' && state.record) {
          unsub();
          resolve(state.record);
        } else if (state.status === 'failed') {
          unsub();
          reject(new Error(state.error || 'Download failed'));
        }
      }
    });

    if (current.status !== 'downloading' && current.status !== 'queued') {
      startDownload(message);
    }
  });
}

export async function deleteDownloadedFile(eventId: string): Promise<void> {
  const index = await getDownloadIndex();
  const record = index[eventId];
  if (record) {
    if (isNative()) {
      try {
        const directory = await getDownloadBaseDirectory();
        await Filesystem.deleteFile({ path: record.path, directory });
      } catch (err) {
        console.warn('[DownloadManager] Filesystem delete error:', err);
      }
    } else if (record.localUrl && record.localUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(record.localUrl);
      } catch {}
    }
    await removeDownloadRecord(eventId);
  }
}

export async function openDownloadedFile(
  record: DownloadRecord,
  onOpenInAppMedia?: (localUrl: string, kind: string) => void
): Promise<void> {
  const isMedia = ['image', 'video', 'audio'].includes(record.kind);
  if (isMedia && onOpenInAppMedia) {
    onOpenInAppMedia(record.localUrl, record.kind);
    return;
  }

  if (isNative()) {
    try {
      await FileOpener.open({
        filePath: record.uri,
        contentType: record.mimeType || 'application/octet-stream',
      });
    } catch (err) {
      console.warn('[DownloadManager] FileOpener failed:', err);
      if (onOpenInAppMedia) {
        onOpenInAppMedia(record.localUrl, record.kind);
      }
    }
  } else {
    // Web fallback
    if (record.localUrl) {
      window.open(record.localUrl, '_blank');
    }
  }
}

export async function shareDownloadedFile(record: DownloadRecord): Promise<void> {
  if (isNative()) {
    try {
      await Share.share({
        title: record.fileName,
        url: record.uri,
      });
    } catch (err) {
      console.warn('[DownloadManager] Share plugin error:', err);
    }
  } else if (navigator.share) {
    try {
      await navigator.share({
        title: record.fileName,
        url: record.localUrl,
      });
    } catch {}
  }
}

export async function getFolderStatistics(): Promise<FolderStats[]> {
  const index = await getDownloadIndex();
  const allRecords = Object.values(index);

  // Validate files on disk
  const validatedRecords: DownloadRecord[] = [];
  for (const rec of allRecords) {
    const valid = await checkFileRecordValid(rec);
    if (valid) {
      validatedRecords.push(rec);
    } else {
      await removeDownloadRecord(rec.eventId);
    }
  }

  const folderDefs = [
    { name: 'Images', folder: APP_FOLDERS.IMAGES },
    { name: 'Videos', folder: APP_FOLDERS.VIDEOS },
    { name: 'Audio', folder: APP_FOLDERS.AUDIO },
    { name: 'Voice Notes', folder: APP_FOLDERS.VOICE_NOTES },
    { name: 'Documents', folder: APP_FOLDERS.DOCUMENTS },
  ];

  return folderDefs.map((def) => {
    const files = validatedRecords.filter((r) => r.folder === def.folder);
    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
    return {
      name: def.name,
      folder: def.folder,
      count: files.length,
      totalSize,
      files: files.sort((a, b) => b.downloadedAt - a.downloadedAt),
    };
  });
}
