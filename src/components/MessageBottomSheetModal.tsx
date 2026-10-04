import React, { useState } from 'react';
import { Message } from '../types';
import {
  Edit3,
  Reply,
  Copy,
  Forward,
  Info,
  Trash2,
  Check,
  Ban,
  Smile,
  Bookmark,
  ArrowLeft,
  FolderDown,
  Share2,
  Download,
} from 'lucide-react';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { copyText } from '../native/platform';
import { useDownloadState } from '../hooks/useDownloadState';

interface MessageBottomSheetModalProps {
  message: Message | null;
  isStarred: boolean;
  onClose: () => void;
  onQuickReaction?: (messageId: string, emoji: string) => void;
  onEditMessage?: (message: Message) => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onToggleStar: (messageId: string) => void;
  onReply: (message: Message) => void;
  onForward?: (message: Message) => void;
  onShowInDownloads?: () => void;
}

export const MessageBottomSheetModal: React.FC<MessageBottomSheetModalProps> = ({
  message,
  isStarred,
  onClose,
  onQuickReaction,
  onEditMessage,
  onDeleteMessage,
  onDeleteForEveryone,
  onToggleStar,
  onReply,
  onForward,
  onShowInDownloads,
}) => {
  useAndroidBackHandler(Boolean(message), onClose, 'message-bottom-sheet');
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const { status: downloadStatus, shareFile, deleteFile, saveToDevice: saveItemToDevice } = useDownloadState(message);

  if (!message) return null;

  const handleEdit = () => {
    onEditMessage?.(message);
    onClose();
  };

  const handleCopy = () => {
    copyText(message.content);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 1200);
  };

  const handleDelete = () => {
    onDeleteMessage(message.id);
    onClose();
  };

  const handleDeleteForEveryone = () => {
    if (onDeleteForEveryone) {
      onDeleteForEveryone(message.id);
    } else {
      onDeleteMessage(message.id);
    }
    onClose();
  };

  const handleToggleStar = () => {
    onToggleStar(message.id);
    onClose();
  };

  const handleReply = () => {
    onReply(message);
    onClose();
  };

  const handleForward = () => {
    if (onForward) {
      onForward(message);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#2b2d31] border border-[#383a40] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom duration-200 max-h-[85dvh] flex flex-col">
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-[#4e5058]" />
        </div>

        <div className="mx-4 mt-2 mb-1 p-2 bg-[#1e1f22] rounded-2xl border border-[#35363c] flex items-center justify-around shrink-0">
          {['❤️', '👍', '🔥', '😂', '🎉'].map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onQuickReaction?.(message.id, emoji);
                onClose();
              }}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[#2b2d31] hover:bg-[#383a40] active:scale-95 transition-all flex items-center justify-center text-xl cursor-pointer shadow-sm"
              title={`React ${emoji}`}
            >
              <span>{emoji}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onQuickReaction?.(message.id, '⭐');
              onClose();
            }}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[#2b2d31] hover:bg-[#383a40] active:scale-95 transition-all flex items-center justify-center text-[#dbdee1] hover:text-white cursor-pointer shadow-sm"
            title="More reactions"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-4 my-2 p-2.5 bg-[#1e1f22] rounded-xl border border-[#35363c] flex items-center gap-3 shrink-0">
          <button
            onClick={onClose}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center text-[#949ba4] hover:text-white rounded-lg hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Dismiss Sheet"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#5865f2] text-white font-bold flex items-center justify-center text-xs shrink-0 shadow">
            {message.userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs truncate">
                {message.userName}
              </span>
              <span className="text-[10px] text-[#949ba4]">
                {message.timestamp}
              </span>
            </div>
            <p className="text-xs text-[#dbdee1] mt-0.5 line-clamp-1 break-words">
              {message.content}
            </p>
          </div>
        </div>

        {showInfo && (
          <div className="mx-4 mb-2 p-2.5 bg-[#18191c] rounded-xl border border-[#3f4147] text-[11px] space-y-1 text-[#b5bac1] shrink-0">
            <div className="font-semibold text-white text-xs mb-1">Matrix Event Metadata</div>
            <div><span className="text-[#949ba4]">Event ID:</span> <span className="font-mono text-[#5865f2]">{message.id}</span></div>
            <div><span className="text-[#949ba4]">Room ID:</span> <span className="font-mono">{message.channelId}</span></div>
            <div><span className="text-[#949ba4]">Encryption:</span> Megolm v1 AES-256-CTR (End-to-End Encrypted)</div>
            <div><span className="text-[#949ba4]">Sender:</span> @{message.userName}:matrix.org</div>
          </div>
        )}

        <div className="px-2 pb-4 space-y-0.5 overflow-y-auto no-scrollbar pb-safe">
          <button
            onClick={handleReply}
            className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
          >
            <Reply className="w-4 h-4 text-[#949ba4]" />
            <span>Reply</span>
          </button>
          {!message.isRedacted && 
           message.status !== 'failed' && 
           message.status !== 'queued' && 
           message.deliveryStatus !== 'failed' && (
            <button
              onClick={handleForward}
              className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
            >
              <Forward className="w-4 h-4 text-[#949ba4]" />
              <span>Forward</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#949ba4]" />
                <span>Copy Text</span>
              </>
            )}
          </button>
          <button
            onClick={handleToggleStar}
            className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
          >
            <Bookmark className={`w-4 h-4 ${isStarred ? 'text-[#fee75c] fill-[#fee75c]' : 'text-[#949ba4]'}`} />
            <span>{isStarred ? 'Remove Bookmark' : 'Bookmark Message'}</span>
          </button>
          {message.userId === localStorage.getItem('matrix_user_id') && (
            <button
              onClick={handleEdit}
              className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
            >
              <Edit3 className="w-4 h-4 text-[#5865f2]" />
              <span className="text-[#5865f2] font-semibold">Edit</span>
            </button>
          )}

          {downloadStatus === 'downloaded' && (
            <div className="pt-1 pb-1 mb-1 border-y border-[#383a40]/60 space-y-0.5">
              <button
                type="button"
                onClick={async () => {
                  onClose();
                  await saveItemToDevice();
                }}
                className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
              >
                <Download className="w-4 h-4 text-[#5865f2]" />
                <span>Save to device</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await shareFile();
                  onClose();
                }}
                className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Share</span>
              </button>
              {onShowInDownloads && (
                <button
                  type="button"
                  onClick={() => {
                    onShowInDownloads();
                    onClose();
                  }}
                  className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
                >
                  <FolderDown className="w-4 h-4 text-[#949ba4]" />
                  <span>Show in Downloads</span>
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  await deleteFile();
                  onClose();
                }}
                className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 active:bg-red-500/10 transition-colors cursor-pointer text-left text-sm font-medium"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Delete from Device</span>
              </button>
            </div>
          )}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="w-full min-h-[44px] flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-white hover:bg-[#35373c] active:bg-[#35373c] transition-colors cursor-pointer text-left text-sm font-medium"
          >
            <Info className="w-4 h-4 text-[#949ba4]" />
            <span>Info {showInfo ? '(Hide)' : ''}</span>
          </button>
          <div className="h-px bg-[#35363c] my-1" />
          {message.userId === localStorage.getItem('matrix_user_id') && (
            <button
              onClick={handleDeleteForEveryone}
              className="w-full min-h-[44px] flex flex-col px-4 py-2 rounded-xl text-[#fa777c] hover:bg-[#fa777c]/10 active:bg-[#fa777c]/10 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3.5 text-sm font-semibold">
                <Ban className="w-4 h-4 text-[#fa777c]" />
                <span>Delete for Everyone</span>
              </div>
            </button>
          )}
          <button
            onClick={handleDelete}
            className="w-full min-h-[44px] flex flex-col px-4 py-2 rounded-xl text-[#fa777c]/80 hover:bg-[#fa777c]/10 active:bg-[#fa777c]/10 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3.5 text-sm font-medium">
                <Trash2 className="w-4 h-4 text-[#fa777c]/80" />
                <span>Hide on this device</span>
            </div>
            <span className="text-[10px] text-[#949ba4] pl-[30px]">Other people still see it.</span>
          </button>
        </div>
      </div>
    </div>
  );
};
