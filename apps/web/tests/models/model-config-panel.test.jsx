// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelConfigPanel } from '../../src/modules/models/components/ModelConfigPanel.jsx';
import { initialConfigForProvider, modelParameterState } from '../../src/modules/models/model/modelConfigDraft.js';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal('React', React);
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.mock('../../src/modules/settings/index.js', () => ({
  LIST_COLLAPSE_AREAS: { models: 'models' },
  usePersistentCollapseState: (_area, initial) => [...React.useState(initial), true],
}));

let root;
let container;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});
const draft = () => ({ id: 'config-example', provider: 'custom', name: 'Example', model: '', model_options: [],
  api_format: 'chat_completions', api_key: '', base_url: 'https://models.example/v1', custom_headers: {} });

it('accepts explicit model token settings without universal four-million or minimum-window cutoffs', () => {
  const state = values => modelParameterState({ ...draft(), model: 'synthetic', model_options: [{ id: 'synthetic', ...values }] }, 'custom');
  expect(state({ contextWindowTokens: 8000001, maxOutputTokens: 6000001, autoCompactTokenLimit: 64, temperature: 3 }).parameterError).toBeFalsy();
  expect(state({ contextWindowTokens: 512, autoCompactTokenLimit: 32 }).parameterError).toBeFalsy();
  expect(state({ contextWindowTokens: 512, autoCompactTokenLimit: 513 }).parameterError).toBe(true);
  expect(state({ maxOutputTokens: Infinity }).parameterError).toBe(true);
});
const layout = ({ sidePanel, mainPanel, overlays }) => <>{sidePanel}{mainPanel}{overlays}</>;
const button = text => [...container.querySelectorAll('button')].find(element => element.textContent.trim() === text);
const field = text => [...container.querySelectorAll('label')].find(element => element.textContent.trim().startsWith(text))?.querySelector('input,select');
async function change(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(props) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ModelConfigPanel config={draft()} configs={[]} renderLayout={layout} {...props} />));
}

