import { useState, useEffect, useCallback } from 'react';
import {
  getDownloadStatus,
  subscribeDownloadEvents,
  startDownload,
  cancelDownload,
  deleteDownloadedFile,
  openDownloadedFile,
  shareDownloadedFile,
  DownloadStatus,
  DownloadRecord,
} from '../services/downloadManager';
import { saveToDevice } from '../services/deviceStorage';

export function useDownloadState(message: any) {
  const eventId = message?.id || message?.eventId || '';
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [record, setRecord] = useState<DownloadRecord | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const checkStatus = useCallback(async () => {
    if (!eventId) return;
    const task = await getDownloadStatus(eventId);
    setStatus(task.status);
    setProgress(task.progress);
    setRecord(task.record);
    setError(task.error);
  }, [eventId]);

  useEffect(() => {
    checkStatus();

    const unsubscribe = subscribeDownloadEvents((updatedEventId) => {
      if (!updatedEventId || updatedEventId === eventId) {
        checkStatus();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [eventId, checkStatus]);

  const handleStart = useCallback(() => {
    if (!message) return;
    startDownload(message);
  }, [message]);

  const handleCancel = useCallback(() => {
    if (!eventId) return;
    cancelDownload(eventId);
  }, [eventId]);

  const handleOpen = useCallback(
    (onOpenInAppMedia?: (url: string, kind: string) => void) => {
      if (!record) return;
      openDownloadedFile(record, onOpenInAppMedia);
    },
    [record]
  );

  const handleDelete = useCallback(async () => {
    if (!eventId) return;
    await deleteDownloadedFile(eventId);
  }, [eventId]);

  const handleShare = useCallback(async () => {
    if (!record) return;
    await shareDownloadedFile(record);
  }, [record]);

  const handleSaveToDevice = useCallback(async () => {
    if (!message) return false;
    return await saveToDevice(message);
  }, [message]);

  return {
    status,
    progress,
    record,
    error,
    startDownload: handleStart,
    cancelDownload: handleCancel,
    openFile: handleOpen,
    deleteFile: handleDelete,
    shareFile: handleShare,
    saveToDevice: handleSaveToDevice,
  };
}
