import { desktopClient } from '../../../bridge/desktopClient.ts';
import {
  clearRichMessageHeightCache,
  hydrateRichMessageHeightCache,
  normalizeRichMessageViewportWidth,
  setCachedRichMessageHeight,
} from './richMessageHeightCache.js';

const pendingLoads = new Map();
let activeConversationId = '';
let loadedConversationId = '';

export async function primeRichMessageHeightCache(conversationId) {
  if (!conversationId) return;
  if (activeConversationId !== conversationId) {
    activeConversationId = conversationId;
    loadedConversationId = '';
    clearRichMessageHeightCache();
  }
  if (loadedConversationId === conversationId) return;
  const pending = pendingLoads.get(conversationId);
  if (pending) return pending;
  const load = desktopClient.request('query.conversations.rich_heights', { conversationId })
    .then((records) => {
      if (activeConversationId !== conversationId) return;
      hydrateRichMessageHeightCache(records);
      loadedConversationId = conversationId;
    })
    .catch(() => undefined)
    .finally(() => pendingLoads.delete(conversationId));
  pendingLoads.set(conversationId, load);
  return load;
}

export function rememberRichMessageHeight(record) {
  const normalized = {
    ...record,
    rootIndex: Math.max(0, Math.trunc(Number(record.rootIndex) || 0)),
    viewportWidthPx: normalizeRichMessageViewportWidth(record.viewportWidthPx),
    heightPx: Math.min(100_000, Math.max(1, Math.ceil(Number(record.heightPx) || 1))),
    measuredAtEpochMs: Date.now(),
  };
  setCachedRichMessageHeight(normalized);
  desktopClient.request('command.conversations.rich_height.save', {
    conversationId: normalized.conversationId,
    messageId: normalized.messageId,
    contentRevision: normalized.contentRevision,
    rootIndex: normalized.rootIndex,
    viewportWidthPx: normalized.viewportWidthPx,
    heightPx: normalized.heightPx,
  }).catch(() => undefined);
}