describe('model configuration form', () => {
  it('preserves the official non-thinking declaration while editing ordinary parameters', async () => {
    const config = { ...initialConfigForProvider('deepseek'), model: 'synthetic-model',
      model_options: [{ id: 'synthetic-model', reasoningEfforts: { off: null } }] };
    const save = vi.fn(async item => item);
    await mount({ config, configs: [config], onSave: save });
    await change(field('温度'), '0.5');
    expect(button('保存配置').disabled).toBe(false);
    await act(async () => button('保存配置').click());
    expect(save.mock.calls[0][0].model_options[0]).toMatchObject({ reasoningEfforts: { off: null }, temperature: 0.5 });
  });

  it('creates separate custom and drawing configurations from the menu', async () => {
    const config = draft();
    await mount({ config, configs: [config] });
    await act(async () => container.querySelector('[aria-label="新建模型配置"]').click());
    const menu = container.querySelector('.model-provider-create-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim())).toEqual(['自定义提供商', 'OpenAI Images', 'NovelAI']);
    await act(async () => menu.querySelector('[role="menuitem"]').click());
    expect(container.querySelectorAll('.model-config-provider')).toHaveLength(2);
    expect(field('Provider ID').readOnly).toBe(false);
    expect(container.textContent).not.toContain('测试连接');
  });

  it('opens deletion as a modal and removes only the selected configuration', async () => {
    const first = { ...draft(), id: 'config-first' };
    const second = { ...draft(), id: 'config-second', name: 'Other' };
    const remove = vi.fn(async () => second);
    await mount({ config: first, configs: [first, second], onDeleteConfig: remove });
    const form = container.querySelector('.model-detail-form');
    const children = form.childElementCount;
    await act(async () => container.querySelector('[aria-label="删除配置"]').click());
    expect(form.childElementCount).toBe(children);
    const dialog = document.body.querySelector('[role="alertdialog"]');
    expect(dialog.closest('.model-provider-delete-overlay')).not.toBeNull();
    expect(form.contains(dialog)).toBe(false);
    await act(async () => dialog.querySelector('.danger').click());
    expect(remove).toHaveBeenCalledExactlyOnceWith('config-first');
    expect(field('配置名称').value).toBe('Other');
  });

  it('defaults manual models to text and deletes the active added model with its parameters', async () => {
    const save = vi.fn(async item => item);
    await mount({ onSave: save });
    await act(async () => button('添加模型').click());
    await change(container.querySelector('[aria-label="模型名"]'), 'synthetic-model');
    await act(async () => button('添加').click());
    const inputs = container.querySelectorAll('.model-input-capabilities input');
    expect([...inputs].map(item => item.checked)).toEqual([true, false]);
    await change(field('温度'), '0.5');
    await act(async () => container.querySelector('[title="展开模型列表"]').click());
    await act(async () => container.querySelector('[aria-label="删除模型 synthetic-model"]').click());
    expect(field('温度').disabled).toBe(true);
    await act(async () => button('保存配置').click());
    expect(save.mock.calls[0][0]).toMatchObject({ model: '', model_options: [] });
  });
  it('creates the DeepSeek card as the dedicated DSH provider', () => {
    expect(initialConfigForProvider('deepseek')).toMatchObject({
      id: 'deepseek-official', provider: 'deepseek', api_format: 'deepseek_messages',
      base_url: 'https://api.deepseek.com/anthropic',
    });
  });

  it('adds models in the form and keeps network settings visible without disclosure controls', async () => {
    await mount();
    const picker = container.querySelector('.model-picker-field');
    await act(async () => button('添加模型').click());
    const addition = picker.querySelector('.model-manual-add');
    expect(addition.parentElement).toBe(picker);
    expect(addition.querySelector('label').textContent).toBe('模型 ID');
    expect(addition.querySelector('input').placeholder).toBe('填写提供商实际模型 ID');
    expect([...addition.querySelectorAll('button')].map(item => item.textContent.trim())).toEqual(['添加', '取消']);
    await change(addition.querySelector('input'), 'synthetic-draft-model');
    await act(async () => addition.querySelector('input').dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(picker.querySelector('.model-manual-add')).toBe(addition);
    await act(async () => [...addition.querySelectorAll('button')].find(item => item.textContent === '取消').click());
    expect(picker.querySelector('.model-manual-add')).toBeNull();
    expect(container.querySelector('.model-picker-value').textContent).not.toContain('synthetic-draft-model');
    expect(container.querySelector('.model-network-section').tagName).toBe('SECTION');
    expect(container.querySelector('.model-network-section summary')).toBeNull();
    expect(container.querySelector('[aria-label="新请求头名称"]')).not.toBeNull();
    const capabilities = container.querySelector('.model-input-capabilities');
    expect(capabilities.textContent).not.toContain('输入能力');
    expect([...capabilities.querySelectorAll('label')].map(item => item.textContent)).toEqual(['文本', '图片']);
  });

  it('shows independent configuration rows without a version selector', async () => {
    const first = { ...draft(), id: 'config-first', name: '网关一' };
    const second = { ...draft(), id: 'config-second', name: '网关二' };
    await mount({ config: first, configs: [first, second] });
    expect(container.querySelector('.model-version-picker')).toBeNull();
    expect([...container.querySelectorAll('.model-config-provider b')].map(item => item.textContent)).toEqual(['网关一', '网关二']);
    await act(async () => [...container.querySelectorAll('.model-config-provider')][1].click());
    expect(field('配置名称').value).toBe('网关二');
  });

  it('refreshes saved credential state when the catalog finishes loading after the page', async () => {
    const fallback = {
      ...initialConfigForProvider('deepseek'),
      name: '',
      model: '',
      model_options: [],
      credentialConfigured: false,
    };
    const configured = {
      ...fallback,
      name: 'DeepSeek',
      model: 'deepseek-flash',
      model_options: [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' }],
      credentialConfigured: true,
      credentialRef: 'DEEPSEEK_API_KEY',
    };
    await mount({ config: fallback, configs: [] });
    expect(container.querySelector('.model-api-key-control input').placeholder).toBe('填写 DeepSeek API Key');

    await act(async () => root.render(
      <ModelConfigPanel config={fallback} configs={[configured]} renderLayout={layout} />,
    ));

    expect(container.querySelector('.model-api-key-control input').placeholder).toBe('已保存，留空保留');
    expect(field('配置名称').value).toBe('DeepSeek');
    expect(field('Provider ID').value).toBe('deepseek-official');
  });

  it('reveals a saved credential on demand without dirtying or saving its plaintext', async () => {
    const config = { ...draft(), credentialConfigured: true, credentialRef: 'SYNTHETIC_REF' };
    const onRevealApiKey = vi.fn(async () => 'synthetic-stored-value');
    const onSave = vi.fn(async value => value);
    const onDirtyChange = vi.fn();
    await mount({ config, configs: [config], onRevealApiKey, onSave, onDirtyChange });
    const key = container.querySelector('.model-api-key-control input');
    const eye = container.querySelector('.model-api-key-control button');
    expect(key.value).toBe('');
    expect(onRevealApiKey).not.toHaveBeenCalled();
    await act(async () => eye.click());
    expect(onRevealApiKey).toHaveBeenCalledExactlyOnceWith(config.id);
    expect(key.value).toBe('synthetic-stored-value');
    expect(key.type).toBe('text');
    expect(onDirtyChange.mock.calls.some(([dirty]) => dirty)).toBe(false);
    await change(field('配置名称'), 'Renamed');
    await act(async () => button('保存配置').click());
    expect(onSave.mock.calls[0][0].api_key).toBe('');
    await act(async () => eye.click());
    expect(key.value).toBe('');
    expect(key.type).toBe('password');
  });

  it('ignores an outstanding credential read after typing a replacement and reports read errors', async () => {
    let finish;
    const read = new Promise(resolve => { finish = resolve; });
    const onRevealApiKey = vi.fn().mockReturnValueOnce(read).mockRejectedValueOnce(new Error('Synthetic credential read failed'));
    const notify = vi.fn();
    const config = { ...draft(), credentialConfigured: true };
    await mount({ config, configs: [config], onRevealApiKey, onNotify: notify });
    const key = container.querySelector('.model-api-key-control input');
    const eye = container.querySelector('.model-api-key-control button');
    await act(async () => eye.click());
    expect(eye.disabled).toBe(true);
    await change(key, 'synthetic-replacement');
    await act(async () => { finish('synthetic-obsolete-value'); await read; });
    expect(key.value).toBe('synthetic-replacement');
    expect(key.type).toBe('password');
    await change(key, '');
    await act(async () => eye.click());
    expect(notify).toHaveBeenCalledWith('error', 'Synthetic credential read failed');
    expect(key.value).toBe('');
    expect(eye.disabled).toBe(false);
  });

  it('keeps the DeepSeek official card on the dedicated Messages adapter', async () => {
    await mount({ config: { ...draft(), id: 'deepseek-official', provider: 'deepseek', api_format: 'deepseek_messages',
      base_url: 'https://api.deepseek.com/anthropic' } });
    const select = field('接口格式');
    expect([...select.options].map(option => option.textContent)).toEqual(['Messages API']);
    expect(select.value).toBe('anthropic_messages');
    expect(select.disabled).toBe(true);
    expect(field('API 地址').value).toBe('https://api.deepseek.com/anthropic');
    expect(container.querySelector('.model-reasoning-profile')).toBeNull();
  });
  it('selects discovered models, enables parameters, and preserves values after saving and reopening', async () => {
    const onSave = vi.fn(async value => ({ ...value }));
    const onFetchModels = vi.fn(async () => [{ id: 'example-model', name: 'Example Model', contextWindowTokens: 65536,
      reasoningEfforts: { off: null, high: 'high' } }]);
    await mount({ onSave, onFetchModels });
    expect(field('Top P').disabled).toBe(true);
    await act(async () => button('读取模型').click());
    expect(field('Top P').disabled).toBe(false);
    for (const name of ['上下文窗口', '自动压缩阈值', '单次最大输出', '温度']) expect(field(name).disabled).toBe(false);
    expect([...field('推理强度').options].map(option => option.value)).toEqual(['', 'off', 'high']);
    await change(field('Top P'), '0.96');
    await change(field('温度'), '0.4');
    await act(async () => button('保存配置').click());
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ model: 'example-model', model_options: [{ id: 'example-model', topP: 0.96, temperature: 0.4 }] });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<ModelConfigPanel config={saved} configs={[saved]} renderLayout={layout} onSave={onSave} onFetchModels={onFetchModels} />));
    expect(field('Top P').value).toBe('0.96');
    expect(field('温度').value).toBe('0.4');
  });

  it('lets a custom model explicitly declare and persist its pi-ai reasoning efforts', async () => {
    const config = { ...draft(), model: 'example-manual-model', model_options: [{ id: 'example-manual-model', isUserAdded: true }] };
    const onSave = vi.fn(async value => ({ ...value }));
    await mount({ config, configs: [config], onSave });

    const reasoning = field('推理强度');
    expect(reasoning.disabled).toBe(true);
    expect(container.querySelector('.model-reasoning-profile')).not.toBeNull();

    await act(async () => container.querySelector('[aria-label="声明支持关闭档位"]').click());
    expect(button('保存配置').disabled).toBe(true);
    expect(container.querySelector('.model-parameter-error').textContent).toContain('至少选择一个非关闭档位');

    await act(async () => container.querySelector('[aria-label="声明支持低档位"]').click());
    await act(async () => container.querySelector('[aria-label="声明支持高档位"]').click());
    expect(reasoning.disabled).toBe(false);
    expect([...reasoning.options].map(option => option.value)).toEqual(['', 'off', 'low', 'high']);
    await act(async () => {
      reasoning.value = 'high';
      reasoning.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('保存配置').click());

    const saved = onSave.mock.calls[0][0];
    expect(saved.model_options[0]).toMatchObject({
      id: 'example-manual-model',
      reasoningEfforts: { off: null, low: 'low', high: 'high' },
      reasoningEffort: 'high',
    });

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(
      <ModelConfigPanel config={saved} configs={[saved]} renderLayout={layout} onSave={onSave} />,
    ));
    expect(field('推理强度').value).toBe('high');
    expect(container.querySelector('[aria-label="取消高档位"]')).not.toBeNull();
  });

  it('does not overwrite a newer draft with a late discovery response', async () => {
    let finish;
    const discovery = new Promise(resolve => { finish = resolve; });
    await mount({ onFetchModels: () => discovery });
    await act(async () => button('读取模型').click());
    await change(field('API 地址'), 'https://changed.example/v1');
    await act(async () => { finish([{ id: 'example-stale-model' }]); await discovery; });
    expect(field('API 地址').value).toBe('https://changed.example/v1');
    expect(field('Top P').disabled).toBe(true);
  });

  it('keeps the existing selection on empty discovery and never invents reasoning capabilities', async () => {
    const config = { ...draft(), model: 'example-manual-model', model_options: [{ id: 'example-manual-model', isUserAdded: true, topP: 0.95 }] };
    const notify = vi.fn();
    await mount({ config, configs: [config], onFetchModels: async () => [], onNotify: notify });
    await act(async () => button('读取模型').click());
    expect(field('Top P').value).toBe('0.95');
    expect(field('Top P').disabled).toBe(false);
    expect(field('推理强度').disabled).toBe(true);
    expect(container.querySelector('.model-reasoning-profile')).not.toBeNull();
    expect(notify).toHaveBeenCalledWith('error', '未读取到模型，当前配置已保留。');
  });
});
