import React from 'react';
import { AlertTriangle, Trash2, ArrowLeft } from 'lucide-react';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';

interface DestructiveConfirmModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  description?: string;
  confirmLabel?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DestructiveConfirmModal: React.FC<DestructiveConfirmModalProps> = ({
  isOpen,
  title,
  itemName,
  description = 'This action will permanently delete this item. This cannot be undone.',
  confirmLabel = 'Delete File',
  isProcessing = false,
  onConfirm,
  onCancel,
}) => {
  useAndroidBackHandler(isOpen, onCancel, 'destructive-confirm');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onCancel} />
      <div
        className="relative z-10 w-full max-w-md bg-[#313338] border border-[#3f4147] rounded-2xl shadow-2xl p-5 sm:p-6 text-[#dbdee1] flex flex-col gap-4 max-h-[90dvh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <button
            onClick={onCancel}
            className="min-w-[36px] min-h-[36px] -ml-1 rounded-xl flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Navigate Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-white">{title}</h3>
            <p className="text-xs sm:text-sm text-[#949ba4] mt-1">{description}</p>
          </div>
        </div>

        <div className="bg-[#1e1f22] p-3 rounded-xl border border-[#2b2d31] flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-white truncate">{itemName}</span>
        </div>

        <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-[#3f4147]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#dbdee1] hover:text-white cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl bg-[#da373c] hover:bg-[#ba2f34] active:scale-95 text-white flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
