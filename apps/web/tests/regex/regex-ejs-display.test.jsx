// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
const tasks = vi.hoisted(() => []);
vi.mock('../../src/modules/regex/runtime/runRegexEjs.js', () => ({ runRegexEjs: (input, options) => new Promise(resolve => tasks.push({ input, options, resolve })) }));
import { useRegexEjsDisplay } from '../../src/modules/regex/useRegexEjsDisplay.js';
import { RegexRuleInspector } from '../../src/modules/regex/components/RegexRuleInspector.jsx';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal('React', React);
const message = { id: 'synthetic-message', conversationId: 'synthetic-chat', role: 'assistant', status: 'complete', content: 'Narrative', variableStateJson: '{"score":12}' };
function Probe({ message, content }) { const result = useRegexEjsDisplay(message, content); return <output data-pending={result.pending}>{result.content}|{result.error}</output>; }

describe('regex EJS display lifecycle', () => {
  it('only renders complete regex output, releases pending work and refuses old message results', async () => {
    tasks.length = 0;
    const node = document.createElement('div'), root = createRoot(node); document.body.append(node);
    const render = async (content, changes = {}) => act(() => root.render(<Probe message={{ ...message, ...changes }} content={content.includes('<%') ? '<!-- eleckoi:regex-ejs:start -->'+content+'<!-- eleckoi:regex-ejs:end -->' : content} />));
    try {
      await render('<%= variables.score %>', { status: 'streaming' }); expect(tasks).toHaveLength(0);
      await render('<%= variables.score %>'); expect(tasks).toHaveLength(1);
      expect(node.querySelector('output').dataset.pending).toBe('true');
      expect(node.textContent).toBe('Narrative|');
      expect(tasks[0].input.variables).toEqual({ score: 12 });
      await act(() => tasks[0].resolve({ content: '12' })); expect(node.textContent).toBe('12|');
      expect(node.querySelector('output').dataset.pending).toBe('false');
      await render('<%= variables.score %>', { variableStateJson: '{"score":20}' }); expect(node.textContent).toBe('12|');
      await render('Narrative'); expect(tasks[1].options.signal.aborted).toBe(true);
      await act(() => tasks[1].resolve({ content: 'Late disabled output' })); expect(node.textContent).toBe('Narrative|');
      await render('<%= variables.score %>', { id: 'synthetic-other-message', variableSnapshotAvailable: false });
      expect(tasks[2].input.variables).toBeNull(); expect(node.textContent).toBe('Narrative|');
    } finally { await act(() => root.unmount()); node.remove(); }
    expect(tasks[2].options.signal.aborted).toBe(true);
  });
  it('uses the existing regex inspector and sends explicit test scope and variables', async () => {
    const node = document.createElement('div'), root = createRoot(node); document.body.append(node);
    const onTest = vi.fn(async () => ({ output: '12', validationMessage: null }));
    const rule = { id: 'synthetic-rule', name: 'Synthetic rule', pattern: 'x', replacement: '<%= getvar("score") %>', targets: ['AiOutput'], displayOnly: true, promptOnly: false, runOnEdit: false };
    try {
      await act(() => root.render(<RegexRuleInspector scope="Character" rule={rule} onTest={onTest} onChange={() => {}} />));
      const fields = [...node.querySelectorAll('.regex-test label')];
      const variables = fields.find(label => label.textContent.includes('测试变量')).querySelector('textarea');
      await act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(variables, '{"score":12}'); variables.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { node.querySelector('.regex-test-heading button').click(); await Promise.resolve(); });
      expect(onTest).toHaveBeenCalledWith('', rule, 'AiOutput', { surface: 'Display', variablesJson: '{"score":12}' }, expect.any(AbortSignal));
      expect(fields.find(label => label.querySelector('span')?.textContent === '结果').querySelector('textarea').value).toBe('12');
    } finally { await act(() => root.unmount()); node.remove(); }
  });
});
