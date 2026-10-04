export interface Channel {
  id: string;
  spaceId: string; // Internal grouping label ('space-dm' or 'space-matrix'), not Matrix Spaces
  name: string;
  category?: string;
  type: 'text';
  topic?: string;
  unread?: boolean;
  unreadCount?: number;
  matrixRoomId?: string;
  lastMessage?: string;
  isDirect?: boolean;
  thumbnailLink?: string;
  isEncrypted?: boolean;
}

export interface DriveFileAttachment {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

export type EncryptionLevel = 'verified' | 'encrypted' | 'warning' | 'unencrypted' | 'pending' | 'undecryptable';

export interface MessageEncryptionState {
  level: EncryptionLevel;
  reason?: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  avatarColor?: string;
  roleColor?: string;
  timestamp: string;
  content: string;
  isTapped?: boolean;
  isEdited?: boolean;
  isRedacted?: boolean;
  driveAttachment?: DriveFileAttachment;
  reactions?: Record<string, number>;
  myReactions?: Record<string, string>;
  replyTo?: {
    eventId: string;
    userName: string;
    userAvatar?: string;
    snippet: string;
  };
  isEncrypted?: boolean;
  isDecryptionFailure?: boolean;
  encryption?: MessageEncryptionState;
  msgtype?: string;
  mediaUrl?: string; // mxc
  mediaInfo?: { mimetype: string; size: number; duration?: number; w?: number; h?: number };
  encryptedFile?: any; // content.file
  thumbnailUrl?: string; // local or cached poster URL
  geoUri?: string;
  status?: 'sending' | 'queued' | 'sent' | 'failed';
  deliveryStatus?: 'sending' | 'sent' | 'read' | 'failed';
  uploadProgress?: number;
  txnId?: string;
  ts?: number;
}
