import { describe, expect, it } from 'vitest';
import { processBlocks, processItemDetails, subagentDetailPresentation } from '../src/renderer/src/modules/chat/model/agentProcessDetails.js';

function item(overrides) {
  return {
    id: 'process-1',
    kind: 'tool',
    status: 'complete',
    toolName: '',
    arguments: '',
    summary: '',
    detail: '',
    startedAtMillis: 1,
    completedAtMillis: 2,
    ...overrides,
  };
}

describe('agent process detail presentation', () => {
  it('groups consecutive reasoning and tool work around narrative boundaries', () => {
    const first = item({ id: 'first', toolName: 'eleckoi_glob_setting_files' });
    const second = item({ id: 'second', toolName: 'eleckoi_read_setting_files' });
    const reasoning = item({ id: 'reasoning', kind: 'reasoning', toolName: 'reasoning', detail: '先读取设定。' });
    const narrative = item({ id: 'phase', kind: 'narrative', toolName: 'assistant_narrative', summary: '继续检查变量。' });
    const third = item({ id: 'third', toolName: 'eleckoi_glob_variables' });

    const blocks = processBlocks([reasoning, first, second, narrative, third]);
    expect(blocks.map((block) => block.type)).toEqual(['operations', 'narrative', 'operations']);
    expect(blocks.map((block) => block.id)).toEqual(['operations:reasoning', 'phase', 'operations:third']);
    expect(blocks[0].items.map((entry) => entry.id)).toEqual(['reasoning', 'first', 'second']);
    expect(blocks[0].presentation).toMatchObject({
      title: '已查找设定文件、已读取设定正文',
      icon: 'search-setting',
    });
    expect(blocks[1].text).toBe('继续检查变量。');
    expect(blocks[2].presentation.title).toBe('已查找变量');
  });

  it('previews the first two distinct operation names and truncates longer groups', () => {
    const blocks = processBlocks([
      item({ id: 'settings', toolName: 'eleckoi_glob_setting_files' }),
      item({ id: 'variables', toolName: 'eleckoi_glob_variables' }),
      item({ id: 'run', toolName: 'tool' }),
      item({ id: 'read', toolName: 'eleckoi_read_variables' }),
    ]);

    expect(blocks[0].presentation.title).toBe('已查找设定文件、已查找变量…');
  });

  it('keeps a completed reasoning-only group upright and summarized once', () => {
    const first = item({ id: 'reasoning-1', kind: 'reasoning', toolName: 'reasoning', detail: '先判断问题。' });
    const second = item({ id: 'reasoning-2', kind: 'reasoning', toolName: 'reasoning', detail: '再整理答案。' });

    const blocks = processBlocks([first, second]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'operations',
      presentation: { title: '思考过程', icon: 'reasoning', status: 'complete' },
    });
    expect(blocks[0].items).toEqual([first, second]);
  });

  it('keeps compaction attempts separate from surrounding model work', () => {
    const first = item({ id: 'first', toolName: 'eleckoi_read_variables' });
    const compaction = item({ id: 'compact', kind: 'compaction', toolName: '', summary: '上下文已自动压缩' });
    const reasoning = item({ id: 'reasoning', kind: 'reasoning', toolName: 'reasoning', detail: '继续生成。' });

    const blocks = processBlocks([first, compaction, reasoning]);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((block) => block.items.map((entry) => entry.id))).toEqual([
      ['first'], ['compact'], ['reasoning'],
    ]);
    expect(blocks[1].presentation.title).toBe('上下文已自动压缩');
  });

  it('uses the live item as the concise group status instead of concatenating every prior title', () => {
    const first = item({ id: 'first', toolName: 'eleckoi_glob_setting_files' });
    const second = item({
      id: 'reasoning', kind: 'reasoning', toolName: 'reasoning', status: 'running',
      detail: '正在整理。', completedAtMillis: undefined,
    });

    const blocks = processBlocks([first, second]);
    expect(blocks[0].presentation).toMatchObject({
      title: '正在思考',
      icon: 'reasoning',
      status: 'running',
    });
  });

  it('keeps delegated child work out of the parent timeline', () => {
    const delegation = item({ id: 'delegate', kind: 'subagent', toolName: 'subagent' });
    const childReasoning = item({ id: 'child-reasoning', kind: 'reasoning', toolName: 'reasoning', parentId: 'delegate' });
    const childSearch = item({ id: 'child-search', toolName: 'web_search', parentId: 'delegate' });
    const rootSearch = item({ id: 'root-search', toolName: 'web_search' });

    const blocks = processBlocks([delegation, childReasoning, childSearch, rootSearch]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].items.map((entry) => entry.id)).toEqual(['delegate', 'root-search']);
  });

  it('presents setting glob counts, required entries, and path metadata', () => {
    const details = processItemDetails(item({
      toolName: 'eleckoi_glob_setting_files',
      arguments: JSON.stringify({ pattern: '**' }),
      summary: JSON.stringify({
        status: 'ok',
        files: [
          { path: '人物/外貌与性格', title: '外貌与性格', read_strategy: 'normal' },
          { path: '世界/当前地点', title: '当前地点', read_strategy: 'required' },
        ],
        required_entries: [{ path: '世界/当前地点', title: '当前地点', read_strategy: 'required' }],
        truncated: false,
        omitted: 0,
      }),
    }));

    expect(details.title).toBe('已查找设定文件');
    expect(details.target).toBe('“**” · 2 项');
    expect(details.specialized).toMatchObject({
      type: 'glob',
      paths: ['人物/外貌与性格', '世界/当前地点'],
      required: ['世界/当前地点'],
    });
  });

  it('presents setting and variable fields instead of flattening the result to JSON', () => {
    const setting = processItemDetails(item({
      toolName: 'eleckoi_read_setting_files',
      summary: JSON.stringify({ files: [{
        path: '人物/外貌与性格',
        title: '外貌与性格',
        group_path: '人物',
        read_strategy: 'normal',
        selection_hint: '描写角色时读取',
        content: '蓝绿色长发双马尾。',
      }] }),
    }));
    const variable = processItemDetails(item({
      toolName: 'eleckoi_read_variables',
      arguments: JSON.stringify({ paths: ['/世界/当前地点'] }),
      summary: JSON.stringify({ variables: [{
        path: '/世界/当前地点', type: 'string', current: '樱川高中', default: '',
        description: '当前所在位置', update_rule: '场景切换时更新',
      }] }),
    }));

    expect(setting.target).toBe('外貌与性格');
    expect(setting.specialized.entries[0]).toMatchObject({ groupPath: '人物', readStrategy: 'normal' });
    expect(variable.target).toBe('/世界/当前地点');
    expect(variable.specialized.entries[0]).toMatchObject({ current: '樱川高中', updateRule: '场景切换时更新' });
  });

  it('falls back to tool arguments when patch and plan results omit their entries', () => {
    const variablePatch = processItemDetails(item({
      toolName: 'eleckoi_apply_variable_patch',
      arguments: JSON.stringify({ operations: [{ op: 'replace', path: '/世界/地点', value: '新地点' }] }),
      summary: JSON.stringify({ applied_operations: 1 }),
    }));
    const settingPatch = processItemDetails(item({
      toolName: 'eleckoi_apply_setting_patch',
      arguments: JSON.stringify({ op: 'edit_file', path: '世界/地点', detail: '更新地点' }),
      summary: JSON.stringify({ applied_operations: 1 }),
    }));
    const plan = processItemDetails(item({
      toolName: 'update_plan',
      arguments: JSON.stringify({ steps: [{ title: '继续剧情', status: 'pending' }] }),
      summary: JSON.stringify({ status: 'ok' }),
    }));

    expect(variablePatch.specialized.operations).toMatchObject([{ op: 'replace', path: '/世界/地点' }]);
    expect(settingPatch.specialized.operations).toMatchObject([{ op: 'edit_file', path: '世界/地点' }]);
    expect(plan.specialized.steps).toMatchObject([{ title: '继续剧情', status: 'pending' }]);
  });

  it('presents subagent metadata and hides the launch receipt', () => {
    const root = item({
      kind: 'subagent',
      toolName: 'subagent',
      arguments: JSON.stringify({ description: '查看设定库', prompt: '读取完整设定', run_in_background: false }),
      summary: 'started subagent f23c5d74-98d8-4832-90e6-91203ecac920',
      delegatedModel: 'deepseek-flash',
    });
    const details = subagentDetailPresentation(root, [
      item({ id: 'reply', kind: 'narrative', toolName: 'assistant_final', summary: '子 Agent 真正回复', parentId: root.id }),
    ]);

    expect(details).toMatchObject({
      description: '查看设定库',
      prompt: '读取完整设定',
      model: 'deepseek-flash',
      execution: '等待子 Agent 返回',
      reply: '子 Agent 真正回复',
      returnResult: '',
    });
  });

  it('shows a separately relayed parent result only when it differs from the child reply', () => {
    const root = item({ kind: 'subagent', toolName: 'subagent' });
    const children = [
      item({ id: 'reply', kind: 'narrative', toolName: 'assistant_final', summary: '可见回复', parentId: root.id }),
      item({ id: 'relay', toolName: 'send_message', arguments: JSON.stringify({ message: '交给父 Agent 的结果' }), parentId: root.id }),
    ];
    expect(subagentDetailPresentation(root, children).returnResult).toBe('交给父 Agent 的结果');
    children[1].arguments = JSON.stringify({ message: '  可见回复  ' });
    expect(subagentDetailPresentation(root, children).returnResult).toBe('');
  });
});
