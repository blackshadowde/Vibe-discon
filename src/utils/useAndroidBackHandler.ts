import { useEffect, useRef } from 'react';

export function useAndroidBackHandler(isOpen: boolean, onClose: () => void, modalId?: string) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const hasPushedStateRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      if (hasPushedStateRef.current) {
        hasPushedStateRef.current = false;
      }
      return;
    }

    const stateKey = modalId || `modal-${Date.now()}`;
    try {
      window.history.pushState({ modalOpen: true, modalId: stateKey }, '');
      hasPushedStateRef.current = true;
    } catch {}

    const handlePopState = () => {
      if (hasPushedStateRef.current) {
        hasPushedStateRef.current = false;
        onCloseRef.current();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (hasPushedStateRef.current) {
          try {
            window.history.back();
          } catch {
            onCloseRef.current();
          }
        } else {
          onCloseRef.current();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      if (hasPushedStateRef.current) {
        hasPushedStateRef.current = false;
      }
    };
  }, [isOpen, modalId]);
}
