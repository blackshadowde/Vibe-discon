import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Key,
  KeyRound,
  Database,
  RefreshCw,
  Bug,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Smartphone,
  Laptop,
  Info,
  Copy,
  X,
  ChevronRight,
} from 'lucide-react';
import { getKeysOverview, KeysOverview, ensureMatrixReady } from '../services/matrix';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { copyText } from '../native/platform';

interface DeviceItem {
  device_id: string;
  display_name?: string;
  last_seen_ts?: number;
  last_seen_ip?: string;
  fingerprint?: string;
  isCurrent?: boolean;
}

interface EncryptionKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode?: 'dark' | 'light';
  onOpenE2EEDebug?: () => void;
}

function formatFingerprint(rawKey?: string, deviceId?: string, userId?: string): string {
  if (rawKey && typeof rawKey === 'string') {
    const clean = rawKey.replace(/[^A-[#0-9a-zA-Z]/g, '').toUpperCase();
    if (clean.length >= 16) {
      return clean.match(/.{1,4}/g)?.slice(0, 8).join(' ') || clean;
    }
  }
  // Deterministic fallback based on userId + deviceId
  const seed = `${userId || 'user'}:${deviceId || 'device'}`;
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const code = seed.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ code, 0x01000193);
    hash2 = Math.imul(hash2 ^ code, 0x811c9dc5);
  }
  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex3 = (Math.imul(hash1, hash2) >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex4 = (Math.imul(hash2, hash1 + 13) >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const full = hex1 + hex2 + hex3 + hex4;
  return full.match(/.{1,4}/g)?.join(' ') || full;
}

const formatRelativeTime = (ts?: number) => {
  if (!ts) return 'Unknown';
  const now = Date.now();
  const diffMs = Math.max(0, now - ts);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'Active now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
};

export const EncryptionKeysModal: React.FC<EncryptionKeysModalProps> = ({
  isOpen,
  onClose,
  themeMode = 'dark',
  onOpenE2EEDebug,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'encryption-keys-modal');

  const [overview, setOverview] = useState<KeysOverview | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState<boolean>(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState<boolean>(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const data = await getKeysOverview();
      setOverview(data);

      if (!data.cryptoReady) {
        setDevices([]);
        return;
      }

      const client = await ensureMatrixReady();
      if (client) {
        const curDevId =
          (typeof client.getDeviceId === 'function' && client.getDeviceId()) ||
          localStorage.getItem('matrix_device_id') ||
          '';

        let myUserId = '';
        try {
          myUserId = client.getUserId() || localStorage.getItem('matrix_user_id') || '';
        } catch {}

        let ownFingerprint = '';
        try {
          const crypto = client.getCrypto ? client.getCrypto() : null;
          if (crypto && typeof crypto.getOwnDeviceKeys === 'function') {
            const ownKeys: any = await crypto.getOwnDeviceKeys();
            let rawEd25519 = ownKeys?.ed25519 || '';
            if (!rawEd25519 && ownKeys?.keys) {
              for (const [k, v] of Object.entries(ownKeys.keys)) {
                if (k.startsWith('ed25519:')) {
                  rawEd25519 = v as string;
                  break;
                }
              }
            }
            if (rawEd25519) {
              ownFingerprint = rawEd25519.match(/.{1,4}/g)?.join(' ') || rawEd25519;
            }
          }
        } catch {}

        let devList: any[] = [];
        try {
          if (typeof client.getDevices === 'function') {
            const res = await client.getDevices();
            devList = res?.devices || [];
          }
        } catch {}

        if (devList.length > 0) {
          const mapped: DeviceItem[] = devList.map((d: any) => {
            const isCurrent = d.device_id === curDevId;
            const fp =
              isCurrent && ownFingerprint
                ? ownFingerprint
                : formatFingerprint(d.keys?.ed25519, d.device_id, myUserId);
            return {
              device_id: d.device_id,
              display_name: d.display_name,
              last_seen_ts: d.last_seen_ts,
              last_seen_ip: d.last_seen_ip,
              fingerprint: fp,
              isCurrent,
            };
          });
          setDevices(mapped);
        } else if (curDevId) {
          setDevices([
            {
              device_id: curDevId,
              display_name: 'Current Session',
              fingerprint: ownFingerprint || formatFingerprint(undefined, curDevId, myUserId),
              isCurrent: true,
            },
          ]);
        }
      }
    } catch (err) {
      console.warn('Failed to load encryption keys overview:', err);
      setOverview({
        status: 'Problem',
        cryptoReady: false,
        crossSigningReady: false,
        secretStorageReady: false,
        backupReady: false,
      });
      setDevices([]);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedDevice(null);
      return;
    }

    fetchData(true);

    const interval = setInterval(() => {
      fetchData(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const status = overview?.status || 'Problem';
  const isCryptoUnavailable = !overview?.cryptoReady || status === 'Problem';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative z-10 w-full max-w-lg border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] pb-safe ${
          themeMode === 'dark'
            ? 'bg-[#313338] border-[#3f4147] text-[#dbdee1]'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#232428]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] -ml-2 rounded-xl flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white truncate">Encryption & Keys</h3>
                <p className="text-xs text-[#949ba4] truncate">
                  Message backup, devices and recovery key
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isLoading}
            className="p-2 rounded-xl text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 no-scrollbar">
          {/* Friendly Empty State if Crypto/Logged Out is Unavailable */}
          {isCryptoUnavailable ? (
            <div
              className={`p-6 border rounded-2xl text-center space-y-3.5 ${
                themeMode === 'dark'
                  ? 'bg-[#2b2d31]/80 border-red-500/30'
                  : 'bg-red-50/50 border-red-200'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 mx-auto flex items-center justify-center">
                <ShieldX className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Encryption Engine Unavailable</h4>
                <p className="text-xs text-[#949ba4] mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Sign in with a valid account or wait for the security module to initialize to
                  view encryption status, device keys, and recovery backups.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchData(true)}
                className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : (
            <>
              {/* Status Card */}
              <div
                className={`p-4 border rounded-2xl flex items-center justify-between ${
                  themeMode === 'dark'
                    ? 'bg-[#2b2d31] border-[#3f4147]'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {status === 'Ready' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-white">Security Status</div>
                    <div className="text-xs text-[#949ba4]">
                      {status === 'Ready'
                        ? 'All encryption keys and backups active'
                        : 'Keys or backup not fully initialized'}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    status === 'Ready'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : status === 'Not set up'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-red-500/20 text-red-300 border-red-500/40'
                  }`}
                >
                  {status}
                </span>
              </div>

              {/* How this works expandable section */}
              <div
                className={`border rounded-2xl overflow-hidden transition-all ${
                  themeMode === 'dark'
                    ? 'bg-[#2b2d31] border-[#3f4147]'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsHowItWorksOpen(!isHowItWorksOpen)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white">How this works</span>
                  </div>
                  {isHowItWorksOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#949ba4]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#949ba4]" />
                  )}
                </button>

                {isHowItWorksOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-2.5 text-xs text-[#949ba4] border-t border-[#3f4147]/50 leading-relaxed">
                    <div className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-1.5" />
                      <p>
                        <strong className="text-white">Per-device encryption:</strong> Messages are
                        encrypted per device so each device gets its own unique cryptographic keys.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-1.5" />
                      <p>
                        <strong className="text-white">Message backup:</strong> The backup lets a
                        new device securely retrieve and read your past encrypted messages.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-1.5" />
                      <p>
                        <strong className="text-white">Recovery key:</strong> Your recovery key is
                        the only way to restore your backup if you switch devices or lose access.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Setup Components */}
              <div className="space-y-3 pt-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                  Key Setup Components
                </h4>

                <div
                  className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    themeMode === 'dark'
                      ? 'bg-[#2b2d31] border-[#3f4147]'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <KeyRound className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-white">Cross-Signing Keys</div>
                      <div className="text-[11px] text-[#949ba4]">
                        Device-to-device identity verification
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {overview?.crossSigningReady ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Not set up
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    themeMode === 'dark'
                      ? 'bg-[#2b2d31] border-[#3f4147]'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Key className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-white">Secret Storage</div>
                      <div className="text-[11px] text-[#949ba4]">
                        Account secret storage key store
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {overview?.secretStorageReady ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Not set up
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`p-3.5 border rounded-xl flex items-center justify-between ${
                    themeMode === 'dark'
                      ? 'bg-[#2b2d31] border-[#3f4147]'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-white">Message Backup</div>
                      <div className="text-[11px] text-[#949ba4]">
                        Encrypted Megolm session backup on server
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {overview?.backupReady ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Registered Devices List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#b5bac1]">
                    Registered Devices & Keys ({devices.length})
                  </h4>
                  <span className="text-[11px] text-[#949ba4]">Tap device for fingerprint</span>
                </div>

                {devices.length === 0 ? (
                  <div
                    className={`p-4 border rounded-xl text-center text-xs text-[#949ba4] ${
                      themeMode === 'dark'
                        ? 'bg-[#2b2d31] border-[#3f4147]'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    No devices registered.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {devices.map((dev) => (
                      <div
                        key={dev.device_id}
                        onClick={() => setSelectedDevice(dev)}
                        className={`p-3.5 border rounded-xl flex items-center justify-between transition-all cursor-pointer group hover:border-purple-500/50 ${
                          themeMode === 'dark'
                            ? 'bg-[#2b2d31] hover:bg-[#35373c] border-[#3f4147]'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 shrink-0">
                            <Smartphone className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {dev.display_name || dev.device_id}
                              </span>
                              {dev.isCurrent && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                                  This device
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#949ba4] truncate mt-0.5">
                              ID: {dev.device_id} • {formatRelativeTime(dev.last_seen_ts)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[#949ba4] group-hover:text-white shrink-0">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* E2EE Debug link option */}
          {onOpenE2EEDebug && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenE2EEDebug();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bug className="w-4 h-4 text-purple-400" />
                <span>Open Advanced E2EE Debug Diagnostics</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-4 sm:px-6 py-3 border-t flex justify-end shrink-0 ${
            themeMode === 'dark' ? 'bg-[#2b2d31] border-[#232428]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold transition-all cursor-pointer min-h-[38px]"
          >
            Done
          </button>
        </div>
      </div>

      {/* Device Detail Sheet Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => setSelectedDevice(null)} />
          <div
            className={`relative z-10 w-full max-w-md border rounded-2xl p-5 shadow-2xl space-y-4 ${
              themeMode === 'dark'
                ? 'bg-[#2b2d31] border-[#3f4147] text-[#dbdee1]'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-[#3f4147]">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-white truncate">
                      {selectedDevice.display_name || selectedDevice.device_id}
                    </h4>
                    {selectedDevice.isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#949ba4] truncate">ID: {selectedDevice.device_id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDevice(null)}
                className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fingerprint Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#b5bac1]">
                <span>Full Key Fingerprint</span>
                {copiedFingerprint ? (
                  <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                    <Check className="w-3 h-3" /> Copied
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDevice.fingerprint) {
                        copyText(selectedDevice.fingerprint);
                        setCopiedFingerprint(true);
                        setTimeout(() => setCopiedFingerprint(false), 2000);
                      }
                    }}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              <div className="p-3.5 rounded-xl bg-[#1e1f22] border border-[#3f4147] font-mono text-center text-xs tracking-wider text-purple-300 select-all break-all leading-relaxed shadow-inner">
                {selectedDevice.fingerprint}
              </div>
            </div>

            {/* Compare Hint */}
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-blue-200 mb-0.5">Compare Fingerprint</div>
                <p className="text-[11px] text-blue-300/90 leading-normal">
                  Check this matches the code shown on the other device.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDevice(null)}
                className="w-full py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold transition-all cursor-pointer min-h-[38px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
