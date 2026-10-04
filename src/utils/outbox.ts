export type OutboxItem = {
  txnId: string;
  roomId: string;
  channelId: string;
  content: string;
  replyToId?: string;
  createdAt: number;
};

const OUTBOX_KEY = 'outbox_v1';

export function getOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addToOutbox(item: OutboxItem): void {
  try {
    const items = getOutbox();
    const existingIndex = items.findIndex((i) => i.txnId === item.txnId);
    if (existingIndex >= 0) {
      items[existingIndex] = item;
    } else {
      items.push(item);
    }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {}
}

export function removeFromOutbox(txnId: string): void {
  try {
    const items = getOutbox();
    const filtered = items.filter((i) => i.txnId !== txnId);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(filtered));
  } catch {}
}

export function clearOutbox(): void {
  try {
    localStorage.removeItem(OUTBOX_KEY);
  } catch {}
}
