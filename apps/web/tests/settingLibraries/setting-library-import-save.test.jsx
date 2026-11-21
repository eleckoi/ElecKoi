// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { normalizeSettingLibrary, emptyEntry } from '../../../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization';
import { settingLibrarySchema } from '../../../../packages/shared/src/contracts/settingLibrary/schemas';
import { SettingLibraryManager } from '../../src/modules/settingLibraries/components/SettingLibraryManager.jsx';

let root, container, model, stored;
const characterId = 'synthetic-character';
const worldbook = JSON.stringify({ name: '合成世界书', entries: {
  0: { uid: 0, comment: '合成关键词设定', content: '合成关键词正文', key: ['合成关键词'], disable: true },
  1: { uid: 1, comment: '合成常驻设定', content: '合成常驻正文', constant: true },
} });

beforeEach(async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  stored = normalizeSettingLibrary(characterId);
  stored = normalizeSettingLibrary(characterId, { ...stored, entries: [...stored.entries,
    { ...emptyEntry('synthetic-original'), title: '合成原有设定', content: '合成原有正文' }],
  });
  model = {
    getSnapshot: () => ({ status: 'ready', value: stored }),
    subscribe: () => () => {},
    read: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (_id, draft) => {
      stored = normalizeSettingLibrary(characterId, settingLibrarySchema.parse(draft));
      return structuredClone(stored);
    }),
    saveViewState: vi.fn(async () => []),
    listCharacters: vi.fn(async () => ({ items: [] })),
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<SettingLibraryPanel characterId={characterId} settingLibraries={model} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('exports the complete current library through Android save completion, cancellation and retry', async () => {
  const entries = Array.from({ length: 10001 }, (_, index) => ({ ...emptyEntry(`synthetic-export-${index}`),
    title: `合成设定 ${index}`, content: [0, 5000, 10000].includes(index) ? `${'合成长正文'.repeat(4000)}末尾 ${index}` : `合成正文 ${index}` }));
  const library = { ...stored, entries };
  const picker = vi.fn(() => { throw new Error('Unexpected browser picker'); });
  let finish;
  const saveText = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('showSaveFilePicker', picker);
  vi.stubGlobal('ElecKoiPlatform', { saveText });
  await act(async () => root.render(<SettingLibraryManager characterId={characterId} settingLibraries={model} library={library}
    onChange={vi.fn()} onClose={vi.fn()} onError={vi.fn()} />));
  await click('导出当前版本');
  expect(saveText).toHaveBeenCalledTimes(1);
  expect(picker).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]')).toBeNull();
  const [name, json, mime] = saveText.mock.calls[0];
  expect(name).toMatch(/\.json$/); expect(mime).toBe('application/json');
  const exported = JSON.parse(json);
  expect(exported.entries).toHaveLength(entries.length);
  for (const index of [0, 5000, 10000]) expect(exported.entries[index].content).toBe(entries[index].content);
  expect([...document.querySelectorAll('button')].find(button => button.textContent.includes('导出当前版本')).disabled).toBe(true);
  await act(async () => finish({ result: 'cancelled', cancelled: true }));
  expect(document.querySelector('[role="status"]')).toBeNull();
  saveText.mockRejectedValueOnce(new Error('合成文件保存失败'));
  await click('导出当前版本');
  expect(document.querySelector('[role="dialog"]').textContent).toContain('合成文件保存失败');
  saveText.mockResolvedValueOnce({ result: 'content://synthetic/export', cancelled: false });
  await click('导出当前版本');
  expect(document.querySelector('[role="status"]').textContent).toBe('设定库已导出');
  expect(model.save).not.toHaveBeenCalled();
});

async function click(label, scope = document.body) {
  const button = [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  expect(button, label).toBeTruthy();
  await act(async () => button.click());
}

async function chooseWorldbook() {
  const input = document.querySelector('.setting-library-file-input');
  const file = new File([worldbook], 'synthetic-worldbook.json', { type: 'application/json' });
  file.text = async () => worldbook;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

describe('worldbook import save workflow', () => {
  it('imports a version and saves complete native entries without deleting the previous version', async () => {
    const originalVersionId = stored.activeVersionId;
    await click('导入角色设定库');
    await click('导入为新版本');
    await click('酒馆世界书导入 SillyTavern 世界书 JSON');
    await chooseWorldbook();
    expect(model.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    await click('保存');
    expect(model.save).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.textContent).toContain('已保存');
    expect(stored.entries.filter(item => item.kind === 'normal')).toHaveLength(2);
    expect(stored.entries.find(item => item.title === '合成关键词设定')).toMatchObject({ contentMode: 'plain_text', enabled: false });
    expect(stored.versions.find(item => item.id === originalVersionId).entries.find(item => item.id === 'synthetic-original').content).toBe('合成原有正文');
  });

  it('merges a local worldbook, retains the draft on save failure and exposes the complete error for retry', async () => {
    const originalVersionId = stored.activeVersionId;
    await click('导入角色设定库');
    await click('并入设定库');
    await click('从本地文件');
    await chooseWorldbook();
    await click('全选');
    await click('检查并入结果');
    await click('并入设定');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    const error = '合成写入失败\n合成错误详情';
    model.save.mockRejectedValueOnce(new Error(error));
    await click('保存');
    expect(stored.entries.filter(item => item.kind === 'normal')).toHaveLength(1);
    await click('查看保存错误');
    expect(document.querySelector('.app-error-detail').textContent).toBe(error);
    await click('关闭错误详情');
    expect(document.querySelector('.app-error-detail')).toBeNull();
    expect(container.querySelector('.setting-library-save-button').disabled).toBe(false);
    await click('保存');
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(stored.activeVersionId).toBe(originalVersionId);
    expect(stored.entries.filter(item => item.kind === 'normal')).toHaveLength(3);
    expect(stored.entries.find(item => item.id === 'synthetic-original').content).toBe('合成原有正文');
    expect(stored.entries.find(item => item.title === '合成常驻设定')).toMatchObject({ contentMode: 'plain_text', agentReadStrategy: 'required' });
  });
});
