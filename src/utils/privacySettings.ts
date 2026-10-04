import { useState, useEffect, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';

export const LINK_PREVIEWS_PREF_KEY = 'link_previews_enabled';
export const LINK_PREVIEWS_CHANGED_EVENT = 'link-previews-changed';

// In-memory cache for synchronous reads with true default
let linkPreviewsEnabledMemory: boolean = (() => {
  try {
    const val = localStorage.getItem(LINK_PREVIEWS_PREF_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {}
  return true;
})();

// Initialize asynchronously from Capacitor Preferences if native
if (typeof window !== 'undefined') {
  Preferences.get({ key: LINK_PREVIEWS_PREF_KEY })
    .then(({ value }) => {
      if (value !== null && value !== undefined) {
        const parsed = value === 'true';
        if (parsed !== linkPreviewsEnabledMemory) {
          linkPreviewsEnabledMemory = parsed;
          try {
            localStorage.setItem(LINK_PREVIEWS_PREF_KEY, String(parsed));
          } catch {}
          window.dispatchEvent(
            new CustomEvent(LINK_PREVIEWS_CHANGED_EVENT, { detail: { enabled: parsed } })
          );
        }
      }
    })
    .catch(() => {});
}

export function getLinkPreviewsEnabled(): boolean {
  return linkPreviewsEnabledMemory;
}

export async function setLinkPreviewsEnabled(value: boolean): Promise<void> {
  linkPreviewsEnabledMemory = value;

  try {
    localStorage.setItem(LINK_PREVIEWS_PREF_KEY, String(value));
  } catch {}

  try {
    await Preferences.set({
      key: LINK_PREVIEWS_PREF_KEY,
      value: String(value),
    });
  } catch {}

  // Notify all subscribers immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(LINK_PREVIEWS_CHANGED_EVENT, { detail: { enabled: value } })
    );
  }
}

export function useLinkPreviewsEnabled(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(linkPreviewsEnabledMemory);

  useEffect(() => {
    setEnabledState(linkPreviewsEnabledMemory);

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnabledState(customEvent.detail.enabled);
      } else {
        setEnabledState(linkPreviewsEnabledMemory);
      }
    };

    window.addEventListener(LINK_PREVIEWS_CHANGED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(LINK_PREVIEWS_CHANGED_EVENT, handleUpdate);
    };
  }, []);

  const setEnabled = useCallback((val: boolean) => {
    setEnabledState(val);
    setLinkPreviewsEnabled(val);
  }, []);

  return [enabled, setEnabled];
}
