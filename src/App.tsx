/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Channel, Message, DriveFileAttachment } from './types';
import { SpacesRail } from './components/SpacesRail';
import { ChannelsDrawer, getRealDMName } from './components/ChannelsDrawer';
import { MessageItem } from './components/MessageItem';
import { LoginScreen } from './components/LoginScreen';
import { CreateDmModal } from './components/CreateDmModal';
import { MessageBottomSheetModal } from './components/MessageBottomSheetModal';
import { UserProfileModal } from './components/UserProfileModal';
import { MatrixAvatar } from './components/MatrixAvatar';
import { SettingsModal } from './components/SettingsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { DestructiveConfirmModal } from './components/DestructiveConfirmModal';
import { E2EEDebugModal } from './components/E2EEDebugModal';
import { SplashScreen } from './components/SplashScreen';
import { WelcomeScreen } from './components/WelcomeScreen';
import { AboutModal } from './components/AboutModal';
import { WELCOME_SEEN_KEY } from './appInfo';
import { ForwardPickerModal } from './components/ForwardPickerModal';
import {
  ClientEvent,
  RoomEvent,
  RoomMemberEvent,
  MatrixEventEvent,
} from 'matrix-js-sdk';
import { BackupMessagesModal } from './components/BackupMessagesModal';
import { RestoreMessageHistoryModal } from './components/RestoreMessageHistoryModal';
import { LogoutBackupWarningModal } from './components/LogoutBackupWarningModal';
import {
  initMatrixGuestSession,
  fetchMatrixRoomMessages,
  matrixLogin,
  matrixRegisterUser,
  matrixCreateDirectRoom,
  matrixCreateChannelRoom,
  matrixSendMessage,
  matrixFetchJoinedRooms,
  getOrCreateMatrixClient,
  ensureMatrixReady,
  matrixLogout,
  isCryptoReady,
  matrixIsRoomEncrypted,
  matrixEnsureRoomEncrypted,
  matrixLeaveRoom,
  getBackupStatus,
  matrixBlockUser,
  matrixGetDisplayName,
  matrixGetProfileAvatar,
  matrixFetchSelfProfile,
  getHomeserverUrl,
  resolveMxcToHttp,
  matrixSendReadReceipt,
  matrixUpdateAvatar,
  matrixUpdateDisplayName,
  matrixSetPresence,
  matrixSendAudioMessage,
  matrixSendLocationMessage,
  matrixLoadMoreHistory,
  matrixSendReaction,
  matrixRemoveReaction,
  matrixRedactMessage,
  matrixRetrySend,
  matrixForwardMessage,
  sendMediaMessage,
  clearEventEncryptionCache,
  MatrixEventItem,
  MatrixRoom,
} from './services/matrix';
import {
  saveCachedMessages,
  getCachedMessages,
  clearMessageCache,
  recordSuccessfulSync,
  checkAndLogStoragePersist,
} from './services/messageCache';
import { addToOutbox, getOutbox, removeFromOutbox } from './utils/outbox';
import { formatMessageTime, formatDateDivider, isSameDay } from './utils/formatTime';
import { buildNameColorMap } from './utils/color';
import { formatBytes } from './utils/files';
import { haptic, openUrl, copyText, saveBlob, isNative, registerBackButtonHandler, registerAppStateChangeListener, capturePhoto, registerAppRestoredCameraHandler } from './native/platform';
import { getMediaKind } from './utils/mediaKind';
import {
  AppNotificationItem,
  loadNotifications,
  saveNotifications,
  loadNotificationSettings,
  playNotificationSound,
  triggerHapticNotification,
  dispatchSystemNotification,
  evaluateEventForNotification,
} from './services/notifications';
import { useAndroidBackHandler } from './utils/useAndroidBackHandler';
// Removed FirebaseUser import
import {
  Menu,
  Send,
  Plus,
  Smile,
  Smartphone,
  Monitor,
  FileCode,
  Radio,
  Edit3,
  Reply,
  MessageSquare,
  Search,
  Camera,
  Image as ImageIcon,
  Paperclip,
  UserCheck,
  Hash,
  ArrowLeft,
  Bell,
  Trash2,
  Lock,
  Unlock,
  MoreVertical,
  User,
  LogOut,
  Ban,
  Mic,
  AudioLines,
  MapPin,
  Square,
  RotateCcw,
  Check,
  Calendar,
  ArrowUp,
  RefreshCw,
  X,
  Play,
  Video,
  Volume2,
  FileText,
  AlertCircle,
} from 'lucide-react';

const LiveAudioWaveform: React.FC<{
  stream: MediaStream | null;
  themeMode: 'dark' | 'light';
}> = ({ stream, themeMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!stream) return;
    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyserNode: AnalyserNode | null = null;
    let animationId: number | null = null;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
        sourceNode = audioCtx.createMediaStreamSource(stream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        sourceNode.connect(analyserNode);

        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const numBars = 36;
        const historyBars: number[] = new Array(numBars).fill(4);
        let lastSampleTime = 0;

        const render = (time: number) => {
          if (!analyserNode || !canvasRef.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          if (time - lastSampleTime > 55) {
            analyserNode.getByteTimeDomainData(dataArray);
            let sumSq = 0;
            for (let i = 0; i < bufferLength; i++) {
              const val = (dataArray[i] - 128) / 128;
              sumSq += val * val;
            }
            const rms = Math.sqrt(sumSq / bufferLength);
            const barH = Math.max(4, Math.min(28, Math.round(rms * 105)));
            historyBars.shift();
            historyBars.push(barH);
            lastSampleTime = time;
          }

          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const barWidth = 3;
          const barGap = 4;
          const totalWidth = numBars * (barWidth + barGap);
          const startX = Math.max(0, (w - totalWidth) / 2);

          ctx.fillStyle = themeMode === 'dark' ? '#388bfd' : '#0b57d0';

          historyBars.forEach((barHeight, idx) => {
            const x = startX + idx * (barWidth + barGap);
            const y = (h - barHeight) / 2;
            const r = barWidth / 2;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, barWidth, barHeight, r);
            } else {
              ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
          });

          animationId = requestAnimationFrame(render);
        };

        animationId = requestAnimationFrame(render);
      }
    } catch (e) {
      console.warn('Live waveform initialization note:', e);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {}
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        try {
          audioCtx.close();
        } catch {}
      }
    };
  }, [stream, themeMode]);

  return (
    <canvas
      ref={canvasRef}
      width={250}
      height={32}
      className="w-full h-8 max-w-full"
    />
  );
};

interface PendingAttachment {
  id: string;
  file: File;
  kind: 'image' | 'video' | 'audio' | 'file';
  previewUrl: string;
  thumbUrl?: string;
  videoDuration?: number;
}

interface UploadQueueItem {
  txnId: string;
  roomId: string;
  channelId: string;
  file: File;
  kind: 'image' | 'video' | 'audio' | 'file';
  previewUrl: string;
  thumbUrl?: string;
  videoDuration?: number;
  caption?: string;
  replyToId?: string;
  status: 'queued' | 'sending' | 'failed' | 'cancelled';
  progress: number;
}

const generateVideoThumbnail = (file: File, videoUrl: string): Promise<{ thumbUrl: string; duration: number }> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 160;
        canvas.height = video.videoHeight || 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve({ thumbUrl, duration: video.duration || 0 });
          return;
        }
      } catch (e) {
        console.error('Failed to generate video thumbnail frame', e);
      }
      resolve({ thumbUrl: '', duration: video.duration || 0 });
    };

    video.onerror = () => {
      resolve({ thumbUrl: '', duration: 0 });
    };
  });
};

