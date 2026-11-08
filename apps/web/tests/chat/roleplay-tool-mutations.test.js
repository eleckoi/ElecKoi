import { describe, expect, it } from 'vitest';
import { roleplayMutationDefinition, roleplayToolMutation } from '../../src/modules/chat/model/roleplayToolMutations.js';

const variable = 'eleckoi_apply_variable_patch', setting = 'eleckoi_apply_setting_patch';
const block = (args, payload, extras = {}) => ({ kind: 'tool-result', call: { argsRaw: JSON.stringify(args) },
  isError: false, content: [{ type: 'text', text: JSON.stringify(payload) }], ...extras });
const present = (tool, args, payload, extras) => roleplayToolMutation(roleplayMutationDefinition(tool), block(args, payload, extras), 'result');

describe('Readable recorded setting and variable changes', () => {
  it('keeps each submitted operation and escaped path without inventing previous values or altering source records', () => {
    const args = { operations: [
      { op: 'replace', path: '/剧情/共伞', value: true }, { op: 'delta', path: '/关系/好感度', value: -1 },
      { op: 'insert', path: '/物品/a~1b~0c', value: { title: '合成𠮷', enabled: false } }, { op: 'remove', path: '/物品/旧物' },
    ] };
    const source = block(args, { status: 'ok', applied_operations: 4, paths: [] }), before = structuredClone(source);
    const result = roleplayToolMutation(roleplayMutationDefinition(variable), source, 'result');
    expect(result.title).toBe('已修改变量'); expect(result.summary).toBe('4 项操作');
    const rows = result.parts.filter(part => part.kind === 'variable');
    expect(rows.map(row => [row.action, row.value])).toEqual([['设为', '是'], ['减少', '1'], ['添加', '{\n  "title": "合成𠮷",\n  "enabled": false\n}'], ['删除', undefined]]);
    expect(rows[2].segments).toEqual(['物品', 'a/b~c']);
    expect(rows.every(row => !Object.hasOwn(row, 'before'))).toBe(true);
    expect(source).toEqual(before);
  });
  it('admits the real Host rejection statuses, shows readable issues and never labels them as successful', () => {
    const result = present(variable, { operations: [{ op: 'replace', path: '/好感度', value: 120 }] },
      { status: 'validation_error', message: '变量状态不符合 Zod 规则', issues: [{ path: ['好感度'], message: '不能超过 100' }], state_unchanged: true });
    expect(result.state).toBe('error'); expect(result.title).toBe('变量修改未生效');
    expect(result.parts.filter(part => part.kind === 'error').map(part => part.text)).toEqual(['变量状态不符合 Zod 规则', '好感度：不能超过 100']);
  });
  it.each([variable, setting])('shows unchanged and interrupted calls without claiming an applied change (%s)', tool => {
    const args = tool === variable ? { operations: [{ op: 'replace', path: '/值', value: 0 }] } : { operation: 'edit_file', path: '组/条目', old_string: '旧', new_string: '新' };
    const unchanged = present(tool, args, tool === variable ? { status: 'ok', applied_operations: 0, paths: [], state_unchanged: true } : { status: 'ok', changed: false });
    expect(unchanged.state).toBe('unchanged'); expect(unchanged.parts.map(part => part.kind)).toEqual(['note']);
    const cancelled = present(tool, args, undefined, { isError: true, error: { code: 'interrupted', message: 'Synthetic cancelled' }, content: [{ type: 'text', text: 'Interrupted' }] });
    expect(cancelled.state).toBe('cancelled'); expect(cancelled.title).toContain('已取消');
  });
  it('keeps preparation and dispatched start states running and avoids completed receipts before the result', () => {
    const definition = roleplayMutationDefinition(setting);
    const preparing = roleplayToolMutation(definition, { phase: 'preparing' }, 'preparing');
    expect(preparing).toMatchObject({ state: 'running', title: '正在修改对话设定', parts: [] });
    const start = roleplayToolMutation(definition, { argsRaw: JSON.stringify({ operation: 'edit_file', path: '设定', old_string: '旧', new_string: '新' }) }, 'start');
    expect(start.title).toBe('正在修改对话设定'); expect(start.parts.some(part => part.kind === 'note')).toBe(false);
  });
  it.each(['write_file', 'edit_file', 'make_directory', 'move_file', 'move_directory', 'delete_file', 'delete_directory'])('presents the recorded %s operation and complete text', operation => {
    const old_string = '完整旧文𠮷\r\n'.repeat(1200), new_string = '完整新文𠮷\r\n'.repeat(1200);
    const result = present(setting, { operation, path: '组/设定', destination: '新组/设定', old_string, new_string, content: new_string },
      { status: 'ok', changed: true, operation, path: '组/设定', destination: '新组/设定', replacements: operation === 'edit_file' ? 1 : undefined });
    expect(result.state).toBe('changed'); expect(result.parts[0].text).toBe('组/设定');
    if (operation === 'edit_file') {
      expect(result.parts.filter(part => part.kind === 'removed').map(part => part.text).join('')).toBe(old_string);
      expect(result.parts.filter(part => part.kind === 'added').map(part => part.text).join('')).toBe(new_string);
    }
    if (operation.startsWith('move_')) expect(result.parts.map(part => part.text)).toEqual(['组/设定', '新组/设定']);
    if (operation === 'write_file') expect(result.parts.filter(part => part.kind === 'text').map(part => part.text).join('')).toBe(new_string);
  });
  it('leaves malformed, paged, spilled and image results with the native presentation', () => {
    const definition = roleplayMutationDefinition(variable), args = { operations: [{ op: 'replace', path: '/值', value: false }] };
    for (const payload of [{}, { status: 'spilled', path: '/full' }, { kind: 'tool_result_page', content: 'continued' }, { status: 'ok', applied_operations: 3 }]) {
      expect(present(variable, args, payload)).toBeUndefined();
    }
    expect(roleplayToolMutation(definition, block(args, {}, { content: [{ type: 'image', image: {} }] }), 'result')).toBeUndefined();
    expect(roleplayMutationDefinition('synthetic-unrelated-tool')).toBeUndefined();
  });
  it('preserves an empty replacement and a recorded native error without fabricating a successful write', () => {
    const args = { operation: 'edit_file', path: '场景', old_string: '删除的片段', new_string: '' };
    const deletion = present(setting, args, { status: 'ok', changed: true, path: '场景', replacements: 1 });
    expect(deletion.parts.find(part => part.kind === 'added')).toMatchObject({ label: '新文', text: '' });
    const error = present(setting, args, undefined, { isError: true, content: [{ type: 'text', text: 'Error: Synthetic rejected edit' }] });
    expect(error.state).toBe('error'); expect(error.parts[0].text).toBe('Error: Synthetic rejected edit');
    expect(error.parts.some(part => part.kind === 'added')).toBe(false);
  });
});
