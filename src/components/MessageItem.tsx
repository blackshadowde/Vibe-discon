import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message, MessageEncryptionState, EncryptionLevel } from '../types';
import {
  ExternalLink,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  File,
  Copy,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Star,
  MoreHorizontal,
  Ban,
  Lock,
  Unlock,
  ShieldAlert,
  Key,
  Reply,
  RefreshCw,
  FileArchive,
  Download,
  X,
  MoreVertical,
  Share2,
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { getFriendlyFileType, formatBytes } from '../utils/files';
import { resolveMxcToHttp, getOrCreateMatrixClient, fetchDecryptedMedia } from '../services/matrix';
import { getNameColor } from '../utils/color';
import { MatrixAvatar } from './MatrixAvatar';
import { ReplyHeader } from './ReplyHeader';
import { useMatrixMedia, useMatrixImage } from '../hooks/useMatrixMedia';
import { useLinkPreview } from '../hooks/useLinkPreview';
import { MediaDownloadControl } from './MediaDownloadControl';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { openUrl, copyText, saveBlob, registerBackButtonHandler, isNative, saveToDevice } from '../native/platform';
import { getMediaKind } from '../utils/mediaKind';
import { linkifyText } from '../utils/linkify';
import type { LinkPreviewData } from '../services/matrix';

interface MessageItemProps {
  message: Message;
  matrixRoomId?: string;
  isCompact?: boolean;
  isStarred?: boolean;
  isEditing?: boolean;
  isJumpHighlighted?: boolean;
  nameColor?: string;
  currentUserAvatar?: string;
  currentUserDisplayName?: string;
  onTap?: (messageId: string) => void;
  onLongPress?: (message: Message) => void;
  onToggleStar?: (messageId: string) => void;
  onOpenAttachment?: (attachment: NonNullable<Message['driveAttachment']>) => void;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onReplyClick?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onRetry?: (message: Message) => void;
  onCancelSending?: (messageId: string) => void;
  onUserClick?: (user: { userName: string; userId: string; userAvatar?: string; avatarColor?: string }) => void;
  onOpenRestoreModal?: () => void;
  onOpenE2EEDebug?: () => void;
}

const EncryptionBadge: React.FC<{
  encryption?: MessageEncryptionState;
  isEncrypted?: boolean;
  isDecryptionFailure?: boolean;
  onOpenE2EEDebug?: () => void;
}> = ({ encryption, isEncrypted, isDecryptionFailure, onOpenE2EEDebug }) => {
  const [showSheet, setShowSheet] = useState(false);

  const level: EncryptionLevel = encryption?.level || (
    isDecryptionFailure
      ? 'undecryptable'
      : isEncrypted
      ? 'encrypted'
      : 'unencrypted'
  );

  const defaultReasons: Record<EncryptionLevel, string> = {
    verified: 'Encrypted and verified sender device',
    encrypted: 'Encrypted, sender device not verified',
    warning: 'Warning: untrusted or unsigned sender device',
    unencrypted: 'Sent without encryption',
    pending: 'Sending (encryption confirmation pending)',
    undecryptable: "Waiting for this message's key or decryption failed",
  };

  const reason = encryption?.reason || defaultReasons[level];

  const getBadgeConfig = () => {
    switch (level) {
      case 'verified':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          title: 'Verified Encrypted',
          color: 'text-emerald-400',
        };
      case 'encrypted':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />,
          title: 'Encrypted (Unverified)',
          color: 'text-zinc-400',
        };
      case 'warning':
        return {
          icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          title: 'Encryption Warning',
          color: 'text-amber-400',
        };
      case 'unencrypted':
        return {
          icon: <Unlock className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
          title: 'Sent Without Encryption',
          color: 'text-rose-400',
        };
      case 'pending':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />,
          title: 'Pending Encryption',
          color: 'text-zinc-500',
        };
      case 'undecryptable':
        return {
          icon: <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          title: 'Decryption Pending',
          color: 'text-amber-400',
        };
    }
  };

  const { icon, title, color } = getBadgeConfig();

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowSheet(true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowSheet(true);
        }}
        title={`${title}: ${reason}`}
        aria-label={`${title}: ${reason}`}
        className="min-w-[44px] min-h-[44px] -m-[15px] flex items-center justify-center cursor-pointer select-none group/enc focus:outline-none"
      >
        <span className="w-3.5 h-3.5 flex items-center justify-center transition-transform group-hover/enc:scale-115">
          {icon}
        </span>
      </button>

      {showSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            setShowSheet(false);
          }}
        >
          <div
            className="bg-[#2b2d31] border border-[#383a40] rounded-2xl max-w-sm w-full p-4 shadow-2xl flex flex-col gap-3 text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#1e1f22] border border-[#3f4147]">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-bold ${color}`}>{title}</h4>
                <p className="text-xs text-[#dbdee1] font-medium mt-0.5">{reason}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#383a40]/60">
              {onOpenE2EEDebug && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSheet(false);
                    onOpenE2EEDebug();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Verify Devices
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSheet(false)}
                className="px-3 py-1.5 rounded-lg bg-[#35373c] hover:bg-[#3f4147] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const FileMessageCard: React.FC<{
  message: Message;
  onOpenRestoreModal?: () => void;
  onCancelSending?: (messageId: string) => void;
}> = ({ message, onOpenRestoreModal, onCancelSending }) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const name = message.content || 'file';
  const size = message.mediaInfo?.size || 0;
  const mime = message.mediaInfo?.mimetype || 'application/octet-stream';
  const ext = name.split('.').pop()?.toLowerCase();

  const isSending = message.status === 'sending';
  const uploadProgress = message.uploadProgress || 0;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading || isSending) return;

    try {
      setDownloading(true);
      setError(null);
      setProgress(10);

      // Decrypt on demand
      const encryptedFile = message.encryptedFile;
      if (!encryptedFile) {
        throw new Error('No encrypted file found for this message');
      }

      setProgress(30);
      const blob = await fetchDecryptedMedia(encryptedFile, mime);
      setProgress(80);

      // Save blob using Capacitor or Web fallback
      await saveBlob(blob, name);
      setProgress(100);
    } catch (err: any) {
      console.error('File decryption or saving failed:', err);
      setError(err?.message || 'Decryption failed');
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setProgress(0);
      }, 800);
    }
  };

  const getFileIcon = () => {
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive className="w-5 h-5 text-amber-500" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    if (['doc', 'docx', 'pdf', 'txt', 'rtf'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    return <File className="w-5 h-5 text-cyan-400" />;
  };

  return (
    <div className="mt-2.5 w-full max-w-full sm:max-w-md bg-[#2b2d31] border border-[#3f4147] rounded-xl p-3 shadow-md hover:bg-[#313338] transition-colors duration-150">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[#1e1f22] border border-[#383a40] shrink-0">
          {getFileIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white truncate" title={name}>
            {name}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-[#949ba4] flex-wrap">
            <span>{getFriendlyFileType(mime)}</span>
            <span>•</span>
            <span className="font-mono">{formatBytes(size)}</span>
            {(message.isEncrypted || isSending) && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5 text-emerald-400" title="End-to-End Encrypted">
                  <Lock className="w-3 h-3 inline" />
                  <span>Encrypted</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {isSending && (
        <div className="mt-2.5 bg-[#1e1f22]/50 p-2 rounded-lg border border-[#383a40]/50">
          <div className="flex items-center justify-between text-xs mb-1 text-[#949ba4]">
            <span className="flex items-center gap-1.5 font-medium animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 text-[#5865f2] animate-spin" />
              Uploading encrypted file…
            </span>
            <span className="font-mono font-bold text-white">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-[#1e1f22] h-1.5 rounded-full overflow-hidden border border-[#383a40]">
            <div
              className="bg-[#5865f2] h-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {downloading && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs mb-1 text-[#949ba4]">
            <span className="flex items-center gap-1.5 font-medium animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 text-[#5865f2] animate-spin" />
              Decrypting and downloading…
            </span>
            <span className="font-mono font-bold text-white">{progress}%</span>
          </div>
          <div className="w-full bg-[#1e1f22] h-1.5 rounded-full overflow-hidden border border-[#383a40]">
            <div
              className="bg-[#5865f2] h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-[#383a40] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#949ba4] flex items-center gap-1 uppercase tracking-wider">
          <Lock className="w-3 h-3 text-emerald-500" />
          <span>{isSending ? 'Uploading File' : 'E2EE File Attachment'}</span>
        </span>
        {isSending ? (
          onCancelSending && (
            <button
              type="button"
              onClick={() => onCancelSending(message.id)}
              className="px-2.5 py-1 text-xs font-bold text-[#949ba4] hover:text-white hover:bg-white/10 rounded-lg border border-[#3f4147] transition-all cursor-pointer shrink-0"
            >
              Cancel
            </button>
          )
        ) : (
          <MediaDownloadControl message={message} />
        )}
      </div>
    </div>
  );
};

// Poster frame memory cache
const globalPosterCache = new Map<string, string>();

const VideoThumbnailBubble: React.FC<{
  message: Message;
  posterUrl: string | null;
  loading: boolean;
  onPlayClick: () => void;
  onCancelSending?: (messageId: string) => void;
}> = ({ message, posterUrl, loading, onPlayClick, onCancelSending }) => {
  const isSending = message.status === 'sending';
  const progressPercent = message.uploadProgress || 0;

  const w = message.mediaInfo?.w || 0;
  const h = message.mediaInfo?.h || 0;
  const aspect = w && h ? w / h : 16 / 9;
  const width = 280;
  const height = Math.min(Math.max(width / aspect, 150), 380);

  const formatDuration = (ms?: number) => {
    if (!ms) return '0:00';
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <>
      <div
        onClick={isSending ? undefined : onPlayClick}
        style={{ width: `${width}px`, height: `${height}px` }}
        className="relative mt-2 max-w-full rounded-2xl overflow-hidden border border-[#3f4147] bg-black/80 flex items-center justify-center cursor-pointer shadow-lg group/video select-none"
      >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt="Video Thumbnail"
          className="w-full h-full object-cover select-none transition-transform duration-300 group-hover/video:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e1f22] to-[#111214] flex flex-col items-center justify-center gap-2 p-4 text-center">
          <ImageIcon className="w-8 h-8 text-[#5865f2] opacity-80" />
          <span className="text-[11px] text-[#949ba4] font-medium truncate w-full max-w-full font-mono">
            {message.content || 'video.mp4'}
          </span>
        </div>
      )}

      {/* E2EE Lock Badge */}
      {(message.isEncrypted || message.encryptedFile) && (
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-semibold text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shadow z-10" title="End-to-End Encrypted Video">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>E2EE</span>
        </div>
      )}

      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/30 group-hover/video:bg-black/25 transition-colors duration-200" />

      {/* Centered Circular Play Button */}
      {!isSending && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center group-hover/video:bg-[#5865f2] group-hover/video:scale-110 group-hover/video:border-[#5865f2]/40 transition-all duration-200 shadow-xl">
            <svg className="w-6 h-6 fill-current translate-x-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Duration and Size Pills */}
      <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono font-bold text-white border border-white/5 flex items-center gap-1 shadow">
        <span>{formatDuration(message.mediaInfo?.duration)}</span>
      </div>

      <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono font-bold text-white border border-white/5 shadow">
        {formatBytes(message.mediaInfo?.size || 0)}
      </div>

      {/* Optimistic Sending circular progress overlay with cancel */}
      {isSending && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="#1e1f22"
                strokeWidth="4"
                fill="transparent"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="#5865f2"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26 * (1 - progressPercent / 100)}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <span className="absolute text-xs font-black text-white font-mono">
              {progressPercent}%
            </span>
          </div>
          <span className="text-[11px] font-black text-[#5865f2] tracking-wider uppercase animate-pulse">
            Uploading Video
          </span>
          {onCancelSending && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelSending(message.id);
              }}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
    {!isSending && (
      <div className="mt-1.5">
        <MediaDownloadControl message={message} onOpenInAppMedia={onPlayClick} />
      </div>
    )}
    </>
  );
};

const VideoViewerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  message: Message;
}> = ({ isOpen, onClose, message }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Video playback states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let url: string | null = null;

    async function loadVideo() {
      try {
        setLoading(true);
        setError(null);

        const encryptedFile = message.encryptedFile;
        const mime = message.mediaInfo?.mimetype || 'video/mp4';

        if (encryptedFile) {
          const blob = await fetchDecryptedMedia(encryptedFile, mime);
          if (isMounted) {
            setVideoBlob(blob);
            const u = URL.createObjectURL(blob);
            url = u;
            setBlobUrl(u);
            setLoading(false);
          }
        } else if (message.mediaUrl) {
          // Unencrypted / old message url
          if (isMounted) {
            setBlobUrl(message.mediaUrl);
            setLoading(false);
          }
        } else {
          throw new Error('No media data found');
        }
      } catch (err: any) {
        console.error('Failed to decrypt video for playback:', err);
        if (isMounted) {
          setError(err?.message || 'Decryption failed');
          setLoading(false);
        }
      }
    }

    loadVideo();

    // Register hardware back button listener
    const backListener = registerBackButtonHandler(() => {
      onClose();
    });

    return () => {
      isMounted = false;
      backListener.remove();
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [isOpen, message, onClose]);

  if (!isOpen) return null;

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const val = parseFloat(e.target.value);
    videoRef.current.currentTime = val;
    setCurrentTime(val);
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSaveShare = async () => {
    try {
      let finalBlob = videoBlob;
      if (!finalBlob && blobUrl) {
        const response = await fetch(blobUrl);
        finalBlob = await response.blob();
      }
      if (finalBlob) {
        await saveBlob(finalBlob, message.content || 'video.mp4');
      }
    } catch (err) {
      console.error('Failed to save video:', err);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4 safe-area-padding animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h4 className="text-white text-xs sm:text-sm font-semibold truncate max-w-xs font-mono">
          {message.content || 'video.mp4'}
        </h4>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            disabled={loading}
            className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
            title="More options"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-30 w-44 bg-[#2b2d31] border border-[#3f4147] rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    await saveToDevice(message);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm font-medium text-white hover:bg-[#35373c] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#5865f2]" />
                  <span>Save to device</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    if (isNative()) {
                      await Share.share({
                        title: message.content || 'video.mp4',
                        url: blobUrl || undefined,
                      });
                    } else if (blobUrl) {
                      await saveBlob(videoBlob || new Blob(), message.content || 'video.mp4');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm font-medium text-white hover:bg-[#35373c] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>Share</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-10 h-10 text-[#5865f2] animate-spin" />
          <span className="text-sm font-black text-[#949ba4] tracking-wider uppercase animate-pulse">
            Decrypting E2EE video…
          </span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-white text-sm font-semibold">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            Go Back
          </button>
        </div>
      ) : (
        <div className="w-full max-w-4xl h-full flex flex-col justify-center relative">
          <video
            ref={videoRef}
            src={blobUrl || undefined}
            playsInline
            autoPlay
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full max-h-[70vh] object-contain rounded-lg"
            onClick={handlePlayPause}
          />

          {/* Custom Controls Panel */}
          <div className="mt-6 w-full bg-[#111214]/90 border border-[#2e3035] rounded-2xl p-4 flex flex-col gap-3 shadow-2xl backdrop-blur-md">
            {/* Seek Bar */}
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs font-mono font-bold text-[#949ba4] min-w-[32px]">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                className="flex-1 accent-[#5865f2] cursor-pointer h-1 rounded-full bg-[#383a40]"
              />
              <span className="text-xs font-mono font-bold text-[#949ba4] min-w-[32px]">
                {formatTime(duration)}
              </span>
            </div>

            {/* Buttons Panel */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-2 text-[#949ba4] hover:text-white transition-colors cursor-pointer"
              >
                {isMuted ? (
                  <svg className="w-5 h-5 fill-current text-red-400" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.51 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 fill-current text-gray-400 hover:text-white" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>

              {/* Big Play/Pause Button */}
              <button
                type="button"
                onClick={handlePlayPause}
                className="w-12 h-12 rounded-full bg-[#5865f2] hover:bg-[#4752c4] flex items-center justify-center text-white cursor-pointer shadow-lg transition-transform duration-100 hover:scale-105"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Spacer */}
              <div className="w-9 h-9" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ImageViewerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  message: Message;
}> = ({ isOpen, onClose, message }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    let url: string | null = null;

    async function loadImage() {
      try {
        setLoading(true);
        setError(null);

        const encryptedFile = message.encryptedFile;
        const mime = message.mediaInfo?.mimetype || 'image/jpeg';

        if (encryptedFile) {
          const blob = await fetchDecryptedMedia(encryptedFile, mime);
          if (isMounted) {
            setImageBlob(blob);
            const u = URL.createObjectURL(blob);
            url = u;
            setBlobUrl(u);
            setLoading(false);
          }
        } else if (message.mediaUrl) {
          // Unencrypted / old message url
          if (isMounted) {
            setBlobUrl(message.mediaUrl);
            setLoading(false);
          }
        } else {
          throw new Error('No media data found');
        }
      } catch (err: any) {
        console.error('Failed to decrypt image for playback:', err);
        if (isMounted) {
          setError(err?.message || 'Decryption failed');
          setLoading(false);
        }
      }
    }

    loadImage();

    // Register hardware back button listener
    const backListener = registerBackButtonHandler(() => {
      onClose();
    });

    return () => {
      isMounted = false;
      backListener.remove();
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [isOpen, message, onClose]);

  if (!isOpen) return null;

  const handleSaveShare = async () => {
    try {
      let finalBlob = imageBlob;
      if (!finalBlob && blobUrl) {
        const response = await fetch(blobUrl);
        finalBlob = await response.blob();
      }
      if (finalBlob) {
        await saveBlob(finalBlob, message.content || 'image.jpg');
      }
    } catch (err) {
      console.error('Failed to save image:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4 safe-area-padding animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <h4 className="text-white text-xs sm:text-sm font-semibold truncate max-w-xs font-mono">
          {message.content || 'image.jpg'}
        </h4>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            disabled={loading}
            className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
            title="More options"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-30 w-44 bg-[#2b2d31] border border-[#3f4147] rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    await saveToDevice(message);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm font-medium text-white hover:bg-[#35373c] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#5865f2]" />
                  <span>Save to device</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    if (isNative()) {
                      await Share.share({
                        title: message.content || 'image.jpg',
                        url: blobUrl || undefined,
                      });
                    } else if (blobUrl) {
                      await saveBlob(imageBlob || new Blob(), message.content || 'image.jpg');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm font-medium text-white hover:bg-[#35373c] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>Share</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-10 h-10 text-[#5865f2] animate-spin" />
          <span className="text-sm font-black text-[#949ba4] tracking-wider uppercase animate-pulse">
            Decrypting E2EE image…
          </span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-white text-sm font-semibold">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            Go Back
          </button>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center relative p-2 select-all">
          <img
            src={blobUrl || undefined}
            alt={message.content || 'Decrypted attachment'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl transition-transform duration-200"
          />
        </div>
      )}
    </div>
  );
};

const Linkified: React.FC<{ text: string }> = ({ text }) => {
  const tokens = useMemo(() => linkifyText(text), [text]);

  return (
    <p className="whitespace-pre-wrap">
      {tokens.map((token, idx) => {
        if (token.type === 'link' && token.href) {
          return (
            <a
              key={idx}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                if (isNative()) {
                  e.preventDefault();
                  openUrl(token.href!);
                }
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className="text-[#00a8fc] underline break-all hover:text-[#38b9ff] transition-colors cursor-pointer"
            >
              {token.text}
            </a>
          );
        }
        return <React.Fragment key={idx}>{token.text}</React.Fragment>;
      })}
    </p>
  );
};

const LinkPreviewCard: React.FC<{ preview: LinkPreviewData }> = ({ preview }) => {
  const { blobUrl: imageBlobUrl } = useMatrixImage(
    preview.imageMxc ? { mediaUrl: preview.imageMxc } : {},
    !preview.imageMxc
  );

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (isNative()) {
          openUrl(preview.url);
        } else {
          window.open(preview.url, '_blank', 'noopener,noreferrer');
        }
      }}
      className="mt-2.5 w-full max-w-sm sm:max-w-md bg-[#2b2d31] border border-[#3f4147] hover:border-[#5865f2] rounded-xl overflow-hidden cursor-pointer transition-all group/preview shadow-sm hover:shadow-md select-none"
    >
      {imageBlobUrl && (
        <div className="w-full h-36 sm:h-44 bg-[#1e1f22] overflow-hidden relative border-b border-[#3f4147]">
          <img
            src={imageBlobUrl}
            alt={preview.title || preview.siteName || 'Preview'}
            className="w-full h-full object-cover group-hover/preview:scale-102 transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-3 flex flex-col gap-1">
        {preview.siteName && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] truncate">
            {preview.siteName}
          </span>
        )}
        {preview.title && (
          <h4 className="text-sm font-semibold text-white group-hover/preview:text-[#00a8fc] transition-colors line-clamp-2 leading-snug">
            {preview.title}
          </h4>
        )}
        {preview.description && (
          <p className="text-xs text-[#b5bac1] line-clamp-2 leading-relaxed">
            {preview.description}
          </p>
        )}
      </div>
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  matrixRoomId,
  isStarred = false,
  isEditing = false,
  isJumpHighlighted = false,
  nameColor,
  currentUserAvatar,
  currentUserDisplayName,
  onTap,
  onLongPress,
  onToggleStar,
  onOpenAttachment,
  onAddReaction,
  onReplyClick,
  onReply,
  onRetry,
  onCancelSending,
  onUserClick,
  onOpenRestoreModal,
  onOpenE2EEDebug,
}) => {
  const [isTappedLocally, setIsTappedLocally] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const isAttachment = useMemo(() => {
    return Boolean(
      message.encryptedFile ||
      message.mediaUrl ||
      ['m.image', 'm.video', 'm.audio', 'm.file'].includes(message.msgtype || '')
    );
  }, [message.encryptedFile, message.mediaUrl, message.msgtype]);

  const kind = useMemo(() => {
    if (!isAttachment) return null;
    return getMediaKind({
      msgtype: message.msgtype,
      mimetype: message.mediaInfo?.mimetype,
      name: message.content,
    });
  }, [isAttachment, message.msgtype, message.mediaInfo?.mimetype, message.content]);

  const isImageMessage = kind === 'image';

  const [imageError, setImageError] = useState(false);

  // Disable auto-decryption on mount/scroll for 'file' kind
  const { blobUrl, loading: mediaLoading } = useMatrixMedia(message, kind === 'file');

  const thumbnailSource = useMemo(() => {
    if (kind !== 'video') return null;
    const info = (message as any).info || message.mediaInfo;
    if (!info) return null;
    const encryptedFile = info.thumbnail_file || (message as any).thumbnail_file || (message as any).thumbnailFile;
    const mediaUrl = info.thumbnail_url || message.thumbnailUrl;
    if (!encryptedFile && !mediaUrl) return null;
    return { encryptedFile, mediaUrl, mimeType: info.thumbnail_info?.mimetype || 'image/jpeg' };
  }, [message, kind]);

  const { blobUrl: thumbBlobUrl, loading: thumbLoading } = useMatrixMedia(
    thumbnailSource || { mediaUrl: undefined },
    kind !== 'video'
  );

  const [lazyPosterUrl, setLazyPosterUrl] = useState<string | null>(() => {
    return globalPosterCache.get(message.id) || null;
  });

  useEffect(() => {
    if (kind !== 'video' || thumbBlobUrl || lazyPosterUrl || !blobUrl) return;

    const size = message.mediaInfo?.size || 0;
    if (size > 50 * 1024 * 1024) return; // Limit to 50 MB

    let isMounted = true;
    const video = document.createElement('video');
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const handleLoadedData = () => {
      video.currentTime = 0.1;
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob && isMounted) {
              const u = URL.createObjectURL(blob);
              globalPosterCache.set(message.id, u);
              setLazyPosterUrl(u);
            }
          }, 'image/jpeg', 0.8);
        }
      } catch (e) {
        console.error('Lazy thumbnail extraction failed:', e);
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      isMounted = false;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [kind, blobUrl, thumbBlobUrl, lazyPosterUrl, message.id, message.mediaInfo?.size]);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const hasSwipedRecentlyRef = useRef<boolean>(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Map avatars by sender ID: Retrieve that specific sender's member object or profile from room cache
  const [senderAvatarUrl, setSenderAvatarUrl] = useState<string | null>(() => {
    if (message.userAvatar && (message.userAvatar.startsWith('http') || message.userAvatar.startsWith('mxc://'))) {
      return message.userAvatar;
    }
    return null;
  });
  const [senderDisplayName, setSenderDisplayName] = useState<string>(message.userName || '');

  useEffect(() => {
    let isMounted = true;
    async function resolveSenderProfile() {
      const senderId = message.userId;
      if (!senderId) return;

      const myId = localStorage.getItem('matrix_user_id');
      if (senderId === myId) {
        if (isMounted) {
          if (currentUserAvatar) setSenderAvatarUrl(currentUserAvatar);
          if (currentUserDisplayName) setSenderDisplayName(currentUserDisplayName);
        }
        return;
      }

      try {
        const client = await getOrCreateMatrixClient();
        if (!client) return;

        const targetRoomId = matrixRoomId || (message.channelId?.startsWith('!') ? message.channelId : undefined);
        let room = targetRoomId && typeof client.getRoom === 'function' ? client.getRoom(targetRoomId) : null;
        if (!room && typeof client.getRooms === 'function') {
          const rooms = client.getRooms();
          room = rooms.find((r: any) => r.roomId === targetRoomId || r.getMember?.(senderId)) || null;
        }

        let rawAvatarUrl: string | null = null;
        let displayName: string | null = null;

        // Retrieve that specific sender's member object or profile from the room cache
        if (room && typeof room.getMember === 'function') {
          const member = room.getMember(senderId);
          if (member) {
            rawAvatarUrl = (typeof member.getMxcAvatarUrl === 'function' ? member.getMxcAvatarUrl() : (member as any).avatarUrl) || null;
            displayName = member.name || null;
          }
        }

        // Check client.getUser(senderId)
        if ((!rawAvatarUrl || !displayName) && typeof client.getUser === 'function') {
          const user = client.getUser(senderId);
          if (user) {
            if (!rawAvatarUrl && user.avatarUrl) rawAvatarUrl = user.avatarUrl;
            if (!displayName && user.displayName) displayName = user.displayName;
          }
        }

        if (isMounted && displayName && !displayName.startsWith('@') && displayName !== senderDisplayName) {
          setSenderDisplayName(displayName);
        }

        // Convert and Fallback Correctly
        if (rawAvatarUrl) {
          if (isMounted) {
            setSenderAvatarUrl(rawAvatarUrl);
          }
        }
      } catch (err) {
        console.warn('[MessageItem] resolveSenderProfile error:', err);
      }
    }

    resolveSenderProfile();
    return () => {
      isMounted = false;
    };
  }, [message.userId, matrixRoomId, message.channelId, currentUserAvatar, currentUserDisplayName]);

  const isHighlighted = message.isTapped || isTappedLocally || isJumpHighlighted;
  const isRedacted = Boolean(message.isRedacted);

  const handleClick = (e?: React.MouseEvent) => {
    if (isAttachment) return;
    if (isRedacted || hasSwipedRecentlyRef.current) return;

    if (e) {
      const target = e.target as HTMLElement | null;
      // Ignore the toggle if the click target is inside an <a>
      if (target?.closest('a')) return;

      // Do not call onTap for plain text messages unless the user taps outside text and links
      const isPlainText = !isAttachment && !message.driveAttachment && !message.geoUri && message.msgtype !== 'm.location';
      if (isPlainText && target?.closest('p, a')) {
        return;
      }
    }

    setIsTappedLocally(!isTappedLocally);
    if (onTap) {
      onTap(message.id);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRedacted) return;

    // If touch started on an <a>, cancel the row's 450ms long-press timer so native link menu appears
    const target = e.target as HTMLElement | null;
    if (target?.closest('a')) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      return;
    }

    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    setIsSwiping(false);
    setSwipeOffset(0);
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
    touchTimerRef.current = setTimeout(() => {
      onLongPress?.(message);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRedacted) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    // If movement exceeds minimal threshold, cancel long-press timer so it never triggers during swipe
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    }

    // Cancel horizontal swipe if gesture is predominantly vertical (vertical scrolling)
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      setSwipeOffset(0);
      setIsSwiping(false);
      return;
    }

    // Only allow Right-to-Left swiping (deltaX < 0)
    if (deltaX < 0) {
      setSwipeOffset(Math.max(deltaX, -100));
      if (deltaX <= -60) {
        setIsSwiping(true);
      } else {
        setIsSwiping(false);
      }
    } else {
      // Swiping Left-to-Right: ignore (do not trigger reply or animate)
      setSwipeOffset(0);
      setIsSwiping(false);
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (isSwiping || swipeOffset <= -60) {
      hasSwipedRecentlyRef.current = true;
      setTimeout(() => {
        hasSwipedRecentlyRef.current = false;
      }, 350);
      onReply?.(message);
    }
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const getDriveIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="w-5 h-5 text-[#5865f2]" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text')) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    if (mimeType.includes('image')) {
      return <ImageIcon className="w-5 h-5 text-purple-400" />;
    }
    if (mimeType.includes('presentation')) {
      return <FileCode className="w-5 h-5 text-amber-400" />;
    }
    return <File className="w-5 h-5 text-cyan-400" />;
  };

  const handleCopyLink = (e: React.MouseEvent, url?: string) => {
    e.stopPropagation();
    if (url) {
      copyText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const { replyUser, replySnippet, cleanedContent, isReply } = useMemo(() => {
    let rUser = message.replyTo?.userName;
    let rSnippet = message.replyTo?.snippet;
    let text = message.content || '';
    if (text) {
      if (text.startsWith('Replying to ')) {
        const parts = text.split(': ');
        if (parts.length >= 2) {
          rUser = rUser || parts[0].replace('Replying to ', '').trim();
          text = parts.slice(1).join(': ').trim();
        }
      } else if (text.includes('> <') || text.startsWith('>')) {
        const lines = text.split('\n');
        const quoteLines = lines.filter((l) => l.startsWith('>'));
        if (quoteLines.length > 0) {
          const firstQuote = quoteLines[0];
          const userMatch = firstQuote.match(/<([^>]+)>/);
          if (userMatch) {
            rUser = rUser || userMatch[1].split(':')[0].replace('@', '');
          }
          if (!rSnippet) {
            rSnippet = firstQuote.replace(/^>\s*(<[^>]+>)?\s*/, '').trim();
          }
          text = lines.filter((l) => !l.startsWith('>')).join('\n').trim();
        }
      }
    }
    const hasReply = Boolean(rUser || rSnippet || message.replyTo);
    return {
      replyUser: rUser,
      replySnippet: rSnippet,
      cleanedContent: text || message.content || '',
      isReply: hasReply,
    };
  }, [message.content, message.replyTo]);

  const myUserId = typeof window !== 'undefined' ? (localStorage.getItem('matrix_user_id') || '') : '';
  const isMe = Boolean(myUserId && message.userId === myUserId);
  const isUndecryptable = Boolean(
    message.isDecryptionFailure ||
    (cleanedContent && (
      cleanedContent.includes('Unable to decrypt') ||
      cleanedContent.includes("can't decrypt") ||
      cleanedContent.includes('awaiting key') ||
      cleanedContent.includes('Awaiting Key') ||
      cleanedContent === 'Unable to decrypt message'
    ))
  );

  const isRoomOrMessageEncrypted = Boolean(
    message.isEncrypted ||
    message.encryption?.level === 'verified' ||
    message.encryption?.level === 'encrypted' ||
    message.encryption?.level === 'warning'
  );

  const { preview: linkPreview } = useLinkPreview(
    isUndecryptable || isRedacted || kind !== null ? undefined : cleanedContent,
    isRoomOrMessageEncrypted
  );

  return (
    <div
      id={`message-${message.id}`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swipeOffset !== 0 ? 'none' : 'transform 0.2s ease-out',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!isRedacted) onLongPress?.(message);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (!isRedacted) onAddReaction?.(message.id, '❤️');
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      className={`group relative flex items-start px-3 sm:px-4 py-2 sm:py-2.5 transition-colors duration-100 select-none ${
        isEditing
          ? 'bg-[#5865f2]/20 border-y border-[#5865f2]/40 ring-1 ring-[#5865f2]/50'
          : isHighlighted
          ? 'bg-[#5865f2]/30 transition-colors duration-500 ring-1 ring-[#5865f2]/50'
          : 'hover:bg-white/[0.035] bg-transparent'
      } ${isRedacted ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
    >
      {swipeOffset < -10 && (
        <div className="absolute -right-10 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-[#35373c] text-[#5865f2]">
          <Reply className="w-4 h-4" />
        </div>
      )}
      {(isEditing || isHighlighted) && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r ${
            isEditing ? 'bg-[#5865f2]' : 'bg-[#5865f2]/70'
          }`}
        />
      )}

      <div
        onClick={(e) => {
          e.stopPropagation();
          if (!isRedacted && onUserClick) {
            onUserClick({
              userName: message.userName,
              userId: message.userId,
              userAvatar: message.userAvatar,
              avatarColor: message.avatarColor,
            });
          }
        }}
        className="relative shrink-0 mr-3 sm:mr-4 cursor-pointer"
      >
        {isRedacted ? (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-[#4e5058] text-[#949ba4] shadow-inner">
            <Ban className="w-5 h-5" />
          </div>
        ) : (
          <MatrixAvatar
            mxcUrl={senderAvatarUrl || message.userAvatar}
            name={message.userName}
            size={38}
            className="ring-1 ring-black/40 hover:opacity-90 transition-opacity shadow-lg sm:w-10 sm:h-10"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-center gap-1.5 mb-1 flex-wrap">
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (!isRedacted && onUserClick) {
                onUserClick({
                  userName: senderDisplayName,
                  userId: message.userId,
                  userAvatar: senderAvatarUrl || message.userAvatar,
                  avatarColor: message.avatarColor,
                });
              }
            }}
            style={!isRedacted ? { color: nameColor ?? getNameColor(message.userId) } : undefined}
            className={`font-semibold text-base ${
              isRedacted ? 'text-[#949ba4]' : ''
            } hover:underline cursor-pointer`}
          >
            {senderDisplayName}
          </span>

          <EncryptionBadge
            encryption={message.encryption}
            isEncrypted={message.isEncrypted}
            isDecryptionFailure={message.isDecryptionFailure}
            onOpenE2EEDebug={onOpenE2EEDebug}
          />

          <span className="text-xs font-medium text-[#949ba4] ml-2">
            {message.timestamp}
          </span>
          {message.userId === localStorage.getItem('matrix_user_id') && !isRedacted && message.deliveryStatus && (
            <>
              {message.deliveryStatus === 'sending' && (
                <span title="Sending" className="inline-flex items-center ml-1.5">
                  <Clock size={14} className="text-[#949ba4]" style={{ color: '#949ba4' }} />
                </span>
              )}
              {message.deliveryStatus === 'sent' && (
                <span title="Sent" className="inline-flex items-center ml-1.5">
                  <Check size={14} className="text-[#949ba4]" style={{ color: '#949ba4' }} />
                </span>
              )}
              {message.deliveryStatus === 'read' && (
                <span title="Read" className="inline-flex items-center ml-1.5">
                  <CheckCheck size={14} className="text-[#5865f2]" style={{ color: '#5865f2' }} />
                </span>
              )}
              {message.deliveryStatus === 'failed' && (
                <span
                  title="Failed to send"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry?.(message);
                  }}
                  className="inline-flex items-center gap-1 ml-1.5 cursor-pointer"
                >
                  <AlertCircle size={14} className="text-[#f23f43]" style={{ color: '#f23f43' }} />
                  <span className="text-[11px] text-[#f23f43]">Failed. Tap to retry</span>
                </span>
              )}
            </>
          )}
          {message.isDecryptionFailure && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30"
              title="Waiting for room decryption key"
            >
              <Key className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
              <span className="text-[9px] font-bold tracking-wider">Awaiting Key</span>
            </span>
          )}
          {message.isEdited && !isRedacted && (
            <span className="text-[10px] text-[#949ba4] italic">(edited)</span>
          )}
          {isEditing && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#5865f2] text-white">
              Editing
            </span>
          )}
        </div>

        {isReply && !isRedacted && (
          <ReplyHeader
            eventId={message.replyTo?.eventId || ''}
            roomId={matrixRoomId || message.channelId}
            onReplyClick={onReplyClick}
            fallbackSnippet={message.replyTo?.snippet || replySnippet}
            fallbackUserName={message.replyTo?.userName || replyUser}
          />
        )}

        {isRedacted ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-[13px] text-[#949ba4] italic my-0.5 select-none">
            <span>Message deleted</span>
          </div>
        ) : (
          <div className="text-base text-[#dbdee1] leading-[1.375] font-normal whitespace-pre-wrap break-words">
            {kind === 'audio' ? (
              <AudioMessagePlayer message={message} />
            ) : kind === 'video' ? (
              <VideoThumbnailBubble
                message={message}
                posterUrl={message.thumbnailUrl || thumbBlobUrl || lazyPosterUrl}
                loading={mediaLoading || thumbLoading}
                onPlayClick={() => setIsVideoModalOpen(true)}
                onCancelSending={onCancelSending}
              />
            ) : kind === 'file' ? (
              <FileMessageCard message={message} onOpenRestoreModal={onOpenRestoreModal} onCancelSending={onCancelSending} />
            ) : kind === 'image' ? (
              mediaLoading ? (
                <div className="p-3 bg-[#2b2d31] rounded-lg text-xs text-[#949ba4] border border-[#3f4147] inline-flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin" />
                  <span>Loading image…</span>
                </div>
              ) : (blobUrl && !imageError) ? (
                <div className="relative inline-block max-w-full group/img">
                  <img
                    src={blobUrl}
                    alt={message.content || "Image attachment"}
                    className="max-w-full rounded-lg cursor-pointer"
                    onError={() => setImageError(true)}
                    onClick={() => setIsImageModalOpen(true)}
                  />
                  {(message.isEncrypted || message.encryptedFile) && (
                    <div
                      className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-xs border border-white/10 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold shadow select-none pointer-events-none"
                      title="End-to-End Encrypted Image"
                    >
                      <Lock className="w-2.5 h-2.5 text-emerald-400" />
                      <span>E2EE</span>
                    </div>
                  )}
                  <div className="mt-1.5">
                    <MediaDownloadControl
                      message={message}
                      onOpenInAppMedia={() => setIsImageModalOpen(true)}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#2b2d31] rounded-xl text-xs text-[#949ba4] border border-[#3f4147] inline-flex flex-col gap-2 max-w-xs sm:max-w-sm">
                  <div className="flex items-center gap-2 text-red-400 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Failed to load image</span>
                  </div>
                  <span className="text-[11px] text-[#dbdee1] truncate font-medium font-mono">
                    {message.content || 'image.png'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageError(false);
                    }}
                    className="px-2.5 py-1 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded text-[11px] font-bold self-start cursor-pointer transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )
            ) : message.msgtype === 'm.location' ? (
              <div>Location Message</div>
            ) : isUndecryptable ? (
              <div className="flex items-center gap-2.5 flex-wrap my-0.5">
                <div className="flex items-center gap-1.5 text-amber-400 font-medium text-xs sm:text-[13px] italic">
                  <Key className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                  <span>Waiting for this message's key</span>
                </div>
                {!isMe && onOpenRestoreModal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRestoreModal();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3 text-purple-400" />
                    <span>Restore history</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <Linkified text={cleanedContent} />
                {linkPreview && <LinkPreviewCard preview={linkPreview} />}
              </>
            )}
          </div>
        )}

        {message.driveAttachment && !isImageMessage && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenAttachment) {
                onOpenAttachment(message.driveAttachment!);
              }
            }}
            className="mt-2.5 w-full max-w-full sm:max-w-lg bg-[#2b2d31] border-l-4 border-[#5865f2] rounded-xl p-3 sm:p-3.5 shadow-md hover:bg-[#35373c] transition-colors border border-r-transparent border-t-transparent border-b-transparent cursor-pointer group/drive"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#1e1f22] border border-[#3f4147] shrink-0">
                {getDriveIcon(message.driveAttachment.mimeType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover/drive:text-[#5865f2] transition-colors">
                    {message.driveAttachment.name}
                  </h4>
                  {message.driveAttachment.webViewLink && (
                    <ExternalLink className="w-3.5 h-3.5 text-[#949ba4] shrink-0 opacity-60 group-hover/drive:opacity-100" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#949ba4]">
                  <span>{getFriendlyFileType(message.driveAttachment.mimeType)}</span>
                  {message.driveAttachment.size && (
                    <>
                      <span>•</span>
                      <span>{message.driveAttachment.size}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-[#383a40] flex items-center justify-between text-xs">
              <span className="text-[#949ba4] flex items-center gap-1 font-medium text-[11px]">
                {/* Google Drive label removed */}
              </span>
              <div className="flex items-center gap-2">
                {message.driveAttachment.webViewLink && (
                  <button
                    onClick={(e) => handleCopyLink(e, message.driveAttachment?.webViewLink)}
                    className="p-1 text-[#949ba4] hover:text-white transition-colors"
                    title="Copy Drive link"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {/* Open in Drive button removed */}
              </div>
            </div>
          </div>
        )}

        {message.status === 'sending' && kind !== 'file' && (
          <div className="mt-2 flex items-center gap-3 p-2.5 rounded-xl bg-[#2b2d31]/60 border border-[#3f4147]/40 max-w-xs sm:max-w-sm">
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  stroke="#383a40"
                  strokeWidth="3"
                  fill="transparent"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  stroke="#5865f2"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 12}
                  strokeDashoffset={2 * Math.PI * 12 * (1 - (message.uploadProgress || 0) / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[9px] font-bold text-white font-mono">
                {message.uploadProgress || 0}%
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#dbdee1] truncate">
                Uploading media…
              </p>
              <div className="w-full bg-[#1e1f22] h-1 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-[#5865f2] h-full transition-all duration-300 ease-out"
                  style={{ width: `${message.uploadProgress || 0}%` }}
                />
              </div>
            </div>

            {onCancelSending && (
              <button
                type="button"
                onClick={() => onCancelSending(message.id)}
                className="px-2.5 py-1 text-[11px] font-bold text-[#949ba4] hover:text-white hover:bg-white/10 rounded-lg border border-[#3f4147] transition-all cursor-pointer shrink-0"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {message.status === 'queued' && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#949ba4]">
            <Clock size={12} className="shrink-0 text-[#949ba4]" style={{ width: 12, height: 12, color: '#949ba4' }} />
            <span>Waiting for network…</span>
          </div>
        )}

        {message.status === 'failed' && (
          <div className="mt-1 flex items-center gap-2 text-xs text-red-400">
            <span className="font-medium">Failed to send</span>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(message);
                }}
                className="text-xs font-semibold underline hover:text-red-300 cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {message.reactions && !isRedacted && Object.keys(message.reactions).length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {Object.entries(message.reactions).map(([emoji, count]) => {
              const hasReacted = Boolean(message.myReactions?.[emoji]);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddReaction?.(message.id, emoji);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all min-h-[30px] active:scale-95 cursor-pointer ${
                    hasReacted
                      ? 'bg-[#5865f2]/20 border-[#5865f2] text-white'
                      : 'bg-[#2b2d31] hover:bg-[#35373c] border-[#3f4147] text-[#dbdee1]'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className={`text-[11px] font-semibold ${hasReacted ? 'text-[#5865f2]' : 'text-[#949ba4]'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!isRedacted && (
        <div className="absolute right-3 -top-3.5 hidden md:group-hover:flex items-center bg-[#313338] border border-[#232428] rounded-md shadow-md overflow-hidden z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar?.(message.id);
            }}
            className={`p-1.5 transition-colors ${
              isStarred
                ? 'text-[#fee75c] bg-[#fee75c]/10'
                : 'text-[#b5bac1] hover:text-white hover:bg-[#35373c]'
            }`}
            title={isStarred ? 'Unstar message' : 'Star message'}
          >
            <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-[#fee75c]' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLongPress?.(message);
            }}
            className="p-1.5 text-[#b5bac1] hover:text-white hover:bg-[#35373c] transition-colors"
            title="More actions"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fullscreen Video/Image Overlay Modals */}
      <VideoViewerModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        message={message}
      />
      <ImageViewerModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        message={message}
      />
    </div>
  );
};
