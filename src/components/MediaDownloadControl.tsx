import React from 'react';
import { ArrowDown, Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { useDownloadState } from '../hooks/useDownloadState';
import { formatBytes } from '../utils/files';

interface MediaDownloadControlProps {
  message: any;
  onOpenInAppMedia?: (url: string, kind: string) => void;
  className?: string;
  size?: number;
}

export const MediaDownloadControl: React.FC<MediaDownloadControlProps> = ({
  message,
  onOpenInAppMedia,
  className = '',
  size,
}) => {
  const {
    status,
    progress,
    startDownload,
    cancelDownload,
    openFile,
  } = useDownloadState(message);

  const fileSize = size || message?.mediaInfo?.size || message?.driveAttachment?.size;
  const formattedSize = fileSize ? formatBytes(fileSize) : '';

  if (status === 'downloaded') {
    return null;
  }

  if (status === 'downloading' || status === 'queued') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#1e1f22]/90 border border-[#3f4147] text-xs font-semibold select-none backdrop-blur-xs ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'queued' ? (
          <div className="flex items-center gap-1.5 text-amber-400 text-[11px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Queued</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-[90px]">
            <div className="flex-1 h-2 bg-[#2b2d31] rounded-full overflow-hidden border border-[#3f4147]/60">
              <div
                className="h-full bg-[#5865f2] transition-all duration-150 rounded-full"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-white shrink-0">
              {progress}%
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            cancelDownload();
          }}
          className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500/30 text-white/70 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
          title="Cancel download"
          aria-label="Cancel download"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          startDownload();
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${className}`}
        title="Download failed. Tap to retry."
      >
        <RefreshCw className="w-3.5 h-3.5 text-red-400" />
        <span>Retry</span>
      </button>
    );
  }

  // Idle state: Download button
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startDownload();
      }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5865f2]/20 hover:bg-[#5865f2]/30 text-[#5865f2] hover:text-white border border-[#5865f2]/40 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-xs ${className}`}
      title="Download and decrypt to device storage"
    >
      <ArrowDown className="w-3.5 h-3.5 shrink-0" />
      <span>Download</span>
      {formattedSize && (
        <span className="text-[10px] opacity-75 font-mono">({formattedSize})</span>
      )}
    </button>
  );
};
