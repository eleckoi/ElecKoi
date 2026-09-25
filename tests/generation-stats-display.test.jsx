import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GenerationStatsLine,
  billedInputTokens,
  cacheHitPercent,
  contextBreakdownRows,
  contextOccupancy,
  formatDuration,
  formatTokens,
  generationStatGroups,
  retainVisibleGenerationStats,
  sessionTimeRows,
  sessionUsageRows,
} from '../src/renderer/src/modules/chat/components/GenerationStats.jsx';

globalThis.React = React;

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
    })).toEqual(['1 轮 2 步 · 76 tok/s', '37.4K tok · 缓存命中 49%']);
  });

  it('separates time and exact token buckets in the detail panels', () => {
    expect(sessionTimeRows({ llmMs: 31_600, toolMs: 800, ttftMs: 26_000, ttftSteps: 2, decodeMs: 5_645, decodeTokens: 429 })).toEqual([
      { label: '模型用时', value: '31.6秒' },
      { label: '工具调用用时', value: '0.8秒' },
      { label: '首 token 平均（TTFT）', value: '13秒' },
      { label: '输出速度（TPS）', value: '76 tok/s' },
    ]);
    expect(sessionUsageRows({ uncachedInputTokens: 18_364, cacheReadTokens: 17_920, cacheWriteTokens: 0, outputTokens: 429 })).toEqual([
      { label: '缓存命中', value: '49%' },
      { label: '未缓存输入', value: '18,364 tok' },
      { label: '缓存读取', value: '17,920 tok' },
      { label: '输出', value: '429 tok' },
    ]);
    expect(sessionUsageRows({ uncachedInputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 5, outputTokens: 1 })).toContainEqual({ label: '缓存写入', value: '5 tok' });
  });

  it('renders the two statistics pills and a separate context reading', () => {
    const html = renderToStaticMarkup(React.createElement(GenerationStatsLine, { stats: {
      turns: 1, steps: 2, decodeMs: 5_645, decodeTokens: 429,
      tokenUsage: { uncachedInputTokens: 18_364, cacheReadTokens: 17_920, cacheWriteTokens: 0, outputTokens: 429 },
      contextPressure: { projectedTokens: 20_000, contextWindow: 1_000_000 },
    } }));
    expect(html).toContain('1 轮 2 步 · 76 tok/s');
    expect(html).toContain('36.7K tok · 缓存命中 49%');
    expect(html).toContain('2%');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('preserves the DSH near-100 cache precision rule', () => {
    const usage = { uncachedInputTokens: 5, outputTokens: 1, cacheReadTokens: 9_995, cacheWriteTokens: 0 };
    expect(billedInputTokens(usage)).toBe(10_000);
    expect(cacheHitPercent(usage)).toBe('99.95');
    expect(cacheHitPercent({ ...usage, uncachedInputTokens: 0, cacheReadTokens: 10_000 })).toBe('100');
  });

  it('formats context occupancy and compact values', () => {
    expect(contextOccupancy({ projectedTokens: 18_700, contextWindow: 1_000_000 })).toEqual({
      percent: 1.87,
      percentLabel: '2',
      usedTokens: 18_700,
      contextWindow: 1_000_000,
    });
    expect(contextOccupancy({ projectedTokens: 2_800, contextWindow: 1_000_000 })).toMatchObject({
      percent: 0.28,
      percentLabel: '0.3',
    });
    expect(formatTokens(18_700)).toBe('18.7K');
    expect(formatDuration(162_000)).toBe('2分42秒');
  });

  it('keeps heuristic categories separate from the provider context total', () => {
    const rows = contextBreakdownRows({
      systemTokens: 0,
      toolsTokens: 551,
      messageTokens: 5_600,
    });

    expect(rows.map((row) => row.label)).toEqual([
      '系统提示词',
      '工具定义',
      '对话消息',
    ]);
    expect(rows.map((row) => row.value)).toEqual([0, 551, 5_600]);
  });

  it('keeps the same three heuristic categories without provider pressure', () => {
    const rows = contextBreakdownRows({
      systemTokens: 0,
      toolsTokens: 551,
      messageTokens: 5_600,
    });

    expect(rows.map((row) => row.label)).toEqual(['系统提示词', '工具定义', '对话消息']);
  });

  it('keeps the statistics strip and context meter stable while a regenerated run warms up', () => {
    const previous = {
      turns: 1,
      steps: 2,
      llmMs: 12_000,
      toolMs: 200,
      ttftMs: 800,
      ttftSteps: 1,
      decodeMs: 4_000,
      decodeTokens: 300,
      tokenUsage: {
        uncachedInputTokens: 1_000,
        outputTokens: 300,
        cacheReadTokens: 2_000,
        cacheWriteTokens: 0,
      },
      contextPressure: { projectedTokens: 4_200, contextWindow: 1_000_000 },
      contextBreakdown: { systemTokens: 0, toolsTokens: 551, messageTokens: 1_400 },
    };
    const warmingUp = {
      turns: 0,
      steps: 0,
      llmMs: 0,
      toolMs: 0,
      ttftMs: 0,
      ttftSteps: 0,
      decodeMs: 0,
      decodeTokens: 0,
      tokenUsage: {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      contextPressure: {},
      contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 0 },
    };

    const retained = retainVisibleGenerationStats(previous, warmingUp);

    expect(generationStatGroups(retained)).toEqual(generationStatGroups(previous));
    expect(contextOccupancy(retained.contextPressure)).toEqual(contextOccupancy(previous.contextPressure));
    expect(retained.contextBreakdown).toEqual(previous.contextBreakdown);
  });

  it('replaces each retained section as soon as its new values are visible', () => {
    const previous = {
      turns: 1,
      steps: 1,
      llmMs: 1_000,
      toolMs: 0,
      ttftMs: 200,
      ttftSteps: 1,
      decodeMs: 800,
      decodeTokens: 40,
      tokenUsage: { uncachedInputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
      contextPressure: { projectedTokens: 1_000, contextWindow: 10_000 },
      contextBreakdown: { systemTokens: 100, toolsTokens: 100, messageTokens: 800 },
    };
    const next = {
      ...previous,
      turns: 0,
      steps: 0,
      llmMs: 0,
      ttftMs: 0,
      ttftSteps: 0,
      decodeMs: 0,
      decodeTokens: 0,
      tokenUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      contextPressure: { projectedTokens: 2_000, contextWindow: 10_000 },
      contextBreakdown: { systemTokens: 200, toolsTokens: 200, messageTokens: 1_600 },
    };

    const retained = retainVisibleGenerationStats(previous, next);

    expect(generationStatGroups(retained)).toEqual(generationStatGroups(previous));
    expect(contextOccupancy(retained.contextPressure)?.usedTokens).toBe(2_000);
    expect(retained.contextBreakdown).toEqual(next.contextBreakdown);
  });
});
