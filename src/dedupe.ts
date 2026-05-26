const seenMessages = new Map<string, number>();

/** 避免飞书重复投递同一 message_id 时重复回复/写入 */
export function shouldProcessMessage(messageId: string, now = Date.now(), ttlMs = 10 * 60 * 1000): boolean {
  cleanupSeenMessages(now, ttlMs);

  const seenAt = seenMessages.get(messageId);
  if (seenAt !== undefined && now - seenAt <= ttlMs) {
    return false;
  }

  seenMessages.set(messageId, now);
  return true;
}

function cleanupSeenMessages(now: number, ttlMs: number) {
  for (const [messageId, seenAt] of seenMessages) {
    if (now - seenAt > ttlMs) {
      seenMessages.delete(messageId);
    }
  }
}
