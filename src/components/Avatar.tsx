import React, { useState, useEffect } from 'react';
import { getOrCreateMatrixClient } from '../services/matrix';

export interface AvatarProps {
  mxcUrl?: string | null;
  alt?: string;
  className?: string;
  fallbackText?: string;
  fallbackBg?: string;
  fallback?: string;
  onClick?: (e?: any) => void;
  title?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  mxcUrl,
  alt = 'Avatar',
  className = 'w-9 h-9 rounded-full object-cover',
  fallbackText = 'U',
  fallbackBg = 'bg-[#5865f2]',
  fallback,
  onClick,
  title,
}) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function resolveAvatarUrl() {
      // Check 1: if (!mxcUrl) return setUrl(fallback)
      if (!mxcUrl) {
        if (isMounted) setUrl(fallback || null);
        return;
      }

      // Check 2: if (mxcUrl.startsWith('http')) return setUrl(mxcUrl)
      if (mxcUrl.startsWith('http') || mxcUrl.startsWith('blob:') || mxcUrl.startsWith('data:')) {
        // v43 compatibility: check if this is a Matrix media URL that might require authentication
        if (mxcUrl.includes('/_matrix/media/')) {
          const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
          if (token && isMounted) {
            try {
              const res = await fetch(mxcUrl, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                if (isMounted) {
                  setUrl(blobUrl);
                  return;
                }
              }
            } catch (err) {
              console.warn('[Avatar] auth fetch error for http media:', err);
            }
          }
        }

        if (isMounted) setUrl(mxcUrl);
        return;
      }

      // Check 3: If it is MXC, use the room or user object's built-in avatar getter, OR explicitly call client.mxcUrlToHttp(mxcUrl)
      if (mxcUrl.startsWith('mxc://')) {
        try {
          const client = await getOrCreateMatrixClient();
          const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
          
          let httpUrl = '';
          if (client && typeof client.mxcUrlToHttp === 'function') {
            httpUrl = client.mxcUrlToHttp(mxcUrl, 256, 256, 'crop') || client.mxcUrlToHttp(mxcUrl) || '';
          }

          if (!httpUrl) {
            const parts = mxcUrl.replace('mxc://', '').split('/');
            if (parts.length >= 2) {
              const userId = localStorage.getItem('matrix_user_id');
              const baseUrl = (typeof (client as any).getHomeserverUrl === 'function') ? (client as any).getHomeserverUrl() : `https://matrix.org`;
              httpUrl = `${baseUrl}/_matrix/media/v3/download/${parts[0]}/${parts[1]}`;
            }
          }

          if (httpUrl && isMounted) {
            // Fetch as blob with auth header for v43 compatibility
            try {
              const res = await fetch(httpUrl, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                if (isMounted) {
                  setUrl(blobUrl);
                  return;
                }
              }
            } catch (blobErr) {
              console.warn('[Avatar] authenticated blob fetch error:', blobErr);
            }

            setUrl(httpUrl);
            return;
          }
        } catch (err) {
          console.warn('[Avatar] client.mxcUrlToHttp error:', err);
        }
      }

      if (isMounted) {
        setUrl(mxcUrl || fallback || null);
      }
    }

    resolveAvatarUrl();

    return () => {
      isMounted = false;
    };
  }, [mxcUrl, fallback]);

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onClick={onClick}
        title={title}
        onError={() => {
          // If resolved image fails to load, gracefully fall back
          if (fallback && url !== fallback) {
            setUrl(fallback);
          } else {
            setUrl(null);
          }
        }}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      title={title}
      className={`${className} ${fallbackBg} text-white font-bold flex items-center justify-center text-xs shrink-0 select-none shadow`}
    >
      {fallbackText.slice(0, 2).toUpperCase()}
    </div>
  );
};
