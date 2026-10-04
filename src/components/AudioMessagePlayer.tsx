import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';
import { Play, Pause, Lock } from 'lucide-react';
import { useMatrixMedia } from '../hooks/useMatrixMedia';
import { MediaDownloadControl } from './MediaDownloadControl';

interface AudioMessagePlayerProps {
  message: Message;
}

const FIXED_BARS = [
  6, 10, 16, 12, 8, 14, 20, 18, 12, 16, 14, 8, 10, 18, 16, 12, 20, 14, 10, 8, 14, 16, 10, 6
];

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({ message }) => {
  const { blobUrl: audioUrl, loading, error: mediaError } = useMatrixMedia(message);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const error = mediaError ? 'Failed to load audio' : playbackError;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Initialise duration from message.mediaInfo?.duration (milliseconds, divide by 1000)
  const [duration, setDuration] = useState<number>(() => {
    const d = message.mediaInfo?.duration;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
      return d / 1000;
    }
    return 0;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const d = message.mediaInfo?.duration;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
      setDuration((prev) => (prev > 0 ? prev : d / 1000));
    }
  }, [message.mediaInfo?.duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const total = duration > 0 ? duration : (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
      if (total > 0) {
        setProgress(Math.min(1, Math.max(0, audio.currentTime / total)));
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    // In the loadedmetadata handler, only call setDuration if Number.isFinite(audio.duration) && audio.duration > 0.
    // Never overwrite with 0, NaN or Infinity.
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const onError = () => {
      console.warn('[AudioPlayer] Audio element error encountered');
      setIsPlaying(false);
      setPlaybackError('Audio format not supported');
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl, duration]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (playErr) {
        console.warn('[AudioPlayer] play() rejected:', playErr);
        setIsPlaying(false);
      }
    }
  };

  if (loading) {
    return <div className="text-xs text-[#949ba4] py-1 select-none">Loading audio...</div>;
  }

  if (error || !audioUrl) {
    return <div className="text-xs text-red-400 py-1 select-none">{error || 'Audio unavailable'}</div>;
  }

  // Waveform bars: show at most 24 waveform bars, each 3px wide and between 4px and 20px tall. If there is no waveform, draw 24 fixed bars.
  const rawWaveform: number[] =
    (message as any)?.['org.matrix.msc1767.audio']?.waveform ||
    (message as any)?.['org.matrix.msc3245.voice']?.waveform ||
    (message as any)?.waveform ||
    [];

  let bars: number[] = [];
  if (rawWaveform && rawWaveform.length > 0) {
    let sampled: number[] = [];
    if (rawWaveform.length <= 24) {
      sampled = rawWaveform;
    } else {
      const step = rawWaveform.length / 24;
      sampled = Array.from({ length: 24 }, (_, i) => {
        const idx = Math.min(rawWaveform.length - 1, Math.floor(i * step));
        return rawWaveform[idx];
      });
    }
    const maxVal = Math.max(...sampled, 1);
    bars = sampled.map((val) => {
      const normalized = Math.max(0, Math.min(1, val / maxVal));
      return Math.round(4 + normalized * 16);
    });
  } else {
    bars = FIXED_BARS;
  }

  // While playing, show the remaining time using the stored duration. When paused, show the full duration.
  const displaySeconds = isPlaying ? Math.max(0, duration - currentTime) : duration;
  const safeSecs = Math.max(0, Math.floor(displaySeconds));
  const timeFormatted = `${Math.floor(safeSecs / 60)}:${(safeSecs % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 bg-[#1e1f22] rounded-full px-2 max-w-[220px] w-full h-[40px] border border-[#3f4147] select-none">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onError={() => {
          setIsPlaying(false);
          setPlaybackError('Audio format not supported');
        }}
      />

      {/* Play button 32px circle (icon size 16) */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white relative shrink-0 cursor-pointer active:scale-95 transition-transform"
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        <svg className="w-8 h-8 -rotate-90 absolute pointer-events-none">
          <circle
            cx="16"
            cy="16"
            r="14"
            className="stroke-[#5865f2]/30 fill-none"
            strokeWidth="2.5"
          />
          <circle
            cx="16"
            cy="16"
            r="14"
            className="stroke-white fill-none transition-all duration-100 ease-linear"
            strokeWidth="2.5"
            strokeDasharray={87.96}
            strokeDashoffset={87.96 * (1 - Math.min(1, Math.max(0, progress)))}
          />
        </svg>
        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div className="flex items-center gap-[1.5px] flex-1 justify-center overflow-hidden h-[24px]">
        {bars.map((height, i) => (
          <div
            key={i}
            className={`w-[3px] rounded-full transition-colors ${
              i / bars.length <= progress ? 'bg-[#5865f2]' : 'bg-[#4e5058]'
            }`}
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      {/* Time text 11px and E2EE Lock */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#949ba4] tabular-nums font-medium select-none shrink-0 ml-auto">
        {(message.isEncrypted || message.encryptedFile) && (
          <span className="flex items-center gap-0.5 text-emerald-400 text-[10px]" title="End-to-End Encrypted Voice Message">
            <Lock className="w-2.5 h-2.5 inline" />
          </span>
        )}
        <span>{timeFormatted}</span>
      </div>

      <MediaDownloadControl
        message={message}
        onOpenInAppMedia={() => {
          if (audioRef.current) {
            audioRef.current.play();
            setIsPlaying(true);
          }
        }}
        className="shrink-0"
      />
    </div>
  );
};
