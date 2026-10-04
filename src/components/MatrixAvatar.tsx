import React, { useState, useEffect } from 'react';
import { getOrCreateMatrixClient, getHomeserverUrl } from '../services/matrix';

export interface MatrixAvatarProps {
  mxcUrl?: string | null;
  name?: string;
  size?: number;
  className?: string;
  onClick?: (e?: any) => void;
  title?: string;
}

/**
 * MatrixAvatar component modeled after FluffyChat's architecture.
 * Handles MXC resolution, HTTP direct links, and graceful initials fallback.
 */
export const MatrixAvatar: React.FC<MatrixAvatarProps> = ({
  mxcUrl,
  name = '?',
  size = 36,
  className = '',
  onClick,
  title,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let currentBlobUrl: string | null = null;
    setError(false);

    async function resolve() {
      if (!mxcUrl) {
        if (isMounted) setResolvedUrl(null);
        return;
      }

      const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');

      // 1. Handle mxc:// URIs
      if (mxcUrl.startsWith('mxc://')) {
        try {
          const client = await getOrCreateMatrixClient();
          let httpUrl = '';
          if (client && typeof client.mxcUrlToHttp === 'function') {
            // v43: try to get the authenticated endpoint URL if possible, or fallback to standard
            httpUrl = client.mxcUrlToHttp(mxcUrl, size * 2, size * 2, 'crop', false, false, true) || 
                      client.mxcUrlToHttp(mxcUrl, size * 2, size * 2, 'crop') || 
                      client.mxcUrlToHttp(mxcUrl) || '';
          }

          if (!httpUrl) {
            const parts = mxcUrl.replace('mxc://', '').split('/');
            if (parts.length >= 2) {
              const userId = localStorage.getItem('matrix_user_id');
              const baseUrl = getHomeserverUrl(userId);
              httpUrl = `${baseUrl}/_matrix/media/v3/download/${parts[0]}/${parts[1]}`;
            }
          }

          if (httpUrl) {
            const res = await fetch(httpUrl, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
              const blob = await res.blob();
              const bUrl = URL.createObjectURL(blob);
              if (isMounted) {
                currentBlobUrl = bUrl;
                setResolvedUrl(bUrl);
                return;
              } else {
                URL.revokeObjectURL(bUrl);
              }
            }
          }
        } catch (err) {
          console.warn('[MatrixAvatar] resolution error for mxc:', err);
        }
      } 
      // 2. Handle Matrix media HTTP links that might need auth
      else if (mxcUrl.includes('/_matrix/media/')) {
        try {
          const res = await fetch(mxcUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const blob = await res.blob();
            const bUrl = URL.createObjectURL(blob);
            if (isMounted) {
              currentBlobUrl = bUrl;
              setResolvedUrl(bUrl);
              return;
            } else {
              URL.revokeObjectURL(bUrl);
            }
          }
        } catch (err) {
          console.warn('[MatrixAvatar] auth fetch error for http media:', err);
        }
      }
      
      // 3. Fallback for data:, blob:, or ordinary http links
      if (isMounted) {
        setResolvedUrl(mxcUrl);
      }
    }

    resolve();

    return () => {
      isMounted = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [mxcUrl, size]);

  const initials = (name || '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Simple color generation from name
  const getBackgroundColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-blue-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-purple-500',
      'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500',
      'bg-cyan-500', 'bg-teal-500'
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const combinedClassName = `rounded-full flex items-center justify-center shrink-0 select-none overflow-hidden transition-all ${className}`;
  const style = { width: size, height: size, fontSize: Math.max(10, size / 2.5) };

  if (resolvedUrl && !error) {
    return (
      <div className={combinedClassName} style={style} onClick={onClick} title={title || name}>
        <img
          src={resolvedUrl}
          alt={name}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${combinedClassName} ${getBackgroundColor(name || '')} text-white font-bold shadow-sm`}
      style={style}
      onClick={onClick}
      title={title || name}
    >
      {initials}
    </div>
  );
};
