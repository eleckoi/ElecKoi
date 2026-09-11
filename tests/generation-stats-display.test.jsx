import { describe, expect, it } from 'vitest';
import {
  billedInputTokens,
  cacheHitPercent,
  contextOccupancy,
  formatDuration,
  formatTokens,
  generationStatGroups,
} from '../src/renderer/src/modules/chat/components/GenerationStats.jsx';

describe('generation statistics display', () => {
  it('matches the DSH statistics strip formatting', () => {
    expect(generationStatGroups({
      turns: 1,
      steps: 2,
      llmMs: 31_600,
      toolMs: 800,
      ttftMs: 26_000,
      ttftSteps: 2,
      decodeMs: 5_645,
      decodeTokens: 429,
      tokenUsage: {
        uncachedInputTokens: 18_700,
        outputTokens: 429,
        cacheReadTokens: 18_300,
        cacheWriteTokens: 0,
      },
    })).toEqual([
      '1 轮 · 2 步',
      'LLM 31.6s · 工具调用 0.8s',
      '首 token 平均 13s · 76 tok/s',
      '缓存命中 49%',
      '输入 37K tok · 输出 429 tok',
    ]);
  });

  it('preserves the DSH near-100 cache precision rule', () => {
    const usage = { uncachedInputTokens: 5, outputTokens: 1, cacheReadTokens: 9_995, cacheWriteTokens: 0 };
    expect(billedInputTokens(usage)).toBe(10_000);
    expect(cacheHitPercent(usage)).toBe('99.95');
    expect(cacheHitPercent({ ...usage, uncachedInputTokens: 0, cacheReadTokens: 10_000 })).toBe('100');
  });

  it('formats context occupancy and compact values', () => {
    expect(contextOccupancy({ projectedTokens: 18_700, contextWindow: 1_000_000 })).toEqual({
      percent: 2,
      usedTokens: 18_700,
      contextWindow: 1_000_000,
    });
    expect(formatTokens(18_700)).toBe('18.7K');
    expect(formatDuration(162_000)).toBe('2m42s');
  });
});
