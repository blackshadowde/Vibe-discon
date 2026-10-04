import React, { useState, useMemo } from 'react';
import { Message, Channel } from '../types';
import {
  Search,
  Check,
  Loader2,
  Hash,
  X,
} from 'lucide-react';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { MatrixAvatar } from './MatrixAvatar';

interface ForwardPickerModalProps {
  isOpen: boolean;
  message: Message | null;
  channels: Channel[];
  themeMode: 'dark' | 'light';
  onSend: (channel: Channel) => Promise<void>;
  onClose: () => void;
}

export const ForwardPickerModal: React.FC<ForwardPickerModalProps> = ({
  isOpen,
  message,
  channels,
  themeMode,
  onSend,
  onClose,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'forward-picker');
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingChannelId, setSendingChannelId] = useState<string | null>(null);
  const [successChannelId, setSuccessChannelId] = useState<string | null>(null);
  const [errorChannelId, setErrorChannelId] = useState<string | null>(null);

  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      const isMatrix = Boolean(ch.matrixRoomId);
      const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      return isMatrix && matchesSearch;
    });
  }, [channels, searchQuery]);

  if (!isOpen) return null;

  const handleForward = async (channel: Channel) => {
    if (sendingChannelId || successChannelId) return;
    
    setSendingChannelId(channel.id);
    setErrorChannelId(null);

    try {
      await onSend(channel);
      setSendingChannelId(null);
      setSuccessChannelId(channel.id);
      
      setTimeout(() => {
        setSuccessChannelId(null);
        onClose();
        setSearchQuery('');
      }, 600);
    } catch (err) {
      console.error('Forward failed:', err);
      setSendingChannelId(null);
      setErrorChannelId(channel.id);
      setTimeout(() => setErrorChannelId(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className={`relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 animate-in slide-in-from-bottom duration-200 max-h-[80dvh] flex flex-col ${
        themeMode === 'dark' ? 'bg-[#2b2d31] border border-[#383a40]' : 'bg-white border border-slate-200'
      }`}>
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-[#4e5058]" />
        </div>

        <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
          <h3 className={`text-lg font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
            Forward to…
          </h3>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-full hover:bg-black/10 transition-colors ${
              themeMode === 'dark' ? 'text-[#949ba4] hover:text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3">
          <div className={`relative flex items-center rounded-xl border px-3 py-2 transition-all ${
            themeMode === 'dark' 
              ? 'bg-[#1e1f22] border-[#1e1f22] focus-within:border-[#5865f2]' 
              : 'bg-slate-100 border-slate-100 focus-within:border-[#5865f2]'
          }`}>
            <Search className={`w-4 h-4 shrink-0 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`} />
            <input
              type="text"
              autoFocus
              placeholder="Search for a chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-transparent border-none outline-none px-2.5 text-sm ${
                themeMode === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#949ba4] hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-6 no-scrollbar">
          {filteredChannels.length === 0 ? (
            <div className="py-12 text-center">
              <p className={`text-sm ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
                No matches found
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredChannels.map((channel) => {
                const isSending = sendingChannelId === channel.id;
                const isSuccess = successChannelId === channel.id;
                const isError = errorChannelId === channel.id;
                
                return (
                  <button
                    key={channel.id}
                    onClick={() => handleForward(channel)}
                    disabled={Boolean(sendingChannelId || successChannelId)}
                    className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left ${
                      themeMode === 'dark' 
                        ? 'hover:bg-[#35373c] text-white active:bg-[#3f4147]' 
                        : 'hover:bg-slate-100 text-slate-900 active:bg-slate-200'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {channel.isDirect ? (
                        <MatrixAvatar
                          mxcUrl={channel.thumbnailLink}
                          name={channel.name}
                          size={40}
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          themeMode === 'dark' ? 'bg-[#313338]' : 'bg-slate-200'
                        }`}>
                          <Hash className="w-5 h-5 text-[#949ba4]" />
                        </div>
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{channel.name}</div>
                      {isError && (
                        <div className="text-[10px] font-bold text-red-400 animate-in fade-in">
                          Could not forward
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 min-w-[24px] flex items-center justify-center">
                      {isSending && (
                        <Loader2 className="w-5 h-5 text-[#5865f2] animate-spin" />
                      )}
                      {isSuccess && (
                        <div className="bg-emerald-500 rounded-full p-1 animate-in zoom-in duration-200">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
