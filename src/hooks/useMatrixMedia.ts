import { useState, useEffect, useRef } from 'react';
import { getOrCreateMatrixClient, getHomeserverUrl, fetchDecryptedMedia } from '../services/matrix';
import { Message } from '../types';

export const useMatrixMedia = (
  source: Message | { mediaUrl?: string; encryptedFile?: any; mimeType?: string },
  disabled = false
) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const createdUrlsRef = useRef<string[]>([]);

  // Check if source is a Message
  const isMessage = Boolean(source && 'id' in source);
  const msgSource = isMessage ? (source as Message) : null;
  const objSource = !isMessage ? (source as { mediaUrl?: string; encryptedFile?: any; mimeType?: string }) : null;
  const encryptedFile = msgSource ? msgSource.encryptedFile : objSource?.encryptedFile;
  const mediaUrl = msgSource
    ? (msgSource.mediaUrl || msgSource.driveAttachment?.thumbnailLink)
    : objSource?.mediaUrl;
  const mimeType = msgSource
    ? msgSource.mediaInfo?.mimetype
    : objSource?.mimeType;

  useEffect(() => {
    return () => {
      // Revoke all created blob URLs only when the component unmounts
      createdUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchMedia() {
      try {
        setLoading(true);
        setError(false);

        let blob: Blob;

        if (encryptedFile) {
          blob = await fetchDecryptedMedia(encryptedFile, mimeType);
        } else {
          if (mediaUrl && mediaUrl.startsWith('blob:')) {
            if (isMounted) {
              setBlobUrl(mediaUrl);
              setLoading(false);
            }
            return;
          }

          if (!mediaUrl || !mediaUrl.startsWith('mxc://')) {
            if (isMounted) {
              setBlobUrl(null);
              setLoading(false);
            }
            return;
          }

          const cleanMxc = mediaUrl.replace('mxc://', '');
          const parts = cleanMxc.split('/');
          const server = parts[0];
          const mediaId = parts.slice(1).join('/');

          const client = await getOrCreateMatrixClient().catch(() => null);
          const userId = client?.getUserId ? client.getUserId() : localStorage.getItem('matrix_user_id');
          const homeserver = getHomeserverUrl(userId).replace(/\/+$/, '');
          const accessToken =
            (client && typeof client.getAccessToken === 'function' ? client.getAccessToken() : null) ||
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

          if (!response || !response.ok) throw new Error('Failed to fetch media');
          blob = await response.blob();
        }

        if (isMounted) {
          const createdBlobUrl = URL.createObjectURL(blob);
          createdUrlsRef.current.push(createdBlobUrl);
          setBlobUrl(createdBlobUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('[MatrixMedia] Error fetching media:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchMedia();

    return () => {
      isMounted = false;
    };
  }, [
    msgSource?.id,
    msgSource?.status,
    encryptedFile?.url,
    mediaUrl,
    mimeType,
    disabled,
  ]);

  return { blobUrl, loading, error };
};

export const useMatrixImage = useMatrixMedia;