const formatVideoDuration = (sec: number): string => {
  if (isNaN(sec) || sec === Infinity) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => { try { return localStorage.getItem(WELCOME_SEEN_KEY) !== 'true'; } catch { return true; } });
  const [isWelcomeReplay, setIsWelcomeReplay] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<'login' | 'chat'>(() => {
    const savedToken = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
    return savedToken ? 'chat' : 'login';
  });

  const [matrixToken, setMatrixToken] = useState<string | null>(() => {
    return localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token') || null;
  });
  const [matrixUserId, setMatrixUserId] = useState<string>(() => {
    return localStorage.getItem('matrix_user_id') || '';
  });
  const matrixUsername = matrixUserId.split(':')[0].replace('@', '');
  const [matrixDisplayName, setMatrixDisplayName] = useState<string>(() => {
    return localStorage.getItem('matrix_display_name') || matrixUserId.split(':')[0].replace('@', '') || 'WHO';
  });
  const [isMatrixLoggingIn, setIsMatrixLoggingIn] = useState(false);
  const [matrixLoginError, setMatrixLoginError] = useState<string | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const channelsRef = useRef<Channel[]>([]);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const activeChannel =
    channels.find((c) => c.id === activeChannelId) ||
    channels[0];

  const [viewMode, setViewMode] = useState<'desktop' | 'mobile-android'>('desktop');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  useAndroidBackHandler(isMobileDrawerOpen, () => setIsMobileDrawerOpen(false), 'main-drawer');

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [isAutoBackupModalOpen, setIsAutoBackupModalOpen] = useState(false);
  const [hasSkippedBackupPrompt, setHasSkippedBackupPrompt] = useState(false);
  const [isAutoRestoreModalOpen, setIsAutoRestoreModalOpen] = useState(false);
  const [hasSkippedRestorePrompt, setHasSkippedRestorePrompt] = useState(false);
  const [isLogoutBackupWarningOpen, setIsLogoutBackupWarningOpen] = useState(false);
  const [roomRefreshKey, setRoomRefreshKey] = useState(0);
  const [isHapticEnabled, setIsHapticEnabled] = useState<boolean>(() => {
    return localStorage.getItem('haptic_enabled') !== 'false';
  });

  const triggerHaptic = useCallback(() => {
    if (isHapticEnabled) {
      haptic().catch(() => {});
    }
  }, [isHapticEnabled]);

  const handleToggleHaptic = () => {
    const next = !isHapticEnabled;
    setIsHapticEnabled(next);
    localStorage.setItem('haptic_enabled', String(next));
    if (next) haptic().catch(() => {});
  };

  const handleToggleTheme = (mode: 'dark' | 'light') => {
    setThemeMode(mode);
    triggerHaptic();
  };

  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => {
    return localStorage.getItem('user_avatar_url') || '';
  });
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
      if (errorToast) {
          const timer = setTimeout(() => setErrorToast(null), 5000);
          return () => clearTimeout(timer);
      }
  }, [errorToast]);


  const handleUpdateAvatarUrl = async (fileOrUrl: File | string) => {
    try {
      const token = matrixToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
      const client = await getOrCreateMatrixClient(undefined, token || undefined);
      const res = await matrixUpdateAvatar(client, fileOrUrl, token || undefined);
      if (res && res.mxcUri) {
        const mxcUri = res.mxcUri;
        setUserAvatarUrl(mxcUri);
        localStorage.setItem('user_avatar_url', mxcUri);
        
        // Update selectedUserProfile if it's open to reflect change instantly in modal
        if (selectedUserProfile) {
          setSelectedUserProfile(prev => prev ? { ...prev, userAvatar: mxcUri } : null);
        }

        triggerHaptic();
        setMessages((prev) =>
          prev.map((m) =>
            m.userId.includes(matrixUsername) || (currentUser && m.userId === currentUser.uid)
              ? { ...m, userAvatar: mxcUri }
              : m
          )
        );
      }
    } catch (err: any) {
      console.warn('Failed to update Matrix avatar globally:', err);
      const fallbackUrl = fileOrUrl instanceof File ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
      setUserAvatarUrl(fallbackUrl);
      localStorage.setItem('user_avatar_url', fallbackUrl);
      if (selectedUserProfile) {
        setSelectedUserProfile(prev => prev ? { ...prev, userAvatar: fallbackUrl } : null);
      }
      triggerHaptic();
    }
  };

  const handleUpdateDisplayName = async (newName: string) => {
    try {
      const token = matrixToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
      const client = await getOrCreateMatrixClient(undefined, token || undefined);
      await matrixUpdateDisplayName(client, newName, token || undefined);
      
      setMatrixDisplayName(newName);
      localStorage.setItem('matrix_display_name', newName);

      // Update selectedUserProfile if it's open
      if (selectedUserProfile) {
        setSelectedUserProfile(prev => prev ? { ...prev, userName: newName } : null);
      }

      triggerHaptic();
      setMessages((prev) =>
        prev.map((m) =>
          m.userId.includes(matrixUsername) || (currentUser && m.userId === currentUser.uid)
            ? { ...m, userName: newName }
            : m
        )
      );
    } catch (err: any) {
      console.warn('Failed to update Matrix display name globally:', err);
      setMatrixDisplayName(newName);
      localStorage.setItem('matrix_display_name', newName);
      if (selectedUserProfile) {
        setSelectedUserProfile(prev => prev ? { ...prev, userName: newName } : null);
      }
      triggerHaptic();
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OPEN_ROOM' && event.data.roomId) {
        setActiveChannelId(event.data.roomId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'locked' | 'reviewing'>('idle');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const recordStartRef = useRef(0);

  useEffect(() => {
    const handleAppStateChange = (isActive: boolean) => {
      if (!isActive) {
        console.log('[Voice Recorder] App went to background, stopping voice recording and releasing microphone...');
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop();
          } catch {}
        }
        if (mediaStreamRef.current) {
          try {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          } catch {}
          mediaStreamRef.current = null;
        }
        setRecorderState('idle');
      }
    };

    const sub = registerAppStateChangeListener(handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    let registerListener: any = null;
    let errorListener: any = null;
    let receivedListener: any = null;
    let actionListener: any = null;

    const initPush = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive === 'granted') {
          await PushNotifications.register();
        } else {
          console.warn('[Push] Permission denied.');
        }

        registerListener = await PushNotifications.addListener('registration', async (token) => {
          console.log('[Push] Native FCM registration token received:', token.value);
          localStorage.setItem('native_fcm_token', token.value);

          try {
            const client = await getOrCreateMatrixClient();
            if (client && typeof client.setPusher === 'function') {
              const homeserverUrl = getHomeserverUrl();
              await client.setPusher({
                pushkey: token.value,
                kind: 'http',
                app_id: 'com.secureconnect.app',
                app_display_name: 'SecureConnect',
                device_display_name: 'Android WebView',
                profile_tag: 'prod',
                lang: 'en',
                data: {
                  url: `${homeserverUrl}/_matrix/push/v1/notify` || 'https://matrix.org/_matrix/push/v1/notify',
                  format: 'event_id_only'
                }
              });
              console.log('[Push] Registered pusher on homeserver.');
            }
          } catch (err) {
            console.warn('[Push] Matrix pusher registration failed:', err);
          }
        });

        errorListener = await PushNotifications.addListener('registrationError', (error) => {
          console.error('[Push] Native registration error:', error);
        });

        receivedListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Push] Foreground notification received:', notification);
          const senderName = notification.data?.senderName || notification.title || 'Matrix User';
          const roomId = notification.data?.roomId || notification.data?.room_id;
          
          const newNotif: AppNotificationItem = {
            id: `notif-${notification.id || Date.now()}`,
            type: 'message',
            title: `New message from ${senderName}`,
            body: 'New message', // Cryptographically secure, no content leaks
            senderName,
            senderId: notification.data?.senderId || '',
            roomId: roomId || '',
            roomName: notification.data?.roomName || 'SecureConnect Chat',
            timestamp: Date.now(),
            isRead: false,
          };

          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          
          setInAppToast({ notification: newNotif, visible: true });
          setTimeout(() => setInAppToast(null), 4000);
          playNotificationSound();
          triggerHapticNotification();
        });

        actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Push] Action performed:', action);
          const roomId = action.notification.data?.roomId || action.notification.data?.room_id;
          if (roomId) {
            const found = channelsRef.current.find((c) => c.matrixRoomId === roomId);
            if (found) {
              setActiveChannelId(found.id);
            } else {
              console.warn('[Push] Tapped room not found in active channel list:', roomId);
            }
          }
        });

      } catch (err) {
        console.error('[Push] Initialization failed:', err);
      }
    };

    initPush();

    return () => {
      if (registerListener) registerListener.remove();
      if (errorListener) errorListener.remove();
      if (receivedListener) receivedListener.remove();
      if (actionListener) actionListener.remove();
    };
  }, [matrixToken]);

  const startVoiceRecording = async () => {
    try {
      triggerHaptic();

      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const perm = await navigator.permissions.query({ name: 'microphone' as any });
          if (perm.state === 'denied') {
            setDeliveryError('Microphone permission is denied. Please grant microphone permission in your device settings to record voice messages.');
            return;
          }
        } catch (e) {
          console.warn('[Voice Recorder] Permissions query not fully supported:', e);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const mime = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordedAudioBlob(blob);
      };

      recorder.start(100);
      recordStartRef.current = Date.now();
      setRecorderState('recording');
      setRecordingDuration(0);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied')) {
        setDeliveryError('Microphone permission is denied. Please grant microphone permission in your device settings to record voice messages.');
      } else {
        setDeliveryError(`Could not access microphone: ${err.message || err.name || 'UnknownError'}`);
      }
      setRecorderState('idle');
    }
  };

  const stopVoiceRecordingAndSend = async (blobToSend?: Blob) => {
    const secs = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }

    const blob = blobToSend || new Blob(audioChunksRef.current, { type: recorder?.mimeType || 'audio/webm' });

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    const roomId = activeChannel?.matrixRoomId;

    if (!navigator.onLine) {
      if (mediaStreamRef.current) {
        ((mediaStreamRef.current as any)?.getTracks() || []).forEach((t: any) => t.stop());
        mediaStreamRef.current = null;
      }
      setDeliveryError("Voice notes can't be sent while offline");
      return;
    }

    if (roomId && blob && blob.size > 0 && activeChannel) {
      const txnId = `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const localUrl = URL.createObjectURL(blob);
      activeBlobUrlsRef.current.set(txnId, localUrl);

      const audioMessage: Message = {
        id: txnId,
        txnId,
        channelId: activeChannel.id,
        userId: currentUser?.uid || matrixUserId,
        userName: currentUser?.displayName || matrixDisplayName || `@${matrixUsername}`,
        userAvatar: userAvatarUrl || currentUser?.photoURL || '',
        avatarColor: 'bg-[#5865f2]',
        roleColor: 'text-[#5865f2]',
        timestamp: formatMessageTime(Date.now()),
        ts: Date.now(),
        content: 'Voice message',
        msgtype: 'm.audio',
        mediaUrl: localUrl,
        mediaInfo: {
          mimetype: blob.type || 'audio/webm',
          size: blob.size,
          duration: secs * 1000,
        },
        isTapped: false,
        isEncrypted: isCurrentRoomEncrypted ?? false,
        isDecryptionFailure: false,
        encryption: {
          level: 'pending',
          reason: isCurrentRoomEncrypted === false ? 'Sent without encryption' : undefined,
        },
        status: 'sending',
        uploadProgress: 0,
      };

      sentTxnIdsRef.current.add(txnId);
      setMessages((prev) => [...prev, audioMessage]);

      try {
        triggerHaptic();
        const sendResult = await matrixSendAudioMessage(roomId, blob, matrixToken || undefined, secs, {
          txnId,
          onProgress: (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            setMessages((prev) =>
              prev.map((m) => (m.id === txnId ? { ...m, uploadProgress: pct } : m))
            );
          }
        });
        if (sendResult?.eventId) {
          sentEventIdsRef.current.add(sendResult.eventId);
          setMessages((prev) =>
            prev.map((m) => (m.id === txnId ? { ...m, id: sendResult.eventId, status: 'sent', uploadProgress: undefined } : m))
          );
          const blobUrl = activeBlobUrlsRef.current.get(txnId);
          if (blobUrl) {
            try { URL.revokeObjectURL(blobUrl); } catch {}
            activeBlobUrlsRef.current.delete(txnId);
          }
        }
      } catch (err: any) {
        console.warn('Failed to send voice message:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === txnId ? { ...m, status: 'failed' } : m))
        );
        const file = new File([blob], 'voice-message.webm', { type: blob.type || 'audio/webm' });
        retryFilesRef.current.set(txnId, file);
      }
    }

    setRecorderState('idle');
    setRecordedAudioBlob(null);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const cancelVoiceRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setRecorderState('idle');
    setRecordedAudioBlob(null);
    setRecordingDuration(0);
    audioChunksRef.current = [];
    triggerHaptic();
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShareLocation = async () => {
    setIsAttachmentDrawerOpen(false);
    if (!activeChannel?.matrixRoomId) {
      alert('Please select a room first.');
      return;
    }
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    try {
      triggerHaptic();
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          try {
            const { eventId } = await matrixSendLocationMessage(activeChannel.matrixRoomId!, lat, lon, matrixToken || undefined);
            const newMsg: Message = {
              id: eventId,
              channelId: activeChannel?.id || 'channel-1',
              userId: matrixUserId || '@user:matrix.org',
              userName: matrixDisplayName || 'You',
              userAvatar: userAvatarUrl,
              content: `📍 Shared location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isEncrypted: activeChannel.isEncrypted ?? true,
              msgtype: 'm.location',
              geoUri: `geo:${lat},${lon}`,
            };
            setMessages((prev) => [...prev, newMsg]);
          } catch (err: any) {
            alert('Failed to send location message: ' + (err.message || 'Network error'));
          }
        },
        (error) => {
          alert(`Location permission denied or unavailable: ${error.message}`);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } catch (err: any) {
      alert('Could not retrieve location: ' + err.message);
    }
  };

  const handleShareContact = async () => {
    setIsAttachmentDrawerOpen(false);
    if ('contacts' in navigator && typeof (navigator as any).contacts?.select === 'function') {
      try {
        triggerHaptic();
        const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
        if (contacts && contacts.length > 0) {
          const contact = contacts[0];
          const name = contact.name?.[0] || 'Unknown Contact';
          const tel = contact.tel?.[0] || '';
          const contactBody = `👤 Contact: ${name} (${tel})`;
          if (activeChannel?.matrixRoomId) {
            const { eventId } = await matrixSendMessage(activeChannel.matrixRoomId, contactBody, matrixToken || undefined);
            const newMsg: Message = {
              id: eventId,
              channelId: activeChannel?.id || 'channel-1',
              userId: matrixUserId || '@user:matrix.org',
              userName: matrixDisplayName || 'You',
              userAvatar: userAvatarUrl,
              content: contactBody,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isEncrypted: activeChannel?.isEncrypted ?? true,
            };
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      } catch (err: any) {
        console.warn('Contact selection error:', err);
      }
    } else {
      const name = prompt('Enter contact name:');
      if (!name) return;
      const phone = prompt('Enter contact phone number:');
      if (!phone) return;
      const contactBody = `👤 Contact: ${name} (${phone})`;
      if (activeChannel?.matrixRoomId) {
        try {
          const { eventId } = await matrixSendMessage(activeChannel.matrixRoomId, contactBody, matrixToken || undefined);
          const newMsg: Message = {
            id: eventId,
            channelId: activeChannel?.id || 'channel-1',
            userId: matrixUserId || '@user:matrix.org',
            userName: matrixDisplayName || 'You',
            userAvatar: userAvatarUrl,
            content: contactBody,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isEncrypted: activeChannel?.isEncrypted ?? true,
          };
          setMessages((prev) => [...prev, newMsg]);
        } catch (err: any) {
          alert('Failed to share contact: ' + err.message);
        }
      }
    }
  };

  const [presenceMap, setPresenceMap] = useState<Record<string, { presence: string; statusMsg?: string }>>({});

  useEffect(() => {
    const handlePresenceEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { userId, presence, statusMsg } = customEvent.detail || {};
      if (userId) {
        setPresenceMap((prev) => ({
          ...prev,
          [userId]: { presence, statusMsg },
        }));
      }
    };
    window.addEventListener('matrix:presence', handlePresenceEvent);
    return () => {
      window.removeEventListener('matrix:presence', handlePresenceEvent);
    };
  }, []);

  const handleUpdatePresence = async (presence: 'online' | 'offline' | 'unavailable' | 'free_for_chat', statusMsg?: string) => {
    try {
      const token = matrixToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
      const client = await getOrCreateMatrixClient(undefined, token || undefined);
      await matrixSetPresence(client, presence, statusMsg, token || undefined);
      const myUid = client?.getUserId ? client.getUserId() : (matrixUserId || '');
      if (myUid) {
        setPresenceMap((prev) => ({
          ...prev,
          [myUid]: { presence, statusMsg },
        }));
      }
    } catch (err) {
      console.warn('Failed to update presence:', err);
    }
  };

  const [notifications, setNotifications] = useState<AppNotificationItem[]>(loadNotifications);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [inAppToast, setInAppToast] = useState<{
    notification: AppNotificationItem;
    visible: boolean;
  } | null>(null);

  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllNotificationsAsRead = () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, isRead: true }));
      saveNotifications(updated);
      return updated;
    });
    setChannels((prev) =>
      prev.map((c) => ({ ...c, unread: false, unreadCount: 0 }))
    );
    channels.forEach((c) => {
      if (c.matrixRoomId) {
        matrixSendReadReceipt(c.matrixRoomId);
      }
    });
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const handleNotificationItemClick = (item: AppNotificationItem) => {
    // Immediately mark this notification as read and persist to storage
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === item.id || (item.roomId && n.roomId === item.roomId)
          ? { ...n, isRead: true }
          : n
      );
      saveNotifications(updated);
      return updated;
    });

    const matchChan = channels.find(
      (c) =>
        c.id === item.roomId ||
        c.matrixRoomId === item.roomId ||
        c.name.toLowerCase() === item.roomName.toLowerCase()
    );
    if (matchChan) {
      setActiveChannelId(matchChan.id);
      setChannels((prev) =>
        prev.map((c) =>
          c.id === matchChan.id ? { ...c, unread: false, unreadCount: 0 } : c
        )
      );
      if (matchChan.matrixRoomId) {
        matrixSendReadReceipt(matchChan.matrixRoomId, item.id.replace(/^notif-/, ''));
      }
    } else if (item.roomId) {
      matrixSendReadReceipt(item.roomId, item.id.replace(/^notif-/, ''));
    }
    setIsMobileDrawerOpen(false);
  };

  const [activeBottomNavTab, setActiveBottomNavTab] = useState<'chats' | 'account' | 'security' | 'custom'>('chats');
  const [settingsActiveTab, setSettingsActiveTab] = useState<'account' | 'security' | 'custom' | 'management' | 'downloads'>('account');

  const [chatFontSize, setChatFontSize] = useState<number>(() => Number(localStorage.getItem('chat_font_size')) || 16);

  useEffect(() => {
    localStorage.setItem('chat_font_size', String(chatFontSize));
    document.documentElement.style.setProperty('--chat-font-size', chatFontSize + 'px');
  }, [chatFontSize]);

  const [isStreamingMatrix, setIsStreamingMatrix] = useState(false);
  const [matrixSyncState, setMatrixSyncState] = useState<string | null>('SYNCING');
  const [cryptoReady, setCryptoReady] = useState(isCryptoReady());
  const lastHiddenTimeRef = useRef<number>(0);
  const sync5sTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputContent, setInputContent] = useState('');
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [unencryptedMediaRoomId, setUnencryptedMediaRoomId] = useState<string | null>(null);
  const [isAttachmentDrawerOpen, setIsAttachmentDrawerOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const activeBlobUrlsRef = useRef<Map<string, string>>(new Map());
  const retryFilesRef = useRef<Map<string, File>>(new Map());

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments((prev) => {
      const activeUrls = Array.from(activeBlobUrlsRef.current.values());
      prev.forEach((item) => {
        if (item.previewUrl && !activeUrls.includes(item.previewUrl)) {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch (e) {
            console.error('Failed to revoke previewUrl', e);
          }
        }
        if (item.thumbUrl && item.thumbUrl.startsWith('blob:') && !activeUrls.includes(item.thumbUrl)) {
          try {
            URL.revokeObjectURL(item.thumbUrl);
          } catch (e) {
            console.error('Failed to revoke thumbUrl', e);
          }
        }
      });
      return [];
    });
    setAttachmentError(null);
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const itemToRemove = prev.find(item => item.id === id);
      if (itemToRemove) {
        const activeUrls = Array.from(activeBlobUrlsRef.current.values());
        if (itemToRemove.previewUrl && !activeUrls.includes(itemToRemove.previewUrl)) {
          try { URL.revokeObjectURL(itemToRemove.previewUrl); } catch (e) {}
        }
        if (itemToRemove.thumbUrl && itemToRemove.thumbUrl.startsWith('blob:') && !activeUrls.includes(itemToRemove.thumbUrl)) {
          try { URL.revokeObjectURL(itemToRemove.thumbUrl); } catch (e) {}
        }
      }
      return prev.filter(item => item.id !== id);
    });
  }, []);

  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  const processUploadQueue = async () => {
    if (isProcessingQueueRef.current) return;
    if (!navigator.onLine) {
      setMessages((prev) =>
        prev.map((m) => {
          const inQueue = uploadQueueRef.current.find((q) => q.txnId === m.id);
          if (inQueue && m.status === 'sending') {
            return { ...m, status: 'queued' };
          }
          return m;
        })
      );
      return;
    }

    isProcessingQueueRef.current = true;

    while (true) {
      const nextItem = uploadQueueRef.current.find(
        (item) => item.status === 'queued' || item.status === 'sending'
      );

      if (!nextItem) {
        break;
      }

      if (!navigator.onLine) {
        break;
      }

      nextItem.status = 'sending';
      
      setMessages((prev) =>
        prev.map((m) =>
          m.id === nextItem.txnId ? { ...m, status: 'sending', uploadProgress: m.uploadProgress ?? 0 } : m
        )
      );

      try {
        if (!isCryptoReady()) {
          throw new Error('Encryption failed to start, sending is disabled');
        }

        const isEncrypted = await matrixIsRoomEncrypted(nextItem.roomId);
        if (!isEncrypted) {
          setUnencryptedMediaRoomId(nextItem.roomId);
          throw new Error('Media can only be sent in end-to-end encrypted rooms');
        }

        const client = await getOrCreateMatrixClient(undefined, matrixToken || undefined);
        if (!client) {
          throw new Error('Matrix client not available');
        }

        const mediaResult = await sendMediaMessage(nextItem.roomId, nextItem.file, {
          caption: nextItem.caption,
          txnId: nextItem.txnId,
          onProgress: (loaded, total) => {
            const pct = Math.round((loaded / total) * 100);
            nextItem.progress = pct;
            setMessages((prev) =>
              prev.map((m) => (m.id === nextItem.txnId ? { ...m, uploadProgress: pct } : m))
            );
          }
        });

        if (mediaResult?.eventId) {
          nextItem.status = 'cancelled';
          uploadQueueRef.current = uploadQueueRef.current.filter((q) => q.txnId !== nextItem.txnId);

          sentEventIdsRef.current.add(mediaResult.eventId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === nextItem.txnId
                ? { ...m, id: mediaResult.eventId, txnId: nextItem.txnId, status: 'sent', uploadProgress: undefined }
                : m
            )
          );
        } else {
          throw new Error('Upload failed');
        }
      } catch (err: any) {
        console.error('Queue upload error for txn:', nextItem.txnId, err);
        
        if (nextItem.status === 'cancelled') {
          continue;
        }

        nextItem.status = 'failed';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === nextItem.txnId ? { ...m, status: 'failed', uploadProgress: undefined } : m
          )
        );
        retryFilesRef.current.set(nextItem.txnId, nextItem.file);
      }
    }

    isProcessingQueueRef.current = false;
  };

  useEffect(() => {
    const handleOnline = () => {
      processUploadQueue();
    };
    const handleOffline = () => {
      setMessages((prev) =>
        prev.map((m) => {
          const inQueue = uploadQueueRef.current.find((q) => q.txnId === m.id);
          if (inQueue && m.status === 'sending') {
            return { ...m, status: 'queued' };
          }
          return m;
        })
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((att) => {
        if (att.previewUrl) {
          try { URL.revokeObjectURL(att.previewUrl); } catch (e) {}
        }
        if (att.thumbUrl && att.thumbUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(att.thumbUrl); } catch (e) {}
        }
      });
    };
  }, []);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(true);
  const [historyTick, setHistoryTick] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const syncMatrixTimelineRef = useRef<() => Promise<number>>(async () => 0);

  const loadOlderMessages = async (maxPages = 3) => {
    if (isLoadingMore || !activeChannel?.matrixRoomId) return;
    const roomId = activeChannel.matrixRoomId;

    setIsLoadingMore(true);
    try {
      let pagesLoaded = 0;
      let moreExists = true;

      while (pagesLoaded < maxPages && moreExists) {
        const container = timelineContainerRef.current;
        const oldScrollHeight = container?.scrollHeight || 0;

        moreExists = await matrixLoadMoreHistory(roomId, 50);
        setHasMoreHistory(moreExists);
        pagesLoaded++;

        // Re-run decryption and update state after each page
        const count = await syncMatrixTimelineRef.current();

        // Maintain scroll position relative to newly loaded top content
        requestAnimationFrame(() => {
          if (timelineContainerRef.current) {
            const newScrollHeight = timelineContainerRef.current.scrollHeight;
            timelineContainerRef.current.scrollTop += newScrollHeight - oldScrollHeight;
          }
        });

        if (!moreExists) break;
        if (count >= 50) break;
      }
    } catch (err) {
      console.warn('[Matrix History] loadOlderMessages error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    setHasMoreHistory(true);
    if (activeChannel?.matrixRoomId && currentScreen === 'chat') {
      const currentUserId = matrixUserId || localStorage.getItem('matrix_user_id') || '';
      const roomId = activeChannel.matrixRoomId;
      const channelId = activeChannel.id;

      // 1. Render cache immediately from IndexedDB
      if (currentUserId && roomId) {
        getCachedMessages(currentUserId, roomId).then((cached) => {
          if (cached && cached.length > 0) {
            setMessages((prev) => {
              const otherMessages = prev.filter((m) => m.channelId !== channelId);
              const currentLive = prev.filter((m) => m.channelId === channelId);
              if (currentLive.length === 0) {
                return [...otherMessages, ...cached];
              }
              const merged = [...cached];
              for (const liveMsg of currentLive) {
                const idx = merged.findIndex((m) => m.id === liveMsg.id || (m.txnId && m.txnId === liveMsg.txnId) || (liveMsg.txnId && m.id === liveMsg.txnId));
                if (idx >= 0) {
                  merged[idx] = liveMsg;
                } else {
                  merged.push(liveMsg);
                }
              }
              return [...otherMessages, ...merged];
            });
          }
        });
      }

      // 2. Fetch live messages and merge on top
      (async () => {
        const initialCount = await syncMatrixTimelineRef.current();
        if (initialCount < 50) {
          await loadOlderMessages(3);
        }
      })();
    }
  }, [activeChannel?.id]);

  const [isJumpToDateOpen, setIsJumpToDateOpen] = useState(false);
  const [jumpDateValue, setJumpDateValue] = useState('');
  const [isJumpingToDate, setIsJumpingToDate] = useState(false);
  const [jumpRound, setJumpRound] = useState(0);
  const [jumpMessageHighlightId, setJumpMessageHighlightId] = useState<string | null>(null);
  const [jumpStatusMessage, setJumpStatusMessage] = useState<string | null>(null);

  const loadHistoryUntil = async (targetTimestamp: number) => {
    if (!activeChannel?.matrixRoomId || isJumpingToDate) return;
    const roomId = activeChannel.matrixRoomId;

    setIsJumpingToDate(true);
    setJumpStatusMessage(null);
    setJumpRound(0);

    let round = 0;
    let hasMore = true;

    while (round < 60 && hasMore) {
      const channelMsgs = messages.filter((m) => m.channelId === activeChannel.id);
      const oldestTs = channelMsgs.reduce((min, m) => (m.ts && m.ts < min ? m.ts : min), Infinity);

      if (oldestTs !== Infinity && oldestTs <= targetTimestamp) {
        break;
      }

      round++;
      setJumpRound(round);

      const more = await matrixLoadMoreHistory(roomId, 100);
      if (!more) {
        hasMore = false;
        break;
      }

      try {
        const events = await fetchMatrixRoomMessages(roomId, matrixToken || undefined);
        if (events && events.length > 0) {
          const currentUserId = matrixUserId || localStorage.getItem('matrix_user_id') || '';
          const matrixMessages: Message[] = events.map((evt) => {
            const isMe = evt.sender === currentUserId || (matrixUsername && evt.sender && typeof evt.sender === 'string' && evt.sender.includes(matrixUsername));
            const avatarToUse = isMe ? (userAvatarUrl || evt.avatarUrl || '') : (evt.avatarUrl || '');
            return {
              id: evt.eventId,
              channelId: activeChannel.id,
              userId: evt.sender,
              userName: evt.senderName || 'User',
              userAvatar: avatarToUse,
              avatarColor: 'bg-[#5865f2]',
              roleColor: 'text-[#5865f2]',
              timestamp: evt.timestamp,
              ts: evt.originServerTs,
              content: evt.content,
              isTapped: false,
              isEncrypted: Boolean(evt.isEncrypted),
              isEdited: evt.isEdited,
              isDecryptionFailure: evt.isDecryptionFailure,
              replyTo: evt.replyTo,
              reactions: evt.reactions,
              myReactions: evt.myReactions,
              msgtype: evt.msgtype,
              mediaUrl: evt.mediaUrl,
              mediaInfo: evt.mediaInfo,
              encryptedFile: evt.encryptedFile,
              geoUri: evt.geoUri,
              txnId: evt.txnId,
              isRedacted: Boolean(evt.isRedacted),
              deliveryStatus: evt.deliveryStatus,
            };
          });

          setMessages((prev) => {
            const otherMessages = prev.filter((m) => m.channelId !== activeChannel.id && m.status !== 'queued');
            const queuedMessages = prev.filter((m) => m.status === 'queued');
            const currentRoomExisting = prev.filter((m) => m.channelId === activeChannel.id && m.status !== 'queued');

            const merged = [...currentRoomExisting];
            for (const newMsg of matrixMessages) {
              if (deletedMessageIdsRef.current.has(newMsg.id)) continue;
              if (!merged.some((m) => m.id === newMsg.id)) {
                merged.push(newMsg);
              }
            }

            const finalMerged = merged.filter((m) => !m.id.startsWith('~') || m.status === 'queued');
            const nonQueued = finalMerged.filter((m) => m.status !== 'queued');
            const queued = finalMerged.filter((m) => m.status === 'queued');

            const sortedNonQueued = [...nonQueued].sort((a, b) => {
              const hasA = typeof a.ts === 'number';
              const hasB = typeof b.ts === 'number';
              if (hasA && hasB) return a.ts! - b.ts!;
              if (hasA && !hasB) return -1;
              if (!hasA && hasB) return 1;
              return 0;
            });

            const sortedActiveChannel = [...sortedNonQueued, ...queued];
            const otherQueued = queuedMessages.filter((m) => m.channelId !== activeChannel.id);
            const channelQueued = queuedMessages.filter((m) => m.channelId === activeChannel.id);
            for (const qm of channelQueued) {
              if (!sortedActiveChannel.some((m) => m.id === qm.id)) {
                sortedActiveChannel.push(qm);
              }
            }

            return [...otherMessages, ...otherQueued, ...sortedActiveChannel];
          });
        }
      } catch {}

      setHistoryTick((prev) => prev + 1);
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsJumpingToDate(false);

    const updatedChannelMsgs = messages
      .filter((m) => m.channelId === activeChannel.id && m.status !== 'queued')
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const targetMsg = updatedChannelMsgs.find((m) => m.ts && m.ts >= targetTimestamp);

    if (targetMsg) {
      setIsJumpToDateOpen(false);
      const el = document.getElementById(`message-${targetMsg.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setJumpMessageHighlightId(targetMsg.id);
      setTimeout(() => {
        setJumpMessageHighlightId(null);
      }, 2000);
    } else {
      setJumpStatusMessage('No messages found that far back');
    }
  };

  const handleGoJumpToDate = () => {
    if (!jumpDateValue) return;
    const dateObj = new Date(jumpDateValue);
    dateObj.setHours(0, 0, 0, 0);
    loadHistoryUntil(dateObj.getTime());
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = Math.abs(touchEndY - touchStartYRef.current);
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 65) {
      if (deltaX > 0 && touchStartXRef.current < 45) {
        setIsMobileDrawerOpen(true);
      } else if (deltaX < 0 && isMobileDrawerOpen) {
        setIsMobileDrawerOpen(false);
      }
    }
  };

  const [selectedUserProfile, setSelectedUserProfile] = useState<{
    userName: string;
    userId: string;
    userAvatar?: string;
    avatarColor?: string;
    isCurrentUser?: boolean;
  } | null>(null);

  const handleFileAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setAttachmentError(null);

    let skippedSize = 0;
    let skippedLimit = 0;
    const currentCount = pendingAttachmentsRef.current.length;
    const allowedNewCount = Math.max(0, 10 - currentCount);

    const newAttachments: PendingAttachment[] = [];

    files.forEach((file) => {
      if (file.size > 100 * 1024 * 1024) {
        skippedSize++;
        return;
      }
      if (newAttachments.length >= allowedNewCount) {
        skippedLimit++;
        return;
      }

      const id = Math.random().toString(36).substring(2, 9);
      const previewUrl = URL.createObjectURL(file);
      const kind = getMediaKind({ mimetype: file.type, name: file.name });

      newAttachments.push({
        id,
        file,
        kind,
        previewUrl,
      });
    });

    if (skippedSize > 0 || skippedLimit > 0) {
      let msg = '';
      if (skippedSize > 0 && skippedLimit > 0) {
        msg = `${skippedSize + skippedLimit} files skipped (size over 100 MB or limit of 10 reached)`;
      } else if (skippedSize > 0) {
        msg = `${skippedSize} file${skippedSize > 1 ? 's' : ''} skipped (over 100 MB)`;
      } else {
        msg = `${skippedLimit} file${skippedLimit > 1 ? 's' : ''} skipped (limit of 10 reached)`;
      }
      setAttachmentError(msg);
      setTimeout(() => setAttachmentError(null), 5000);
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
      setIsAttachmentDrawerOpen(false);

      newAttachments.forEach((att) => {
        if (att.kind === 'video') {
          generateVideoThumbnail(att.file, att.previewUrl).then(({ thumbUrl, duration }) => {
            setPendingAttachments((prev) =>
              prev.map((item) =>
                item.id === att.id
                  ? { ...item, thumbUrl, videoDuration: duration }
                  : item
              )
            );
          });
        }
      });
    }

    e.target.value = '';
  };

  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  const [isCreateDmOpen, setIsCreateDmOpen] = useState(false);
  const [starredMessageIds, setStarredMessageIds] = useState<Set<string>>(new Set());
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [confirmLeaveRoom, setConfirmLeaveRoom] = useState<Channel | null>(null);
  const [isProcessingLeave, setIsProcessingLeave] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleForwardSend = async (channel: Channel) => {
    if (!forwardingMessage || !channel.matrixRoomId) return;
    await matrixForwardMessage(channel.matrixRoomId, {
      msgtype: forwardingMessage.msgtype,
      content: forwardingMessage.content,
      mediaUrl: forwardingMessage.mediaUrl,
      mediaInfo: forwardingMessage.mediaInfo,
      encryptedFile: forwardingMessage.encryptedFile,
    });
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Array<{
    name: string;
    userId: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  }>>([]);
  const typingUsersRef = useRef<Array<{
    name: string;
    userId: string;
    avatarUrl?: string | null;
    avatarColor?: string;
  }>>([]);
  typingUsersRef.current = typingUsers;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isE2EEDebugOpen, setIsE2EEDebugOpen] = useState(false);

  // Leave room and block user modals state
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);

  // Room encryption state for active room
  const [isCurrentRoomEncrypted, setIsCurrentRoomEncrypted] = useState<boolean | null>(null);

  // Message input de-duplication and deleted room cache tracking
  const sentTxnIdsRef = useRef<Set<string>>(new Set());
  const sentEventIdsRef = useRef<Set<string>>(new Set());
  const isFlushingRef = useRef<boolean>(false);

  const handleTakePhotoAndSend = useCallback(async (capturedFile?: File) => {
    if (!activeChannel || !activeChannel.matrixRoomId) return;

    let file = capturedFile;
    if (!file) {
      file = (await capturePhoto((errMsg) => {
        setDeliveryError(errMsg);
      })) || undefined;
    }

    if (!file) return;

    // Haptic feedback on capture
    triggerHaptic();

    const txnId = `m${Date.now()}_cam_${Math.random().toString(36).substring(2, 9)}`;
    const localUrl = URL.createObjectURL(file);
    activeBlobUrlsRef.current.set(txnId, localUrl);
    sentTxnIdsRef.current.add(txnId);

    const cameraMessage: Message = {
      id: txnId,
      txnId,
      channelId: activeChannel.id,
      userId: currentUser?.uid || matrixUserId,
      userName: currentUser?.displayName || matrixDisplayName || `@${matrixUsername}`,
      userAvatar: userAvatarUrl || currentUser?.photoURL || '',
      avatarColor: 'bg-[#5865f2]',
      roleColor: 'text-[#5865f2]',
      timestamp: formatMessageTime(Date.now()),
      ts: Date.now(),
      content: file.name || 'Photo',
      msgtype: 'm.image',
      mediaUrl: localUrl,
      mediaInfo: {
        mimetype: file.type || 'image/jpeg',
        size: file.size,
      },
      uploadProgress: 0,
      isTapped: false,
      isEncrypted: isCurrentRoomEncrypted ?? false,
      isDecryptionFailure: false,
      encryption: {
        level: 'pending',
        reason: isCurrentRoomEncrypted === false ? 'Sent without encryption' : undefined,
      },
      status: 'sending',
    };

    setMessages((prev) => [...prev, cameraMessage]);

    uploadQueueRef.current.push({
      txnId,
      roomId: activeChannel.matrixRoomId,
      channelId: activeChannel.id,
      file,
      kind: 'image',
      previewUrl: localUrl,
      caption: undefined,
      status: 'queued',
      progress: 0,
    });

    processUploadQueue();
  }, [activeChannel, currentUser?.uid, currentUser?.displayName, currentUser?.photoURL, matrixUserId, matrixDisplayName, matrixUsername, userAvatarUrl, isCurrentRoomEncrypted, triggerHaptic, processUploadQueue]);

  useEffect(() => {
    const sub = registerAppRestoredCameraHandler((file) => {
      handleTakePhotoAndSend(file);
    });
    return () => {
      sub.remove();
    };
  }, [handleTakePhotoAndSend]);

  const flushOutbox = async () => {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    try {
      const items = getOutbox().sort((a, b) => a.createdAt - b.createdAt);
      for (const item of items) {
        if (!navigator.onLine) break;
        try {
          const sendResult = await matrixSendMessage(
            item.roomId,
            item.content,
            matrixToken || undefined,
            item.txnId,
            item.replyToId
          );
          const eventId = sendResult?.eventId;
          removeFromOutbox(item.txnId);
          if (eventId) {
            sentEventIdsRef.current.add(eventId);
            setMessages((prev) =>
              prev.map((m) => (m.id === item.txnId ? { ...m, id: eventId, status: 'sent' } : m))
            );
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === item.txnId ? { ...m, status: 'sent' } : m))
            );
          }
        } catch (err: any) {
          const isNetworkErr = !navigator.onLine || /network|fetch|timeout|offline|ConnectionError|failed to fetch/i.test(err?.message || '');
          if (isNetworkErr) {
            break;
          } else {
            removeFromOutbox(item.txnId);
            setMessages((prev) =>
              prev.map((m) => (m.id === item.txnId ? { ...m, status: 'failed' } : m))
            );
          }
        }
      }
    } finally {
      isFlushingRef.current = false;
    }
  };
  const deletedMessageIdsRef = useRef<Set<string>>((() => {
    try {
      const stored = localStorage.getItem('matrix_deleted_message_ids');
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  })());
  const clearedRoomTimestampsRef = useRef<Record<string, number>>((() => {
    try {
      const stored = localStorage.getItem('matrix_cleared_room_timestamps');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  })());

  // Dynamic Room Display Names cache (to resolve "Chat (vVGmHX8)" into actual names like "B Venki")
  const [roomDisplayNames, setRoomDisplayNames] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('matrix_room_display_names');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (isSettingsOpen || isNotificationsOpen) {
      setIsMobileDrawerOpen(false);
    }
  }, [isSettingsOpen, isNotificationsOpen]);

  const timelineEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const addMoreFilesInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typingByRoomRef = useRef<Record<string, string[]>>({});
  const lastTypingSentAtRef = useRef<number>(0);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const roomDisplayNamesRef = useRef<Record<string, string>>(roomDisplayNames);
  roomDisplayNamesRef.current = roomDisplayNames;
  const activeChannelRef = useRef<Channel | null>(activeChannel);
  activeChannelRef.current = activeChannel;
  const matrixUserIdRef = useRef<string | null>(matrixUserId);
  matrixUserIdRef.current = matrixUserId;

  useEffect(() => {
    // Auth check removed

    const handleSessionLoggedOut = () => {
      console.log('[App] Session logged out event received, returning to login screen');
      handleLogoutApp();
    };
    window.addEventListener('matrix:session_logged_out', handleSessionLoggedOut);

    return () => {
      window.removeEventListener('matrix:session_logged_out', handleSessionLoggedOut);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function setupMatrix() {
      checkAndLogStoragePersist();
      const savedToken = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
      const savedUserId = localStorage.getItem('matrix_user_id');
      if (savedToken && savedUserId) {
        if (isMounted) {
          setMatrixToken(savedToken);
          setMatrixUserId(savedUserId);
        }
        try {
          const profile = await matrixFetchSelfProfile(savedToken);
          if (isMounted) {
            if (profile.displayName) {
              setMatrixDisplayName(profile.displayName);
              localStorage.setItem('matrix_display_name', profile.displayName);
            }
            if (profile.avatarUrl) {
              setUserAvatarUrl(profile.avatarUrl);
              localStorage.setItem('user_avatar_url', profile.avatarUrl);
            }
          }
        } catch (e) {
          console.warn('Self profile sync error:', e);
        }
        try {
          setRoomsError(null);
          const joinedRooms = await matrixFetchJoinedRooms(savedToken);
          if (isMounted && joinedRooms.length > 0) {
            const mappedChannels: Channel[] = joinedRooms.map((r: MatrixRoom, idx: number) => ({
              id: `ch-matrix-${idx}-${Date.now()}`,
              spaceId: r.isDirect ? 'space-dm' : 'space-matrix',
              name: r.name,
              category: r.isDirect ? 'DIRECT MESSAGES' : 'CHANNELS',
              type: 'text' as const,
              matrixRoomId: r.roomId,
              topic: r.topic || 'Matrix federated room',
              isDirect: Boolean(r.isDirect),
              thumbnailLink: r.avatarUrl || undefined,
            })).filter((c: any) => c.type !== 'voice');
            setChannels(mappedChannels);
            setActiveChannelId(mappedChannels[0].id);
          }

          try {
            const bStatus = await getBackupStatus();
            if (isMounted) {
              if (!bStatus.serverBackupExists && !hasSkippedBackupPrompt) {
                setIsAutoBackupModalOpen(true);
              } else if (bStatus.serverBackupExists && !bStatus.backupEnabledOnThisDevice && !hasSkippedRestorePrompt) {
                setIsAutoRestoreModalOpen(true);
              }
            }
          } catch (e) {
            console.warn('Backup status check note:', e);
          }
        } catch (e) {
          console.warn('Joined rooms fetch note:', e);
          if (isMounted) {
            setRoomsError('Could not load rooms, tap to retry');
          }
        }
      } else {
        try {
          const session = await initMatrixGuestSession();
          if (isMounted && session) {
            setMatrixToken(session.accessToken);
            setMatrixUserId(session.userId);
          } else if (isMounted) {
            setCurrentScreen('login');
          }
        } catch (err: any) {
          console.warn('Matrix connection note:', err);
          if (isMounted) {
            setCurrentScreen('login');
          }
        }
      }
    }
    setupMatrix();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRetryLoadRooms = useCallback(async () => {
    const token = matrixToken || localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
    if (!token) return;
    setRoomsError(null);
    try {
      const joinedRooms = await matrixFetchJoinedRooms(token);
      if (joinedRooms && joinedRooms.length > 0) {
        const mappedChannels: Channel[] = joinedRooms.map((r: MatrixRoom, idx: number) => ({
          id: `ch-matrix-${idx}-${Date.now()}`,
          spaceId: r.isDirect ? 'space-dm' : 'space-matrix',
          name: r.name,
          category: r.isDirect ? 'DIRECT MESSAGES' : 'CHANNELS',
          type: 'text' as const,
          matrixRoomId: r.roomId,
          topic: r.topic || 'Matrix federated room',
          isDirect: Boolean(r.isDirect),
          thumbnailLink: r.avatarUrl || undefined,
        })).filter((c: any) => c.type !== 'voice');
        setChannels(mappedChannels);
        if (!activeChannelId) {
          setActiveChannelId(mappedChannels[0].id);
        }
      }
    } catch (err: any) {
      console.warn('Retry load rooms error:', err);
      setRoomsError('Could not load rooms, tap to retry');
    }
  }, [matrixToken, activeChannelId]);

  // Whenever an active room is opened/viewed, mark its notifications as read and send m.read receipt
  useEffect(() => {
    if (!activeChannel || currentScreen !== 'chat') return;
    const targetRoomId = activeChannel.id;
    const targetMatrixId = activeChannel.matrixRoomId;
    const targetName = activeChannel.name.toLowerCase();

    setNotifications((prev) => {
      let changed = false;
      const updated = prev.map((n) => {
        if (
          !n.isRead &&
          (n.roomId === targetRoomId ||
            (targetMatrixId && n.roomId === targetMatrixId) ||
            n.roomName.toLowerCase() === targetName)
        ) {
          changed = true;
          return { ...n, isRead: true };
        }
        return n;
      });
      if (changed) {
        saveNotifications(updated);
        return updated;
      }
      return prev;
    });

    if (activeChannel.unreadCount || activeChannel.unread) {
      setChannels((prev) =>
        prev.map((c) =>
          c.id === activeChannel.id ? { ...c, unread: false, unreadCount: 0 } : c
        )
      );
    }

    if (activeChannel.matrixRoomId) {
      matrixSendReadReceipt(activeChannel.matrixRoomId);
    }
  }, [activeChannel?.id, activeChannel?.matrixRoomId, currentScreen]);

  // Check and enforce end-to-end encryption for the active room
  useEffect(() => {
    if (!activeChannel?.matrixRoomId || currentScreen !== 'chat') {
      setIsCurrentRoomEncrypted(null);
      return;
    }
    setIsCurrentRoomEncrypted(null);
    let isCancelled = false;
    async function checkAndEnsureRoomEncryption() {
      try {
        const isEnc = await matrixIsRoomEncrypted(activeChannel.matrixRoomId!);
        if (!isCancelled) setIsCurrentRoomEncrypted(isEnc);

        if (!isEnc && activeChannel.matrixRoomId && matrixToken) {
          const enabled = await matrixEnsureRoomEncrypted(activeChannel.matrixRoomId);
          if (enabled && !isCancelled) {
            setIsCurrentRoomEncrypted(true);
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const systemMsg: Message = {
              id: `sys-enc-${Date.now()}`,
              channelId: activeChannel.id,
              userId: 'system',
              userName: 'System',
              userAvatar: '',
              timestamp: `Today at ${timeString}`,
              content: '🔒 Encryption enabled for this room',
              isEncrypted: true,
            };
            setMessages((prev) => [...prev, systemMsg]);
          }
        }
      } catch (err) {
        console.warn('Room encryption check note:', err);
        if (!isCancelled) setIsCurrentRoomEncrypted(null);
      }
    }
    checkAndEnsureRoomEncryption();
    return () => {
      isCancelled = true;
    };
  }, [activeChannel?.id, activeChannel?.matrixRoomId, currentScreen, matrixToken]);

  useEffect(() => {
    const updateCryptoState = () => {
      setCryptoReady(isCryptoReady());
    };
    updateCryptoState();
    const interval = setInterval(updateCryptoState, 2000);
    return () => clearInterval(interval);
  }, [matrixToken]);

  useEffect(() => {
    if (!activeChannel || !activeChannel.matrixRoomId || currentScreen !== 'chat') return;
    let isCancelled = false;
    async function syncMatrixTimeline(): Promise<number> {
      if (!activeChannel || !activeChannel.matrixRoomId) return 0;
      setIsStreamingMatrix(true);
      let displayableCount = 0;
      try {
        const events: MatrixEventItem[] = await fetchMatrixRoomMessages(
          activeChannel.matrixRoomId,
          matrixToken || undefined
        );
        // If a refresh returns no events, keep the messages already on screen. Never replace them with an empty list.
        if (isCancelled || !events || events.length === 0) {
          return messages.filter((m) => m.channelId === activeChannel.id && m.status !== 'queued').length;
        }

        const roomId = activeChannel.matrixRoomId;
        const clearedTs =
          clearedRoomTimestampsRef.current[roomId] ||
          clearedRoomTimestampsRef.current[activeChannel.id] ||
          0;

        // Filter out locally deleted messages and cleared room history
        const filteredEvents = events.filter((evt) => {
          if (deletedMessageIdsRef.current.has(evt.eventId)) return false;
          if (clearedTs && evt.originServerTs && evt.originServerTs <= clearedTs) return false;
          return true;
        });

        if (filteredEvents.length === 0) {
          return messages.filter((m) => m.channelId === activeChannel.id && m.status !== 'queued').length;
        }

        const currentUserId = matrixUserId || localStorage.getItem('matrix_user_id') || '';
        const matrixMessages: Message[] = filteredEvents.map((evt) => {
          const isMe = evt.sender === currentUserId || (matrixUsername && evt.sender && typeof evt.sender === 'string' && evt.sender.includes(matrixUsername));
          // For self-messages, explicitly prioritize the global resolved userAvatarUrl
          const avatarToUse = isMe ? (userAvatarUrl || evt.avatarUrl || '') : (evt.avatarUrl || '');
          
          let resolvedReplyTo = evt.replyTo;
          // Extract reply quotes from standard Matrix formatted body if replyTo wasn't explicitly populated
          if (!resolvedReplyTo && evt.content) {
            if (evt.content.includes('> <') || evt.content.startsWith('>')) {
              const lines = evt.content.split('\n');
              const quoteLine = lines.find((l) => l.startsWith('> <') || l.startsWith('>'));
              if (quoteLine) {
                let rUser = 'user';
                const userMatch = quoteLine.match(/<([^>]+)>/);
                if (userMatch) {
                  rUser = userMatch[1].split(':')[0].replace('@', '');
                }
                const rSnippet = quoteLine.replace(/^>\s*(<[^>]+>)?\s*/, '').trim();
                resolvedReplyTo = {
                  eventId: '',
                  userName: rUser,
                  snippet: rSnippet,
                };
              }
            }
          }

          return {
            id: evt.eventId,
            channelId: activeChannel.id,
            userId: evt.sender,
            userName: evt.senderName || 'User',
            userAvatar: avatarToUse,
            avatarColor: 'bg-[#5865f2]',
            roleColor: 'text-[#5865f2]',
            timestamp: evt.timestamp,
            ts: evt.originServerTs,
            content: evt.content,
            isTapped: false,
            isEncrypted: Boolean(evt.isEncrypted),
            isEdited: evt.isEdited,
            isDecryptionFailure: evt.isDecryptionFailure,
            encryption: evt.encryption,
            replyTo: resolvedReplyTo,
            reactions: evt.reactions,
            myReactions: evt.myReactions,
            msgtype: evt.msgtype,
            mediaUrl: evt.mediaUrl,
            mediaInfo: evt.mediaInfo,
            encryptedFile: evt.encryptedFile,
            geoUri: evt.geoUri,
            txnId: evt.txnId,
            isRedacted: Boolean(evt.isRedacted),
            deliveryStatus: evt.deliveryStatus,
          };
        });

        setMessages((prev) => {
          const queuedMessages = prev.filter((m) => m.status === 'queued');
          const otherMessages = prev.filter((m) => m.channelId !== activeChannel.id && m.status !== 'queued');
          const currentRoomExisting = prev.filter((m) => m.channelId === activeChannel.id && m.status !== 'queued');

           // Merge without duplication
           const merged = [...currentRoomExisting];
           for (const newMsg of matrixMessages) {
             if (deletedMessageIdsRef.current.has(newMsg.id)) continue;
             const isMyMsg = newMsg.userId === currentUserId;
             const existingIndex = merged.findIndex((m) => {
               if (m.id === newMsg.id) return true;
               if (newMsg.txnId && m.id === newMsg.txnId) return true;
               if (newMsg.txnId && m.txnId && m.txnId === newMsg.txnId) return true;
               if (m.id.startsWith('~') && m.txnId && m.txnId === newMsg.txnId) return true;
               return false;
             });
             if (existingIndex >= 0) {
               const oldMsg = merged[existingIndex];
               if (oldMsg?.mediaUrl && oldMsg.mediaUrl.startsWith('blob:') && oldMsg.mediaUrl !== newMsg.mediaUrl) {
                 try { URL.revokeObjectURL(oldMsg.mediaUrl); } catch {}
               }
               merged[existingIndex] = newMsg;
             } else {
               // Resolve replyTo metadata if eventId is present but snippet is missing
               if (newMsg.replyTo?.eventId && (!newMsg.replyTo.snippet || newMsg.replyTo.snippet === 'Message unavailable')) {
                 const target = merged.find((m) => m.id === newMsg.replyTo?.eventId);
                 if (target) {
                   newMsg.replyTo = {
                     eventId: target.id,
                     userName: target.userName,
                     userAvatar: target.userAvatar,
                     snippet: target.content,
                   };
                 }
               }
               const isDuplicate = merged.some((m) => {
                 if (m.id === newMsg.id) return true;
                 if (newMsg.txnId && m.id === newMsg.txnId) return true;
                 if (newMsg.txnId && m.txnId && m.txnId === newMsg.txnId) return true;
                 return false;
               });
               if (!isDuplicate) {
                 merged.push(newMsg);
               }
             }
           }

          // Add outbox items whose channelId matches if no message with that id already exists
          const outboxItems = getOutbox().filter((item) => item.channelId === activeChannel.id);
          for (const item of outboxItems) {
            const exists = merged.some((m) => m.id === item.txnId) || queuedMessages.some((m) => m.id === item.txnId);
            if (!exists) {
              const dt = new Date(item.createdAt);
              const timeString = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const queuedMsg: Message = {
                id: item.txnId,
                channelId: activeChannel.id,
                userId: currentUser?.uid || matrixUserId || '',
                userName: currentUser?.displayName || matrixDisplayName || `@${matrixUsername}`,
                userAvatar: userAvatarUrl || currentUser?.photoURL || '',
                avatarColor: 'bg-[#5865f2]',
                roleColor: 'text-[#5865f2]',
                timestamp: formatMessageTime(item.createdAt),
                ts: item.createdAt,
                content: item.content,
                isTapped: false,
                isEncrypted: isCurrentRoomEncrypted ?? false,
                isDecryptionFailure: false,
                encryption: {
                  level: 'pending',
                  reason: isCurrentRoomEncrypted === false ? 'Sent without encryption' : undefined,
                },
                status: 'queued',
              };
              merged.push(queuedMsg);
            }
          }

          const channelQueuedMessages = queuedMessages.filter((m) => m.channelId === activeChannel.id);
          for (const qm of channelQueuedMessages) {
            if (!merged.some((m) => m.id === qm.id)) {
              merged.push(qm);
            }
          }

          const finalMerged = merged.filter((m) => !m.id.startsWith('~') || m.status === 'queued');
          const nonQueued = finalMerged.filter((m) => m.status !== 'queued');
          const queued = finalMerged.filter((m) => m.status === 'queued');

          const sortedNonQueued = [...nonQueued].sort((a, b) => {
            const hasA = typeof a.ts === 'number';
            const hasB = typeof b.ts === 'number';
            if (hasA && hasB) return a.ts! - b.ts!;
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return 0;
          });

          const sortedActiveChannel = [...sortedNonQueued, ...queued];
          displayableCount = sortedNonQueued.length;
          
          recordSuccessfulSync();
          if (currentUserId && roomId && sortedActiveChannel.length > 0) {
            saveCachedMessages(currentUserId, roomId, sortedActiveChannel);
          }

          const otherQueuedMessages = queuedMessages.filter((m) => m.channelId !== activeChannel.id);
          return [...otherMessages, ...otherQueuedMessages, ...sortedActiveChannel];
        });
        return displayableCount;
      } catch (e: any) {
        console.warn('Failed to sync live Matrix timeline stream (handled):', e?.message || e);
        return messages.filter((m) => m.channelId === activeChannel.id && m.status !== 'queued').length;
      } finally {
        if (!isCancelled) setIsStreamingMatrix(false);
      }
    }

    syncMatrixTimelineRef.current = syncMatrixTimeline;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let timelineDelayedTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleSync = () => {
      if (isCancelled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isCancelled) {
          syncMatrixTimeline();
        }
      }, 80);
    };

    let matrixClientInstance: any = null;
    const currentRoomId = activeChannel.matrixRoomId;

    const handleRoomEvent = (event: any, room: any) => {
      if (isCancelled) return;
      const eventRoomId =
        room?.roomId ||
        (typeof event?.getRoomId === 'function' ? event.getRoomId() : null) ||
        event?.roomId ||
        event?.room_id;
      if (eventRoomId && eventRoomId !== currentRoomId) return;
      scheduleSync();
    };

    const handleTimelineEvent = (event: any, room: any) => {
      if (isCancelled) return;
      const eventRoomId =
        room?.roomId ||
        (typeof event?.getRoomId === 'function' ? event.getRoomId() : null) ||
        event?.roomId ||
        event?.room_id;
      if (eventRoomId && eventRoomId !== currentRoomId) return;
      scheduleSync();
      if (timelineDelayedTimer) clearTimeout(timelineDelayedTimer);
      timelineDelayedTimer = setTimeout(() => {
        if (!isCancelled) {
          scheduleSync();
        }
      }, 1500);
    };

    const handleDecryptedEvent = (event: any) => {
      if (isCancelled) return;
      const eventRoomId =
        (typeof event?.getRoomId === 'function' ? event.getRoomId() : null) ||
        event?.roomId ||
        event?.room_id;
      if (eventRoomId && eventRoomId !== currentRoomId) return;
      scheduleSync();
    };

    const handleSyncState = (state: string) => {
      if (isCancelled) return;
      setMatrixSyncState(state);
      if (state === 'SYNCING') {
        flushOutbox();
      }
    };

    getOrCreateMatrixClient().then((client) => {
      if (isCancelled || !client) return;
      matrixClientInstance = client;
      if (typeof client.getSyncState === 'function') {
        const cs = client.getSyncState();
        if (cs) setMatrixSyncState(cs);
      }
      client.on(RoomEvent.Timeline, handleTimelineEvent as any);
      client.on(RoomEvent.Redaction, handleRoomEvent as any);
      client.on(RoomEvent.LocalEchoUpdated, handleRoomEvent as any);
      client.on(RoomEvent.Receipt, handleRoomEvent as any);
      client.on(MatrixEventEvent.Decrypted, handleDecryptedEvent as any);
      client.on(ClientEvent.Sync, handleSyncState as any);

      const handleCryptoStateUpdate = () => {
        clearEventEncryptionCache();
        scheduleSync();
      };
      client.on('crypto.devicesUpdated' as any, handleCryptoStateUpdate);
      client.on('crypto.userTrustStatusChanged' as any, handleCryptoStateUpdate);
      client.on('UserTrustStatusChanged' as any, handleCryptoStateUpdate);
      client.on('DevicesUpdated' as any, handleCryptoStateUpdate);
      const cryptoApi = client.getCrypto?.() || (client as any).crypto;
      if (cryptoApi && typeof cryptoApi.on === 'function') {
        try {
          cryptoApi.on('userTrustStatusChanged', handleCryptoStateUpdate);
          cryptoApi.on('devicesUpdated', handleCryptoStateUpdate);
        } catch {}
      }

      flushOutbox();
    });

    const triggerClientResume = (client: any) => {
      if (!client || isCancelled) return;
      const hiddenDuration = lastHiddenTimeRef.current > 0 ? Date.now() - lastHiddenTimeRef.current : 0;
      const currentSyncState = typeof client.getSyncState === 'function' ? client.getSyncState() : null;

      if (currentSyncState) {
        setMatrixSyncState(currentSyncState);
      }

      if (hiddenDuration > 20000 || currentSyncState !== 'SYNCING') {
        if (typeof client.retryImmediately === 'function') {
          try {
            client.retryImmediately();
          } catch (e) {
            console.warn('[Matrix Freeze Fix] retryImmediately error:', e);
          }
        }

        if (sync5sTimerRef.current) {
          clearTimeout(sync5sTimerRef.current);
        }

        sync5sTimerRef.current = setTimeout(() => {
          sync5sTimerRef.current = null;
          if (isCancelled) return;
          const stateAfter5s = typeof client.getSyncState === 'function' ? client.getSyncState() : null;
          if (stateAfter5s) {
            setMatrixSyncState(stateAfter5s);
          }
          if (stateAfter5s !== 'SYNCING') {
            try {
              if (typeof client.stopClient === 'function') {
                client.stopClient();
              }
            } catch (err) {
              console.warn('[Matrix Freeze Fix] stopClient error:', err);
            }
            try {
              if (typeof client.startClient === 'function') {
                client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true }).catch((err: any) => {
                  console.warn('[Matrix Freeze Fix] startClient error:', err);
                });
              }
            } catch (err) {
              console.warn('[Matrix Freeze Fix] startClient catch:', err);
            }
          }
        }, 5000);
      }
    };

    const handleAppHidden = () => {
      lastHiddenTimeRef.current = Date.now();
    };

    const handleResumeOrOnline = () => {
      if (isCancelled) return;
      scheduleSync();
      const client = matrixClientInstance;
      if (client) {
        triggerClientResume(client);
      } else {
        getOrCreateMatrixClient().then((c) => {
          if (isCancelled || !c) return;
          triggerClientResume(c);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (isCancelled) return;
      if (document.visibilityState === 'hidden') {
        handleAppHidden();
      } else if (document.visibilityState === 'visible') {
        handleResumeOrOnline();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleResumeOrOnline);
    window.addEventListener('pagehide', handleAppHidden);
    window.addEventListener('online', handleResumeOrOnline);
    window.addEventListener('online', flushOutbox);

    syncMatrixTimeline();
    const interval = setInterval(syncMatrixTimeline, 12000);
    const outboxTimer = setInterval(() => {
      if (getOutbox().length > 0) {
        flushOutbox();
      }
    }, 15000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      clearInterval(outboxTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (timelineDelayedTimer) clearTimeout(timelineDelayedTimer);
      if (sync5sTimerRef.current) clearTimeout(sync5sTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleResumeOrOnline);
      window.removeEventListener('pagehide', handleAppHidden);
      window.removeEventListener('online', handleResumeOrOnline);
      window.removeEventListener('online', flushOutbox);
      if (matrixClientInstance) {
        try {
          matrixClientInstance.removeListener(RoomEvent.Timeline, handleTimelineEvent as any);
          matrixClientInstance.removeListener(RoomEvent.Redaction, handleRoomEvent as any);
          matrixClientInstance.removeListener(RoomEvent.LocalEchoUpdated, handleRoomEvent as any);
          matrixClientInstance.removeListener(RoomEvent.Receipt, handleRoomEvent as any);
          matrixClientInstance.removeListener(MatrixEventEvent.Decrypted, handleDecryptedEvent as any);
          matrixClientInstance.removeListener(ClientEvent.Sync, handleSyncState as any);
        } catch {}
      }
    };
  }, [activeChannel?.id, activeChannel?.matrixRoomId, matrixToken, currentScreen, historyTick, roomRefreshKey]);

  useEffect(() => {
    let isSubscribed = true;
    async function setupMatrixPushListener() {
      try {
        const client = await getOrCreateMatrixClient();
        if (!client || !isSubscribed) return;
        const handleTimelineEvent = async (event: any, room: any, toStartOfTimeline: boolean) => {
          if (!isSubscribed || toStartOfTimeline) return;

          // Decrypt event before processing if it's encrypted
          if (event.isEncrypted() && client && typeof client.decryptEventIfNeeded === 'function') {
            try {
              await client.decryptEventIfNeeded(event);
            } catch (decErr) {
              console.warn('[Matrix] Timeline decryption error:', decErr);
            }
          }
          const roomId = room?.roomId;
          const activeRmId = activeChannel?.matrixRoomId || activeChannel?.id;
          if (roomId && (roomId === activeRmId || roomId === activeChannel?.id) && currentScreen === 'chat') {
            matrixSendReadReceipt(roomId, event.getId(), matrixToken || undefined).catch(() => {});
            return;
          }
          const eventType = event.getType();
          if (eventType !== 'm.room.message' && eventType !== 'm.room.encrypted' && eventType !== 'm.reaction') {
            return;
          }
          const sender = event.getSender();
          const currentUserId = client.getUserId ? client.getUserId() : (matrixUserId || '');
          if (sender === currentUserId) return;
          const isDirect = Boolean(
            room?.isDirect ? room.isDirect() : (room?.getMembersWithMembership?.('join')?.length === 2)
          );
          const isAppForeground = !document.hidden;
          const settings = loadNotificationSettings();
          const evaluation = evaluateEventForNotification(
            {
              type: eventType,
              sender,
              content: event.getContent() || {},
              roomId: room?.roomId,
            },
            currentUserId || '',
            activeChannel?.matrixRoomId || '',
            isDirect,
            settings,
            isAppForeground
          );
          if (!evaluation.shouldNotify) return;
          const senderName = event.sender?.name || sender.replace('@', '').split(':')[0] || 'Matrix User';
          const roomName = room?.name || 'Matrix Room';
          const newNotif: AppNotificationItem = {
            id: `notif-${event.getId() || Date.now()}`,
            type: evaluation.type,
            title:
              evaluation.type === 'reaction'
                ? `${senderName} reacted in ${roomName}`
                : evaluation.type === 'mention'
                ? `@${senderName} mentioned you`
                : `New message from ${senderName}`,
            body: evaluation.previewText || 'New activity in room',
            senderName,
            senderId: sender,
            roomId: room?.roomId || '',
            roomName,
            timestamp: Date.now(),
            isRead: false,
            reactionEmoji: evaluation.type === 'reaction' ? (event.getContent()?.['m.relates_to']?.key || '❤️') : undefined,
          };
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          if (isAppForeground && settings.inAppNotifications) {
            setInAppToast({ notification: newNotif, visible: true });
            setTimeout(() => setInAppToast(null), 4000);
            if (settings.soundEnabled) playNotificationSound();
            if (settings.vibrateEnabled) triggerHapticNotification();
          }
          if (settings.systemNotifications) {
            dispatchSystemNotification(newNotif, settings, () => {
              if (room?.roomId) {
                const found = channels.find((c) => c.matrixRoomId === room.roomId);
                if (found) setActiveChannelId(found.id);
              }
            });
          }
        };
        client.on(RoomEvent.Timeline, handleTimelineEvent as any);
        return () => {
          isSubscribed = false;
          try {
            client.removeListener(RoomEvent.Timeline, handleTimelineEvent as any);
          } catch {}
        };
      } catch (err) {
        console.warn('Matrix push listener setup note:', err);
      }
    }
    const cleanupPromise = setupMatrixPushListener();
    return () => {
      isSubscribed = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [matrixUserId, activeChannel?.matrixRoomId, channels]);

  const resolveTypingUsers = useCallback((roomId: string, userIds: string[], client?: any) => {
    const myId = matrixUserIdRef.current || localStorage.getItem('matrix_user_id') || '';
    const filteredIds = userIds.filter((id) => Boolean(id) && id !== myId);
    if (filteredIds.length === 0) return [];

    const room = client?.getRoom ? client.getRoom(roomId) : null;
    const resolved: {
      name: string;
      userId: string;
      avatarUrl: string | null;
      avatarColor: string;
    }[] = [];

    for (const uid of filteredIds) {
      const roomMember = room?.getMember ? room.getMember(uid) : null;
      let displayName = roomMember?.rawDisplayName || roomMember?.name;
      if (!displayName || displayName.startsWith('@') || displayName.includes(':matrix.org')) {
        if (roomDisplayNamesRef.current[uid]) {
          displayName = roomDisplayNamesRef.current[uid];
        } else {
          // If room.getMember(uid) is null, use the id's localpart as the name
          displayName = uid.split(':')[0].replace('@', '');
        }
      }

      let avatarUrl: string | null = null;
      try {
        avatarUrl = (roomMember?.getMxcAvatarUrl ? roomMember.getMxcAvatarUrl() : (roomMember as any)?.avatarUrl) || null;
      } catch {}

      if (!avatarUrl) {
        const prev = messagesRef.current.find(
          (m) => (m.userId === uid || m.userName === displayName) && m.userAvatar
        );
        if (prev && prev.userAvatar) {
          avatarUrl = prev.userAvatar;
        }
      }

      resolved.push({
        name: displayName || uid.split(':')[0].replace('@', ''),
        userId: uid,
        avatarUrl: avatarUrl || null,
        avatarColor: 'bg-[#5865f2]',
      });
    }

    return resolved;
  }, []);

  // 1. Session-level effect listening to RoomMemberEvent.Typing and RoomEvent.Timeline
  useEffect(() => {
    let isSubscribed = true;

    async function initSessionTyping() {
      try {
        const client = await getOrCreateMatrixClient();
        if (!client || !isSubscribed) return;

        const myId = matrixUserIdRef.current || (client.getUserId && client.getUserId()) || localStorage.getItem('matrix_user_id') || '';

        const handleTyping = (event: any, member?: any) => {
          if (!isSubscribed) return;
          const roomId =
            member?.roomId ||
            member?.room?.roomId ||
            (typeof event?.getRoomId === 'function' ? event.getRoomId() : event?.room_id) ||
            event?.roomId;
          if (!roomId) return;

          const content = (typeof event?.getContent === 'function' ? event.getContent() : event?.content) || {};
          const rawUserIds: string[] = content.user_ids || [];
          const filtered = rawUserIds.filter((id) => Boolean(id) && id !== myId);

          typingByRoomRef.current[roomId] = filtered;

          const currentActiveRoomId = activeChannelRef.current?.matrixRoomId;
          if (currentActiveRoomId === roomId) {
            const resolved = resolveTypingUsers(roomId, filtered, client);
            setTypingUsers(resolved);
          }
        };

        const handleTimeline = (evt: any, room: any) => {
          if (!isSubscribed) return;
          const eType = typeof evt?.getType === 'function' ? evt.getType() : evt?.type;
          if (eType === 'm.room.message') {
            const sender = typeof evt?.getSender === 'function' ? evt.getSender() : evt?.sender;
            const roomId = room?.roomId || (typeof evt?.getRoomId === 'function' ? evt.getRoomId() : evt?.room_id);
            if (sender && roomId && typingByRoomRef.current[roomId]) {
              const updated = typingByRoomRef.current[roomId].filter((id) => id !== sender);
              typingByRoomRef.current[roomId] = updated;
              if (activeChannelRef.current?.matrixRoomId === roomId) {
                const resolved = resolveTypingUsers(roomId, updated, client);
                setTypingUsers(resolved);
              }
            }
          }
        };

        client.on(RoomMemberEvent.Typing, handleTyping);
        client.on(RoomEvent.Timeline, handleTimeline);

        return () => {
          isSubscribed = false;
          try {
            client.removeListener(RoomMemberEvent.Typing, handleTyping);
            client.removeListener(RoomEvent.Timeline, handleTimeline);
          } catch {}
        };
      } catch (err) {
        console.warn('Session typing listener note:', err);
      }
    }

    const cleanupPromise = initSessionTyping();
    return () => {
      isSubscribed = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [matrixToken, resolveTypingUsers]);

  // 2. Active room change: recompute typingUsers without clearing
  useEffect(() => {
    const roomId = activeChannel?.matrixRoomId;
    if (!roomId) return;

    getOrCreateMatrixClient().then((client) => {
      if (!client) return;
      const myId = matrixUserIdRef.current || (client.getUserId && client.getUserId()) || localStorage.getItem('matrix_user_id') || '';
      const room = client.getRoom ? client.getRoom(roomId) : null;
      let typingIds: string[] = [];

      if (room && typeof room.getMembersWithMembership === 'function') {
        typingIds = room
          .getMembersWithMembership('join')
          .filter((m: any) => m.typing && m.userId !== myId)
          .map((m: any) => m.userId);
      } else {
        typingIds = (typingByRoomRef.current[roomId] || []).filter((id) => id !== myId);
      }

      typingByRoomRef.current[roomId] = typingIds;
      const resolved = resolveTypingUsers(roomId, typingIds, client);
      setTypingUsers(resolved);
    });
  }, [activeChannel?.matrixRoomId, resolveTypingUsers]);

  useEffect(() => {
    let isSubscribed = true;
    async function setupUnreadListener() {
      try {
        const client = await getOrCreateMatrixClient();
        if (!client || !isSubscribed) return;
        const updateCounts = () => {
          if (!isSubscribed) return;
          setChannels((prev) =>
            prev.map((ch) => {
              if (!ch.matrixRoomId) return ch;
              const room = client.getRoom ? client.getRoom(ch.matrixRoomId) : null;
              const count = room ? (room as any).getUnreadNotificationCount('total') : 0;
              return { ...ch, unreadCount: count };
            })
          );
        };
        client.on(RoomEvent.Timeline, updateCounts);
        client.on(RoomEvent.Receipt, updateCounts);
        return () => {
          isSubscribed = false;
          try {
            client.removeListener(RoomEvent.Timeline, updateCounts);
            client.removeListener(RoomEvent.Receipt, updateCounts);
          } catch {}
        };
      } catch (e) {
        console.warn('Unread listener setup note:', e);
      }
    }
    const cleanupPromise = setupUnreadListener();
    return () => {
      isSubscribed = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, [matrixToken]);

  const globalUnreadCount = channels.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
  const rawChannelMessages = activeChannel
    ? messages.filter((m) => m.channelId === activeChannel.id)
    : [];
  const currentChannelMessages = searchQuery.trim()
    ? rawChannelMessages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawChannelMessages;

  const nameColorMap = useMemo(
    () => buildNameColorMap([...currentChannelMessages.map((m) => m.userId), matrixUserId]),
    [currentChannelMessages, matrixUserId]
  );

  useEffect(() => {
    if (timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeChannelId, typingUsers.length]);

  const resolveChannelTitle = useCallback(
    (channel: Channel | null | undefined): string => {
      if (!channel) return 'direct-messages';

      // 1. Check cached display names
      if (roomDisplayNames[channel.id]) return roomDisplayNames[channel.id];
      if (channel.matrixRoomId && roomDisplayNames[channel.matrixRoomId]) {
        return roomDisplayNames[channel.matrixRoomId];
      }

      // 2. Check messages in channel for the other participant
      const otherMsg = messages.find(
        (m) =>
          (m.channelId === channel.id || m.channelId === channel.matrixRoomId) &&
          m.userId &&
          m.userId !== matrixUserId &&
          m.userId !== `@${matrixUsername}:matrix.org` &&
          m.userName &&
          !m.userName.startsWith('Chat (') &&
          !m.userName.startsWith('!')
      );
      if (otherMsg?.userName) {
        return otherMsg.userName;
      }

      // 3. Clean up raw names
      if (
        channel.name &&
        !channel.name.startsWith('Chat (') &&
        !channel.name.startsWith('!') &&
        !channel.name.startsWith('Empty room') &&
        !channel.name.includes(':matrix.org')
      ) {
        return channel.name;
      }

      if (channel.name.startsWith('@')) {
        return channel.name.replace('@', '').split(':')[0];
      }

      // 4. If name was Chat (xxx) but we have any message sender
      const anyMsg = messages.find(
        (m) => (m.channelId === channel.id || m.channelId === channel.matrixRoomId) && m.userName
      );
      if (anyMsg?.userName && !anyMsg.userName.startsWith('Chat (')) {
        return anyMsg.userName;
      }

      if (channel.isDirect) {
        return 'Direct Message';
      }

      return channel.name && !channel.name.startsWith('Chat (') ? channel.name : 'Direct Message';
    },
    [roomDisplayNames, messages, matrixUserId, matrixUsername]
  );

  const activeChannelPartnerAvatar = useMemo(() => {
    if (!activeChannel?.isDirect) return null;
    const otherMsg = messages.find(
      (m) =>
        (m.channelId === activeChannel.id || m.channelId === activeChannel.matrixRoomId) &&
        m.userId !== matrixUserId &&
        m.userAvatar
    );
    return otherMsg?.userAvatar || activeChannel.thumbnailLink || null;
  }, [activeChannel, messages, matrixUserId]);

  useEffect(() => {
    if (!activeChannel?.matrixRoomId) return;
    let isMounted = true;
    async function resolveParticipantName() {
      try {
        const client = await getOrCreateMatrixClient();
        if (!client || !activeChannel?.matrixRoomId) return;
        const currentUserId = client.getUserId ? client.getUserId() : (matrixUserId || '');
        const roomId = activeChannel.matrixRoomId;

        // Check m.direct account data
        const directData = ((client as any).getAccountData?.('m.direct')?.getContent?.()) || {};
        for (const [targetUid, roomIds] of Object.entries(directData)) {
          if (Array.isArray(roomIds) && roomIds.includes(roomId)) {
            const name = await matrixGetDisplayName(targetUid);
            const avatarUrl = await matrixGetProfileAvatar(targetUid);
            if ((name || avatarUrl) && isMounted) {
              setRoomDisplayNames((prev) => {
                const next = { ...prev, [roomId]: name || prev[roomId], [activeChannel.id]: name || prev[activeChannel.id] };
                localStorage.setItem('matrix_room_display_names', JSON.stringify(next));
                return next;
              });
              setChannels((prev) =>
                prev.map((c) => (c.id === activeChannel.id ? { ...c, isDirect: true, name: name || c.name, thumbnailLink: avatarUrl || c.thumbnailLink } : c))
              );
              return;
            }
          }
        }

        // Check room members via Matrix client
        const room = client.getRoom ? client.getRoom(roomId) : null;
        if (room) {
          const members =
            (typeof room.getJoinedMembers === 'function' && room.getJoinedMembers()) ||
            (typeof room.getMembers === 'function' && room.getMembers()) ||
            [];
          const other = members.find((m: any) => m.userId && m.userId !== currentUserId);
          if (other) {
            let name = other.rawDisplayName || other.name;
            const avatarUrl = other.getMxcAvatarUrl ? other.getMxcAvatarUrl() : (other as any).avatarUrl;
            if (!name || name.startsWith('@') || name.includes(':matrix.org') || name.startsWith('Chat (')) {
              name = await matrixGetDisplayName(other.userId);
            }
            if ((name || avatarUrl) && isMounted) {
              setRoomDisplayNames((prev) => {
                const next = { ...prev, [roomId]: name || prev[roomId], [activeChannel.id]: name || prev[activeChannel.id] };
                localStorage.setItem('matrix_room_display_names', JSON.stringify(next));
                return next;
              });
              const isDm = members.length <= 2;
              setChannels((prev) =>
                prev.map((c) => (c.id === activeChannel.id ? { ...c, ...(isDm ? { isDirect: true } : {}), name: name || c.name, thumbnailLink: avatarUrl || c.thumbnailLink } : c))
              );
              return;
            }
          }
        }

        // REST joined_members query fallback for instant participant name resolution
        const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
        if (token) {
          const baseUrl = getHomeserverUrl(matrixUserId);
          const res = await fetch(`${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            const joined = data.joined || {};
            const userIds = Object.keys(joined);
            const otherUid = userIds.find((u) => u !== currentUserId);
            if (otherUid) {
              const info = joined[otherUid];
              let name = info?.display_name;
              const avatarUrl = info?.avatar_url;
              if (!name || name.startsWith('@') || name.includes(':matrix.org')) {
                name = otherUid.replace('@', '').split(':')[0];
              }
              if ((name || avatarUrl) && isMounted) {
                setRoomDisplayNames((prev) => {
                  const next = { ...prev, [roomId]: name || prev[roomId], [activeChannel.id]: name || prev[activeChannel.id] };
                  localStorage.setItem('matrix_room_display_names', JSON.stringify(next));
                  return next;
                });
                const isDm = userIds.length <= 2;
                setChannels((prev) =>
                  prev.map((c) => (c.id === activeChannel.id ? { ...c, ...(isDm ? { isDirect: true } : {}), name: name || c.name, thumbnailLink: avatarUrl || c.thumbnailLink } : c))
                );
              }
            }
          }
        }
      } catch (err) {
        console.warn('Participant name resolution note:', err);
      }
    }
    resolveParticipantName();
    return () => {
      isMounted = false;
    };
  }, [activeChannel?.id, activeChannel?.matrixRoomId, matrixUserId]);

  const handleConfirmLeaveRoom = async () => {
    if (!activeChannel) return;
    try {
      setIsLeavingRoom(true);
      const rid = activeChannel.matrixRoomId || activeChannel.id;
      clearedRoomTimestampsRef.current[rid] = Date.now();
      try {
        localStorage.setItem(
          'matrix_cleared_room_timestamps',
          JSON.stringify(clearedRoomTimestampsRef.current)
        );
      } catch {}
      setMessages((prev) => prev.filter((m) => m.channelId !== activeChannel.id && m.channelId !== rid));
      await matrixLeaveRoom(rid, matrixToken || undefined);
      const channelToLeave = activeChannel;
      setChannels((prev) => prev.filter((c) => c.id !== channelToLeave.id));
      const remaining = channels.filter((c) => c.id !== channelToLeave.id);
      if (remaining.length > 0) {
        setActiveChannelId(remaining[0].id);
      } else {
        setActiveChannelId('');
      }
      setIsLeaveConfirmOpen(false);
    } catch (err: any) {
      console.error('Leave room failed:', err);
      alert('Failed to leave room: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLeavingRoom(false);
    }
  };

  const handleConfirmBlockUser = async () => {
    if (!activeChannel) return;
    try {
      setIsBlockingUser(true);
      let targetUserId = activeChannel.matrixRoomId || '';
      if (!targetUserId.startsWith('@')) {
        const otherMsg = messages.find(
          (m) =>
            (m.channelId === activeChannel.id || m.channelId === activeChannel.matrixRoomId) &&
            m.userId &&
            m.userId !== matrixUserId
        );
        if (otherMsg?.userId) {
          targetUserId = otherMsg.userId;
        }
      }
      if (targetUserId) {
        await matrixBlockUser(targetUserId, matrixToken || undefined);
      }
      setIsBlockConfirmOpen(false);
      alert(`Blocked ${resolveChannelTitle(activeChannel)}. Their messages and invites will be ignored.`);
    } catch (err: any) {
      console.error('Block user failed:', err);
      alert('Failed to block user: ' + (err.message || 'Unknown error'));
    } finally {
      setIsBlockingUser(false);
    }
  };

  const handleOpenDetails = () => {
    setIsOverflowMenuOpen(false);
    if (!activeChannel) return;
    const otherMsg = messages.find(
      (m) =>
        (m.channelId === activeChannel.id || m.channelId === activeChannel.matrixRoomId) &&
        m.userId &&
        m.userId !== matrixUserId
    );
    const title = resolveChannelTitle(activeChannel);
    const targetUserId =
      otherMsg?.userId || (activeChannel.matrixRoomId?.startsWith('@') ? activeChannel.matrixRoomId : title);
    setSelectedUserProfile({
      userName: title,
      userId: targetUserId,
      userAvatar: otherMsg?.userAvatar || undefined,
      avatarColor: otherMsg?.avatarColor || 'bg-[#5865f2]',
      isCurrentUser: false,
    });
  };

  const handleMatrixLogin = async (username: string, password: string) => {
    setIsMatrixLoggingIn(true);
    setMatrixLoginError(null);
    try {
      const session = await matrixLogin(username, password);
      setMatrixToken(session.accessToken);
      setMatrixUserId(session.userId);
      try {
        const profile = await matrixFetchSelfProfile(session.accessToken);
        if (profile.displayName) {
          setMatrixDisplayName(profile.displayName);
          localStorage.setItem('matrix_display_name', profile.displayName);
        }
        if (profile.avatarUrl) {
          setUserAvatarUrl(profile.avatarUrl);
          localStorage.setItem('user_avatar_url', profile.avatarUrl);
        }
      } catch (err) {
        console.warn('Self profile fetch error:', err);
      }
      try {
        const joinedRooms = await matrixFetchJoinedRooms(session.accessToken);
        if (joinedRooms.length > 0) {
          const mappedChannels: Channel[] = joinedRooms.map((r: MatrixRoom, idx: number) => ({
            id: `ch-matrix-${idx}-${Date.now()}`,
            spaceId: r.isDirect ? 'space-dm' : 'space-matrix',
            name: r.name,
            category: r.isDirect ? 'DIRECT MESSAGES' : 'CHANNELS',
            type: 'text' as const,
            matrixRoomId: r.roomId,
            topic: r.topic || 'Matrix federated room',
            isDirect: Boolean(r.isDirect),
          })).filter((c: any) => c.type !== 'voice');
          setChannels(mappedChannels);
          setActiveChannelId(mappedChannels[0].id);
        }
      } catch (e) {
        console.warn('Joined rooms fetch error:', e);
      }
      setCurrentScreen('chat');
      try {
        const bStatus = await getBackupStatus();
        if (!bStatus.serverBackupExists && !hasSkippedBackupPrompt) {
          setIsAutoBackupModalOpen(true);
        } else if (bStatus.serverBackupExists && !bStatus.backupEnabledOnThisDevice && !hasSkippedRestorePrompt) {
          setIsAutoRestoreModalOpen(true);
        }
      } catch (e) {
        console.warn('Backup status check error:', e);
      }
    } catch (err: any) {
      setMatrixLoginError(err.message || 'Authentication against matrix.org failed');
    } finally {
      setIsMatrixLoggingIn(false);
    }
  };

  const handleMatrixRegister = async (username: string, password: string) => {
    setIsMatrixLoggingIn(true);
    setMatrixLoginError(null);
    try {
      const session = await matrixRegisterUser(username, password);
      setMatrixToken(session.accessToken);
      setMatrixUserId(session.userId);
      try {
        const dName = await matrixGetDisplayName(session.userId, session.accessToken);
        if (dName) {
          setMatrixDisplayName(dName);
          localStorage.setItem('matrix_display_name', dName);
        }
      } catch {}
      try {
        const joinedRooms = await matrixFetchJoinedRooms(session.accessToken);
        if (joinedRooms.length > 0) {
          const mappedChannels: Channel[] = joinedRooms.map((r: MatrixRoom, idx: number) => ({
            id: `ch-matrix-${idx}-${Date.now()}`,
            spaceId: r.isDirect ? 'space-dm' : 'space-matrix',
            name: r.name,
            category: r.isDirect ? 'DIRECT MESSAGES' : 'CHANNELS',
            type: 'text' as const,
            matrixRoomId: r.roomId,
            topic: r.topic || 'Matrix federated room',
            isDirect: Boolean(r.isDirect),
          })).filter((c: any) => c.type !== 'voice');
          setChannels(mappedChannels);
          setActiveChannelId(mappedChannels[0].id);
        }
      } catch (e) {
        console.warn('Joined rooms fetch error:', e);
      }
      setCurrentScreen('chat');
      try {
        const bStatus = await getBackupStatus();
        if (!bStatus.serverBackupExists && !hasSkippedBackupPrompt) {
          setIsAutoBackupModalOpen(true);
        } else if (bStatus.serverBackupExists && !bStatus.backupEnabledOnThisDevice && !hasSkippedRestorePrompt) {
          setIsAutoRestoreModalOpen(true);
        }
      } catch (e) {
        console.warn('Backup status check error:', e);
      }
    } catch (err: any) {
      setMatrixLoginError(err.message || 'Matrix account registration failed');
    } finally {
      setIsMatrixLoggingIn(false);
    }
  };

  const handleLogoutApp = async () => {
    triggerHaptic();
    try {
      const bStatus = await getBackupStatus();
      if (!bStatus.backupEnabledOnThisDevice) {
        setIsLogoutBackupWarningOpen(true);
        return;
      }
    } catch (e) {
      console.warn('Backup status check error during logout:', e);
    }
    performLogout();
  };

  const performLogout = () => {
    matrixLogout();
    clearMessageCache();
    setMatrixToken(null);
    setCurrentScreen('login');
    setIsLogoutBackupWarningOpen(false);
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputContent(val);
    if (activeChannel?.matrixRoomId && matrixToken) {
      try {
        const client = await getOrCreateMatrixClient();
        if (client && client.sendTyping) {
          await client.sendTyping(activeChannel.matrixRoomId, Boolean(val.trim()), 3000);
        }
      } catch {}
    }
  };

  const handleEditMessage = (msg: Message) => {
    setEditingMessageId(msg.id);
    setInputContent(msg.content);
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  const handleCancelEditing = () => {
    setEditingMessageId(null);
    setInputContent('');
  };

  const handleRedactForEveryone = async (messageId: string) => {
    const currentUserId = matrixUserId || localStorage.getItem('matrix_user_id') || currentUser?.uid || '';
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.userId !== currentUserId) {
      return;
    }

    if (!messageId.startsWith('$')) {
      handleDeleteMessage(messageId);
      return;
    }

    try {
      await matrixRedactMessage(activeChannel?.matrixRoomId || '', messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isRedacted: true,
                content: 'Message deleted',
                driveAttachment: undefined,
                reactions: undefined,
                mediaUrl: undefined,
              }
            : m
        )
      );
    } catch (err: any) {
      alert('Could not delete the message: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim() && pendingAttachments.length === 0) return;

    if (!isCryptoReady() && activeChannel?.matrixRoomId) {
      setDeliveryError("Encryption failed to start, sending is disabled");
      return;
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setTypingUsers([]);
    if (activeChannel?.matrixRoomId && matrixToken) {
      try {
        const client = await getOrCreateMatrixClient();
        if (client && client.sendTyping) {
          client.sendTyping(activeChannel.matrixRoomId, false, 0).catch(() => {});
        }
      } catch {}
    }

    const contentText = inputContent.trim();
    const currentChannel = activeChannel;

    if (pendingAttachments.length > 0 && !navigator.onLine) {
      setDeliveryError("Media cannot be sent while offline");
      return;
    }

    setInputContent('');
    setReplyingToMessage(null);

    if (editingMessageId) {
      if (activeChannel?.matrixRoomId && matrixToken) {
        try {
          const sendResult = await matrixSendMessage(
            activeChannel.matrixRoomId,
            contentText,
            matrixToken,
            undefined,
            undefined,
            editingMessageId
          );
          if (sendResult?.eventId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === editingMessageId
                  ? { ...m, content: contentText, isEdited: true }
                  : m
              )
            );
          }
        } catch (err: any) {
          console.error('Failed to send edit:', err);
          setDeliveryError(err.message || 'Failed to edit message');
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessageId
              ? { ...m, content: contentText, isEdited: true }
              : m
          )
        );
      }
      setEditingMessageId(null);
      return;
    }

    const attachmentsToSend = [...pendingAttachments];
    clearPendingAttachments();

    if (attachmentsToSend.length > 0) {
      const newMessagesToAdd: Message[] = [];
      const queueItemsToAdd: UploadQueueItem[] = [];

      attachmentsToSend.forEach((att, index) => {
        const txnId = `m${Date.now()}_${index}_${Math.random().toString(36).substring(2, 9)}`;
        const fileMsgtype = `m.${att.kind}`;
        const caption = index === 0 ? contentText : undefined;

        const newMessage: Message = {
          id: txnId,
          txnId,
          channelId: currentChannel.id,
          userId: currentUser?.uid || matrixUserId,
          userName: currentUser?.displayName || matrixDisplayName || `@${matrixUsername}`,
          userAvatar: userAvatarUrl || currentUser?.photoURL || '',
          avatarColor: 'bg-[#5865f2]',
          roleColor: 'text-[#5865f2]',
          timestamp: formatMessageTime(Date.now()),
          ts: Date.now(),
          content: caption || att.file.name || 'Shared file',
          msgtype: fileMsgtype,
          mediaUrl: att.previewUrl,
          mediaInfo: {
            mimetype: att.file.type || 'application/octet-stream',
            size: att.file.size,
            duration: att.videoDuration,
          },
          thumbnailUrl: att.thumbUrl,
          uploadProgress: 0,
          isTapped: false,
          isEncrypted: isCurrentRoomEncrypted ?? false,
          isDecryptionFailure: false,
          encryption: {
            level: 'pending',
            reason: isCurrentRoomEncrypted === false ? 'Sent without encryption' : undefined,
          },
          replyTo: index === 0 && replyingToMessage ? {
            eventId: replyingToMessage.id,
            userName: replyingToMessage.userName,
            userAvatar: replyingToMessage.userAvatar,
            snippet: replyingToMessage.content,
          } : undefined,
          status: 'sending',
        };

        if (att.previewUrl) {
          activeBlobUrlsRef.current.set(txnId, att.previewUrl);
        }

        sentTxnIdsRef.current.add(txnId);
        newMessagesToAdd.push(newMessage);

        const replyToIdToSend = index === 0 ? replyingToMessage?.id : undefined;

        queueItemsToAdd.push({
          txnId,
          roomId: currentChannel.matrixRoomId || '',
          channelId: currentChannel.id,
          file: att.file,
          kind: att.kind,
          previewUrl: att.previewUrl,
          thumbUrl: att.thumbUrl,
          videoDuration: att.videoDuration,
          caption: caption || undefined,
          replyToId: replyToIdToSend,
          status: 'queued',
          progress: 0,
        });
      });

      setMessages((prev) => [...prev, ...newMessagesToAdd]);
      uploadQueueRef.current.push(...queueItemsToAdd);
      processUploadQueue();

    } else if (contentText) {
      const txnId = `m${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const replyToInfo = replyingToMessage
        ? {
            eventId: replyingToMessage.id,
            userName: replyingToMessage.userName,
            userAvatar: replyingToMessage.userAvatar,
            snippet: replyingToMessage.content,
          }
        : undefined;
      const replyToIdToSend = replyingToMessage?.id;

      const newMessage: Message = {
        id: txnId,
        channelId: currentChannel.id,
        userId: currentUser?.uid || matrixUserId,
        userName: currentUser?.displayName || matrixDisplayName || `@${matrixUsername}`,
        userAvatar: userAvatarUrl || currentUser?.photoURL || '',
        avatarColor: 'bg-[#5865f2]',
        roleColor: 'text-[#5865f2]',
        timestamp: formatMessageTime(Date.now()),
        ts: Date.now(),
        content: contentText,
        msgtype: 'm.text',
        isTapped: false,
        isEncrypted: isCurrentRoomEncrypted ?? false,
        isDecryptionFailure: false,
        encryption: {
          level: 'pending',
          reason: isCurrentRoomEncrypted === false ? 'Sent without encryption' : undefined,
        },
        replyTo: replyToInfo,
        status: 'sending',
      };

      sentTxnIdsRef.current.add(txnId);
      setMessages((prev) => [...prev, newMessage]);

      if (!navigator.onLine) {
        addToOutbox({
          txnId,
          roomId: currentChannel.matrixRoomId || '',
          channelId: currentChannel.id,
          content: contentText,
          replyToId: replyToIdToSend,
          createdAt: Date.now(),
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === txnId ? { ...m, status: 'queued' } : m))
        );
        setDeliveryError(null);
        return;
      }

      if (currentChannel.matrixRoomId && matrixToken) {
        try {
          let roomId = currentChannel.matrixRoomId;
          if (roomId.startsWith('@') || roomId.includes(':matrix.org')) {
            roomId = await matrixCreateDirectRoom(roomId, matrixToken);
            setChannels((prev) =>
              prev.map((c) => (c.id === currentChannel.id ? { ...c, matrixRoomId: roomId } : c))
            );
          }
          const sendResult = await matrixSendMessage(roomId, contentText, matrixToken, txnId, replyToIdToSend);
          if (sendResult?.eventId) {
            sentEventIdsRef.current.add(sendResult.eventId);
            setMessages((prev) =>
              prev.map((m) => (m.id === txnId ? { ...m, id: sendResult.eventId, status: 'sent' } : m))
            );
          }
          setDeliveryError(null);
        } catch (err: any) {
          console.warn('Failed to transmit live Matrix message:', err);
          const isOfflineError = !navigator.onLine || /network|fetch|timeout|offline|ConnectionError|failed to fetch/i.test(err?.message || '');
          if (isOfflineError) {
            addToOutbox({
              txnId,
              roomId: currentChannel.matrixRoomId || '',
              channelId: currentChannel.id,
              content: contentText,
              replyToId: replyToIdToSend,
              createdAt: Date.now(),
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === txnId ? { ...m, status: 'queued' } : m))
            );
            setDeliveryError(null);
          } else {
            setDeliveryError(err.message || 'Failed to deliver message');
            setMessages((prev) =>
              prev.map((m) => (m.id === txnId ? { ...m, status: 'failed' } : m))
            );
          }
        }
      }
    }
  };

  const handleToggleMessageTap = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isTapped: !m.isTapped } : m
      )
    );
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!messageId || !messageId.startsWith('$')) return;
    const roomId = activeChannel?.matrixRoomId;
    if (!roomId) return;

    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    const previousReactions = targetMsg.reactions ? { ...targetMsg.reactions } : undefined;
    const previousMyReactions = targetMsg.myReactions ? { ...targetMsg.myReactions } : undefined;

    const existingReactionEventId = targetMsg.myReactions?.[emoji];
    const isRemoving = Boolean(existingReactionEventId);

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          const nextReactions = { ...(m.reactions || {}) };
          const nextMyReactions = { ...(m.myReactions || {}) };

          if (isRemoving) {
            const count = (nextReactions[emoji] || 1) - 1;
            if (count <= 0) {
              delete nextReactions[emoji];
            } else {
              nextReactions[emoji] = count;
            }
            delete nextMyReactions[emoji];
          } else {
            nextReactions[emoji] = (nextReactions[emoji] || 0) + 1;
            nextMyReactions[emoji] = `pending-${Date.now()}`;
          }

          return {
            ...m,
            reactions: Object.keys(nextReactions).length > 0 ? nextReactions : undefined,
            myReactions: Object.keys(nextMyReactions).length > 0 ? nextMyReactions : undefined,
          };
        }
        return m;
      })
    );

    try {
      if (isRemoving && existingReactionEventId) {
        await matrixRemoveReaction(roomId, existingReactionEventId);
      } else {
        const res = await matrixSendReaction(roomId, messageId, emoji);
        const newReactionEventId = res?.event_id;
        if (newReactionEventId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === messageId) {
                return {
                  ...m,
                  myReactions: {
                    ...(m.myReactions || {}),
                    [emoji]: newReactionEventId,
                  },
                };
              }
              return m;
            })
          );
        }
      }
    } catch (err: any) {
      console.warn('Reaction update failed:', err);
      // Roll back UI state
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              reactions: previousReactions,
              myReactions: previousMyReactions,
            };
          }
          return m;
        })
      );
      setDeliveryError('Failed to update reaction: ' + (err?.message || 'Unknown error'));
      setTimeout(() => setDeliveryError(null), 5000);
    }
  };

  const handleToggleStarMessage = (messageId: string) => {
    setStarredMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const handleDeleteMessage = (messageId: string) => {
    // Cancel upload if in queue
    const itemIndex = uploadQueueRef.current.findIndex((q) => q.txnId === messageId);
    if (itemIndex > -1) {
      const item = uploadQueueRef.current[itemIndex];
      item.status = 'cancelled';
      uploadQueueRef.current.splice(itemIndex, 1);
    }

    // Revoke and clean up blob url
    const blobUrl = activeBlobUrlsRef.current.get(messageId);
    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch {}
      activeBlobUrlsRef.current.delete(messageId);
    }
    retryFilesRef.current.delete(messageId);

    // Remove from outbox if it's an unsent message
    removeFromOutbox(messageId);

    // Filter out of local list
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    // Persist local deletion for real messages
    if (messageId.startsWith('$')) {
      deletedMessageIdsRef.current.add(messageId);
      try {
        localStorage.setItem(
          'matrix_deleted_message_ids',
          JSON.stringify(Array.from(deletedMessageIdsRef.current))
        );
      } catch {}
    }
  };

  const handleRedactMessage = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !activeChannel?.matrixRoomId) return;

    try {
      await matrixRedactMessage(activeChannel.matrixRoomId, messageId);
    } catch (err: any) {
      console.error('Redact failed:', err);
      setErrorToast('Failed to delete message: ' + (err.message || 'Unknown error'));
    }
  };


  const handleReplyMessage = (msg: Message) => {
    setEditingMessageId(null);
    setReplyingToMessage(msg);
    chatInputRef.current?.focus();
  };

  const handleRetryMessage = async (msg: Message) => {
    if (!activeChannel?.matrixRoomId) return;

    const file = retryFilesRef.current.get(msg.id);
    if (file) {
      const queueItem: UploadQueueItem = {
        txnId: msg.id,
        roomId: activeChannel.matrixRoomId,
        channelId: activeChannel.id,
        file,
        kind: msg.msgtype?.replace('m.', '') as any || 'file',
        previewUrl: msg.mediaUrl || '',
        caption: msg.content !== file.name ? msg.content : undefined,
        status: 'queued',
        progress: 0
      };

      retryFilesRef.current.delete(msg.id);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, status: 'queued', uploadProgress: 0 } : m
        )
      );

      if (!uploadQueueRef.current.some((q) => q.txnId === msg.id)) {
        uploadQueueRef.current.push(queueItem);
      }

      processUploadQueue();
      return;
    }

    const outbox = getOutbox();
    const inOutbox = outbox.some((i) => i.txnId === msg.id);

    if (inOutbox) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: 'queued' } : m))
      );
      flushOutbox();
      return;
    }

    if (msg.status === 'failed') {
      addToOutbox({
        txnId: msg.id,
        roomId: activeChannel.matrixRoomId,
        channelId: activeChannel.id,
        content: msg.content,
        replyToId: msg.replyTo?.eventId,
        createdAt: Date.now(),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: 'queued' } : m))
      );
      flushOutbox();
      return;
    }

    try {
      await matrixRetrySend(activeChannel.matrixRoomId, msg.id);
    } catch (err: any) {
      try {
        addToOutbox({
          txnId: msg.id,
          roomId: activeChannel.matrixRoomId,
          channelId: activeChannel.id,
          content: msg.content,
          replyToId: msg.replyTo?.eventId,
          createdAt: Date.now(),
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, status: 'queued' } : m))
        );
        flushOutbox();
      } catch (innerErr: any) {
        alert('Could not retry sending message: ' + (innerErr.message || err.message || 'Unknown error'));
      }
    }
  };

  const handleScrollToMessage = (messageId: string) => {
    setIsMobileDrawerOpen(false);
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      handleToggleMessageTap(messageId);
    }
  };

  const handleCreateDirectMessage = async (userId: string) => {
    const cleanName = userId.replace('@', '').split(':')[0] || 'Contact';
    let resolvedRoomId = userId;
    if (matrixToken) {
      try {
        resolvedRoomId = await matrixCreateDirectRoom(userId, matrixToken);
      } catch (err: any) {
        console.warn('Direct room creation note:', err);
      }
    }
    const newDmChannel: Channel = {
      id: `ch-dm-${Date.now()}`,
      spaceId: 'space-dm', // Internal grouping label, not a Matrix Space
      name: cleanName,
      category: 'DIRECT MESSAGES',
      type: 'text',
      matrixRoomId: resolvedRoomId,
      topic: `Direct message with ${userId}`,
      lastMessage: 'Chat started',
      isDirect: true,
    };
    setChannels((prev) => [newDmChannel, ...prev.filter((c) => c.matrixRoomId !== userId)]);
    setActiveChannelId(newDmChannel.id);
    setIsCreateDmOpen(false);
  };

  const handleDeleteRoomChat = async (room: Channel) => {
    setConfirmLeaveRoom(room);
  };

  const confirmLeave = async () => {
    if (!confirmLeaveRoom) return;
    setIsProcessingLeave(true);
    setErrorMessage(null);
    try {
      const token = localStorage.getItem('matrix_token') || localStorage.getItem('matrix_access_token');
      if (confirmLeaveRoom.matrixRoomId) {
        await matrixLeaveRoom(confirmLeaveRoom.matrixRoomId, token || undefined);
      }
      setChannels((prev) => prev.filter((c) => c.id !== confirmLeaveRoom.id));
      if (activeChannel?.id === confirmLeaveRoom.id) {
        const remaining = channels.filter((c) => c.id !== confirmLeaveRoom.id);
        setActiveChannelId(remaining[0]?.id || '');
      }
      setMessages((prev) => prev.filter((m) => m.channelId !== confirmLeaveRoom.id && m.channelId !== confirmLeaveRoom.matrixRoomId));
    } catch (err: any) {
      console.error('Failed to leave room:', err);
      setErrorMessage(err.message || 'Failed to leave room');
    } finally {
      setIsProcessingLeave(false);
      setConfirmLeaveRoom(null);
    }
  };

  const isMatrixChannel = Boolean(activeChannel?.matrixRoomId);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full h-[100dvh] max-h-[100dvh] bg-[#1e1f22] text-[#dbdee1] flex flex-col overflow-x-hidden overflow-hidden font-sans select-none antialiased"
    >
      {/* Floating In-App Banner Notification Toast */}
      {inAppToast && inAppToast.visible && (
        <div
          onClick={() => {
            handleNotificationItemClick(inAppToast.notification);
            setInAppToast(null);
          }}
          className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[90] bg-[#2b2d31] border border-[#5865f2] rounded-2xl shadow-2xl p-3 flex items-center gap-3 cursor-pointer animate-in slide-in-from-top-4 duration-200"
        >
          <div className="w-10 h-10 rounded-full bg-[#5865f2] text-white font-bold flex items-center justify-center shrink-0 shadow overflow-hidden">
            {inAppToast.notification.reactionEmoji ? (
              <span className="text-lg">{inAppToast.notification.reactionEmoji}</span>
            ) : (
              <MatrixAvatar
                mxcUrl={inAppToast.notification.senderAvatar}
                name={inAppToast.notification.senderName}
                size={40}
                className="w-full h-full rounded-full"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white truncate">
                {inAppToast.notification.title}
              </span>
              <span className="text-[10px] text-[#5865f2] font-semibold">#{inAppToast.notification.roomName}</span>
            </div>
            <p className="text-xs text-[#dbdee1] truncate mt-0.5">{inAppToast.notification.body}</p>
          </div>
        </div>
      )}

      {/* Main Container Wrapper */}
      <div className="flex-1 flex w-full h-full min-h-0 bg-[#1e1f22] overflow-hidden relative">
        <div className="w-full h-full flex flex-col md:flex-row relative overflow-hidden bg-[#313338]">
          {currentScreen === 'login' ? (
            showWelcome ? (
              <WelcomeScreen ready={!showSplash} onDone={() => setShowWelcome(false)} />
            ) : (
              <LoginScreen
                onLogin={handleMatrixLogin}
                onRegister={handleMatrixRegister}
                isLoading={isMatrixLoggingIn}
                errorMessage={matrixLoginError}
                onOpenAbout={() => setIsAboutOpen(true)}
              />
            )
          ) : (
            <div className="flex-1 flex relative w-full h-full overflow-hidden">
              {viewMode === 'desktop' && (
                <div className="hidden md:flex h-full shrink-0">
                  <SpacesRail
                    rooms={channels}
                    activeRoomId={activeChannel?.id || ''}
                    onSelectRoom={(id) => {
                      const ch = channels.find((c) => c.id === id);
                      if (ch) setActiveChannelId(ch.id);
                    }}
                    onOpenCreateDm={() => setIsCreateDmOpen(true)}
                    onDeleteRoom={handleDeleteRoomChat}
                    currentUsername={matrixDisplayName}
                    currentUserAvatar={userAvatarUrl || currentUser?.photoURL || undefined}
                    themeMode={themeMode}
                    roomsError={roomsError}
                    onRetryLoadRooms={handleRetryLoadRooms}
                  />
                  <ChannelsDrawer
                    activeRoom={activeChannel}
                    channels={channels}
                    activeRoomId={activeChannel?.id}
                    onSelectRoom={(id) => {
                      const ch = channels.find((c) => c.id === id);
                      if (ch) setActiveChannelId(ch.id);
                    }}
                    contactName={activeChannel?.name || ''}
                    messages={messages}
                    starredMessageIds={starredMessageIds}
                    onScrollToMessage={handleScrollToMessage}
                    onOpenCreateDm={() => setIsCreateDmOpen(true)}
                    currentUser={currentUser}
                    matrixUserId={matrixUsername}
                    matrixDisplayName={matrixDisplayName || currentUser?.displayName || 'WHO'}
                    onLogout={handleLogoutApp}
                    onOpenSettings={() => {
                      triggerHaptic();
                      setIsSettingsOpen(true);
                    }}
                    onOpenUserProfile={() => {
                      triggerHaptic();
                      setSelectedUserProfile({
                        userName: matrixDisplayName || currentUser?.displayName || 'WHO',
                        userId: matrixUsername,
                        userAvatar: userAvatarUrl || currentUser?.photoURL || undefined,
                        avatarColor: 'bg-[#5865f2]',
                        isCurrentUser: true,
                      });
                    }}
                    onOpenNotifications={() => {
                      triggerHaptic();
                      setIsNotificationsOpen(true);
                    }}
                    unreadNotificationsCount={unreadNotificationsCount}
                    themeMode={themeMode}
                    userAvatarUrl={userAvatarUrl}
                    roomsError={roomsError}
                    onRetryLoadRooms={handleRetryLoadRooms}
                  />
                </div>
              )}

              {isMobileDrawerOpen && (
                <div
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="fixed inset-0 bg-black/70 backdrop-blur-2xs z-40 transition-opacity animate-in fade-in"
                />
              )}

              <div
                className={`fixed top-0 bottom-0 left-0 z-50 flex shadow-2xl transition-transform duration-250 ease-out bg-[#2b2d31] ${
                  isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                style={{ width: '85%', maxWidth: '340px' }}
              >
                <SpacesRail
                  rooms={channels}
                  activeRoomId={activeChannel?.id || ''}
                  onSelectRoom={(id) => {
                    const ch = channels.find((c) => c.id === id);
                    if (ch) setActiveChannelId(ch.id);
                    setIsMobileDrawerOpen(false);
                  }}
                  onOpenCreateDm={() => {
                    setIsMobileDrawerOpen(false);
                    setIsCreateDmOpen(true);
                  }}
                  onDeleteRoom={handleDeleteRoomChat}
                  currentUsername={matrixDisplayName}
                  currentUserAvatar={userAvatarUrl || currentUser?.photoURL || undefined}
                  themeMode={themeMode}
                  roomsError={roomsError}
                  onRetryLoadRooms={handleRetryLoadRooms}
                />
                <div className="flex-1 min-w-0 h-full overflow-hidden">
                  <ChannelsDrawer
                    activeRoom={activeChannel}
                    channels={channels}
                    activeRoomId={activeChannel?.id}
                    onSelectRoom={(id) => {
                      const ch = channels.find((c) => c.id === id);
                      if (ch) setActiveChannelId(ch.id);
                      setIsMobileDrawerOpen(false);
                    }}
                    contactName={activeChannel?.name || ''}
                    messages={messages}
                    starredMessageIds={starredMessageIds}
                    onScrollToMessage={(msgId) => {
                      handleScrollToMessage(msgId);
                      setIsMobileDrawerOpen(false);
                    }}
                    onOpenCreateDm={() => {
                      setIsMobileDrawerOpen(false);
                      setIsCreateDmOpen(true);
                    }}
                    currentUser={currentUser}
                    matrixUserId={matrixUsername}
                    matrixDisplayName={matrixDisplayName || currentUser?.displayName || 'WHO'}
                    onLogout={handleLogoutApp}
                    onOpenSettings={() => {
                      triggerHaptic();
                      setIsSettingsOpen(true);
                    }}
                    onOpenUserProfile={() => {
                      triggerHaptic();
                      setIsMobileDrawerOpen(false);
                      setSelectedUserProfile({
                        userName: matrixDisplayName || currentUser?.displayName || 'WHO',
                        userId: matrixUsername,
                        userAvatar: userAvatarUrl || currentUser?.photoURL || undefined,
                        avatarColor: 'bg-[#5865f2]',
                        isCurrentUser: true,
                      });
                    }}
                    onOpenNotifications={() => {
                      triggerHaptic();
                      setIsMobileDrawerOpen(false);
                      setIsNotificationsOpen(true);
                    }}
                    unreadNotificationsCount={unreadNotificationsCount}
                    themeMode={themeMode}
                    userAvatarUrl={userAvatarUrl}
                    roomsError={roomsError}
                    onRetryLoadRooms={handleRetryLoadRooms}
                  />
                </div>
              </div>

              {/* Main Chat & Content Area */}
              <main className="flex-1 flex flex-col bg-[#313338] min-w-0 h-full overflow-hidden">
                {/* Top Navigation Bar in Chat Area */}
                <div className="pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))] sm:h-[calc(3rem+env(safe-area-inset-top))] border-b border-[#202225] px-3 sm:px-4 flex items-center justify-between bg-[#2b2d31] shrink-0 shadow-xs z-10 relative">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <button
                      onClick={() => {
                        triggerHaptic();
                        setIsMobileDrawerOpen(!isMobileDrawerOpen);
                      }}
                      className="min-w-[44px] min-h-[44px] -ml-2 text-[#b5bac1] hover:text-white hover:bg-[#35373c] rounded-xl transition-colors relative flex items-center justify-center cursor-pointer"
                      title="Open Channels and Direct Messages Drawer"
                      aria-label="Toggle Navigation Drawer"
                    >
                      <Menu className="w-5 h-5 text-[#dbdee1]" />
                      {globalUnreadCount > 0 && (
                        <span className="absolute top-2 right-2 bg-[#f23f43] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-md animate-pulse">
                          {globalUnreadCount > 99 ? '99+' : globalUnreadCount}
                        </span>
                      )}
                    </button>

                    {isSearchOpen ? (
                      <div className="flex-1 flex items-center gap-2 bg-[#1e1f22] px-2.5 py-1.5 rounded-xl border border-[#3f4147] animate-in fade-in">
                        <button
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="min-w-[32px] min-h-[32px] flex items-center justify-center text-[#949ba4] hover:text-white cursor-pointer"
                          title="Exit Search"
                          aria-label="Back"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <Search className="w-4 h-4 text-[#949ba4] shrink-0" />
                        <input
                          type="text"
                          placeholder="Search room history..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-transparent text-sm text-white placeholder-[#949ba4] focus:outline-none flex-1 min-w-0"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 truncate text-[#f2f3f5] min-w-0">
                        {activeChannel?.isDirect ? (
                          <div className="relative shrink-0">
                            <MatrixAvatar
                              mxcUrl={activeChannelPartnerAvatar || activeChannel?.thumbnailLink}
                              name={resolveChannelTitle(activeChannel)}
                              size={32}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-1 ring-white/10 shadow-sm"
                            />
                          </div>
                        ) : (
                          <Hash className="w-4 h-4 text-[#949ba4] shrink-0" />
                        )}
                        <span className="font-semibold text-white text-sm sm:text-[15px] truncate">
                          {resolveChannelTitle(activeChannel)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Top Bar Actions */}
                  <div className="flex items-center gap-1 text-[#b5bac1] relative shrink-0">
                    {/*
                      EXACT SPECIFICATION 1 & 2:
                      - Replace the header's bell icon with a single, minimal monochrome lock icon (clean vector icon, no colored emoji).
                      - Dynamic Lock State:
                        * Unverified / Keys untrusted: Display an unlocked icon state (minimal open padlock / Unlock).
                        * Verified: Display a locked icon state (minimal closed padlock / Lock).
                      - When tapped, open the "Encryption & Verification" modal/bottom sheet.
                    */}
                    <button
                      type="button"
                      onClick={() => setIsE2EEDebugOpen(true)}
                      className="min-w-[40px] min-h-[40px] px-2 rounded-xl flex items-center justify-center text-[#dbdee1] hover:bg-[#35373c] transition-colors cursor-pointer"
                      title={
                        isCurrentRoomEncrypted === null
                          ? "Checking room encryption..."
                          : isCurrentRoomEncrypted
                          ? "End-to-end encrypted room"
                          : "Encryption not enabled"
                      }
                      aria-label={
                        isCurrentRoomEncrypted === null
                          ? "Checking room encryption..."
                          : isCurrentRoomEncrypted
                          ? "End-to-end encrypted room"
                          : "Encryption not enabled"
                      }
                    >
                      {isCurrentRoomEncrypted === null ? (
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Lock className="w-4 h-4 text-zinc-400 animate-pulse" />
                          <span className="text-[11px] font-medium hidden sm:inline text-zinc-400">Checking...</span>
                        </div>
                      ) : isCurrentRoomEncrypted ? (
                        <Lock className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Unlock className="w-5 h-5 text-rose-400" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setIsSearchOpen(!isSearchOpen);
                        if (isSearchOpen) setSearchQuery('');
                      }}
                      className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:text-white transition-colors cursor-pointer ${
                        isSearchOpen ? 'bg-[#35373c] text-white' : ''
                      }`}
                      title="Search messages"
                      aria-label="Search messages"
                    >
                      <Search className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => setIsOverflowMenuOpen(!isOverflowMenuOpen)}
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
                      title="More Options"
                      aria-label="More Options"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {isOverflowMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsOverflowMenuOpen(false)}
                        />
                        <div className="absolute right-0 top-12 w-48 bg-[#2b2d31] border border-[#3f4147] rounded-2xl shadow-2xl py-1.5 z-50 text-[#f2f3f5] text-sm animate-in fade-in zoom-in-95 duration-100">
                          <button
                            onClick={handleOpenDetails}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#35373c] hover:text-white transition-colors flex items-center gap-3 cursor-pointer min-h-[44px]"
                          >
                            <User className="w-4 h-4 text-[#949ba4]" />
                            <span className="font-medium">Details</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsOverflowMenuOpen(false);
                              setIsJumpToDateOpen(true);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#35373c] hover:text-white transition-colors flex items-center gap-3 cursor-pointer min-h-[44px]"
                          >
                            <Calendar className="w-4 h-4 text-[#949ba4]" />
                            <span className="font-medium">Jump to date</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsOverflowMenuOpen(false);
                              setIsLeaveConfirmOpen(true);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#35373c] hover:text-amber-400 transition-colors flex items-center gap-3 cursor-pointer min-h-[44px]"
                          >
                            <LogOut className="w-4 h-4 text-amber-400" />
                            <span className="font-medium">Leave Room</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsOverflowMenuOpen(false);
                              setIsBlockConfirmOpen(true);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#35373c] hover:text-red-400 transition-colors flex items-center gap-3 cursor-pointer min-h-[44px]"
                          >
                            <Ban className="w-4 h-4 text-red-400" />
                            <span className="font-medium text-red-400">Block User</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Main Content Body */}
                {!activeChannel ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#949ba4] bg-[#313338]">
                    <div className="w-16 h-16 rounded-full bg-[#1e1f22] border border-[#35363c] flex items-center justify-center mb-4 text-[#949ba4]">
                      <MessageSquare className="w-8 h-8 text-[#5865f2]" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1.5">
                      No conversations yet. Tap + to start a chat
                    </h3>
                    <p className="text-xs text-[#949ba4] max-w-sm mb-5">
                      Enter a Matrix ID (e.g. @contact:matrix.org) to start a private 1-on-1 encrypted chat.
                    </p>
                    <button
                      onClick={() => setIsCreateDmOpen(true)}
                      className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-sm font-semibold shadow-md transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Start Direct Message</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 bg-[#313338] relative">
                    {(matrixSyncState === 'RECONNECTING' || matrixSyncState === 'ERROR' || matrixSyncState === 'STOPPED') && (
                      <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs py-1.5 px-3 flex items-center justify-center gap-2 font-medium z-20 shrink-0">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Reconnecting…</span>
                      </div>
                    )}
                    <div
                      ref={timelineContainerRef}
                      onScroll={(e) => {
                        if (e.currentTarget.scrollTop <= 80 && hasMoreHistory && !isLoadingMore) {
                          loadOlderMessages();
                        }
                      }}
                      className="flex-1 overflow-y-auto overflow-x-hidden pt-3 sm:pt-4 pb-4 px-1 sm:px-2 space-y-0.5 no-scrollbar scroll-smooth overscroll-contain"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {hasMoreHistory && (
                        <div className="flex items-center justify-center pt-2 pb-1 px-3 my-1">
                          <button
                            onClick={() => loadOlderMessages(3)}
                            disabled={isLoadingMore}
                            className="px-3.5 py-1.5 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] active:scale-95 text-xs text-[#5865f2] hover:text-white font-medium border border-[#3f4147] transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoadingMore ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5865f2]" />
                                <span>Loading older messages…</span>
                              </>
                            ) : (
                              <>
                                <ArrowUp className="w-3.5 h-3.5 text-[#5865f2]" />
                                <span>Load older messages</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      <div className="px-3 sm:px-4 py-4 sm:py-6 mb-2">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#4e5058] flex items-center justify-center mb-3 text-white font-bold text-xl sm:text-2xl shadow-md">
                          {activeChannel?.isDirect ? '@' : '#'}
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-[#f2f3f5] mb-1">
                          {activeChannel?.isDirect
                            ? `Welcome to your chat with ${resolveChannelTitle(activeChannel)}!`
                            : `Welcome to #${resolveChannelTitle(activeChannel)}!`}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#949ba4] max-w-lg">
                          {activeChannel?.isDirect
                            ? `This is the start of your direct encrypted conversation with ${resolveChannelTitle(activeChannel)}. End-to-end encrypted with Megolm v1 AES-SHA2.`
                            : `This is the start of the #${resolveChannelTitle(activeChannel)} channel. End-to-end encrypted with Megolm v1 AES-SHA2.`}
                        </p>
                      </div>

                      <div className="relative flex items-center justify-center my-3 mx-3">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-[#3f4147]" />
                        </div>
                        <span className="relative px-2.5 bg-[#313338] text-[10px] sm:text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">
                          Live Encrypted Stream
                        </span>
                      </div>

                      {currentChannelMessages.map((msg, idx) => {
                        const prevMsg = idx > 0 ? currentChannelMessages[idx - 1] : undefined;
                        const showDateDivider = !prevMsg || !isSameDay(msg.ts, prevMsg.ts);
                        const dateText = formatDateDivider(msg.ts);

                        return (
                          <React.Fragment key={`${msg.id}-${idx}`}>
                            {showDateDivider && dateText && (
                              <div className="relative flex items-center justify-center my-3 mx-3">
                                <div className="absolute inset-0 flex items-center">
                                  <div className="w-full border-t border-[#3f4147]" />
                                </div>
                                <span className="relative px-2.5 bg-[#313338] text-xs font-semibold text-[#949ba4]">
                                  {dateText}
                                </span>
                              </div>
                            )}
                            <MessageItem
                              key={`${msg.id}-${idx}`}
                              message={msg}
                              matrixRoomId={activeChannel?.matrixRoomId}
                              isStarred={starredMessageIds.has(msg.id)}
                              isEditing={editingMessageId === msg.id}
                              isJumpHighlighted={jumpMessageHighlightId === msg.id}
                              nameColor={nameColorMap[msg.userId]}
                              currentUserAvatar={userAvatarUrl}
                              currentUserDisplayName={matrixDisplayName}
                              onTap={handleToggleMessageTap}
                              onLongPress={(m) => setSelectedMessage(m)}
                              onToggleStar={handleToggleStarMessage}
                              onAddReaction={handleAddReaction}
                              onReplyClick={handleScrollToMessage}
                              onReply={handleReplyMessage}
                              onRetry={handleRetryMessage}
                              onCancelSending={handleDeleteMessage}
                              onUserClick={(user) => setSelectedUserProfile(user)}
                              onOpenE2EEDebug={() => setIsE2EEDebugOpen(true)}
                              onOpenRestoreModal={() => setIsAutoRestoreModalOpen(true)}
                              onOpenAttachment={(attachment) => {
                                if (attachment.webViewLink) {
                                  window.open(attachment.webViewLink, '_blank');
                                }
                              }}
                            />
                          </React.Fragment>
                        );
                      })}
                      <div ref={timelineEndRef} className="h-2" />
                    </div>

                    {!cryptoReady && matrixToken && (
                      <div className="mx-3 sm:mx-4 my-2 px-3.5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Encryption failed to start, sending is disabled</span>
                      </div>
                    )}

                    {deliveryError && (
                      <div className="mx-3 sm:mx-4 my-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center justify-between shadow-md animate-in fade-in">
                        <span className="font-medium">Message delivery failed: {deliveryError}</span>
                        <button
                          onClick={() => setDeliveryError(null)}
                          className="min-w-[32px] min-h-[32px] flex items-center justify-center text-red-300 hover:text-white font-bold ml-2 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {unencryptedMediaRoomId && (
                      <div className="mx-3 sm:mx-4 my-2 px-3.5 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in gap-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Media can only be sent in end-to-end encrypted rooms</span>
                        </div>
                        <button
                          onClick={async () => {
                            if (unencryptedMediaRoomId) {
                              const success = await matrixEnsureRoomEncrypted(unencryptedMediaRoomId);
                              if (success) {
                                setUnencryptedMediaRoomId(null);
                                setDeliveryError(null);
                                processUploadQueue();
                              }
                            }
                          }}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold transition-all text-[11px] shrink-0 active:scale-95 cursor-pointer shadow-sm"
                        >
                          Enable Encryption
                        </button>
                      </div>
                    )}

                    {/* Live Typing Indicator */}
                    {typingUsers.length > 0 && (
                      <div
                        className="px-3 sm:px-4 py-2 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200 select-none bg-[#313338]"
                        aria-live="polite"
                      >
                        {/* Circular Avatar on the left */}
                        <div className="relative shrink-0">
                          <MatrixAvatar
                            mxcUrl={typingUsers[0].avatarUrl}
                            name={typingUsers[0].name}
                            size={32}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-1 ring-white/10 shadow-sm"
                          />
                          {typingUsers.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 bg-[#5865f2] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#313338]">
                              +{typingUsers.length - 1}
                            </span>
                          )}
                        </div>

                        {/* Small, pill-shaped RCS chat bubble with three distinct bouncing dots */}
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#2b2d31] border border-[#3f4147]/70 shadow-sm shrink-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-rcs-bounce inline-block shrink-0"
                            style={{
                              width: '6px',
                              height: '6px',
                              minWidth: '6px',
                              minHeight: '6px',
                              borderRadius: '9999px',
                              backgroundColor: '#9ca3af',
                              animationDelay: '0ms',
                            }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-rcs-bounce inline-block shrink-0"
                            style={{
                              width: '6px',
                              height: '6px',
                              minWidth: '6px',
                              minHeight: '6px',
                              borderRadius: '9999px',
                              backgroundColor: '#9ca3af',
                              animationDelay: '150ms',
                            }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-rcs-bounce inline-block shrink-0"
                            style={{
                              width: '6px',
                              height: '6px',
                              minWidth: '6px',
                              minHeight: '6px',
                              borderRadius: '9999px',
                              backgroundColor: '#9ca3af',
                              animationDelay: '300ms',
                            }}
                          />
                        </div>

                        {/* Restored visible display text identifying who is typing */}
                        <span className="text-xs text-[#949ba4] font-medium truncate">
                          <strong className="text-[#dbdee1] font-semibold">
                            {typingUsers.length === 1
                              ? typingUsers[0].name
                              : typingUsers.length === 2
                              ? `${typingUsers[0].name} and ${typingUsers[1].name}`
                              : `${typingUsers[0].name} and ${typingUsers.length - 1} others`}
                          </strong>{' '}
                          {typingUsers.length === 1 ? 'is typing...' : 'are typing...'}
                        </span>
                      </div>
                    )}

                    {replyingToMessage && (
                      <div className="mx-3 sm:mx-4 mb-2 px-3 py-2 bg-[#2b2d31] border border-[#5865f2] rounded-xl flex items-center justify-between text-xs animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <Reply className="w-4 h-4 text-[#5865f2] shrink-0" />
                          <span className="font-semibold text-[#5865f2] shrink-0">
                            Replying to @{replyingToMessage.userName}
                          </span>
                          <span className="text-[#dbdee1] truncate max-w-xs sm:max-w-md">
                            {replyingToMessage.content}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className="min-h-[36px] px-2 text-[#949ba4] hover:text-white font-semibold cursor-pointer flex items-center shrink-0 ml-2"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {editingMessageId && (
                      <div className="mx-3 sm:mx-4 mb-2 px-3 py-2 bg-[#232428] border border-[#5865f2] rounded-xl flex items-center justify-between text-xs animate-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-[#5865f2]" />
                          <span className="font-semibold text-[#5865f2]">
                            Editing message
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelEditing}
                          className="min-h-[36px] px-2 text-[#949ba4] hover:text-white font-semibold cursor-pointer flex items-center"
                        >
                          Cancel
                        </button>
                      </div>
                    )}


                    <div className="px-3 sm:px-4 pt-1.5 pb-2.5 sm:pb-3.5 bg-[#313338] relative shrink-0 border-t border-[#232428]/40 pb-safe">
                      {isAttachmentDrawerOpen && (
                        <>
                          <div
                            className="fixed inset-0 bg-black/60 backdrop-blur-2xs z-40"
                            onClick={() => setIsAttachmentDrawerOpen(false)}
                          />
                          <div className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 z-50 bg-[#2b2d31] border border-[#3f4147] rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom duration-200 max-h-[70vh] overflow-y-auto">
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-[#b5bac1] uppercase tracking-wider">
                                  Recent Media
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto no-scrollbar">
                                <label className="bg-[#1e1f22] hover:bg-[#35373c] active:scale-95 rounded-xl aspect-square flex flex-col items-center justify-center cursor-pointer relative group transition-all border border-[#3f4147] min-h-[44px]">
                                  <ImageIcon className="w-6 h-6 text-[#949ba4] group-hover:text-white transition-colors" />
                                  <span className="text-[10px] text-[#949ba4] mt-1 font-medium">Photos</span>
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileAttachmentSelect}
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="bg-[#1e1f22] rounded-xl p-2 flex items-center justify-around border border-[#3f4147]">
                              <button
                                type="button"
                                onClick={handleShareLocation}
                                className="flex flex-col items-center gap-1 text-[#b5bac1] hover:text-white cursor-pointer transition-colors p-2 rounded-xl hover:bg-[#2b2d31] min-w-[56px] min-h-[44px]"
                                title="Share Location"
                              >
                                <MapPin className="w-5 h-5 text-gray-400" />
                                <span className="text-[11px] font-medium">Location</span>
                              </button>
                              <label className="flex flex-col items-center gap-1 text-[#b5bac1] hover:text-white cursor-pointer transition-colors p-2 rounded-xl hover:bg-[#2b2d31] min-w-[56px] min-h-[44px]">
                                <Paperclip className="w-5 h-5 text-gray-400" />
                                <span className="text-[11px] font-medium">Files</span>
                                <input
                                  type="file"
                                  accept="*/*"
                                  multiple
                                  className="hidden"
                                  onChange={handleFileAttachmentSelect}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={handleShareContact}
                                className="flex flex-col items-center gap-1 text-[#b5bac1] hover:text-white cursor-pointer transition-colors p-2 rounded-xl hover:bg-[#2b2d31] min-w-[56px] min-h-[44px]"
                                title="Share Contact"
                              >
                                <UserCheck className="w-5 h-5 text-gray-400" />
                                <span className="text-[11px] font-medium">Contacts</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {isEmojiPickerOpen && (
                        <>
                          <div
                            className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-40"
                            onClick={() => setIsEmojiPickerOpen(false)}
                          />
                          <div className="fixed sm:absolute bottom-20 left-3 right-3 sm:left-auto sm:right-0 sm:bottom-full sm:mb-2 z-50 bg-[#2b2d31] border border-[#3f4147] rounded-2xl shadow-2xl p-3 max-w-sm sm:w-72 mx-auto sm:mx-0 animate-in fade-in zoom-in-95 duration-150">
                            <div className="text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setIsEmojiPickerOpen(false)}
                                className="min-w-[28px] min-h-[28px] flex items-center justify-center text-[#949ba4] hover:text-white rounded-lg cursor-pointer"
                                title="Close"
                                aria-label="Back"
                              >
                                <ArrowLeft className="w-4 h-4" />
                              </button>
                              <span>Emojis</span>
                            </div>
                            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto no-scrollbar">
                              {['😀', '😂', '🔥', '👍', '❤️', '🎉', '🚀', '⭐', '👏', '🙌', '😎', '💡', '💻', '🔒', '🔑', '✅'].map((emoji, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setInputContent((prev) => prev + emoji);
                                    chatInputRef.current?.focus();
                                  }}
                                  className="w-8 h-8 sm:w-7 sm:h-7 min-w-[32px] min-h-[32px] flex items-center justify-center text-lg hover:bg-[#35373c] active:scale-95 rounded-lg transition-transform cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {recorderState === 'recording' || recorderState === 'locked' ? (
                        <div className="flex w-full items-center gap-2 max-w-5xl mx-auto">
                          {/* Recording bar: same height (~52px) and radius (rounded-full) */}
                          <div
                            className={`flex-1 min-w-0 flex items-center min-h-[52px] h-[52px] rounded-full px-3 sm:px-4 shadow-lg transition-colors gap-2.5 sm:gap-3 overflow-hidden ${
                              themeMode === 'dark' ? 'bg-[#2b2d31] text-white' : 'bg-[#f0f0f3] text-slate-900'
                            }`}
                          >
                            {/* Left: Trash2 icon button (cancels and discards recording) */}
                            <button
                              type="button"
                              onClick={cancelVoiceRecording}
                              style={{ touchAction: 'manipulation' }}
                              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[#949ba4] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 active:scale-95"
                              title="Discard recording"
                              aria-label="Discard recording"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>

                            {/* Pulsing red dot + Elapsed time in m:ss */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] animate-pulse shrink-0" />
                              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider select-none">
                                {formatTimer(recordingDuration)}
                              </span>
                            </div>

                            {/* LIVE waveform that fills remaining width */}
                            <div className="flex-1 flex items-center justify-center min-w-0 px-1 sm:px-2 overflow-hidden">
                              <LiveAudioWaveform stream={mediaStreamRef.current} themeMode={themeMode} />
                            </div>
                          </div>

                          {/* Right: circular Send button (40px on screens under 400px, 52px on >= 400px) */}
                          <button
                            type="button"
                            onClick={() => stopVoiceRecordingAndSend()}
                            style={{ touchAction: 'manipulation' }}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] min-[400px]:w-[52px] min-[400px]:h-[52px] min-[400px]:min-w-[52px] min-[400px]:min-h-[52px] rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white flex items-center justify-center cursor-pointer shadow-md active:scale-95 transition-all duration-150 shrink-0"
                            title="Send voice message"
                            aria-label="Send voice message"
                          >
                            <Send className="w-5 h-5 ml-0.5" />
                          </button>
                        </div>
                      ) : recorderState === 'reviewing' ? (
                        <div className="flex w-full items-center gap-2 max-w-5xl mx-auto">
                          <div
                            className={`flex-1 min-w-0 flex items-center justify-between min-h-[52px] h-[52px] rounded-full px-4 shadow-lg transition-colors ${
                              themeMode === 'dark' ? 'bg-[#2b2d31] text-white' : 'bg-[#f0f0f3] text-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold truncate">
                                Voice Message ({formatTimer(recordingDuration)})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={cancelVoiceRecording}
                              style={{ touchAction: 'manipulation' }}
                              className="px-3 py-1.5 text-xs text-[#949ba4] hover:text-red-400 font-semibold cursor-pointer rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                            >
                              Discard
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => stopVoiceRecordingAndSend()}
                            style={{ touchAction: 'manipulation' }}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] min-[400px]:w-[52px] min-[400px]:h-[52px] min-[400px]:min-w-[52px] min-[400px]:min-h-[52px] rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white flex items-center justify-center cursor-pointer shadow-md active:scale-95 transition-all duration-150 shrink-0"
                            title="Send voice message"
                            aria-label="Send voice message"
                          >
                            <Send className="w-5 h-5 ml-0.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex w-full flex-col gap-2 max-w-5xl mx-auto">
                          {/* Error banner for attachment limits */}
                          {attachmentError && (
                            <div className="mx-1 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 shadow-md animate-in fade-in">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>{attachmentError}</span>
                            </div>
                          )}

                          {/* Horizontal scrollable pending attachments strip */}
                          {pendingAttachments.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto py-2 px-1.5 no-scrollbar max-w-full w-full select-none animate-in fade-in slide-in-from-bottom-2 self-start">
                              {pendingAttachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="relative w-16 h-16 rounded-xl overflow-hidden bg-[#2b2d31]/90 border border-[#3f4147] flex items-center justify-center shrink-0 group shadow-md"
                                >
                                  {att.kind === 'image' && (
                                    <img src={att.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                  )}
                                  {att.kind === 'video' && (
                                    <>
                                      {att.thumbUrl ? (
                                        <img src={att.thumbUrl} alt="Video preview" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full bg-[#1e1f22] flex items-center justify-center">
                                          <Video className="w-4 h-4 text-[#949ba4]" />
                                        </div>
                                      )}
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                        <div className="w-5 h-5 rounded-full bg-black/45 flex items-center justify-center text-white">
                                          <Play className="w-2.5 h-2.5 fill-white ml-0.5" />
                                        </div>
                                      </div>
                                      {att.videoDuration !== undefined && (
                                        <div className="absolute bottom-0.5 left-0.5 bg-black/75 px-1 py-0.2 rounded-[3px] text-[7px] font-bold text-white font-mono leading-none scale-90 origin-bottom-left">
                                          {formatVideoDuration(att.videoDuration)}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {att.kind === 'audio' && (
                                    <div className="flex flex-col items-center justify-center w-full h-full p-1 bg-[#1e1f22]/40">
                                      <Volume2 className="w-4 h-4 text-[#5865f2] mb-0.5 shrink-0" />
                                      <span className="text-[7px] font-semibold text-[#b5bac1] truncate max-w-full px-0.5 text-center leading-none">
                                        {att.file.name}
                                      </span>
                                    </div>
                                  )}
                                  {att.kind === 'file' && (
                                    <div className="flex flex-col items-center justify-center w-full h-full p-1 bg-[#1e1f22]/40">
                                      <FileText className="w-4 h-4 text-emerald-400 mb-0.5 shrink-0" />
                                      <span className="text-[7px] font-semibold text-[#b5bac1] truncate max-w-full px-0.5 text-center leading-none">
                                        {att.file.name}
                                      </span>
                                    </div>
                                  )}

                                  {/* Remove button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removePendingAttachment(att.id);
                                    }}
                                    className="absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
                                    title="Remove item"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}

                              {/* Plus thumbnail inside strip to add more files */}
                              {pendingAttachments.length < 10 && (
                                <>
                                  <input
                                    ref={addMoreFilesInputRef}
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileAttachmentSelect}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (addMoreFilesInputRef.current) {
                                        addMoreFilesInputRef.current.click();
                                      }
                                    }}
                                    className="w-16 h-16 rounded-xl border-2 border-dashed border-[#3f4147] hover:border-[#5865f2] hover:bg-[#35373c]/20 flex flex-col items-center justify-center text-[#949ba4] hover:text-white transition-all cursor-pointer shrink-0"
                                    title="Add more files"
                                  >
                                    <Plus className="w-5 h-5" />
                                    <span className="text-[8px] font-bold mt-0.5 leading-none">ADD MORE</span>
                                  </button>
                                </>
                              )}

                              {/* Multi-file badge count */}
                              {pendingAttachments.length > 1 && (
                                <div className="ml-auto shrink-0 bg-[#5865f2] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-md">
                                  {pendingAttachments.length} Files Selected
                                </div>
                              )}
                            </div>
                          )}

                          {/* Message input pill and Send/Voice buttons row */}
                          <div className="flex w-full items-center gap-2">
                            {/* Idle state: Rounded-full Pill Input Row (height ~52px) */}
                            <form
                              onSubmit={handleSendMessage}
                              className={`flex-1 min-w-0 flex items-center min-h-[52px] h-[52px] rounded-full px-2 sm:px-3 transition-colors ${
                                themeMode === 'dark' ? 'bg-[#2b2d31] text-white' : 'bg-[#f0f0f3] text-slate-900'
                              }`}
                            >
                              {/* Left: circular "+" for attachments */}
                              <button
                                type="button"
                                onClick={() => setIsAttachmentDrawerOpen(!isAttachmentDrawerOpen)}
                                style={{ touchAction: 'manipulation' }}
                                className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 ${
                                  isAttachmentDrawerOpen
                                    ? 'bg-[#5865f2] text-white'
                                    : themeMode === 'dark'
                                    ? 'bg-[#383a40] text-[#dbdee1] hover:text-white hover:bg-[#404249]'
                                    : 'bg-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-300'
                                }`}
                                title="Open attachments"
                                aria-label="Toggle attachments"
                              >
                                <Plus className="w-5 h-5" />
                              </button>

                              {/* Middle: text input */}
                              <input
                                ref={chatInputRef}
                                type="text"
                                value={inputContent}
                                onChange={handleInputChange}
                                placeholder="Message"
                                className={`flex-1 min-w-0 w-full bg-transparent text-sm sm:text-base focus:outline-hidden py-2 px-2.5 select-text ${
                                  themeMode === 'dark' ? 'text-[#f2f3f5] placeholder-[#80848e]' : 'text-slate-900 placeholder-slate-400'
                                }`}
                              />

                              {/* Right inside the pill: Emoji & Image icons (hidden if text is long) */}
                              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                                {inputContent.length <= 35 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsEmojiPickerOpen(!isEmojiPickerOpen);
                                      if (isAttachmentDrawerOpen) setIsAttachmentDrawerOpen(false);
                                    }}
                                    style={{ touchAction: 'manipulation' }}
                                    className={`w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 active:scale-95 ${
                                      isEmojiPickerOpen
                                        ? 'text-[#5865f2] bg-[#5865f2]/10'
                                        : themeMode === 'dark'
                                        ? 'text-[#949ba4] hover:text-white'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                    title="Emoji Picker"
                                    aria-label="Select emoji"
                                  >
                                    <Smile className="w-5 h-5" />
                                  </button>
                                )}

                                {inputContent.length <= 18 && recorderState === 'idle' && !recordedAudioBlob && (
                                  <button
                                    type="button"
                                    onClick={() => handleTakePhotoAndSend()}
                                    style={{ touchAction: 'manipulation' }}
                                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 active:scale-95 ${
                                      themeMode === 'dark' ? 'text-[#949ba4] hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                    title="Take photo"
                                    aria-label="Take photo"
                                  >
                                    <Camera className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                            </form>

                            {/* Outside the pill on far right: circular button */}
                            {inputContent.trim().length > 0 || pendingAttachments.length > 0 ? (
                              <button
                                type="submit"
                                onClick={handleSendMessage}
                                style={{ touchAction: 'manipulation' }}
                                className="w-10 h-10 min-w-[40px] min-h-[40px] min-[400px]:w-[52px] min-[400px]:h-[52px] min-[400px]:min-w-[52px] min-[400px]:min-h-[52px] rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white flex items-center justify-center cursor-pointer shadow-md active:scale-95 transition-all duration-150 shrink-0"
                                title="Send Message"
                                aria-label="Send message"
                              >
                                <Send className="w-5 h-5 ml-0.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={startVoiceRecording}
                                style={{ touchAction: 'manipulation' }}
                                className="w-10 h-10 min-w-[40px] min-h-[40px] min-[400px]:w-[52px] min-[400px]:h-[52px] min-[400px]:min-w-[52px] min-[400px]:min-h-[52px] rounded-full bg-[#d3e3fd] hover:bg-[#c2d7fc] text-[#0b57d0] flex items-center justify-center cursor-pointer shadow-md active:scale-95 transition-all duration-150 shrink-0"
                                title="Record Voice Message"
                                aria-label="Record voice message"
                              >
                                <AudioLines className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </main>
            </div>
          )}
        </div>
      </div>

      <CreateDmModal
        isOpen={isCreateDmOpen}
        onClose={() => setIsCreateDmOpen(false)}
        onSubmit={handleCreateDirectMessage}
      />
      <MessageBottomSheetModal
        message={selectedMessage}
        isStarred={selectedMessage ? starredMessageIds.has(selectedMessage.id) : false}
        onClose={() => setSelectedMessage(null)}
        onQuickReaction={handleAddReaction}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onDeleteForEveryone={handleRedactForEveryone}
        onToggleStar={handleToggleStarMessage}
        onReply={handleReplyMessage}
        onForward={(m) => setForwardingMessage(m)}
        onShowInDownloads={() => {
          setSelectedMessage(null);
          setSettingsActiveTab('downloads');
          setIsSettingsOpen(true);
        }}
      />
      <ForwardPickerModal
        isOpen={Boolean(forwardingMessage)}
        message={forwardingMessage}
        channels={channels}
        themeMode={themeMode}
        onSend={handleForwardSend}
        onClose={() => setForwardingMessage(null)}
      />
      <E2EEDebugModal
        isOpen={isE2EEDebugOpen}
        onClose={() => setIsE2EEDebugOpen(false)}
        activeRoomId={activeChannel?.matrixRoomId}
      />
      <UserProfileModal
        user={selectedUserProfile}
        isInitialFriend={channels.some(
          (ch) =>
            Boolean(ch.isDirect || ch.type === 'text') &&
            selectedUserProfile &&
            (ch.name.toLowerCase().includes(selectedUserProfile.userName.toLowerCase()) ||
              ch.id.includes(selectedUserProfile.userId))
        )}
        onClose={() => setSelectedUserProfile(null)}
        activeNavTab="account"
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        hapticEnabled={isHapticEnabled}
        onToggleHaptic={handleToggleHaptic}
        triggerHaptic={triggerHaptic}
        onUpdateDisplayName={handleUpdateDisplayName}
        onUpdateAvatarUrl={handleUpdateAvatarUrl}
        onLogout={handleLogoutApp}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        activeRoomId={activeChannel?.matrixRoomId}
        chatFontSize={chatFontSize}
        onChatFontSizeChange={setChatFontSize}
        onOpenSettings={() => {
          triggerHaptic();
          setSelectedUserProfile(null);
          setSettingsActiveTab('security');
          setIsSettingsOpen(true);
        }}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsActiveTab}
        matrixUserId={matrixUsername}
        matrixDisplayName={matrixDisplayName}
        onUpdateDisplayName={handleUpdateDisplayName}
        currentUser={currentUser}
        onLogout={handleLogoutApp}
        hapticEnabled={isHapticEnabled}
        onToggleHaptic={handleToggleHaptic}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        triggerHaptic={triggerHaptic}
        userAvatarUrl={userAvatarUrl}
        onUpdateAvatarUrl={handleUpdateAvatarUrl}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        activeRoomId={activeChannel?.matrixRoomId}
        matrixToken={matrixToken}
        chatFontSize={chatFontSize}
        onChatFontSizeChange={setChatFontSize}
        onOpenAbout={() => { setIsSettingsOpen(false); setIsAboutOpen(true); }}
      />
      <BackupMessagesModal
        isOpen={isAutoBackupModalOpen}
        onClose={() => setIsAutoBackupModalOpen(false)}
        isAutoPrompt={true}
        onSkipAutoPrompt={() => {
          setHasSkippedBackupPrompt(true);
          setIsAutoBackupModalOpen(false);
        }}
        onSuccess={() => {
          setIsAutoBackupModalOpen(false);
        }}
        themeMode={themeMode}
      />
      <RestoreMessageHistoryModal
        isOpen={isAutoRestoreModalOpen}
        onClose={() => setIsAutoRestoreModalOpen(false)}
        isAutoPrompt={true}
        onSkipAutoPrompt={() => {
          setHasSkippedRestorePrompt(true);
          setIsAutoRestoreModalOpen(false);
        }}
        onSuccess={() => {
          setIsAutoRestoreModalOpen(false);
          setRoomRefreshKey((prev) => prev + 1);
        }}
        themeMode={themeMode}
      />
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        onClearAll={handleClearAllNotifications}
        onNotificationClick={handleNotificationItemClick}
        matrixToken={matrixToken}
        themeMode={themeMode}
        triggerHaptic={triggerHaptic}
      />
      {/* Leave Room and Block User Confirmation Dialogs */}
      <DestructiveConfirmModal
        isOpen={isLeaveConfirmOpen}
        title="Leave Room"
        itemName={resolveChannelTitle(activeChannel)}
        description={`Are you sure you want to leave ${resolveChannelTitle(activeChannel)}? You won't receive new messages from this room unless re-invited.`}
        confirmLabel="Leave Room"
        isProcessing={isLeavingRoom}
        onConfirm={handleConfirmLeaveRoom}
        onCancel={() => setIsLeaveConfirmOpen(false)}
      />
      <DestructiveConfirmModal
        isOpen={isBlockConfirmOpen}
        title="Block User"
        itemName={resolveChannelTitle(activeChannel)}
        description={`Are you sure you want to block ${resolveChannelTitle(activeChannel)}? Their messages and invites will be ignored.`}
        confirmLabel="Block User"
        isProcessing={isBlockingUser}
        onConfirm={handleConfirmBlockUser}
        onCancel={() => setIsBlockConfirmOpen(false)}
      />
      {/* Jump to Date Bottom Sheet Modal */}
      {isJumpToDateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full sm:max-w-md bg-[#2b2d31] border border-[#3f4147] rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 text-[#f2f3f5] animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Jump to date</h3>
              <button
                onClick={() => !isJumpingToDate && setIsJumpToDateOpen(false)}
                className="text-[#949ba4] hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#949ba4] uppercase mb-2">Select Date</label>
                <input
                  type="date"
                  value={jumpDateValue}
                  onChange={(e) => setJumpDateValue(e.target.value)}
                  disabled={isJumpingToDate}
                  className="w-full bg-[#1e1f22] border border-[#3f4147] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#5865f2]"
                />
              </div>
              {isJumpingToDate && (
                <div className="flex items-center gap-2 text-xs text-[#949ba4] font-medium py-2">
                  <div className="w-4 h-4 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin" />
                  <span>Loading older messages… (round {jumpRound})</span>
                </div>
              )}
              {jumpStatusMessage && !isJumpingToDate && (
                <div className="text-xs text-amber-400 font-medium py-1">
                  {jumpStatusMessage}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsJumpToDateOpen(false)}
                  disabled={isJumpingToDate}
                  className="px-4 py-2 rounded-xl bg-[#35373c] hover:bg-[#3f4147] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGoJumpToDate}
                  disabled={!jumpDateValue || isJumpingToDate}
                  className="px-5 py-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2"
                >
                  Go
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} onReplayWelcome={() => setIsWelcomeReplay(true)} />
      {isWelcomeReplay && (<div className="fixed inset-0 z-[400]"><WelcomeScreen ready onDone={() => setIsWelcomeReplay(false)} /></div>)}
      {confirmLeaveRoom && (
        <DestructiveConfirmModal
          isOpen={!!confirmLeaveRoom}
          title="Leave and delete this chat?"
          itemName={confirmLeaveRoom.name}
          description="You will lose access to its history."
          confirmLabel="Leave"
          isProcessing={isProcessingLeave}
          onConfirm={confirmLeave}
          onCancel={() => setConfirmLeaveRoom(null)}
        />
      )}
      {errorMessage && (
        <div className="fixed bottom-4 left-4 z-[90] bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-2 hover:text-red-200">✕</button>
        </div>
      )}
    </div>
  );
}
