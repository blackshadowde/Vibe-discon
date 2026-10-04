import { registerPlugin, Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
//import { Media } from '@capacitor-community/media';
import { isNative } from '../native/platform';
import { ensureDownloaded, markSavedToDevice, DownloadRecord } from './downloadManager';

export interface SaveToDownloadsPlugin {
  save(options: { path: string; name: string; mimeType: string }): Promise<{ uri: string; folder: string }>;
}

export const SaveToDownloads = registerPlugin<SaveToDownloadsPlugin>('SaveToDownloads');

export const PREF_SAVE_CONFIRM_DONT_ASK = 'vibe_save_to_device_dont_ask_again';

export interface SaveConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

let confirmHandler: ((req: SaveConfirmRequest) => void) | null = null;

export function registerSaveConfirmHandler(handler: (req: SaveConfirmRequest) => void) {
  confirmHandler = handler;
  return () => {
    if (confirmHandler === handler) {
      confirmHandler = null;
    }
  };
}

export async function shouldShowSaveConfirmation(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: PREF_SAVE_CONFIRM_DONT_ASK });
    if (value === 'true') return false;
  } catch {}
  try {
    if (localStorage.getItem(PREF_SAVE_CONFIRM_DONT_ASK) === 'true') return false;
  } catch {}
  return true;
}

export async function setSaveConfirmationDontAsk(dontAsk: boolean): Promise<void> {
  if (dontAsk) {
    try {
      await Preferences.set({ key: PREF_SAVE_CONFIRM_DONT_ASK, value: 'true' });
    } catch {}
    try {
      localStorage.setItem(PREF_SAVE_CONFIRM_DONT_ASK, 'true');
    } catch {}
  }
}

let toastHandler: ((msg: string, isError?: boolean, onRetry?: () => void) => void) | null = null;

export function registerToastHandler(handler: (msg: string, isError?: boolean, onRetry?: () => void) => void) {
  toastHandler = handler;
  return () => {
    if (toastHandler === handler) {
      toastHandler = null;
    }
  };
}

export function showSaveToast(msg: string, isError = false, onRetry?: () => void) {
  if (toastHandler) {
    toastHandler(msg, isError, onRetry);
  } else {
    console.log(`[Toast] ${msg}`);
  }
}

export async function saveToDevice(message: any): Promise<boolean> {
  const eventId = message?.id || message?.eventId;
  if (!eventId) return false;

  // 1. First time only, show confirmation dialog if needed
  const needsConfirm = await shouldShowSaveConfirmation();
  if (needsConfirm && confirmHandler) {
    const confirmed = await new Promise<boolean>((resolve) => {
      confirmHandler!({ resolve });
    });
    if (!confirmed) {
      return false;
    }
  }

  const runSave = async (): Promise<boolean> => {
    try {
      // 2. Ensure in-app download is complete
      const record: DownloadRecord = await ensureDownloaded(message);

      const isImage = record.kind === 'image';
      const isVideo = record.kind === 'video';
      const isMedia = isImage || isVideo;

      if (!isNative()) {
        // Web fallback: download blob via <a download>
        if (record.localUrl) {
          const a = document.createElement('a');
          a.href = record.localUrl;
          a.download = record.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await markSavedToDevice(eventId);
          showSaveToast(`Saved ${record.fileName}`);
          return true;
        }
        throw new Error('No file URL found for download');
      }

      // Native saving
      if (isMedia) {
        // Save to Gallery in album "Vibe"
        let albumIdentifier: string | undefined = undefined;
        try {
          const { albums } = await Media.getAlbums();
          const existing = albums.find((a) => a.name.toLowerCase() === 'vibe');
          if (existing) {
            albumIdentifier = existing.identifier;
          } else {
            await Media.createAlbum({ name: 'Vibe' });
            const updated = await Media.getAlbums();
            const created = updated.albums.find((a) => a.name.toLowerCase() === 'vibe');
            if (created) {
              albumIdentifier = created.identifier;
            }
          }
        } catch (albumErr) {
          console.warn('[Media] Album error (saving anyway):', albumErr);
        }

        const baseName = record.fileName.replace(/\.[^/.]+$/, '');
        if (isVideo) {
          await Media.saveVideo({
            path: record.uri || record.path,
            albumIdentifier,
            fileName: baseName,
          });
        } else {
          await Media.savePhoto({
            path: record.uri || record.path,
            albumIdentifier,
            fileName: baseName,
          });
        }

        await markSavedToDevice(eventId);
        showSaveToast('Saved to Gallery > Vibe');
        return true;
      } else {
        // Audio, voice notes and documents: call custom plugin SaveToDownloads
        try {
          if (Capacitor.isPluginAvailable('SaveToDownloads')) {
            await SaveToDownloads.save({
              path: record.uri || record.path,
              name: record.fileName,
              mimeType: record.mimeType || 'application/octet-stream',
            });
            await markSavedToDevice(eventId);
            showSaveToast('Saved to Downloads/Vibe');
            return true;
          }
        } catch (pluginErr) {
          console.warn('[SaveToDownloads] Plugin call failed, falling back to Share.share:', pluginErr);
        }

        // Fallback: Share.share so user can choose "Save to Files"
        try {
          await Share.share({
            title: record.fileName,
            url: record.uri,
          });
          await markSavedToDevice(eventId);
          showSaveToast('Saved to Downloads/Vibe');
          return true;
        } catch (shareErr: any) {
          throw new Error(shareErr?.message || 'Could not save file to Downloads');
        }
      }
    } catch (err: any) {
      console.error('[saveToDevice] error:', err);
      showSaveToast(`Failed to save: ${err?.message || 'Unknown error'}`, true, () => {
        runSave();
      });
      return false;
    }
  };

  return await runSave();
}
