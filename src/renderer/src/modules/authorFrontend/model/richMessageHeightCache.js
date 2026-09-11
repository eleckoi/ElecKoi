const heights = new Map();

function identityKey({ conversationId, messageId, contentRevision, rootIndex }) {
  return [conversationId, messageId, contentRevision, rootIndex].join('\u001f');
}

function validHeight(value) {
  const height = Math.ceil(Number(value));
  return Number.isFinite(height) && height > 0 ? Math.min(100_000, height) : null;
}

export function normalizeRichMessageViewportWidth(value) {
  const width = Math.round(Number(value));
  if (!Number.isFinite(width) || width < 1) return 1;
  return Math.min(16_384, width);
}

export function setCachedRichMessageHeight(record) {
  const heightPx = validHeight(record?.heightPx);
  if (!record?.conversationId || !record?.messageId || !record?.contentRevision || heightPx === null) return;
  const normalized = {
    ...record,
    rootIndex: Math.max(0, Math.trunc(Number(record.rootIndex) || 0)),
    viewportWidthPx: normalizeRichMessageViewportWidth(record.viewportWidthPx),
    heightPx,
    measuredAtEpochMs: Math.max(0, Math.trunc(Number(record.measuredAtEpochMs) || Date.now())),
  };
  const identity = identityKey(normalized);
  const recent = heights.get(identity);
  if (!recent || normalized.measuredAtEpochMs >= recent.measuredAtEpochMs) heights.set(identity, normalized);
}

export function hydrateRichMessageHeightCache(records) {
  for (const record of records || []) setCachedRichMessageHeight(record);
}

export function getCachedRichMessageHeight(identity, viewportWidthPx) {
  if (!identity?.conversationId || !identity?.messageId || !identity?.contentRevision) return null;
  if (Number(viewportWidthPx) > 0) {
    const exact = getExactCachedRichMessageHeight(identity, viewportWidthPx);
    if (exact !== null) return exact;
  }
  return heights.get(identityKey(identity))?.heightPx ?? null;
}

export function getExactCachedRichMessageHeight(identity, viewportWidthPx) {
  if (!identity?.conversationId || !identity?.messageId || !identity?.contentRevision) return null;
  if (!(Number(viewportWidthPx) > 0)) return null;
  const cached = heights.get(identityKey(identity));
  return cached?.viewportWidthPx === normalizeRichMessageViewportWidth(viewportWidthPx)
    ? cached.heightPx
    : null;
}

export function clearRichMessageHeightCache() {
  heights.clear();
}
