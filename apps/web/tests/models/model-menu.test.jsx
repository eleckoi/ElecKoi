// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { OfficialModelMenu, modelMenuText } from '../helpers/officialModelMenu.js';
import { ModelLabel, ModelProviderLabel, ModelMenuParameters } from '../../src/modules/models/components/ModelMenuParameters.jsx';
import claudeIcon from '../../src/assets/model-icons/claude.svg';
let root, host;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('React', React);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const button = name => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === name);
const confirmationButton = name => [...document.querySelectorAll('[role=alertdialog] button')].find(node => node.textContent.trim() === name);
async function edit(name, value) { const input = document.querySelector(`[data-parameter="${name}"] input`); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function fixture({ reasoning = true, modelId = 'synthetic-a', modelName = '合成模型甲', badge } = {}) {
  const config = { id: 'synthetic-config', name: '合成接口', provider: 'custom', model: modelId, model_options: [
    { id: modelId, name: modelName, temperature: .2, topP: .8 }, { id: 'synthetic-b', name: '合成模型乙' }] };
  const sessionId = 'synthetic-session'; let parameters = { revision: 0, entries: {} };
  let configs = { configs: [config] }, snapshot = { current: { provider: config.id, model: config.model }, routable: true, status: 'ready', pending: null, error: null, failures: [],
    groups: [{ id: config.id, name: config.name, models: config.model_options.map(option => ({ id: option.id, name: option.name, ...(badge ? { badge } : {}), ...(reasoning ? { reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } } : {}) })) }] };
  const listeners = new Set(), notify = () => [...listeners].forEach(listener => listener());
  const catalog = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => configs, parameterEdits: new Map(),
    sessionParameters: () => ({ subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => parameters }),
    readSessionModelParameters: vi.fn(async () => parameters),
    saveSessionModelParameters: vi.fn(async (_session, id, model, patch) => { const key=JSON.stringify([id,model]); parameters={revision:parameters.revision+1,entries:{...parameters.entries,[key]:{...parameters.entries[key],...patch}}};notify();return parameters; }) };
  const select = vi.fn(async selection => { snapshot = { ...snapshot, current: selection }; notify(); return { ok: true }; });
  await act(async () => root.render(<OfficialModelMenu available locked={false} directory={{ subscribe: catalog.subscribe, getSnapshot: () => snapshot }} load={() => {}} select={select} t={modelMenuText} resolveText={value => value}
    renderSlot={(name, owner, options) => name === 'conversation.input.model.label' ? <ModelLabel {...owner} catalog={catalog} resolveText={text => typeof text === 'string' ? text : text['zh-CN']} /> : name.endsWith('.parameters') ? <ModelMenuParameters {...owner} sessionId={sessionId} catalog={catalog} /> : name.endsWith('.provider.label') ? <ModelProviderLabel {...owner} catalog={catalog} /> : options?.fallback} />));
  await click(host.querySelector('button'));
  return { catalog, select, config };
}
it('shows icons on the external trigger and provider heading while model rows remain text-only', async () => {
  const f = await fixture();
  expect(host.querySelectorAll('.model-trigger-identity')).toHaveLength(1);
  expect(document.querySelector('[role=menu] .model-trigger-identity')).toBeNull();
  expect(document.querySelector('.chat-model-save, .chat-model-cancel, .mobile-chat-models')).toBeNull();
  expect(button('参数')).not.toBeNull();
  await click([...document.querySelectorAll('[role=menuitem]')].find(node => node.textContent.startsWith('模型')));
  const options = [...document.querySelectorAll('[role=menuitemradio]')];
  expect(options).toHaveLength(2); expect(options.every(node => !node.querySelector('img, .model-identity-fallback'))).toBe(true);
  expect(document.querySelectorAll('.model-provider-identity')).toHaveLength(1);
  expect(document.querySelector('.model-provider-label').textContent).toBe('合成接口');
  await click(options[1]); expect(f.select).toHaveBeenCalledWith({ provider: 'synthetic-config', model: 'synthetic-b' });
  expect(document.querySelector('[role=menu]')).toBeNull();
});
it('uses the selected model ID for its trigger artwork and preserves catalog names and localized badges', async () => {
  await fixture({ modelId: 'claude-opus-4-6', modelName: '合成显示名称', badge: { text: { 'zh-CN': '合成标签' }, tone: 'neutral' } });
  const label = host.querySelector('.model-selection-label');
  expect(label.querySelector('img').getAttribute('src')).toBe(claudeIcon);
  expect(label.textContent).toBe('合成标签合成显示名称');
  expect(document.querySelector('[role=menu] .model-selection-label').textContent).toBe('合成显示名称合成标签');
  expect(document.querySelector('[role=menu] .model-selection-label img')).toBeNull();
});
it('keeps reasoning selection on the native menu and never duplicates it in parameter fields', async () => {
  const f = await fixture();
  await click([...document.querySelectorAll('[role=menuitem]')].find(node => node.textContent.startsWith('推理等级')));
  await click(button('High'));
  expect(f.select).toHaveBeenCalledWith({ provider: 'synthetic-config', model: 'synthetic-a', reasoningEffort: 'high' });
  await click(host.querySelector('button')); await click(button('参数'));
  expect(document.querySelector('[data-parameter=reasoning]')).toBeNull();
});
it('keeps model capability declarations out of the per-session parameter menu', async () => {
  await fixture({ reasoning:false }); await click(button('参数'));
  expect(document.querySelector('.chat-model-capabilities')).toBeNull();
  expect(document.querySelector('.model-reasoning-profile')).toBeNull();
});
it('keeps edits local through idle and blur, asks before closing, and saves together only on Save', async () => {
  const f = await fixture(); await click(button('参数'));
  await edit('top-p', '0.93'); await edit('temperature', '0.7');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  const input = document.querySelector('[data-parameter=temperature] input');
  await act(async () => { input.focus(); button('参数').focus(); });
  expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
  await act(async () => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull();
  await click(confirmationButton('取消'));
  expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.7');
  await click(button('保存'));
  expect(f.catalog.saveSessionModelParameters).toHaveBeenCalledWith('synthetic-session', 'synthetic-config', 'synthetic-a', { topP: .93, temperature: .7 }, 0);
  expect(f.catalog.saveSessionModelParameters).toHaveBeenCalledTimes(1);
  expect(button('参数').getAttribute('aria-expanded')).toBe('false');
  expect(f.config.model_options[0]).toMatchObject({ temperature: .2, topP: .8 });
});
it('cancels numeric edits without writing and restores saved values on reopening', async () => {
  const f = await fixture(); await click(button('参数'));
  await edit('temperature', '0.6');
  await click(button('取消'));
  expect(document.activeElement).toBe(button('参数'));
  await click(button('参数'));
  expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.2');
  expect(button('保存').disabled).toBe(true);
  expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
});
it('retains a rejected explicit save across closing and reopening and retries from Save', async () => {
  const f = await fixture(); f.catalog.saveSessionModelParameters.mockRejectedValueOnce(Error('合成保存失败'));
  await click(button('参数')); await edit('temperature', '0.65');
  await click(button('保存'));
  expect(document.querySelector('[role=alert]').textContent).toContain('合成保存失败');
  await click(host.querySelector('button'));
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull();
  await click(confirmationButton('取消'));
  expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.65');
  expect(f.catalog.saveSessionModelParameters).toHaveBeenCalledTimes(1);
  await click(button('保存')); expect(document.querySelector('.model-menu-error')).toBeNull();
  expect(f.catalog.saveSessionModelParameters).toHaveBeenCalledTimes(2);
});
it('rejects invalid drafts before saving and prevents duplicate writes while a save is pending', async () => {
  const f = await fixture(); await click(button('参数'));
  await edit('top-p', '1.5');
  expect(button('保存').disabled).toBe(true);
  await click(button('保存')); expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
  await click(host.querySelector('button'));
  expect(confirmationButton('保存').disabled).toBe(true);
  expect(document.querySelector('[role=alertdialog] [role=alert]').textContent).toContain('模型参数超出有效范围');
  await click(confirmationButton('取消'));
  await edit('top-p', '0.5');
  let complete;
  f.catalog.saveSessionModelParameters.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  await click(button('保存'));
  expect(document.querySelector('[data-parameter=top-p] input').matches(':disabled')).toBe(true);
  expect(button('取消').matches(':disabled')).toBe(true);
  await click(button('保存'));
  expect(f.catalog.saveSessionModelParameters).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  expect(button('参数').getAttribute('aria-expanded')).toBe('false');
});
it('retains native number-input keyboard behavior and confirms Escape before discarding a draft', async () => {
  const f = await fixture(); const parameters = button('参数'); parameters.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await act(async () => parameters.dispatchEvent(tab));
  await act(async () => new Promise(resolve => window.requestAnimationFrame(resolve)));
  const input = document.querySelector('[data-parameter=temperature] input');
  expect(tab.defaultPrevented).toBe(true); expect(document.activeElement).toBe(input);
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
  await act(async () => input.dispatchEvent(arrow)); expect(arrow.defaultPrevented).toBe(false);
  await edit('temperature', '0.64');
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => input.dispatchEvent(escape)); expect(escape.defaultPrevented).toBe(true);
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull();
  expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
  await click(confirmationButton('不保存'));
  expect(document.querySelector('[data-model-parameters-fields]')).toBeNull();
  await click(host.querySelector('button')); await click(button('参数'));
  expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.2');
});

