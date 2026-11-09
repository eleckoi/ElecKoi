import { describe, expect, it } from 'vitest';
import { creatorToolPresentation } from '../../src/modules/creatorStudio/model/creatorToolPresentation.js';

const block = (args, payload, rest = {}) => ({ kind: 'tool-result', call: { argsRaw: JSON.stringify(args) },
  content: [{ type: 'text', text: JSON.stringify(payload) }], ...rest });
const call = (id, args, value, rest) => creatorToolPresentation('eleckoi_call_capability', block({ capability_id: id, arguments: args }, { value }, rest), 'result');
const content = model => model.parts.map(part => `${part.label || ''} ${part.text || ''}`).join('\n');

describe('readable creator tool calls', () => {
  it('renders the native discovery and exact operation descriptions without hiding schemas or guide tails', () => {
    const tools = Array.from({ length: 8 }, (_, index) => ({ id: `group-${index}`, title: `能力${index}`, description: `说明${index}`, operationCount: index }));
    const list = creatorToolPresentation('eleckoi_list_toolsets', block({}, { toolsets: tools }), 'result');
    expect(list.browser.entries).toHaveLength(8); expect(list.icon).toBe('list');
    const guide = '完整指引𠮷\n'.repeat(300) + 'GUIDE_TAIL';
    const detail = creatorToolPresentation('eleckoi_describe_toolset', block({ toolset_id: 'settings', operation_ids: ['settings.edit'], include_schema: true }, {
      toolset: { id: 'settings', title: '设定库', guide: [guide] }, operations: [{ id: 'settings.edit', title: '替换正文', effect: 'write', inputSchema: { required: ['old_string'] } }],
    }), 'result');
    expect(content(detail)).toContain('GUIDE_TAIL'); expect(detail.browser.entries[0].fields.at(-1).value).toEqual({ required: ['old_string'] });
  });

  it('keeps all 1003 preset entries, optional text and actual required receipts without reading live data', () => {
    const files = Array.from({ length: 1003 }, (_, index) => ({ id: `prompt-${index}`, path: `合成组/条目${index}`, title: `条目${index}`, read_strategy: 'normal', content: `正文${index}` }));
    files[0] = { ...files[0], read_strategy: 'required', content_delivery: 'cached_reference', cached_reference: '#P01', content: '本轮前置正文已提供。' };
    files[1002].content = '全部长正文𠮷\n'.repeat(600) + 'PRESET_READ_TAIL';
    const snapshot = JSON.stringify(files);
    const result = call('presetPrompts.read', { paths: files.map(item => item.path) }, { status: 'ok', files });
    expect(result.browser.domain).toBe('presetPrompts'); expect(result.browser.entries).toHaveLength(1003);
    expect(result.browser.entries[0].source.content).toBe('本轮前置正文已提供。');
    expect(result.browser.entries.at(-1).source.content).toContain('PRESET_READ_TAIL'); expect(JSON.stringify(files)).toBe(snapshot);
  });

  it.each([
    ['character.read', { id: 'character-a', name: '合成人物', group: '合成组' }, '合成人物'],
    ['character.read_openings', { openingMessages: [{ id: 'opening-a', title: '备用开场白', content: '完整开场白' }] }, '备用开场白'],
    ['settings.read', { id: 'setting-a', title: '合成设定', content: '完整设定' }, '合成设定'],
    ['settings.list', { entries: [{ id: 'setting-a', title: '合成设定' }], groups: [{ id: 'group-a', name: '合成目录' }] }, '合成目录'],
    ['variables.list', { variables: [{ id: 'var-a', title: '合成变量', defaultValue: '0', enabled: false }], objects: [] }, '合成变量'],
    ['scripts.read', { revision: 2, item: { id: 'script-a', name: '合成脚本', content: 'export default () => {}' } }, '合成脚本'],
    ['scripts.list', { revision: 2, trees: [{ id: 'folder-a', name: '合成目录', type: 'folder', scripts: [{ id: 'script-a', name: '合成脚本' }] }] }, '合成目录'],
    ['regex.read', { revision: 3, rule: { id: 'rule-a', name: '合成规则', pattern: '/x/g', replacement: '$&' } }, '合成规则'],
    ['regex.list', { revision: 3, rules: [{ id: 'rule-a', name: '合成规则' }] }, '合成规则'],
    ['presetScripts.read', { revision: 2, trees: [{ id: 'script-a', name: '预设脚本' }], variables: {} }, '预设脚本'],
    ['editorVersions.read', { scope: 'character', ownerId: 'character-a', versions: [{ id: 'version-a', name: '合成版本', content: '{"enabled":false}' }] }, '合成版本'],
  ])('adapts the actual %s return envelope', (id, value, title) => {
    const result = call(id, {}, value);
    expect(result.browser.entries[0].title).toBe(title); expect(result.state).toBe('complete'); expect(result.icon).toMatch(/read|list/);
  });

  it('presents exact replacement segments and falsy configuration values without inventing old values', () => {
    const old_string = '原文𠮷\n'.repeat(600), new_string = '$& $1 $$ 新文𠮷\n'.repeat(600) + 'REPLACEMENT_TAIL';
    const edit = call('settings.edit', { id: 'setting-a', old_string, new_string }, { id: 'setting-a', changed: true, replacements: 1 });
    expect(edit.parts.filter(part => part.kind === 'removed').map(part => part.text).join('')).toBe(old_string);
    expect(edit.parts.filter(part => part.kind === 'added').map(part => part.text).join('')).toBe(new_string);
    expect(edit.title).toContain('替换设定正文');
    const update = call('variables.update', { id: 'var-a', changes: { defaultValue: '0', enabled: false, description: '' } }, { id: 'var-a', title: '合成变量' });
    expect(update.parts.map(part => part.value)).toEqual(['0', '否', '""']);
    expect(update.parts.every(part => part.action === '设为')).toBe(true);
    expect(update.parts.some(part => part.kind === 'removed')).toBe(false);
    const keyword = call('settings.update', { id: 'setting-a', changes: { agentReadStrategy: 'keyword' } }, { id: 'setting-a', title: '合成设定' });
    expect(keyword.parts[0].value).toBe('选读 · 关键词匹配');
  });

  it('uses create, move, delete, check, test and version icons with small recorded receipts', () => {
    expect(call('scripts.create', { name: '新脚本', content: '' }, { revision: 1, item: { id: 'new', name: '新脚本', enabled: false, content: '' } })).toMatchObject({ icon: 'add', summary: '新脚本' });
    expect(call('regex.create', { rule: { name: '新规则' } }, { revision: 1, rule: { id: 'new', name: '新规则' } }).browser.entries[0].title).toBe('新规则');
    expect(call('scripts.move', { id: 'script-a', folderId: '' }, { revision: 3, item: { id: 'script-a', name: '合成脚本' } })).toMatchObject({ icon: 'move' });
    expect(call('settings.remove', { id: 'setting-a' }, { removedId: 'setting-a' })).toMatchObject({ icon: 'remove' });
    expect(call('variables.validate_schema', { schemaCode: 'z.object({})' }, { state: { flag: false, score: 0 } })).toMatchObject({ icon: 'check' });
    const preview = call('regex.test', { text: 'a', rule: { name: '合成规则' } }, { output: 'a', changed: false, appliesToSurface: false });
    expect(content(preview)).toContain('尚未保存'); expect(content(preview)).toContain('当前规则不适用于此范围');
    const version = call('editorVersions.save', { kind: 'scripts', documents: [], versions: [] }, {
      documents: [JSON.stringify({ scope: 'character', ownerId: 'character-a', revision: 1, enabled: false, trees: [], variables: {} })], versions: [{ scope: 'character', ownerId: 'character-a', versions: [{ id: 'version-a', name: '合成版本', content: '{}' }] }],
    });
    expect(version.icon).toBe('version'); expect(version.browser.entries).toHaveLength(2);
  });

  it('renders page fragments and result-search hits without replaying the original capability', () => {
    const result = creatorToolPresentation('eleckoi_call_capability', block({ result: { file_path: '/synthetic/result.json', offset: 20 } }, {
      kind: 'tool_result_page', file_path: '/synthetic/result.json', offset: 20, total_bytes: 80, content: '完整片段𠮷', next_offset: 50,
    }), 'result');
    expect(result.action).toBe('续读工具结果'); expect(content(result)).toContain('完整片段𠮷'); expect(content(result)).toContain('仍有后续内容');
    const search = creatorToolPresentation('eleckoi_call_capability', block({ result: { file_path: '/synthetic/result.json', query: '末尾' } }, {
      kind: 'tool_result_page', offset: 0, total_bytes: 80, matches: [{ offset: 60, text: '完整末尾匹配' }], next_offset: null,
    }), 'result');
    expect(search.icon).toBe('search'); expect(content(search)).toContain('完整末尾匹配'); expect(content(search)).toContain('已到结果末尾');
  });

  it('keeps failures, interrupted calls and native fallbacks distinct from successful writes', () => {
    const args = { capability_id: 'settings.edit', arguments: { id: 'setting-a', old_string: '原文', new_string: '新文' } };
    const error = creatorToolPresentation('eleckoi_call_capability', block(args, {}, { isError: true, error: { code: 'stale', message: '请重新读取' } }), 'result');
    expect(error.state).toBe('error'); expect(error.title).not.toContain('已'); expect(error.parts.every(part => part.kind === 'error')).toBe(true);
    expect(creatorToolPresentation('eleckoi_call_capability', block(args, {}, { error: { code: 'interrupted' } }), 'result').state).toBe('cancelled');
    expect(call('settings.edit', args.arguments, { changed: false })).toBeUndefined();
    expect(creatorToolPresentation('eleckoi_call_capability', block(args, { status: 'spilled' }), 'result')).toBeUndefined();
    expect(creatorToolPresentation('eleckoi_call_capability', block(args, {}, { content: [{ type: 'image', url: 'synthetic' }] }), 'result')).toBeUndefined();
    expect(call('unknown.operation', {}, {})).toBeUndefined();
    expect(call('settings.list', {}, {})).toBeUndefined();
    expect(call('settings.read', {}, { id: 'bad', title: {} })).toBeUndefined();
  });

  it('shows running work and a genuinely empty directory without reporting an execution as complete', () => {
    const running = creatorToolPresentation('eleckoi_call_capability', { argsRaw: JSON.stringify({ capability_id: 'variables.update', arguments: { id: 'var-a' } }) }, 'start');
    expect(running.state).toBe('running'); expect(running.title).toContain('正在'); expect(running.parts).toEqual([]);
    expect(call('settings.list', {}, { entries: [], groups: [] }).browser.entries).toEqual([]);
  });
});
