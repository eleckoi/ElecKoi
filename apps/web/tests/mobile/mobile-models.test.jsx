// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileModelsPage } from '../../src/mobile/MobileModelsPage.jsx';
import { blankConfigForProvider } from '../../src/modules/models/model/modelProviderCatalog.js';
import { initialConfigForProvider } from '../../src/modules/models/model/modelConfigDraft.js';
import projectLogo from '../../src/assets/eleckoi-app-icon.png';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('../../src/modules/settings/index.js', () => ({
  LIST_COLLAPSE_AREAS: { models: 'models' },
  usePersistentCollapseState: (_area, initial) => [...React.useState(initial), true],
}));

let root, container, view, snapshot, subscribers;
const config = (provider = 'custom', patch = {}) => ({
  ...blankConfigForProvider(provider), id: `example-${provider}`, name: 'Example configuration', ...patch,
});
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const field = text => [...container.querySelectorAll('label')].find(node => node.textContent.trim().startsWith(text))?.querySelector('input');
async function change(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(configs = [], route = { kind: 'root' }, save = async value => value, options = {}) {
  snapshot = { configs, providers: options.providers || [], status: 'ready', error: '' };
  subscribers = new Set();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const guardRef = { current: null };
  const leave = vi.fn();
  view = {
    models: {
      subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); },
      getSnapshot: () => snapshot, save: vi.fn(save),
      discover: vi.fn(options.discover || (async () => [])),
    },
    chat: { modelOptionsByKey: {}, notify: vi.fn() }, route, guardRef,
    scrollPositions: new Map(), pushRoute: vi.fn(), openDrawer: vi.fn(),
    registerBackHandler: () => () => {},
    goBack: () => guardRef.current ? guardRef.current(leave) : leave(), leave,
    renderLayout: ({ mainPanel, overlays }) => <>{mainPanel}{overlays}</>,
  };
  await act(async () => root.render(<MainPageContext.Provider value={view}><div className="mobile-shell"><MobileModelsPage /></div></MainPageContext.Provider>));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

