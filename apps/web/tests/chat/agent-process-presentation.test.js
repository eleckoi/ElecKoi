import { describe, expect, it } from 'vitest';
import { liveProcessPresentation, processItemPresentation } from '../../src/modules/chat/model/agentProcessPresentation.js';

describe('inline agent process presentation', () => {
  it('updates the one-line reasoning detail from the latest nonempty paragraph', () => {
    const reasoning = { id: 'thought', kind: 'reasoning', status: 'running', detail: '**检查输入**\n内容\n\n**读取资料**\n当前段落' };
    expect(liveProcessPresentation([reasoning])).toMatchObject({ title: '正在分析请求', icon: 'thinking', target: '读取资料 当前段落' });
    expect(liveProcessPresentation([{ ...reasoning, detail: `${reasoning.detail}\n\n下一项` }]).target).toBe('下一项');
  });
  it('keeps the still-running tool after a newer tool has settled', () => {
    const older = { id: 'older', kind: 'tool', toolName: 'read', status: 'running', startedAtMillis: 100,
      arguments: '{"description":"读取必要资料","path":"synthetic.txt"}' };
    const newer = { id: 'newer', kind: 'tool', toolName: 'web_search', status: 'complete', startedAtMillis: 200 };
    expect(liveProcessPresentation([older, newer])).toMatchObject({ title: '正在读取文件', target: '读取必要资料' });
    expect(liveProcessPresentation([{ ...older, status: 'complete' }, newer])).toMatchObject({ title: '正在分析请求', target: '' });
  });
  it('selects real running activity by its start time, without reviving completed calls', () => {
    expect(liveProcessPresentation([
      { id: 'newer', kind: 'tool', toolName: 'web_search', status: 'running', startedAtMillis: 200 },
      { id: 'older', kind: 'tool', toolName: 'read', status: 'running', startedAtMillis: 100 },
    ]).title).toBe('正在搜索网页');
  });
  it('uses the official argument priority and bounds one-line details by grapheme count', () => {
    const tool = { kind: 'tool', status: 'running', toolName: 'web_search' };
    expect(liveProcessPresentation([{ ...tool, arguments: '{"queries":["alpha","beta"]}' }]).target).toBe('alpha, beta');
    expect(liveProcessPresentation([{ ...tool, arguments: '{"query":' }]).target).toBe('web_search');
    const text = '🙂'.repeat(200);
    expect(liveProcessPresentation([{ ...tool, arguments: JSON.stringify({ query: text }) }]).target).toBe(`${'🙂'.repeat(159)}…`);
  });
  it('shows compaction progress from the real lifecycle and does not relabel completion as still running', () => {
    const item = { id: 'compact:9', kind: 'compaction', status: 'running' };
    expect(liveProcessPresentation([item]).title).toBe('正在自动压缩');
    expect(liveProcessPresentation([{ ...item, status: 'complete' }]).title).toBe('上下文已自动压缩');
    expect(liveProcessPresentation([{ ...item, status: 'error' }]).title).toBe('自动压缩失败');
  });
  it('does not present rejected or unchanged setting tools as successful mutations', () => {
    const tool = { toolName: 'eleckoi_apply_setting_patch', kind: 'file_change', status: 'complete',
      arguments: JSON.stringify({ path: '合成设定' }) };
    expect(processItemPresentation({ ...tool, summary: JSON.stringify({ status: 'change_rejected' }) }).title)
      .toBe('修改对话设定失败');
    expect(processItemPresentation({ ...tool, summary: JSON.stringify({ status: 'ok', changed: false }) }).title)
      .toBe('设定未变化');
    expect(processItemPresentation({ ...tool, summary: JSON.stringify({ status: 'ok', changed: true }) }).title)
      .toBe('已修改对话设定');
  });
  it('uses the dedicated reasoning mascot instead of a generic document glyph', () => {
    expect(processItemPresentation({ kind: 'reasoning', toolName: 'reasoning', status: 'running' })).toMatchObject({
      title: '正在思考',
      icon: 'reasoning',
    });
  });

  it('shows the delegated task and effective child model on one subagent row', () => {
    expect(processItemPresentation({
      kind: 'subagent',
      toolName: 'subagent',
      status: 'complete',
      arguments: JSON.stringify({ description: '搜索最新资讯' }),
      delegatedModel: 'deepseek-chat',
    })).toMatchObject({
      title: '子 Agent 已完成',
      target: '搜索最新资讯 · deepseek-chat',
      icon: 'groups',
    });
  });

  it('keeps delegated child activity behind the parent item in the live summary', () => {
    expect(liveProcessPresentation([
      { id: 'delegate', kind: 'subagent', toolName: 'subagent', status: 'running', arguments: '{"description":"搜索资讯"}' },
      { id: 'child-search', parentId: 'delegate', kind: 'tool', toolName: 'web_search', status: 'running' },
    ])).toMatchObject({ title: '子 Agent 正在处理', target: '搜索资讯' });
  });

});
