import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRichMessageHeightCache,
  getCachedRichMessageHeight,
  getExactCachedRichMessageHeight,
  hydrateRichMessageHeightCache,
  normalizeRichMessageViewportWidth,
  setCachedRichMessageHeight,
} from '../src/renderer/src/modules/authorFrontend/model/richMessageHeightCache.js';

const identity = {
  conversationId: 'conversation-a',
  messageId: 'message-a',
  contentRevision: 'revision-a',
  rootIndex: 0,
};

describe('rich message height cache', () => {
  beforeEach(clearRichMessageHeightCache);

  it('uses the newest measurement as the first-paint fallback', () => {
    hydrateRichMessageHeightCache([
      { ...identity, viewportWidthPx: 800, heightPx: 640, measuredAtEpochMs: 20 },
      { ...identity, viewportWidthPx: 640, heightPx: 520, measuredAtEpochMs: 10 },
    ]);

    expect(getCachedRichMessageHeight(identity, 801)).toBe(640);
    expect(getCachedRichMessageHeight(identity, 640)).toBe(640);
    expect(getCachedRichMessageHeight(identity)).toBe(640);
  });

  it('isolates content revisions and locks only an exact viewport width', () => {
    setCachedRichMessageHeight({ ...identity, viewportWidthPx: 799, heightPx: 600, measuredAtEpochMs: 1 });
    expect(normalizeRichMessageViewportWidth(799)).toBe(799);
    expect(getExactCachedRichMessageHeight(identity, 802)).toBeNull();
    expect(getCachedRichMessageHeight(identity, 802)).toBe(600);
    expect(getCachedRichMessageHeight({ ...identity, contentRevision: 'revision-b' }, 800)).toBeNull();
  });
});
