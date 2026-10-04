import React, { useState, useEffect } from 'react';
import { ArrowLeft, UserPlus, MessageSquare, Loader2 } from 'lucide-react';
import { getOrCreateMatrixClient } from '../services/matrix';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface CreateDmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userId: string) => void;
}

export const CreateDmModal: React.FC<CreateDmModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'create-dm-modal');
  const [targetUserId, setTargetUserId] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (targetUserId.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const client = await getOrCreateMatrixClient();
        const results = await (client as any).searchUserDirectory({ term: targetUserId });
        setSuggestions(results.results);
      } catch (err) {
        console.error('Directory search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [targetUserId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId.trim()) return;
    onSubmit(targetUserId.trim());
    setTargetUserId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#313338] border border-[#3f4147] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-[#dbdee1] max-h-[90dvh] overflow-y-auto pb-safe">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#232428] flex items-center gap-3 bg-[#2b2d31]">
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] -ml-1 rounded-xl flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Navigate Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-[#5865f2]/20 text-[#5865f2] shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                Add Contact by Matrix ID
              </h3>
              <p className="text-[11px] sm:text-xs text-[#949ba4] truncate">
                Create a private 1-on-1 encrypted room
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#b5bac1] mb-2">
              Matrix User ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="@username:matrix.org"
              className="w-full bg-[#1e1f22] text-sm text-white px-3.5 py-2.5 rounded-xl border border-[#3f4147] focus:outline-hidden focus:border-[#5865f2] transition-colors"
            />
            <p className="text-xs text-[#949ba4] mt-1.5">
              The Matrix Rust SDK will create a DM room and invite this ID.
            </p>
          </div>

          <div className="pt-1">
            <span className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wider block mb-1.5">
              {isSearching ? 'Searching...' : 'Search Results'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((sug) => (
                <button
                  key={sug.user_id}
                  type="button"
                  onClick={() => setTargetUserId(sug.user_id)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] active:scale-95 text-xs text-[#b5bac1] hover:text-white transition-all border border-[#3f4147] min-h-[34px] cursor-pointer"
                >
                  {sug.display_name || sug.user_id}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[#2b2d31] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-[#dbdee1] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!targetUserId.trim()}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Start Chat</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