it.each(['outside','trigger','parameters','model-pane'])('guards session parameter drafts on %s without changing shared model configuration', async target => {
  const f=await fixture();await click(button('参数'));await edit('temperature','0.61');
  if(target==='outside')await act(async()=>document.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})));
  else await click(target==='trigger'?host.querySelector('button'):target==='parameters'?button('参数'):[...document.querySelectorAll('[role=menuitem]')].find(node=>node.textContent.startsWith('模型')));
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull();expect(f.catalog.saveSessionModelParameters).not.toHaveBeenCalled();
  await click(confirmationButton('取消'));expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.61');
  await click(host.querySelector('button'));await click(confirmationButton('不保存'));
  await click(host.querySelector('button'));await click(button('参数'));expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.2');
});

it('keeps saved values and cancelled drafts isolated when switching between two Sessions using the same model', async () => {
  const config = { id: 'provider', provider: 'custom', model: 'model', model_options: [{ id: 'model', temperature: .2 }] };
  const snapshot = { configs: [config] }, states = new Map(), listeners = new Set();
  const read = id => { if (!states.has(id)) states.set(id, { revision: 0, entries: {} }); return states.get(id); };
  const catalog = { subscribe: () => () => {}, getSnapshot: () => snapshot,
    sessionParameters: id => ({ getSnapshot: () => read(id), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } }),
    readSessionModelParameters: async id => read(id), saveSessionModelParameters: vi.fn(async (id, provider, model, patch) => {
      const current = read(id), key = JSON.stringify([provider, model]);
      const next = { revision: current.revision + 1, entries: { ...current.entries, [key]: { ...current.entries[key], ...patch } } };
      states.set(id, next); listeners.forEach(fn => fn()); return next;
    }) };
  const render = async sessionId => { await act(async () => root.render(<ModelMenuParameters provider={{ id: 'provider' }} model={{ id: 'model' }} sessionId={sessionId} catalog={catalog} />)); await click(button('参数')); };
  await render('roleplay-session'); await edit('temperature', '0.31'); await click(button('保存'));
  await render('studio-session'); expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.2');
  await edit('temperature', '0.85'); await click(button('取消'));
  await render('roleplay-session'); expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.31');
  expect(config.model_options[0].temperature).toBe(.2);
  expect(read('studio-session')).toEqual({ revision: 0, entries: {} });
  expect(catalog.saveSessionModelParameters).toHaveBeenCalledExactlyOnceWith('roleplay-session', 'provider', 'model', { temperature: .31 }, 0);
});
