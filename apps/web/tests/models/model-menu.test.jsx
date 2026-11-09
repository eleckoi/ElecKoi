// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { OfficialModelMenu, modelMenuText } from '../helpers/officialModelMenu.js';
import { ModelProviderLabel, ModelMenuParameters } from '../../src/modules/models/components/ModelMenuParameters.jsx';
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
async function edit(name, value) { const input = document.querySelector(`[data-parameter="${name}"] input`); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function fixture({ reasoning = true } = {}) {
  const config = { id: 'synthetic-config', name: '合成接口', provider: 'custom', model: 'synthetic-a', model_options: [
    { id: 'synthetic-a', name: '合成模型甲', temperature: .2, topP: .8 }, { id: 'synthetic-b', name: '合成模型乙' }] };
  let configs = { configs: [config] }, snapshot = { current: { provider: config.id, model: config.model }, routable: true, status: 'ready', pending: null, error: null, failures: [],
    groups: [{ id: config.id, name: config.name, models: config.model_options.map(option => ({ id: option.id, name: option.name, ...(reasoning ? { reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } } : {}) })) }] };
  const listeners = new Set(), notify = () => [...listeners].forEach(listener => listener());
  const catalog = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => configs, parameterEdits: new Map(),
    saveModelParameters: vi.fn(async (id, model, patch) => { configs = { configs: configs.configs.map(item => ({ ...item, model_options: item.model_options.map(option => option.id === model ? { ...option, ...patch } : option) })) }; notify(); }) };
  const select = vi.fn(async selection => { snapshot = { ...snapshot, current: selection }; notify(); return { ok: true }; });
  await act(async () => root.render(<OfficialModelMenu available locked={false} directory={{ subscribe: catalog.subscribe, getSnapshot: () => snapshot }} load={() => {}} select={select} t={modelMenuText} resolveText={value => value}
    renderSlot={(name, owner, options) => name.endsWith('.parameters') ? <ModelMenuParameters {...owner} catalog={catalog} /> : name.endsWith('.provider.label') ? <ModelProviderLabel {...owner} catalog={catalog} /> : options?.fallback} />));
  await click(host.querySelector('button'));
  return { catalog, select, config };
}
it('shows an icon only on the provider heading and selects a native text-only model option immediately', async () => {
  const f = await fixture();
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
it('keeps reasoning selection on the native menu and never duplicates it in parameter fields', async () => {
  const f = await fixture();
  await click([...document.querySelectorAll('[role=menuitem]')].find(node => node.textContent.startsWith('推理等级')));
  await click(button('High'));
  expect(f.select).toHaveBeenCalledWith({ provider: 'synthetic-config', model: 'synthetic-a', reasoningEffort: 'high' });
  await click(host.querySelector('button')); await click(button('参数'));
  expect(document.querySelector('[data-parameter=reasoning]')).toBeNull();
});
it('lets a custom model without reasoning metadata explicitly declare offered levels from the parameter menu', async () => {
  const f = await fixture({ reasoning: false });
  expect([...document.querySelectorAll('[role=menuitem]')].some(node => node.textContent.startsWith('推理等级'))).toBe(false);
  await click(button('参数'));
  await click(document.querySelector('.chat-model-capabilities summary'));
  const high = document.querySelector('button[aria-label="声明支持高档位"]');
  await click(high);
  expect(high.getAttribute('aria-pressed')).toBe('true');
  await act(async () => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(f.catalog.saveModelParameters).toHaveBeenCalledWith('synthetic-config', 'synthetic-a', { reasoningEfforts: { high: 'high' } });
});
it('automatically writes successive changes and flushes the final edit when the menu closes', async () => {
  const f = await fixture(); await click(button('参数'));
  await edit('top-p', '0.93'); await edit('temperature', '0.7');
  expect(f.catalog.saveModelParameters).not.toHaveBeenCalled();
  await act(async () => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(f.catalog.saveModelParameters).toHaveBeenCalledWith('synthetic-config', 'synthetic-a', { topP: .93, temperature: .7 });
  expect(f.config.model_options[0]).toMatchObject({ temperature: .2, topP: .8 });
});
it('retains a rejected edit across closing and reopening and offers retry without a save step', async () => {
  const f = await fixture(); f.catalog.saveModelParameters.mockRejectedValueOnce(Error('合成保存失败'));
  await click(button('参数')); await edit('temperature', '0.65');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 420)); });
  expect(document.querySelector('[role=alert]').textContent).toContain('合成保存失败');
  await click(host.querySelector('button')); await click(host.querySelector('button')); await click(button('参数'));
  expect(document.querySelector('[data-parameter=temperature] input').value).toBe('0.65');
  await click(button('重试')); expect(document.querySelector('.model-menu-error')).toBeNull();
});
it('retains native number-input keyboard behavior and closes the menu with Escape', async () => {
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
  expect(document.querySelector('[data-model-parameters-fields]')).toBeNull();
  expect(f.catalog.saveModelParameters).toHaveBeenCalledWith('synthetic-config', 'synthetic-a', { temperature: .64 });
});
