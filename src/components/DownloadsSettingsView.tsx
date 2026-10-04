import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  Image as ImageIcon,
  Video,
  Music,
  Mic,
  FileText,
  FileArchive,
  File,
  Trash2,
  ExternalLink,
  Share2,
  ChevronDown,
  ChevronRight,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import {
  getFolderStatistics,
  deleteDownloadedFile,
  openDownloadedFile,
  shareDownloadedFile,
  FolderStats,
  DownloadRecord,
  APP_FOLDERS,
} from '../services/downloadManager';
import { formatBytes } from '../utils/files';

interface DownloadsSettingsViewProps {
  themeMode?: 'dark' | 'light';
  onOpenInAppMedia?: (url: string, kind: string) => void;
}

export const DownloadsSettingsView: React.FC<DownloadsSettingsViewProps> = ({
  themeMode = 'dark',
  onOpenInAppMedia,
}) => {
  const [stats, setStats] = useState<FolderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    [APP_FOLDERS.IMAGES]: true,
    [APP_FOLDERS.VIDEOS]: true,
    [APP_FOLDERS.AUDIO]: true,
    [APP_FOLDERS.VOICE_NOTES]: true,
    [APP_FOLDERS.DOCUMENTS]: true,
  });

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFolderStatistics();
      setStats(data);
    } catch (err) {
      console.error('[DownloadsSettingsView] failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }));
  };

  const handleDelete = async (file: DownloadRecord) => {
    await deleteDownloadedFile(file.eventId);
    await loadStats();
  };

  const grandTotalSize = stats.reduce((acc, s) => acc + s.totalSize, 0);
  const grandTotalFiles = stats.reduce((acc, s) => acc + s.count, 0);

  const getFolderIcon = (name: string) => {
    switch (name) {
      case 'Images':
        return <ImageIcon className="w-5 h-5 text-sky-400" />;
      case 'Videos':
        return <Video className="w-5 h-5 text-purple-400" />;
      case 'Audio':
        return <Music className="w-5 h-5 text-emerald-400" />;
      case 'Voice Notes':
        return <Mic className="w-5 h-5 text-amber-400" />;
      default:
        return <FileText className="w-5 h-5 text-blue-400" />;
    }
  };

  const getFileIcon = (file: DownloadRecord) => {
    const ext = file.fileName.split('.').pop()?.toLowerCase();
    if (file.kind === 'image') return <ImageIcon className="w-4 h-4 text-sky-400" />;
    if (file.kind === 'video') return <Video className="w-4 h-4 text-purple-400" />;
    if (file.isVoiceNote) return <Mic className="w-4 h-4 text-amber-400" />;
    if (file.kind === 'audio') return <Music className="w-4 h-4 text-emerald-400" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive className="w-4 h-4 text-amber-400" />;
    }
    return <File className="w-4 h-4 text-[#949ba4]" />;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Top Storage Overview Banner */}
      <div
        className={`p-5 border rounded-2xl flex items-center justify-between shadow-xs ${
          themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-[#5865f2]/20 text-[#5865f2]">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h4 className={`font-bold text-sm sm:text-base ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              Device Storage
            </h4>
            <p className={`text-xs mt-0.5 ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
              Decrypted local files across 5 app folders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-sm sm:text-base font-extrabold text-[#5865f2] font-mono">
              {formatBytes(grandTotalSize)}
            </span>
            <div className={`text-[11px] ${themeMode === 'dark' ? 'text-[#949ba4]' : 'text-slate-500'}`}>
              {grandTotalFiles} {grandTotalFiles === 1 ? 'file' : 'files'}
            </div>
          </div>
          <button
            type="button"
            onClick={loadStats}
            className="p-2 rounded-xl text-[#949ba4] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Refresh folder stats"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Folders List */}
      <div className="space-y-4">
        {stats.map((folderStat) => {
          const isExpanded = expandedFolders[folderStat.folder] ?? true;
          return (
            <div
              key={folderStat.folder}
              className={`border rounded-2xl overflow-hidden transition-all shadow-xs ${
                themeMode === 'dark' ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Folder Header */}
              <div
                onClick={() => toggleFolder(folderStat.folder)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-[#1e1f22] border border-[#3f4147] shrink-0">
                    {getFolderIcon(folderStat.name)}
                  </div>
                  <div className="min-w-0">
                    <h5 className={`font-bold text-sm truncate ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      {folderStat.name}
                    </h5>
                    <span className="text-[11px] font-mono text-[#949ba4] truncate">
                      {folderStat.folder}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#1e1f22] border border-[#3f4147] text-[#949ba4] font-mono">
                    {folderStat.count} {folderStat.count === 1 ? 'file' : 'files'} • {formatBytes(folderStat.totalSize)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-[#949ba4]" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[#949ba4]" />
                  )}
                </div>
              </div>

              {/* Files Table / List */}
              {isExpanded && (
                <div className="border-t border-[#3f4147]/50 divide-y divide-[#3f4147]/30 bg-[#1e1f22]/40">
                  {folderStat.files.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#949ba4] italic">
                      No files downloaded in this folder
                    </div>
                  ) : (
                    folderStat.files.map((file) => (
                      <div
                        key={file.eventId}
                        className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg bg-[#2b2d31] border border-[#383a40] shrink-0">
                            {getFileIcon(file)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h6
                              className="text-xs sm:text-sm font-semibold text-white truncate"
                              title={file.fileName}
                            >
                              {file.fileName}
                            </h6>
                            <div className="flex items-center gap-2 text-[10px] text-[#949ba4] mt-0.5">
                              <span className="font-mono">{formatBytes(file.size)}</span>
                              <span>•</span>
                              <span>{new Date(file.downloadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openDownloadedFile(file, onOpenInAppMedia)}
                            className="px-2.5 py-1 rounded-lg bg-[#5865f2]/20 hover:bg-[#5865f2]/40 text-[#5865f2] hover:text-white border border-[#5865f2]/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            title="Open file"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Open</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => shareDownloadedFile(file)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-[#949ba4] hover:text-white transition-colors cursor-pointer"
                            title="Share file"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(file)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-[#949ba4] hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete from device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
