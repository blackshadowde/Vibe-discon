import { useState, useEffect } from 'react';
import { extractUrls } from '../utils/linkify';
import { getUrlPreview, LinkPreviewData } from '../services/matrix';
import {
  getLinkPreviewsEnabled,
  useLinkPreviewsEnabled,
  LINK_PREVIEWS_CHANGED_EVENT,
} from '../utils/privacySettings';
import {
  isEncryptedLinkPreviewsEnabled,
  EVENT_LINK_PREVIEW_SETTINGS,
} from '../utils/linkPreviewSettings';

export function useLinkPreview(content?: string, isEncryptedRoom?: boolean) {
  const [linkPreviewsEnabled] = useLinkPreviewsEnabled();
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      // If setting is off, clear preview immediately and perform no network requests
      if (!linkPreviewsEnabled || !getLinkPreviewsEnabled() || !content) {
        if (isMounted) {
          setPreview(null);
          setLoading(false);
        }
        return;
      }

      // In encrypted rooms, skip unless user enabled link previews in encrypted chats
      if (isEncryptedRoom && !isEncryptedLinkPreviewsEnabled()) {
        if (isMounted) {
          setPreview(null);
          setLoading(false);
        }
        return;
      }

      const urls = extractUrls(content);
      const firstUrl = urls[0];
      if (!firstUrl) {
        if (isMounted) {
          setPreview(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const data = await getUrlPreview(firstUrl);
        if (isMounted) {
          setPreview(data);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setPreview(null);
          setLoading(false);
        }
      }
    }

    load();

    const onSettingsChange = () => {
      load();
    };

    window.addEventListener(LINK_PREVIEWS_CHANGED_EVENT, onSettingsChange);
    window.addEventListener(EVENT_LINK_PREVIEW_SETTINGS, onSettingsChange);

    return () => {
      isMounted = false;
      window.removeEventListener(LINK_PREVIEWS_CHANGED_EVENT, onSettingsChange);
      window.removeEventListener(EVENT_LINK_PREVIEW_SETTINGS, onSettingsChange);
    };
  }, [content, isEncryptedRoom, linkPreviewsEnabled]);

  // Synchronously return null if disabled so that MessageItem immediately hides preview cards live
  return {
    preview: linkPreviewsEnabled ? preview : null,
    loading: linkPreviewsEnabled ? loading : false,
  };
}
