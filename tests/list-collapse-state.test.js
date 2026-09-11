import { describe, expect, it } from 'vitest';
import {
  LIST_COLLAPSE_AREAS,
  normalizeCollapsedGroups,
} from '../src/renderer/src/modules/settings/model/listCollapseState.js';

describe('persistent list collapse state', () => {
  it('keeps the three list preferences independent', () => {
    expect(new Set(Object.values(LIST_COLLAPSE_AREAS)).size).toBe(3);
  });

  it('keeps boolean states and prunes groups that no longer exist', () => {
    expect(normalizeCollapsedGroups(
      { '全部预设': true, 已删除: true, invalid: 'no' },
      {},
      ['全部预设'],
    )).toEqual({ '全部预设': true });
  });
});
