import React from 'react';
import {
  Star,
  Image as ImageIcon,
  Link as LinkIcon,
  FileText,
  ChevronRight,
  MessageSquare,
  Plus,
  Bell,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { Channel, Message } from '../types';
// Removed FirebaseUser import
import { MatrixAvatar } from './MatrixAvatar';

export const getRealDMName = (channel: Channel, currentUserId: string = ''): string => {
  if (!channel.isDirect) return channel.name;
  return channel.name.replace('@', '').split(':')[0];
};

interface CategorizedItem {
  id: string;
  messageId: string;
  title: string;
  subtitle: string;
  category: 'STARRED' | 'MEDIA' | 'LINKS' | 'FILES';
  url?: string;
}

interface ChannelsDrawerProps {
  activeRoom?: Channel;
  channels?: Channel[];
  activeRoomId?: string;
  onSelectRoom?: (channelId: string) => void;
  contactName: string;
  messages: Message[];
  starredMessageIds: Set<string>;
  onScrollToMessage: (messageId: string) => void;
  onOpenCreateDm: () => void;
  currentUser: any | null;
  matrixUserId?: string;
  matrixDisplayName?: string;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenUserProfile?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  themeMode?: 'dark' | 'light';
  userAvatarUrl?: string;
  roomsError?: string | null;
  onRetryLoadRooms?: () => void;
}

export const ChannelsDrawer: React.FC<ChannelsDrawerProps> = ({
  activeRoom,
  channels = [],
  activeRoomId,
  onSelectRoom,
  contactName,
  messages,
  starredMessageIds,
  onScrollToMessage,
  onOpenCreateDm,
  currentUser,
  matrixUserId = 'ashishboddu',
  matrixDisplayName,
  onLogout,
  onOpenSettings,
  onOpenUserProfile,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  themeMode = 'dark',
  userAvatarUrl,
  roomsError,
  onRetryLoadRooms,
}) => {
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const roomMessages = activeRoom
    ? messages.filter((m) => m.channelId === activeRoom.id && !m.isRedacted)
    : [];

  const starredItems: CategorizedItem[] = [];
  const mediaItems: CategorizedItem[] = [];
  const linkItems: CategorizedItem[] = [];
  const fileItems: CategorizedItem[] = [];

  roomMessages.forEach((msg) => {
    if (starredMessageIds.has(msg.id)) {
      starredItems.push({
        id: `starred-${msg.id}`,
        messageId: msg.id,
        title: msg.content.slice(0, 60) || 'Starred message',
        subtitle: `From ${msg.userName} • ${msg.timestamp}`,
        category: 'STARRED',
      });
    }
    const isAudio = msg.msgtype === 'm.audio';
    const isMedia =
      !isAudio &&
      (msg.msgtype === 'm.image' ||
        msg.msgtype === 'm.video' ||
        Boolean(msg.content.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)/i)) ||
        Boolean(msg.driveAttachment?.mimeType?.includes('image')));
    if (isMedia) {
      mediaItems.push({
        id: `media-${msg.id}`,
        messageId: msg.id,
        title: msg.driveAttachment?.name || msg.content.slice(0, 45) || 'Photo / Video Media',
        subtitle: `Shared by ${msg.userName} • ${msg.timestamp}`,
        category: 'MEDIA',
      });
    }
    const links = msg.content.match(urlPattern);
    if (links) {
      links.forEach((link, idx) => {
        linkItems.push({
          id: `link-${msg.id}-${idx}`,
          messageId: msg.id,
          title: link,
          subtitle: `Shared by ${msg.userName} • ${msg.timestamp}`,
          category: 'LINKS',
          url: link,
        });
      });
    }
    const isFile =
      !isAudio &&
      (msg.msgtype === 'm.file' ||
        Boolean(msg.driveAttachment) ||
        Boolean(msg.content.match(/\.(pdf|zip|tar|gz|docx?|xlsx?|pptx?|txt|apk|csv)/i)));
    if (isFile) {
      fileItems.push({
        id: `file-${msg.id}`,
        messageId: msg.id,
        title: msg.driveAttachment?.name || msg.content.slice(0, 45) || 'Document File',
        subtitle: `Sent by ${msg.userName} • ${msg.timestamp}`,
        category: 'FILES',
      });
    }
  });

  const cleanContact = contactName.replace('@', '').split(':')[0] || 'Direct Message';
  const contactInitials = cleanContact.slice(0, 2).toUpperCase() || 'DM';

  return (
    <div
      className={`relative w-full md:w-80 h-full flex flex-col select-none shrink-0 border-r overflow-hidden ${
        themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225] text-[#dbdee1]' : 'bg-[#FFFFFF] border-slate-200 text-slate-900'
      }`}
    >
      <div
        className={`h-12 border-b px-4 flex items-center justify-between shrink-0 font-bold text-sm shadow-xs ${
          themeMode === 'dark' ? 'bg-[#2b2d31] border-[#202225] text-white' : 'bg-[#FFFFFF] border-slate-200 text-slate-950'
        }`}
      >
        <span className="truncate">
          {activeRoom ? cleanContact : 'Chat Details'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-[92px] space-y-4 no-scrollbar">
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#949ba4] my-auto space-y-3">
            <div
              className={`w-12 h-12 rounded-full border flex items-center justify-center mb-1 ${
                themeMode === 'dark' ? 'bg-[#1e1f22] border-[#35363c] text-[#949ba4]' : 'bg-slate-100 border-slate-300 text-slate-500'
              }`}
            >
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className={`text-sm font-medium ${themeMode === 'dark' ? 'text-[#dbdee1]' : 'text-slate-800'}`}>
              No conversation selected
            </p>
            <p className="text-xs text-[#949ba4]">
              Select a room or DM from the left bar or tap + to start a chat.
            </p>
            {roomsError && onRetryLoadRooms && (
              <button
                type="button"
                onClick={onRetryLoadRooms}
                className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold border border-red-500/40 cursor-pointer transition-all active:scale-95"
              >
                Could not load rooms, tap to retry
              </button>
            )}
            <button
              onClick={onOpenCreateDm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-xs font-semibold shadow transition-all cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Start Direct Message</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-1 border-b pb-3 border-slate-200 dark:border-[#35363c]">
              <div className="relative shrink-0">
                <MatrixAvatar
                  mxcUrl={activeRoom.thumbnailLink}
                  name={cleanContact}
                  size={40}
                  className="w-10 h-10 rounded-full shadow"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#5865f2] ring-2 ring-transparent" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-base font-bold truncate leading-tight ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {cleanContact}
                </h2>
                <div className="flex items-center gap-1.5 text-[11px] text-[#5865f2] mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5865f2] animate-pulse" />
                  <span className="truncate">Encrypted Matrix Session</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Starred ({starredItems.length})</span>
                </div>
              </div>
              {starredItems.length === 0 ? (
                <p className="text-[11px] text-[#949ba4] px-1 py-0.5">No starred messages.</p>
              ) : (
                <div
                  className={`space-y-1 max-h-[150px] overflow-y-auto overscroll-contain pr-1 rounded-xl p-1 border ${
                    themeMode === 'dark' ? 'bg-[#232428] border-[#2b2d31]' : 'bg-slate-100 border-slate-200'
                  }`}
                  style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
                >
                  {starredItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onScrollToMessage(item.messageId)}
                      className={`px-2.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-between group min-h-[38px] ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c]/50 text-white' : 'hover:bg-slate-200/70 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-[#949ba4] truncate">{item.subtitle}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#949ba4] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  <ImageIcon className="w-3.5 h-3.5 text-[#5865f2]" />
                  <span>Media ({mediaItems.length})</span>
                </div>
              </div>
              {mediaItems.length === 0 ? (
                <p className="text-[11px] text-[#949ba4] px-1 py-0.5">No media shared.</p>
              ) : (
                <div
                  className={`space-y-1 max-h-[150px] overflow-y-auto overscroll-contain pr-1 rounded-xl p-1 border ${
                    themeMode === 'dark' ? 'bg-[#232428] border-[#2b2d31]' : 'bg-slate-100 border-slate-200'
                  }`}
                  style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
                >
                  {mediaItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onScrollToMessage(item.messageId)}
                      className={`px-2.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-between group min-h-[38px] ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c]/50 text-white' : 'hover:bg-slate-200/70 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-[#949ba4] truncate">{item.subtitle}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#949ba4] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  <LinkIcon className="w-3.5 h-3.5 text-[#5865f2]" />
                  <span>Links ({linkItems.length})</span>
                </div>
              </div>
              {linkItems.length === 0 ? (
                <p className="text-[11px] text-[#949ba4] px-1 py-0.5">No links shared.</p>
              ) : (
                <div
                  className={`space-y-1 max-h-[150px] overflow-y-auto overscroll-contain pr-1 rounded-xl p-1 border ${
                    themeMode === 'dark' ? 'bg-[#232428] border-[#2b2d31]' : 'bg-slate-100 border-slate-200'
                  }`}
                  style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
                >
                  {linkItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onScrollToMessage(item.messageId)}
                      className={`px-2.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-between group min-h-[38px] ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c]/50 text-white' : 'hover:bg-slate-200/70 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-[#949ba4] truncate">{item.subtitle}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#949ba4] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${themeMode === 'dark' ? 'text-[#b5bac1]' : 'text-slate-600'}`}>
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  <span>Files ({fileItems.length})</span>
                </div>
              </div>
              {fileItems.length === 0 ? (
                <p className="text-[11px] text-[#949ba4] px-1 py-0.5">No files shared.</p>
              ) : (
                <div
                  className={`space-y-1 max-h-[150px] overflow-y-auto overscroll-contain pr-1 rounded-xl p-1 border ${
                    themeMode === 'dark' ? 'bg-[#232428] border-[#2b2d31]' : 'bg-slate-100 border-slate-200'
                  }`}
                  style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
                >
                  {fileItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onScrollToMessage(item.messageId)}
                      className={`px-2.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-between group min-h-[38px] ${
                        themeMode === 'dark' ? 'hover:bg-[#35373c]/50 text-white' : 'hover:bg-slate-200/70 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-[#949ba4] truncate">{item.subtitle}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#949ba4] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className={`absolute left-2 right-2 rounded-[22px] shadow-lg shadow-black/40 border px-3 py-2 ${
          themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-white border-slate-200'
        }`}
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >
        <div className="flex items-center justify-between">
          <div
            onClick={() => {
              if (onOpenUserProfile) onOpenUserProfile();
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 mr-2 cursor-pointer group hover:opacity-90 p-1 rounded-xl transition-all"
            title="Open Profile & Management Sheet"
          >
            <div className="relative shrink-0">
              <MatrixAvatar
                mxcUrl={userAvatarUrl || currentUser?.photoURL}
                name={matrixDisplayName || matrixUserId}
                size={44}
                className="w-11 h-11 rounded-full ring-2 ring-[#2b2d31]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 cursor-pointer group">
                <span
                  className={`text-[13px] font-bold tracking-wide truncate group-hover:underline ${
                    themeMode === 'dark' ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {matrixDisplayName || matrixUserId.replace('@', '').split(':')[0] || 'WHO'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#949ba4] group-hover:text-white shrink-0 transition-colors" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onOpenNotifications) {
                  onOpenNotifications();
                }
              }}
              className={`relative min-w-[36px] min-h-[36px] p-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center ${
                themeMode === 'dark' ? 'text-[#949ba4] hover:text-white hover:bg-[#313338]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Notifications & Alerts"
              aria-label="Open Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#f23f43] ring-1 ring-[#232428] animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
