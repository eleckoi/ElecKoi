// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderRoleplayToolCall } from '../../src/modules/chat/components/RoleplayToolCall.jsx';
import { resultMatchesQuery, resultTextSegments, resultValueText, roleplayToolDefinition, roleplayToolResult } from '../../src/modules/chat/model/roleplayToolResults.js';

const files = Array.from({ length: 86 }, (_, index) => ({ path: `合成组/条目${index}`, title: `设定 ${index}`,
  read_strategy: index === 0 ? 'required' : 'normal', content_delivery: 'tool_result',
  content: `合成正文 ${index}\n${'完整长正文𠮷😀\n'.repeat(180)}末尾关键词${index}` }));
const variables = Array.from({ length: 128 }, (_, index) => ({ path: `/合成组/字段${index}`, type: 'number', current: index,
  current_present: true, default: 0, description: `完整说明 ${index}`, update_rule: `合成规则 ${index}` }));
function block(payload) { return { kind: 'tool-result', callId: 'synthetic-call', isError: false,
  call: { name: 'eleckoi_read_setting_files', argsRaw: '{"paths":["合成组/条目0"]}' }, content: [{ type: 'text', text: JSON.stringify(payload) }], subCalls: [] }; }
function useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, toggle: () => setExpanded(value => !value) }; }
const native = () => <span>Native original tool output</span>;
const model = (name, payload) => roleplayToolResult(roleplayToolDefinition(name), block(payload));
let root, host;
const originalScrollTo = HTMLElement.prototype.scrollTo;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { constructor(read) { this.read = read; } observe(target) {
    this.read([{ target, borderBoxSize: [{ inlineSize: 220, blockSize: target.dataset.detailKind ? (target.dataset.detailKind === 'header' ? 62 : 24) : 288 }] }]);
  } unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const height = this.dataset.detailKind ? (this.dataset.detailKind === 'header' ? 62 : 24) : 288;
    return { width: 220, height, top: 0, bottom: height, left: 0, right: 220, x: 0, y: 0, toJSON() {} };
  });
  HTMLElement.prototype.scrollTo = function (options) { this.scrollTop = options.top || 0; this.dispatchEvent(new Event('scroll')); };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalScrollTo) HTMLElement.prototype.scrollTo = originalScrollTo; else delete HTMLElement.prototype.scrollTo; });

