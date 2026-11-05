import { AutoIllustrationPage } from '../../../../packages/client/features/dsh-auto-illustration/src/page.jsx';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { AutoIllustrationSettings } from '../../src/modules/autoIllustration/components/AutoIllustrationSettings.jsx';

let host, root, handlers;
const find = text => [...document.querySelectorAll('button')].find(button => button.textContent === text || button.getAttribute('aria-label') === text);
async function click(element) { expect(element).toBeTruthy(); await act(async () => element.click()); }
function catalog(configs = []) {
  let snapshot = { configs, status: 'ready', error: '' };
  const listeners = new Set();
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    save: vi.fn(async config => config), refresh: vi.fn(async () => snapshot.configs),
    publish(value) { snapshot = value; listeners.forEach(listener => listener()); } };
}
const config = (id, provider = 'novelai_image') => ({ id, name: id, provider, model: 'nai-diffusion-4-5-full', enabled: false, image_settings: { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' } });
async function render(child, models) {
  await act(async () => root.render(<MainPageContext.Provider value={{ models, registerBackHandler: handler => {
    handlers.push(handler); return () => handlers.splice(handlers.indexOf(handler), 1);
  } }}>{child}</MainPageContext.Provider>));
}
async function change(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.documentElement.dataset.eleckoiMobile = 'true'; handlers = [];
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete document.documentElement.dataset.eleckoiMobile; vi.unstubAllGlobals(); });

describe('Android preset automatic illustration', () => {
  it('lists only NAI image configurations and saves parameters plus the explicit preset binding', async () => {
    const models = catalog([config('NAI-A'), config('NAI-B'), config('text-config', 'custom'), config('other-image', 'openai_image')]);
    const select = vi.fn(async () => {});
    await render(<AutoIllustrationSettings onSelect={select} />, models);
    await click(document.querySelector('.auto-illustration-model'));
    expect(document.querySelector('.mobile-illustration-models')).toBeTruthy();
    expect(document.querySelector('.mobile-sheet-handle')).toBeTruthy();
    expect(document.querySelector('.desktop-illustration-models')).toBeNull();
    expect(document.querySelector('.desktop-auto-illustration-settings')).toBeNull();
    expect(document.body.textContent).toContain('NAI-A'); expect(document.body.textContent).not.toContain('text-config');
    expect(document.body.textContent).not.toContain('other-image');
    await click(find('设置 NAI-B 的参数'));
    expect(document.body.textContent).toContain('每轮分镜数'); expect(document.body.textContent).toContain('全局固定词');
    const input = [...document.querySelectorAll('label')].find(label => label.textContent === '每轮分镜数').querySelector('input');
    await change(input, '2'); await click(find('保存'));
    expect(models.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'NAI-B', image_settings: expect.objectContaining({ fixedImageCount: 2, width: 832 }) }));
    expect(select).toHaveBeenCalledWith('NAI-B');
  });

  it('updates a loading catalog, retains drafts on failure and discards without changing the preset', async () => {
    const models = catalog(); models.publish({ configs: [], status: 'loading', error: '' });
    const select = vi.fn(async () => { throw new Error('合成保存失败'); });
    await render(<AutoIllustrationSettings onSelect={select} />, models);
    await click(document.querySelector('.auto-illustration-model'));
    await act(async () => models.publish({ configs: [config('NAI-A')], status: 'ready', error: '' }));
    await click(find('设置 NAI-A 的参数')); await click(find('保存'));
    expect(document.body.textContent).toContain('合成保存失败');
    await act(async () => handlers.at(-1)());
    expect(document.querySelector('[role=tab][aria-selected=true]').textContent).toBe('模型');
    await act(async () => handlers.at(-1)());
    expect(document.querySelector('[role=alertdialog]')).toBeTruthy();
    await click(find('不保存'));
    expect(document.querySelector('.mobile-illustration-models')).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('saves plugin configuration without adding a preset tool or changing other model bindings', async () => {
    const models = catalog([config('NAI-A'), config('NAI-B')]);
    const current = { id: 'preset-a', name: '合成预设', autoIllustration: { enabled: true, modelConfigId: 'NAI-A' }, toolModelConfigIds: { other: 'text-model' }, toolGroups: [], regexRules: [] };
    const presets = { refresh: vi.fn(async () => ({ presets: [{ id: current.id, name: current.name, purpose: 'roleplay' }], activePresetIds: { roleplay: current.id } })), read: vi.fn(async () => current), save: vi.fn(async value => value) };
    await render(<AutoIllustrationPage presetCatalog={presets} modelCatalog={models} />, models);
    await click(document.querySelector('.auto-illustration-model'));
    await click([...document.querySelectorAll('.mobile-config-choice strong')].find(item => item.textContent === 'NAI-B').closest('button'));
    await click(find('保存'));
    expect(presets.save).toHaveBeenCalledWith(expect.objectContaining({ autoIllustration: { enabled: true, modelConfigId: 'NAI-B' }, toolModelConfigIds: { other: 'text-model' }, toolGroups: [] }), []);
    expect(document.querySelector('.auto-illustration-model').textContent).toContain('NAI-B');
  });
});
