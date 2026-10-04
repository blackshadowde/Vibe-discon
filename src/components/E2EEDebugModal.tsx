import React, { useState, useEffect, useCallback } from 'react';
import { Copy, RefreshCw, X, Check, Bug } from 'lucide-react';
import { ensureMatrixReady, isCryptoReady, getBackupStatus } from '../services/matrix';
import { getLastSuccessfulSyncTime, isStoragePersisted } from '../services/messageCache';
import { useAndroidBackHandler } from '../utils/useAndroidBackHandler';
import { copyText } from '../native/platform';

interface E2EEDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoomId?: string;
}

export const E2EEDebugModal: React.FC<E2EEDebugModalProps> = ({
  isOpen,
  onClose,
  activeRoomId,
}) => {
  useAndroidBackHandler(isOpen, onClose, 'e2ee-debug-modal');
  const [debugText, setDebugText] = useState<string>('Loading E2EE debug diagnostics...');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchDebugData = useCallback(async () => {
    setIsLoading(true);
    const sections: string[] = [];
    const timestamp = new Date().toISOString();
    sections.push(`=== MATRIX E2EE DIAGNOSTICS (${timestamp}) ===\n`);

    try {
      const client = await ensureMatrixReady();
      if (!client) {
        setDebugText('Error: Matrix client is not initialized');
        setIsLoading(false);
        return;
      }

      // 1. Sync Diagnostics Block
      try {
        const syncState = typeof client.getSyncState === 'function' ? client.getSyncState() || 'UNKNOWN' : 'UNKNOWN';
        const lastSyncTime = getLastSuccessfulSyncTime();
        const lastSyncStr = lastSyncTime
          ? `${new Date(lastSyncTime).toLocaleString()} (${Math.round((Date.now() - lastSyncTime) / 1000)}s ago)`
          : 'Never / Pending';

        const persisted = await isStoragePersisted();
        const storagePersistedStr = persisted ? 'Yes' : 'No';

        const cryptoReady = isCryptoReady();
        const cryptoReadyStr = cryptoReady ? 'Yes' : 'No';

        let backupEnabled = false;
        try {
          const status = await getBackupStatus();
          backupEnabled = status.backupEnabledOnThisDevice || status.serverBackupExists;
        } catch {}
        const backupEnabledStr = backupEnabled ? 'Yes' : 'No';

        let undecryptableCount = 0;
        let activeRoom = activeRoomId ? client.getRoom(activeRoomId) : null;
        if (!activeRoom && typeof client.getRooms === 'function') {
          const allRooms = client.getRooms();
          activeRoom = allRooms.find((r: any) => r.roomId === activeRoomId) || allRooms[0] || null;
        }

        if (activeRoom) {
          const liveTimeline = typeof activeRoom.getLiveTimeline === 'function' ? activeRoom.getLiveTimeline() : null;
          const events = liveTimeline && typeof liveTimeline.getEvents === 'function' ? liveTimeline.getEvents() : [];
          undecryptableCount = events.filter((e: any) => {
            if (typeof e.isEncrypted === 'function' && e.isEncrypted()) {
              const isDecFail = typeof e.isDecryptionFailure === 'function' ? e.isDecryptionFailure() : false;
              const reason = e.decryptionFailureReason || (typeof e.getDecryptionFailureReason === 'function' ? e.getDecryptionFailureReason() : '');
              return Boolean(isDecFail || reason || !(e as any).clearEvent);
            }
            return false;
          }).length;
        }

        sections.push(
          `[SYNC DIAGNOSTICS]\n` +
          `sync state: ${syncState}\n` +
          `time of last successful sync: ${lastSyncStr}\n` +
          `storage persisted: ${storagePersistedStr}\n` +
          `crypto ready: ${cryptoReadyStr}\n` +
          `backup enabled: ${backupEnabledStr}\n` +
          `number of undecryptable events in current room: ${undecryptableCount}\n`
        );
      } catch (err: any) {
        sections.push(`[SYNC DIAGNOSTICS]\nError: ${err?.message || String(err)}\n`);
      }

      // 2. Sync State
      try {
        const syncState = client.getSyncState ? client.getSyncState() : 'unknown';
        sections.push(`[SYNC STATE]\n${syncState}\n`);
      } catch (err: any) {
        sections.push(`[SYNC STATE]\nError: ${err?.message || String(err)}\n`);
      }

      // 2. Crypto Engine Status
      try {
        const ready = isCryptoReady();
        sections.push(`[CRYPTO ENGINE READY]\n${ready ? 'true (Rust Cryptographic Engine Active)' : 'false (Inactive or Failed)'}\n`);
      } catch (err: any) {
        sections.push(`[CRYPTO ENGINE READY]\nError: ${err?.message || String(err)}\n`);
      }

      // 3. User ID and Device ID
      let myUserId = '';
      let myDeviceId = '';
      try {
        myUserId = client.getUserId() || localStorage.getItem('matrix_user_id') || '';
        myDeviceId = client.getDeviceId() || localStorage.getItem('matrix_device_id') || '';
        sections.push(`[ACCOUNT IDENTIFIERS]\nUser ID: ${myUserId || '(none)'}\nDevice ID: ${myDeviceId || '(none)'}\n`);
      } catch (err: any) {
        sections.push(`[ACCOUNT IDENTIFIERS]\nError: ${err?.message || String(err)}\n`);
      }

      // 4. Own Device Keys
      try {
        const crypto = client.getCrypto ? client.getCrypto() : null;
        if (crypto && typeof crypto.getOwnDeviceKeys === 'function') {
          const ownKeys = await crypto.getOwnDeviceKeys();
          sections.push(`[OWN DEVICE KEYS]\n${JSON.stringify(ownKeys, null, 2)}\n`);
        } else {
          sections.push(`[OWN DEVICE KEYS]\nCrypto engine getOwnDeviceKeys not available\n`);
        }
      } catch (err: any) {
        sections.push(`[OWN DEVICE KEYS]\nError: ${err?.message || String(err)}\n`);
      }

      // 5. Devices on My Account
      try {
        if (typeof client.getDevices === 'function') {
          const devicesRes = await client.getDevices();
          const devicesList = devicesRes?.devices || [];
          if (devicesList.length === 0) {
            sections.push(`[DEVICES ON MY ACCOUNT]\nNo devices returned\n`);
          } else {
            const devLines = devicesList.map((d: any, idx: number) => {
              const lastSeen = d.last_seen_ts ? new Date(d.last_seen_ts).toLocaleString() : 'never';
              const isCurrent = d.device_id === myDeviceId ? ' (CURRENT DEVICE)' : '';
              return `  ${idx + 1}. device_id: ${d.device_id}${isCurrent}\n     display_name: ${d.display_name || '(none)'}\n     last_seen_ts: ${lastSeen} (${d.last_seen_ts || 0})`;
            });
            sections.push(`[DEVICES ON MY ACCOUNT] (${devicesList.length} total)\n${devLines.join('\n')}\n`);
          }
        } else {
          sections.push(`[DEVICES ON MY ACCOUNT]\nclient.getDevices() not supported\n`);
        }
      } catch (err: any) {
        sections.push(`[DEVICES ON MY ACCOUNT]\nError: ${err?.message || String(err)}\n`);
      }

      // 6. Published Device Keys on the Server
      try {
        const crypto = client.getCrypto ? client.getCrypto() : null;
        if (crypto && typeof crypto.getUserDeviceInfo === 'function' && myUserId) {
          const serverInfoMap = await crypto.getUserDeviceInfo([myUserId], true);
          let userDevices: any = null;
          if (serverInfoMap && typeof serverInfoMap.get === 'function') {
            userDevices = serverInfoMap.get(myUserId);
          } else if (serverInfoMap) {
            userDevices = (serverInfoMap as any)[myUserId];
          }

          let appearsInMap = false;
          let keysCount = 0;
          if (userDevices) {
            if (typeof userDevices.has === 'function') {
              appearsInMap = userDevices.has(myDeviceId);
              keysCount = userDevices.size || 0;
            } else if (typeof userDevices === 'object') {
              appearsInMap = Boolean(userDevices[myDeviceId]);
              keysCount = Object.keys(userDevices).length;
            }
          }

          sections.push(
            `[PUBLISHED DEVICE KEYS ON SERVER]\nTarget User: ${myUserId}\nPublished Devices Count: ${keysCount}\nDoes current deviceId (${myDeviceId}) appear in server map?: ${appearsInMap ? 'true' : 'false'}\n`
          );
        } else {
          sections.push(`[PUBLISHED DEVICE KEYS ON SERVER]\nCrypto getUserDeviceInfo not available\n`);
        }
      } catch (err: any) {
        sections.push(`[PUBLISHED DEVICE KEYS ON SERVER]\nError: ${err?.message || String(err)}\n`);
      }

      // 7. Active Room Info
      let activeRoom: any = null;
      let otherUserId: string | null = null;
      try {
        if (activeRoomId && typeof client.getRoom === 'function') {
          activeRoom = client.getRoom(activeRoomId);
        }
        if (!activeRoom && typeof client.getRooms === 'function') {
          const allRooms = client.getRooms();
          activeRoom = allRooms.find((r: any) => r.roomId === activeRoomId) || allRooms[0] || null;
        }

        if (activeRoom) {
          const targetRoomId = activeRoom.roomId;
          const myMembership = typeof activeRoom.getMyMembership === 'function' ? activeRoom.getMyMembership() : 'unknown';
          const isEncrypted = typeof client.isRoomEncrypted === 'function' ? client.isRoomEncrypted(targetRoomId) : false;
          
          const members = typeof activeRoom.getMembers === 'function' ? activeRoom.getMembers() : [];
          const memberLines = members.map((m: any) => `  - ${m.userId} [${m.membership || 'unknown'}] (${m.name || 'no name'})`);
          
          const otherMember = members.find((m: any) => m.userId !== myUserId);
          if (otherMember) {
            otherUserId = otherMember.userId;
          }

          sections.push(
            `[ACTIVE ROOM INFO]\nRoom ID: ${targetRoomId}\nName: ${activeRoom.name || '(unnamed)'}\nMy Membership: ${myMembership}\nisEncryptionEnabledInRoom: ${isEncrypted ? 'true' : 'false'}\nMembers (${members.length}):\n${memberLines.join('\n')}\n`
          );
        } else {
          sections.push(`[ACTIVE ROOM INFO]\nNo active room selected or found for ID: ${activeRoomId || '(none)'}\n`);
        }
      } catch (err: any) {
        sections.push(`[ACTIVE ROOM INFO]\nError: ${err?.message || String(err)}\n`);
      }

      // 8. The Other User's Devices
      try {
        if (otherUserId) {
          const crypto = client.getCrypto ? client.getCrypto() : null;
          if (crypto && typeof crypto.getUserDeviceInfo === 'function') {
            const otherInfoMap = await crypto.getUserDeviceInfo([otherUserId], true);
            let otherDevices: any = null;
            if (otherInfoMap && typeof otherInfoMap.get === 'function') {
              otherDevices = otherInfoMap.get(otherUserId);
            } else if (otherInfoMap) {
              otherDevices = (otherInfoMap as any)[otherUserId];
            }

            let deviceIdsList: string[] = [];
            if (otherDevices) {
              if (typeof otherDevices.keys === 'function') {
                deviceIdsList = Array.from(otherDevices.keys());
              } else if (typeof otherDevices === 'object') {
                deviceIdsList = Object.keys(otherDevices);
              }
            }

            sections.push(
              `[OTHER USER'S DEVICES]\nUser ID: ${otherUserId}\nDevice IDs (${deviceIdsList.length}): ${deviceIdsList.length > 0 ? deviceIdsList.join(', ') : 'none'}\n`
            );
          } else {
            sections.push(`[OTHER USER'S DEVICES]\nCrypto getUserDeviceInfo not available\n`);
          }
        } else {
          sections.push(`[OTHER USER'S DEVICES]\nNo other user identified in active room\n`);
        }
      } catch (err: any) {
        sections.push(`[OTHER USER'S DEVICES]\nError: ${err?.message || String(err)}\n`);
      }

      // 9. Active Room Live Timeline Events (Do NOT hide any events)
      try {
        if (activeRoom) {
          const liveTimeline = typeof activeRoom.getLiveTimeline === 'function' ? activeRoom.getLiveTimeline() : null;
          const events = liveTimeline && typeof liveTimeline.getEvents === 'function' ? liveTimeline.getEvents() : [];

          // Count by type
          let msgCount = 0;
          let encCount = 0;
          let reactCount = 0;
          let othersCount = 0;

          const lines = events.map((evt: any, idx: number) => {
            const sender = typeof evt.getSender === 'function' ? evt.getSender() : (evt.sender || 'unknown');
            const type = typeof evt.getType === 'function' ? evt.getType() : (evt.type || 'unknown');
            const isEnc = typeof evt.isEncrypted === 'function' ? evt.isEncrypted() : false;
            const isDecFail = typeof evt.isDecryptionFailure === 'function' ? evt.isDecryptionFailure() : false;
            const failureReason = evt.decryptionFailureReason || (typeof evt.getDecryptionFailureReason === 'function' ? evt.getDecryptionFailureReason() : '') || 'none';
            
            const wireContent = (typeof evt.getWireContent === 'function' ? evt.getWireContent() : null) || evt.event?.content || {};
            const sessionIdRaw = wireContent.session_id || wireContent['m.relates_to']?.session_id || '';
            const sessionId = sessionIdRaw ? sessionIdRaw.slice(0, 8) : '-';
            const senderKeyRaw = wireContent.sender_key || '';
            const senderKey = senderKeyRaw ? senderKeyRaw.slice(0, 8) : '-';

            const ts = typeof evt.getTs === 'function' ? evt.getTs() : (evt.event?.origin_server_ts || Date.now());
            const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));

            if (type === 'm.room.message') msgCount++;
            else if (type === 'm.room.encrypted') encCount++;
            else if (type === 'm.reaction') reactCount++;
            else othersCount++;

            return `[#${idx.toString().padStart(3, '0')}] sender=${sender} | type=${type} | isEncrypted=${isEnc} | isDecFail=${isDecFail} | reason=${failureReason} | session_id=${sessionId} | sender_key=${senderKey} | age=${ageSec}s`;
          });

          sections.push(
            `[EVENT COUNTS]\nTotal Events: ${events.length}\nm.room.message: ${msgCount}\nm.room.encrypted: ${encCount}\nm.reaction: ${reactCount}\nothers: ${othersCount}\n`
          );

          sections.push(
            `[LIVE TIMELINE EVENTS (ALL ${events.length} EVENTS)]\n${lines.length > 0 ? lines.join('\n') : 'No events in live timeline'}\n`
          );
        } else {
          sections.push(`[LIVE TIMELINE EVENTS]\nNo active room available\n`);
        }
      } catch (err: any) {
        sections.push(`[LIVE TIMELINE EVENTS]\nError: ${err?.message || String(err)}\n`);
      }

      setDebugText(sections.join('\n'));
    } catch (globalErr: any) {
      setDebugText(`Fatal Diagnostic Error: ${globalErr?.message || String(globalErr)}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeRoomId]);

  useEffect(() => {
    if (isOpen) {
      fetchDebugData();
    }
  }, [isOpen, fetchDebugData]);

  const handleCopy = () => {
    copyText(debugText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full h-full sm:max-w-5xl sm:h-[90vh] bg-[#111214] border border-[#2e3035] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#dbdee1]">
        {/* Header Bar */}
        <div className="px-4 py-3 bg-[#1e1f22] border-b border-[#2b2d31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5865f2]/20 border border-[#5865f2]/40 flex items-center justify-center text-[#5865f2]">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                E2EE Diagnostics Panel
              </h2>
              <p className="text-[11px] text-[#949ba4]">
                Read-only Matrix Megolm v1 End-to-End Encryption cryptographic state
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDebugData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] border border-[#3f4147] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50 min-h-[36px]"
              title="Refresh diagnostics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden xs:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95 min-h-[36px] shadow-sm"
              title="Copy entire diagnostics"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy All'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer ml-1"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Monospace Selectable Scrollable Content Area */}
        <div className="flex-1 min-h-0 p-4 bg-[#0e0f10] overflow-y-auto overflow-x-auto select-text font-mono text-xs text-[#22c55e] leading-relaxed no-scrollbar whitespace-pre">
          {debugText}
        </div>

        {/* Footer Status Bar */}
        <div className="px-4 py-2 bg-[#1e1f22] border-t border-[#2b2d31] flex items-center justify-between text-[11px] text-[#949ba4] shrink-0 font-mono">
          <span>Target Room: {activeRoomId || 'Global / None'}</span>
          <span>{isLoading ? 'Refreshing state...' : 'Diagnostics Ready'}</span>
        </div>
      </div>
    </div>
  );
};