async function render(name, payload, inspect = vi.fn()) {
  await act(async () => root.render(renderRoleplayToolCall({ toolName: name, callId: 'synthetic-call', phase: 'result',
    block: block(payload), useDisclosure, inspect }, native)));
  const disclosure = host.querySelector('[data-disclosure-row]');
  if (disclosure && !host.querySelector('.roleplay-result-browser')) await act(async () => disclosure.click());
  return inspect;
}
async function query(value) {
  await act(async () => {
    const input = host.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function readTail(text) {
  for (let index = 0; index < 10 && !host.querySelector('.roleplay-result-detail-scroll').textContent.includes(text); index++) {
    await act(async () => {
      const scroll = host.querySelector('.roleplay-result-detail-scroll');
      scroll.scrollTop = Math.max(0, parseFloat(scroll.firstElementChild.style.height) - 288);
      scroll.dispatchEvent(new Event('scroll'));
    });
  }
  expect(host.querySelector('.roleplay-result-detail-scroll').textContent).toContain(text);
}

it('retains all setting results, outside-scope required entries and complete tail matches without changing source records', () => {
  const payload = { status: 'ok', files, required_entries: [{ path: '外部/本轮必读', title: '本轮必读', read_strategy: 'required' }] };
  const result = model('eleckoi_glob_setting_files', payload);
  expect(result.entries).toHaveLength(87);
  expect(result.entries.at(-1)).toMatchObject({ path: '外部/本轮必读', requiredOnly: true, required: true });
  expect(resultMatchesQuery(result.entries[85], '末尾关键词85')).toBe(true);
  expect(result.entries[85].source.content).toBe(files[85].content);
  expect(payload.files).toHaveLength(86);
});
it('groups a grep path without dropping any of its matching lines, including the last line', () => {
  const matches = Array.from({ length: 150 }, (_, index) => ({ path: '合成组/长设定', title: '长设定', line: index + 1, text: `匹配行${index}` }));
  const result = model('eleckoi_grep_setting_files', { status: 'ok', required_entries: [], matches });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].matches).toHaveLength(150);
  expect(resultMatchesQuery(result.entries[0], '匹配行149')).toBe(true);
});
it('keeps fixed and turn-required settings distinct in search counts, directory badges and selected details', async () => {
  const listed = [
    { path: '固定设定', read_strategy: 'required' },
    { path: '关键词触发', read_strategy: 'keyword' },
    { path: '条件触发', read_strategy: 'normal' },
    { path: '普通选读', read_strategy: 'normal' },
  ];
  const payload = { status: 'ok', files: listed, required_entries: [...listed.slice(0, 3), { path: '范围外触发', read_strategy: 'keyword' }] };
  expect(model('eleckoi_glob_setting_files', payload).counts).toEqual({ matched: 4, fixed: 1, turn: 3, required: 0 });
  await render('eleckoi_glob_setting_files', payload);
  const badge = index => host.querySelector(`[data-result-index="${index}"] .roleplay-reading-badge`);
  expect(badge(0).textContent).toBe('固定必读'); expect(badge(0).dataset.readingKind).toBe('fixed');
  expect(badge(1).textContent).toBe('本轮须读'); expect(badge(2).dataset.readingKind).toBe('turn');
  expect(badge(3).textContent).toBe('选读'); expect(badge(4).textContent).toBe('本轮须读');
  expect(host.querySelector('.roleplay-result-summary').textContent).toBe('匹配 4固定必读 1本轮须读 3');
  await act(async () => host.querySelector('[data-result-index="2"]').click());
  expect(host.querySelector('.roleplay-result-detail .roleplay-reading-badge').textContent).toBe('本轮须读');
  await query('范围外触发');
  expect(host.querySelector('.roleplay-result-summary').textContent).toContain('固定必读 1本轮须读 3');
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('本轮须读，位于本次搜索范围之外。');
});
it('restores required metadata absent from grep matches and preserves keyword strategy when reading bodies', async () => {
  await render('eleckoi_grep_setting_files', { status: 'ok', matches: [{ path: '固定设定', line: 1, text: '完整命中' }],
    required_entries: [{ path: '固定设定', read_strategy: 'required', cached_reference: '#S01' }] });
  expect(host.querySelector('.roleplay-result-row .roleplay-reading-badge').textContent).toBe('固定必读');
  expect(host.querySelector('.roleplay-result-detail .roleplay-reading-badge').dataset.readingKind).toBe('fixed');
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('完整命中');
  await render('eleckoi_read_setting_files', { status: 'ok', files: [{ path: '关键词设定', read_strategy: 'keyword', content: '本次读取的完整正文' }] });
  expect(host.querySelector('.roleplay-result-row .roleplay-reading-badge').textContent).toBe('关键词');
  expect(host.querySelector('.roleplay-result-detail .roleplay-reading-badge').dataset.readingKind).toBe('keyword');
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('本次读取的完整正文');
});
it('keeps exact variable pointers, falsy values, complete rules and all 128 fields', () => {
  const result = model('eleckoi_read_variables', { status: 'ok', variables: [...variables.slice(0, 127),
    { ...variables[127], path: '/合成组/a~1b~0c', current: false, default: '', update_rule: '规则'.repeat(2000) + '末尾规则' }] });
  expect(result.entries).toHaveLength(128);
  expect(result.entries.at(-1)).toMatchObject({ title: 'a/b~c', path: '/合成组/a~1b~0c' });
  expect(resultMatchesQuery(result.entries.at(-1), '末尾规则')).toBe(true);
  expect(resultValueText(0)).toBe('0'); expect(resultValueText(false)).toBe('false');
  expect(resultValueText('')).toBe('""'); expect(resultValueText(null)).toBe('null');
});
it('virtualizes the entire directory and can scroll, search and read the final setting', async () => {
  await render('eleckoi_read_setting_files', { status: 'ok', files });
  expect(host.querySelector('[data-result-count]').dataset.resultCount).toBe('86');
  expect(host.querySelectorAll('.roleplay-result-row').length).toBeLessThan(20);
  const directory = host.querySelector('.roleplay-result-directory');
  await act(async () => { directory.scrollTop = 48 * 85; directory.dispatchEvent(new Event('scroll')); });
  expect(host.querySelector('[data-result-index="85"]').textContent).toContain('设定 85');
  await query('末尾关键词85');
  expect(host.querySelector('.roleplay-result-toolbar').textContent).toContain('1 / 86 项');
  await act(async () => host.querySelector('.roleplay-result-row').click());
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('合成正文 85');
  expect(host.querySelector('.roleplay-result-expand')).toBeNull();
  expect(host.querySelectorAll('.roleplay-result-part').length).toBeLessThan(30);
  await readTail('末尾关键词85');
  await act(async () => host.querySelector('.roleplay-result-back').click());
  expect(host.querySelector('.roleplay-result-browser').hasAttribute('data-reading')).toBe(false);
});
it('renders variable fields, preserved paging facts and native trajectory inspection', async () => {
  const inspect = await render('eleckoi_read_variables', { status: 'ok', variables: [...variables.slice(0, 127), {
    ...variables[127], current: { kind: 'text_page', text: '完整本页末尾', total_chars: 500, returned_chars: 7, char_offset: 20, has_more: true, next_char_offset: 27 },
  }] });
  await query('字段127');
  await act(async () => host.querySelector('.roleplay-result-row').click());
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('完整本页末尾');
  expect(host.querySelector('.roleplay-result-detail').textContent).toContain('尚有未返回内容');
  await act(async () => host.querySelector('.roleplay-tool-inspect').click());
  expect(inspect).toHaveBeenCalledOnce();
});
it('shows cached receipts exactly and leaves malformed, overflow and error results with the native renderer', async () => {
  const receipt = '已读取：#S01「合成人设」；正文见本轮前置缓存。';
  await render('eleckoi_read_setting_files', { status: 'ok', files: [{ path: '人设', title: '合成人设', read_strategy: 'required', content_delivery: 'cached_reference', cached_reference: '#S01', content: receipt }] });
  expect(host.textContent).toContain(receipt); expect(host.textContent).not.toContain('展开读取回执');
  await act(async () => root.render(renderRoleplayToolCall({ toolName: 'eleckoi_read_setting_files', phase: 'result', callId: 'overflow',
    block: block({ status: 'spilled', path: '/complete-result' }), useDisclosure }, native)));
  expect(host.textContent).toBe('Native original tool output');
  expect(renderRoleplayToolCall({ toolName: 'unregistered-synthetic-tool' }, native)).toBeUndefined();
  expect(model('eleckoi_glob_setting_files', { status: 'ok', files: ['invalid shape'] })).toBeUndefined();
  expect(roleplayToolResult(roleplayToolDefinition('eleckoi_read_variables'), { ...block({ status: 'ok', variables }), isError: true })).toBeUndefined();
});
it('renders structured partial failures and every selected search line without mounting a card for every match', async () => {
  await render('eleckoi_read_setting_files', { status: 'partial', files: [{ path: '合成失败', title: '失败设定', content_delivery: 'error',
    error: { code: 'ejs_render_failed', message: '合成解析失败' } }] });
  expect(host.querySelector('[role="alert"]').textContent).toContain('合成解析失败');
  await act(async () => root.render(renderRoleplayToolCall({ toolName: 'eleckoi_grep_variables', callId: 'grep-call', phase: 'result',
    block: block({ status: 'ok', matches: Array.from({ length: 150 }, (_, index) => ({ path: '/合成变量', line: index + 1, text: `完整匹配${index}` })) }), useDisclosure }, native)));
  if (!host.querySelector('.roleplay-result-browser')) await act(async () => host.querySelector('[data-disclosure-row]').click());
  expect(host.querySelectorAll('.roleplay-result-part').length).toBeLessThan(30);
  await readTail('完整匹配149');
});
it('partitions long single lines, blank lines and surrogate pairs without dropping or replacing any text', () => {
  const text = '合成𠮷😀'.repeat(4000) + '\r\n\n末尾完整正文';
  const segments = resultTextSegments(text);
  expect(segments.join('')).toBe(text);
  expect(segments.length).toBeGreaterThan(10);
  expect(segments.some(segment => /[\uD800-\uDBFF]$/.test(segment))).toBe(false);
});

it.each(['variables', 'settings'])('routes %s modifications through the official disclosure row with readable content and inspect access', async domain => {
  const toolName = domain === 'variables' ? 'eleckoi_apply_variable_patch' : 'eleckoi_apply_setting_patch';
  const args = domain === 'variables' ? { operations: [{ op: 'replace', path: '/剧情/共伞', value: true }, { op: 'delta', path: '/关系/好感度', value: 1 }] }
    : { operation: 'edit_file', path: '场景/雨夜', old_string: '原文保留全部', new_string: '新文保留全部' };
  const payload = domain === 'variables' ? { status: 'ok', applied_operations: 2, paths: ['/剧情/共伞', '/关系/好感度'] }
    : { status: 'ok', changed: true, path: '场景/雨夜', replacements: 1 };
  const inspect = vi.fn();
  await act(async () => root.render(renderRoleplayToolCall({ toolName, phase: 'result', callId: 'synthetic-mutation', useDisclosure, inspect,
    block: { ...block(payload), call: { name: toolName, argsRaw: JSON.stringify(args) } } }, native)));
  expect(host.querySelector('[data-mutation-state="changed"]')).toBeTruthy();
  expect(host.textContent).not.toContain('Native original tool output');
  expect(host.querySelector('[data-disclosure-row] svg')).toBeTruthy();
  await act(async () => host.querySelector('[data-disclosure-row]').click());
  await act(async () => new Promise(resolve => requestAnimationFrame(resolve)));
  if (domain === 'variables') { expect(host.textContent).toContain('共伞'); expect(host.textContent).toContain('增加'); }
  else { expect(host.textContent).toContain('原文保留全部'); expect(host.textContent).toContain('新文保留全部'); }
  await act(async () => host.querySelector('.roleplay-tool-inspect').click()); expect(inspect).toHaveBeenCalledOnce();
});
