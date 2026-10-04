import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export { saveToDevice } from '../services/deviceStorage';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function openUrl(url: string): Promise<void> {
  if (isNative()) {
    try {
      await Browser.open({ url });
    } catch (err) {
      console.error('[Native Platform] Failed to open URL via Browser plugin:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function copyText(text: string): Promise<void> {
  if (isNative()) {
    try {
      await Clipboard.write({ string: text });
    } catch (err) {
      console.error('[Native Platform] Failed to copy text via Clipboard plugin:', err);
      try {
        await navigator.clipboard.writeText(text);
      } catch {}
    }
  } else {
    await navigator.clipboard.writeText(text);
  }
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64 || '');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (isNative()) {
    try {
      const base64Data = await blobToBase64(blob);
      const fileResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });
      await Share.share({
        title: filename,
        url: fileResult.uri,
      });
    } catch (err) {
      console.error('[Native Platform] Failed to save and share file:', err);
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function haptic(): Promise<void> {
  if (isNative()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (err) {
      console.warn('[Native Platform] Haptics error:', err);
    }
  } else {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
  }
}

export function registerBackButtonHandler(handler: (info: { canGoBack: boolean }) => void) {
  let sub: any = null;
  if (isNative()) {
    App.addListener('backButton', (data) => {
      handler(data);
    }).then(s => {
      sub = s;
    });
  }
  return {
    remove: () => {
      if (sub) {
        sub.remove();
      }
    }
  };
}

export function registerAppStateChangeListener(handler: (isActive: boolean) => void) {
  let sub: any = null;
  if (isNative()) {
    App.addListener('appStateChange', (state) => {
      handler(state.isActive);
    }).then(s => {
      sub = s;
    });
  }
  return {
    remove: () => {
      if (sub) {
        sub.remove();
      }
    }
  };
}

export async function capturePhoto(onPermissionDenied?: (msg: string) => void): Promise<File | null> {
  if (isNative()) {
    try {
      const check = await Camera.checkPermissions();
      if (check.camera !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['camera'] });
        if (req.camera !== 'granted') {
          if (onPermissionDenied) {
            onPermissionDenied('Camera permission is needed');
          }
          return null;
        }
      }

      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 85,
        correctOrientation: true,
        saveToGallery: false,
      });

      if (!photo || !photo.webPath) {
        return null;
      }

      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const filename = `photo-${Date.now()}.jpg`;
      return new File([blob], filename, { type: 'image/jpeg' });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/cancel|dismiss|closed/i.test(msg)) {
        return null;
      }
      if (/permission/i.test(msg)) {
        if (onPermissionDenied) {
          onPermissionDenied('Camera permission is needed');
        }
        return null;
      }
      console.warn('[Camera] capturePhoto note:', err);
      return null;
    }
  }

  // Web fallback: programmatic file input with camera capture
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(file);
    };

    input.onchange = () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      finish(file);
    };

    const onFocus = () => {
      setTimeout(() => {
        if (!resolved && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 1000);
    };

    window.addEventListener('focus', onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function registerAppRestoredCameraHandler(handler: (file: File) => void) {
  let sub: any = null;
  if (isNative()) {
    App.addListener('appRestoredResult', async (data: any) => {
      try {
        if (data?.pluginId === 'Camera' && data?.methodName === 'getPhoto' && data?.success && data?.data) {
          const photoData = data.data;
          const webPath = photoData.webPath || photoData.path;
          if (webPath) {
            const response = await fetch(webPath);
            const blob = await response.blob();
            const filename = `photo-${Date.now()}.jpg`;
            const file = new File([blob], filename, { type: 'image/jpeg' });
            handler(file);
          }
        }
      } catch (err) {
        console.warn('[Camera] appRestoredResult error:', err);
      }
    }).then((s) => {
      sub = s;
    });
  }
  return {
    remove: () => {
      if (sub) {
        sub.remove();
      }
    },
  };
}
