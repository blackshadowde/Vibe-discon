export function getMediaKind(params: {
  msgtype?: string;
  mimetype?: string;
  name?: string;
}): 'image' | 'video' | 'audio' | 'file' {
  const { msgtype, mimetype, name } = params;

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
  const videoExts = ['mp4', 'mov', 'webm', 'mkv', '3gp'];
  const audioExts = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'];

  const ext = name ? name.split('.').pop()?.toLowerCase() : '';

  // 1. Check extension and mimetype first (highest accuracy)
  if (mimetype && mimetype !== 'application/octet-stream' && mimetype !== '') {
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('image/')) return 'image';
  }

  if (ext) {
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (imageExts.includes(ext)) return 'image';
  }

  // 2. Trust msgtype as a fallback
  if (msgtype) {
    if (msgtype === 'm.image') return 'image';
    if (msgtype === 'm.video') return 'video';
    if (msgtype === 'm.audio') return 'audio';
    if (msgtype === 'm.file') return 'file';
  }

  return 'file';
}
