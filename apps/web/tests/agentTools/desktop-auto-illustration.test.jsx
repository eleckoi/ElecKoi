import { AutoIllustrationPage } from '../../../../packages/client/features/dsh-auto-illustration/src/page.jsx';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { AutoIllustrationSettings } from '../../src/modules/autoIllustration/components/AutoIllustrationSettings.jsx';

let host, root;
const config = (id, provider = 'novelai_image') => ({ id, name: id, provider, model: 'nai-diffusion-4-5-full',
  image_settings: { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' } });
function catalog(configs = []) {
  let snapshot = { configs, status: 'ready', error: '' };
  const listeners = new Set();
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    save: vi.fn(async value => value), refresh: vi.fn(),
    publish(value) { snapshot = value; listeners.forEach(listener => listener()); } };
}
const find = text => [...document.querySelectorAll('button')].find(button => button.textContent === text || button.getAttribute('aria-label') === text);
async function click(element) { expect(element).toBeTruthy(); await act(async () => element.click()); }
async function render(child, models) {
  await act(async () => root.render(<MainPageContext.Provider value={{ models }}>{child}</MainPageContext.Provider>));
}
async function escape() {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
}
async function change(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  delete document.documentElement.dataset.eleckoiMobile;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Desktop automatic illustration dialogs', () => {
  it('uses desktop tabs and actions without a mobile sheet, including a narrow desktop window', async () => {
    vi.stubGlobal('innerWidth', 390);
    await render(<AutoIllustrationSettings onSelect={vi.fn()} />, catalog([config('image-config-a'), config('text-config', 'custom')]));
    expect(document.querySelector('.desktop-auto-illustration-settings')).toBeTruthy();
    await click(document.querySelector('.auto-illustration-model'));
    const dialog = document.querySelector('.desktop-illustration-models');
    expect(dialog).toBeTruthy();
    expect(document.querySelector('.mobile-conversation-overlay')).toBeNull();
    expect(document.querySelector('.mobile-sheet-handle')).toBeNull();
    expect(dialog.querySelector('.chat-model-tabs')).toBeTruthy();
    expect(dialog.querySelector('.desktop-illustration-scroll')).toBeTruthy();
    expect([...dialog.querySelectorAll('footer button')].map(button => button.textContent)).toEqual(['取消', '保存']);
    expect(dialog.textContent).not.toContain('text-config');
    expect(find('参数').disabled).toBe(true);
    expect(find('保存').disabled).toBe(true);
  });

  it('saves parameter edits and the exact model binding through the shared catalog', async () => {
    const models = catalog([config('image-config-a'), config('image-config-b')]), select = vi.fn(async () => {});
    await render(<AutoIllustrationSettings configId="image-config-a" onSelect={select} />, models);
    await click(document.querySelector('.auto-illustration-model'));
    await click(find('设置 image-config-b 的参数'));
    const input = [...document.querySelectorAll('label')].find(label => label.textContent === '每轮分镜数').querySelector('input');
    await change(input, '2'); await click(find('保存'));
    expect(models.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'image-config-b', image_settings: expect.objectContaining({ fixedImageCount: 2, width: 832 }) }));
    expect(select).toHaveBeenCalledWith('image-config-b');
    expect(document.querySelector('.desktop-illustration-models')).toBeNull();
  });

  it('closes an unchanged picker with Escape and restores focus to its trigger', async () => {
    await render(<AutoIllustrationSettings onSelect={vi.fn()} />, catalog());
    const opener = document.querySelector('.auto-illustration-model'); opener.focus();
    await click(opener);
    expect(document.activeElement).toBe(find('关闭绘图模型选择'));
    await escape();
    expect(document.querySelector('.desktop-illustration-models')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('warns before discarding a changed selection and retains it when the warning is cancelled', async () => {
    const select = vi.fn();
    await render(<AutoIllustrationSettings onSelect={select} />, catalog([config('image-config-a')]));
    await click(document.querySelector('.auto-illustration-model'));
    await click(document.querySelector('.desktop-illustration-config .desktop-illustration-choice'));
    await escape();
    expect(document.querySelector('[role=alertdialog]')).toBeTruthy();
    expect(document.querySelector('.desktop-illustration-models')).toBeTruthy();
    await escape();
    expect(document.querySelector('[role=alertdialog]')).toBeNull();
    expect(document.querySelector('.desktop-illustration-config [aria-pressed=true]')).toBeTruthy();
    await click(find('取消')); await click(find('不保存'));
    expect(document.querySelector('.desktop-illustration-models')).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('retains a failed binding draft, then blocks saving if the selected configuration is removed', async () => {
    const models = catalog([config('image-config-a')]), select = vi.fn(async () => { throw new Error('Synthetic binding failure'); });
    await render(<AutoIllustrationSettings onSelect={select} />, models);
    await click(document.querySelector('.auto-illustration-model'));
    await click(document.querySelector('.desktop-illustration-config .desktop-illustration-choice'));
    await click(find('保存'));
    expect(document.querySelector('.desktop-illustration-models [role=alert]').textContent).toContain('Synthetic binding failure');
    expect(document.querySelector('.desktop-illustration-config [aria-pressed=true]')).toBeTruthy();
    await act(async () => models.publish({ configs: [], status: 'ready', error: '' }));
    expect(find('保存').disabled).toBe(true);
    expect(document.body.textContent).toContain('绑定的图片模型配置已不可用');
  });

  it('keeps the picker open while a binding is being saved', async () => {
    let finish;
    const select = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    await render(<AutoIllustrationSettings onSelect={select} />, catalog([config('image-config-a')]));
    await click(document.querySelector('.auto-illustration-model'));
    await click(document.querySelector('.desktop-illustration-config .desktop-illustration-choice'));
    await click(find('保存'));
    await escape();
    expect(document.querySelector('.desktop-illustration-models').getAttribute('aria-busy')).toBe('true');
    expect(find('关闭绘图模型选择').disabled).toBe(true);
    await act(async () => finish());
    expect(document.querySelector('.desktop-illustration-models')).toBeNull();
  });

  it('configures drawing in the independent plugin and retains its page when the picker closes', async () => {
    const models = catalog([config('image-config-a')]);
    const current = { id: 'preset-a', name: '合成预设', autoIllustration: { enabled: true, modelConfigId: 'image-config-a' }, regexRules: [] };
    const presets = { refresh: vi.fn(async () => ({ presets: [{ id: current.id, name: current.name, purpose: 'roleplay' }], activePresetIds: { roleplay: current.id } })), read: vi.fn(async () => current), save: vi.fn(async value => value) };
    await render(<AutoIllustrationPage presetCatalog={presets} modelCatalog={models} />, models);
    expect(document.querySelector('.auto-illustration-model').textContent).toContain('image-config-a');
    await click(document.querySelector('.auto-illustration-model'));
    await escape();
    expect(document.querySelector('.auto-illustration-plugin')).toBeTruthy();
    expect(document.querySelector('.desktop-illustration-model-dialog')).toBeNull();
    expect(presets.save).not.toHaveBeenCalled();
    await click(document.querySelector('.auto-illustration-plugin [role=switch]'));
    expect(presets.save).toHaveBeenCalledWith(expect.objectContaining({ autoIllustration: { enabled: false, modelConfigId: 'image-config-a' } }), []);
  });
});