describe('Android model library and configuration actions', () => {
  it('lists only saved configurations with their names and IDs, and folds the general section', async () => {
    const custom = config('custom', { id: 'example-custom', name: 'Example gateway' });
    await mount([custom, config('deepseek', { name: 'DeepSeek' })]);
    expect(container.querySelector('section[aria-label="绘画模型"]')).toBeNull();
    const customRow = [...container.querySelectorAll('.mobile-provider-row')].find(node => node.textContent.includes(custom.name));
    expect(customRow.querySelector('img').getAttribute('src')).toBe(projectLogo);
    expect(customRow.querySelector('small').textContent).toBe(custom.id);
    const dedicated = [...container.querySelectorAll('.mobile-provider-row')].find(node => node.textContent.includes('DeepSeek'));
    expect(dedicated.querySelector('small').textContent).toBe('example-deepseek');
    const group = button('通用大模型');
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(group.querySelector('svg')).not.toBeNull();
    await act(async () => group.click());
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#mobile-model-group-general').hidden).toBe(true);
    await act(async () => group.click());
    expect(container.querySelector('#mobile-model-group-general').hidden).toBe(false);
  });

  it('shows an image group only while its saved provider exists, and keeps image creation available from Add', async () => {
    await mount([config('openai_image')]);
    expect(button('绘画模型')).not.toBeUndefined();
    await act(async () => {
      snapshot = { ...snapshot, configs: [] };
      subscribers.forEach(listener => listener());
    });
    expect(container.querySelector('section[aria-label="绘画模型"]')).toBeNull();
    await act(async () => container.querySelector('[aria-label="新建模型配置"]').click());
    const choices = [...document.querySelectorAll('.mobile-picker-list button')];
    expect(choices.find(node => node.textContent.includes('自定义提供商')).querySelector('img').getAttribute('src')).toBe(projectLogo);
    await act(async () => choices.find(node => node.textContent.includes('OpenAI Images')).click());
    expect(view.pushRoute.mock.calls[0][0]).toMatchObject({ kind: 'model-editor', draft: { provider: 'openai_image' } });
  });

  it('opens each configuration directly and appends new configurations as separate rows', async () => {
    const first = config('custom', { id: 'example-a', name: 'Example A', model: 'example-model-a' });
    const second = config('custom', { id: 'example-b', name: 'Example B', model: 'example-model-b' });
    await mount([first, second]);
    const rows = container.querySelectorAll('.mobile-provider-row');
    expect([...rows].map(row => row.querySelector('strong').textContent)).toEqual(['Example A', 'Example B']);
    expect(container.querySelector('.mobile-provider-configs')).toBeNull();
    await act(async () => rows[1].click());
    expect(view.pushRoute).toHaveBeenCalledExactlyOnceWith({ kind: 'model-editor', configId: second.id });
    await act(async () => {
      snapshot = { ...snapshot, configs: [...snapshot.configs, config('custom', { id: 'example-c', name: 'Example C' })] };
      subscribers.forEach(listener => listener());
    });
    expect([...container.querySelectorAll('.mobile-provider-row strong')].map(row => row.textContent)).toEqual(['Example A', 'Example B', 'Example C']);
  });

  it('separates custom, builtin directory and drawing choices, and creates the exact selected builtin route', async () => {
    const providers = [{ provider: 'example-builtin', displayName: 'Example builtin', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'example-builtin'] },
      { provider: 'moonshotai', displayName: 'Excluded route' }];
    await mount([], { kind: 'root' }, undefined, { providers });
    expect(container.querySelectorAll('.mobile-provider-row')).toHaveLength(0);
    await act(async () => container.querySelector('[aria-label="新建模型配置"]').click());
    expect([...document.querySelectorAll('.mobile-model-create-group > label, .mobile-model-create-group > span')].map(node => node.textContent)).toEqual(['内置提供商', '绘画模型']);
    const select = document.querySelector('[aria-label="从 DSH 目录选择"]');
    expect([...select.options].map(option => option.value)).toEqual(['', 'example-builtin']);
    await act(async () => { select.value = 'example-builtin'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(view.pushRoute).toHaveBeenCalledExactlyOnceWith({ kind: 'model-editor', draft: expect.objectContaining({
      id: 'example-builtin', draftKey: 'example-builtin', name: 'Example builtin', provider: 'custom', builtin: true,
      useBuiltinModels: true, settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'example-builtin'], api_format: 'catalog',
    }) });
    expect(container.querySelector('[aria-label="新建模型配置"][role="dialog"]')).toBeNull();
  });

  it('opens an already configured builtin by exact ID instead of creating another draft', async () => {
    const providers = [{ provider: 'example-builtin', displayName: 'Example builtin' }];
    const saved = config('custom', { id: 'example-builtin', builtin: true });
    await mount([saved], { kind: 'root' }, undefined, { providers });
    await act(async () => container.querySelector('[aria-label="新建模型配置"]').click());
    const select = document.querySelector('[aria-label="从 DSH 目录选择"]');
    await act(async () => { select.value = saved.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(view.pushRoute).toHaveBeenCalledExactlyOnceWith({ kind: 'model-editor', configId: saved.id });
  });

  it('loads a builtin draft through the shared discovery flow and preserves directory capability defaults on Save', async () => {
    const providers = [{ provider: 'example-builtin', displayName: 'Example builtin' }];
    const draft = { ...initialConfigForProvider('example-builtin', providers), draftKey: 'example-builtin' };
    const model = { id: 'example-model', name: 'Example model', inputModalities: ['text', 'image'], supportsImageInput: true, reasoningEfforts: { low: 'low', high: 'high' } };
    await mount([], { kind: 'model-editor', draft }, undefined, { providers, discover: async () => [model] });
    expect(view.models.discover).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: draft.id, builtin: true, api_format: 'catalog' }));
    expect(container.querySelector('.mobile-model-provider-card strong').textContent).toBe('Example builtin');
    expect(field('Provider ID').readOnly).toBe(true);
    expect(container.querySelector('.model-directory-toggle input').checked).toBe(true);
    expect([...container.querySelectorAll('.model-input-capabilities input')].map(input => input.checked)).toEqual([true, true]);
    expect(container.querySelector('.model-input-capabilities').disabled).toBe(true);
    expect(button('保存').disabled).toBe(false);
    await act(async () => button('保存').click());
    expect(view.models.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: draft.id, builtin: true, useBuiltinModels: true,
      model: model.id, model_options: [expect.objectContaining({ ...model, catalogDefaults: model })] }));
  });

  it('retains a new builtin draft and reports a failed directory read without creating a saved configuration', async () => {
    const providers = [{ provider: 'example-builtin', displayName: 'Example builtin' }];
    const draft = { ...initialConfigForProvider('example-builtin', providers), draftKey: 'example-builtin' };
    await mount([], { kind: 'model-editor', draft }, undefined, { providers, discover: async () => { throw new Error('Synthetic directory failure'); } });
    expect(field('Provider ID').value).toBe(draft.id);
    expect(view.chat.notify).toHaveBeenCalledWith('error', 'Synthetic directory failure');
    expect(view.models.save).not.toHaveBeenCalled();
    await act(async () => container.querySelector('[aria-label="返回"]').click());
    expect(view.leave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"][aria-label="保存修改？"]')).not.toBeNull();
  });

  it('puts one Save action beside the configuration title and saves the current draft through the existing form', async () => {
    const saved = config();
    let finish;
    const saving = new Promise(resolve => { finish = resolve; });
    await mount([saved], { kind: 'model-editor', configId: saved.id }, () => saving);
    expect(container.querySelector('.mobile-header h1').textContent).toBe('模型配置');
    expect(container.querySelector('.mobile-model-provider-card strong').textContent).toBe('自定义提供商');
    expect(container.querySelector('.model-detail-header')).toBeNull();
    expect(button('取消')).toBeUndefined();
    const save = button('保存');
    expect(save.closest('.mobile-header')).not.toBeNull();
    expect(save.disabled).toBe(true);
    await change(field('配置名称'), 'Changed configuration');
    expect(save.disabled).toBe(false);
    await act(async () => save.click());
    expect(view.models.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: saved.id, name: 'Changed configuration' }));
    expect(save.disabled).toBe(true);
    expect(save.getAttribute('aria-busy')).toBe('true');
    await act(async () => finish(view.models.save.mock.calls[0][0]));
    expect(save.disabled).toBe(true);
    expect(view.chat.notify).toHaveBeenCalledWith('success', '模型配置已保存');
  });

  it('opens a searchable model dialog and selects through the existing draft without saving', async () => {
    const saved = config('custom', { model: 'example-model-a', model_options: [
      { id: 'example-model-a', name: 'Example Alpha', isUserAdded: true },
      { id: 'example-model-b', name: 'Example Beta', isUserAdded: true },
    ] });
    await mount([saved], { kind: 'model-editor', configId: saved.id });
    await act(async () => container.querySelector('.model-picker-value').click());
    const dialog = document.querySelector('[role="dialog"][aria-label="模型列表"]');
    expect(dialog.querySelector('.mobile-model-sheet')).not.toBeNull();
    await act(async () => dialog.querySelector('h2').click());
    expect(document.querySelector('[role="dialog"][aria-label="模型列表"]')).toBe(dialog);
    expect(dialog.querySelectorAll('.mobile-model-choice')).toHaveLength(2);
    await change(dialog.querySelector('[aria-label="搜索模型"]'), 'beta');
    expect(dialog.querySelectorAll('.mobile-model-choice')).toHaveLength(1);
    const choice = dialog.querySelector('.mobile-model-choice');
    await act(async () => { choice.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); choice.click(); });
    expect(document.querySelector('[aria-label="模型列表"]')).toBeNull();
    expect(container.querySelector('.model-picker-value').textContent).toBe('example-model-b');
    expect(view.models.save).not.toHaveBeenCalled();
    await act(async () => button('保存').click());
    expect(view.models.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: 'example-model-b', model_options: saved.model_options }));
  });

  it('adds and removes manual models in dialogs using the same unsaved draft', async () => {
    const saved = config();
    await mount([saved], { kind: 'model-editor', configId: saved.id });
    expect([...container.querySelectorAll('.mobile-model-connection-actions button')].map(node => node.textContent)).toEqual(['添加模型', '读取模型']);
    await act(async () => container.querySelector('.model-picker-value').click());
    expect(document.querySelector('[aria-label="模型列表"]').textContent).not.toContain('添加模型');
    await act(async () => document.querySelector('[aria-label="模型列表"] [aria-label="关闭"]').click());
    await act(async () => button('添加模型').click());
    expect(document.querySelector('[aria-label="模型列表"]')).toBeNull();
    const manual = document.querySelector('[role="dialog"][aria-label="添加模型"]');
    await change(manual.querySelector('input'), 'example-manual-model');
    const add = [...manual.querySelectorAll('button')].find(node => node.textContent === '添加并使用');
    await act(async () => { add.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); add.click(); });
    expect(container.querySelector('.model-picker-value').textContent).toBe('example-manual-model');
    expect(document.querySelector('[aria-label="添加模型"]')).toBeNull();
    await act(async () => container.querySelector('.model-picker-value').click());
    const remove = document.querySelector('[aria-label="删除模型 example-manual-model"]');
    await act(async () => { remove.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); remove.click(); });
    expect(document.querySelector('[role="dialog"][aria-label="模型列表"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="删除模型 example-manual-model"]')).toBeNull();
    expect(view.models.save).not.toHaveBeenCalled();
  });

  it('keeps model capability controls in Parameters and preserves their saved values', async () => {
    const saved = config('custom', { model: 'example-model', model_options: [{ id: 'example-model', name: 'Example model', isUserAdded: true, supportsImageInput: false }] });
    await mount([saved], { kind: 'model-editor', configId: saved.id });
    const parameters = container.querySelector('.mobile-model-parameters');
    expect(parameters.querySelector('h3').textContent).toBe('参数');
    expect(parameters.querySelector('.model-input-capabilities').textContent).toContain('文本');
    expect(parameters.querySelector('.model-input-capabilities').textContent).toContain('图片');
    expect(parameters.querySelector('.model-reasoning-profile legend').textContent).toContain('支持推理档位');
    await act(async () => parameters.querySelectorAll('.model-input-capabilities input')[1].click());
    await act(async () => parameters.querySelector('[aria-label="声明支持低档位"]').click());
    await act(async () => button('保存').click());
    expect(view.models.save.mock.calls[0][0].model_options[0]).toMatchObject({ supportsImageInput: true, reasoningEfforts: { low: 'low' } });
  });

  it('preserves a draft on failed Save and still asks before leaving an unsaved form', async () => {
    const saved = config();
    await mount([saved], { kind: 'model-editor', configId: saved.id }, async () => { throw new Error('Synthetic save failure'); });
    await change(field('配置名称'), 'Unsaved configuration');
    await act(async () => button('保存').click());
    expect(field('配置名称').value).toBe('Unsaved configuration');
    expect(button('保存').disabled).toBe(false);
    expect(view.chat.notify).toHaveBeenCalledWith('error', 'Synthetic save failure');
    await act(async () => container.querySelector('[aria-label="返回"]').click());
    expect(view.leave).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"][aria-label="保存修改？"]');
    expect(dialog).not.toBeNull();
    await act(async () => [...dialog.querySelectorAll('button')].find(node => node.textContent === '取消').click());
    expect(field('配置名称').value).toBe('Unsaved configuration');
    expect(view.leave).not.toHaveBeenCalled();
  });

  it.each([
    config('custom', { model: 'example-model', model_options: [{ id: 'example-model', topP: 2 }] }),
    config('openai_image', { image_settings: { width: 13, height: 1536 } }),
  ])('uses the existing validation to block header Save for $provider parameters', async saved => {
    await mount([saved], { kind: 'model-editor', configId: saved.id });
    await change(field('配置名称'), 'Changed configuration');
    expect(button('保存').disabled).toBe(true);
    await act(async () => button('保存').click());
    expect(view.models.save).not.toHaveBeenCalled();
  });
});
