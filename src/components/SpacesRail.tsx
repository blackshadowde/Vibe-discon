import React, { useState, useRef } from 'react';
import { Plus, MessageSquare, Trash2, RefreshCw } from 'lucide-react';
import { Channel } from '../types';
import { MatrixAvatar } from './MatrixAvatar';

interface SpacesRailProps {
  rooms: Channel[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenCreateDm: () => void;
  onDeleteRoom?: (room: Channel) => Promise<void>;
  currentUsername?: string;
  currentUserAvatar?: string;
  themeMode?: 'dark' | 'light';
  roomsError?: string | null;
  onRetryLoadRooms?: () => void;
}

export const SpacesRail: React.FC<SpacesRailProps> = ({
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenCreateDm,
  onDeleteRoom,
  currentUsername = 'ashishboddu',
  currentUserAvatar,
  themeMode = 'dark',
  roomsError,
  onRetryLoadRooms,
}) => {
  const [contextMenuRoom, setContextMenuRoom] = useState<{ room: Channel; x: number; y: number } | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (room: Channel, e: React.TouchEvent) => {
    const touch = e.touches[0];
    pressTimerRef.current = setTimeout(() => {
      setContextMenuRoom({ room, x: touch.clientX, y: touch.clientY });
    }, 450);
  };

  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <nav
      aria-label="Server Navigation Bar"
      className={`w-[68px] sm:w-[72px] h-full flex flex-col items-center py-3 select-none shrink-0 border-r z-30 justify-between relative ${
        themeMode === 'dark' ? 'bg-[#1e1f22] border-[#151618]' : 'bg-slate-200 border-slate-300'
      }`}
    >
      <div className="flex flex-col items-center w-full">
        <div className="relative group flex items-center justify-center w-full mb-2">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] bg-[#5865f2] text-white font-bold text-sm flex items-center justify-center shadow-lg cursor-pointer hover:rounded-[12px] transition-all relative group overflow-hidden">
            <MatrixAvatar
              mxcUrl={currentUserAvatar}
              name={currentUsername}
              size={48}
              className="w-full h-full rounded-[16px] hover:rounded-[12px]"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#5865f2] ring-2 ring-[#1e1f22]" />
          </div>
          <div className="hidden sm:block absolute left-[80px] px-3 py-1.5 bg-[#111214] text-white text-xs font-semibold rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            {currentUsername}
            <div className="text-[10px] text-[#5865f2] font-normal">Direct Messages & Home</div>
            <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
          </div>
        </div>
        <div className={`w-7 sm:w-8 h-[2px] rounded my-2 ${themeMode === 'dark' ? 'bg-[#35363c]' : 'bg-slate-300'}`} />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar w-full flex flex-col items-center py-1">
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const roomName = room.name.replace('@', '').split(':')[0];
          const isGroup = room.name.includes(',') || (!room.isDirect && room.category === 'MATRIX ROOMS');
          const firstLetter = roomName.charAt(0).toUpperCase() || (isGroup ? ' ' : 'C');
          return (
            <div
              key={room.id}
              className="relative group flex items-center justify-center w-full"
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuRoom({ room, x: e.clientX, y: e.clientY });
              }}
              onTouchStart={(e) => handleTouchStart(room, e)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
            >
              {isActive && (
                <div className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 w-1 h-7 sm:h-8 rounded-r-md bg-[#5865f2] shadow-md" />
              )}
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className={`relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center font-bold text-sm sm:text-base cursor-pointer transition-all duration-200 shadow-md overflow-hidden ${
                  isActive
                    ? themeMode === 'dark'
                      ? 'rounded-[16px] bg-[#313338] text-white ring-2 ring-[#5865f2] ring-offset-2 ring-offset-[#1e1f22]'
                      : 'rounded-[16px] bg-slate-300 text-slate-900 ring-2 ring-[#5865f2] ring-offset-2 ring-offset-white'
                    : themeMode === 'dark'
                    ? 'rounded-[24px] bg-[#313338] text-white hover:rounded-[16px] hover:bg-[#5865f2]'
                    : 'rounded-[24px] bg-slate-300 text-slate-900 hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white'
                }`}
                title={roomName}
                aria-label={`Switch to room ${roomName}`}
              >
                {room.thumbnailLink || room.isDirect ? (
                  <MatrixAvatar
                    mxcUrl={room.thumbnailLink}
                    name={roomName}
                    size={48}
                    className="w-full h-full"
                  />
                ) : (
                  <span>{firstLetter}</span>
                )}
                {room.unreadCount && room.unreadCount > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-[#f23f43] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow border-2 border-[#1e1f22]">
                    {room.unreadCount}
                  </span>
                ) : null}
              </button>
              <div className="hidden sm:block absolute left-[80px] px-3 py-1.5 bg-[#111214] text-white text-xs font-semibold rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                {roomName}
                <div className="text-[10px] text-[#949ba4] font-normal">{room.category}</div>
                <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
              </div>
            </div>
          );
        })}

        <div className="relative group flex items-center justify-center w-full">
          <button
            type="button"
            onClick={onOpenCreateDm}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all cursor-pointer shadow-md group ${
              themeMode === 'dark'
                ? 'bg-[#313338] text-[#23a55a] hover:bg-[#23a55a] hover:text-white'
                : 'bg-white text-[#23a55a] hover:bg-[#23a55a] hover:text-white shadow'
            }`}
            title="Start Direct Message / Join Room"
            aria-label="Start Direct Message"
          >
            <Plus className="w-6 h-6 transition-transform group-hover:rotate-90" />
          </button>
          <div className="hidden sm:block absolute left-[80px] px-3 py-1.5 bg-[#111214] text-white text-xs font-semibold rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            Add a Server
            <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
          </div>
        </div>

        {roomsError && onRetryLoadRooms && (
          <div className="relative group flex items-center justify-center w-full mt-2">
            <button
              type="button"
              onClick={onRetryLoadRooms}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-[24px] hover:rounded-[16px] bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
              title="Could not load rooms, tap to retry"
              aria-label="Could not load rooms, tap to retry"
            >
              <RefreshCw className="w-5 h-5 animate-spin" />
            </button>
            <div className="hidden sm:block absolute left-[80px] px-3 py-1.5 bg-[#111214] text-red-400 text-xs font-semibold rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
              Could not load rooms, tap to retry
              <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#111214]" />
            </div>
          </div>
        )}
      </div>



      {contextMenuRoom && onDeleteRoom && (
        <div
          className="fixed z-50 bg-[#111214] border border-[#3f4147] rounded-xl shadow-2xl p-1.5 min-w-[160px] animate-in fade-in duration-100"
          style={{ top: `${Math.min(contextMenuRoom.y, window.innerHeight - 120)}px`, left: `${Math.min(contextMenuRoom.x, window.innerWidth - 180)}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] font-bold text-[#949ba4] uppercase border-b border-[#202225] mb-1 truncate">
            {contextMenuRoom.room.name}
          </div>
          <button
            onClick={() => {
              onDeleteRoom(contextMenuRoom.room);
              setContextMenuRoom(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Leave / Close Chat</span>
          </button>
        </div>
      )}
    </nav>
  );
};
