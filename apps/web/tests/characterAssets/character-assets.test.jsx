// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CharacterAssetLibrary } from '../../src/modules/characterAssets/index.js';
import { NativeFrontendProvider } from '../../src/modules/authorFrontend/index.js';

let root, container, catalog, watchers, service;
const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
const item = (id, name) => ({ id, name, type: 'image', mimeType: 'image/png', size: 12, hash: 'a'.repeat(64), createdAt: '2026-11-13T00:00:00.000Z' });
const success = value => ({ ok: true, value });
async function render(characterId = 'synthetic-role') {
  await act(() => root.render(<NativeFrontendProvider connection={{ subscribe: () => () => {}, getSnapshot: () => service }}><CharacterAssetLibrary key={characterId} characterId={characterId} /></NativeFrontendProvider>));
}
async function click(label, scope = document.body) {
  const button = [...scope.querySelectorAll('button,[role=button]')].find(button => button.getAttribute('aria-label') === label || button.textContent.trim() === label);
  expect(button, label).toBeTruthy(); await act(() => button.click());
}
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  catalog = { characterId: 'synthetic-role', revision: 0, folders: [], items: [item(first, 'image.png'), item(second, 'portrait.jpg')] }; watchers = new Set();
  const publish = () => { catalog = { ...catalog, revision: catalog.revision + 1 }; watchers.forEach(listener => listener(structuredClone(catalog))); return success(catalog); };
  service = { watchAssets: vi.fn((id, listener) => { watchers.add(listener); listener({ ...structuredClone(catalog), characterId: id }); return () => watchers.delete(listener); }), assets: {
    list: vi.fn(async () => success(catalog)),
    canReveal: vi.fn(async () => success(true)),
    reveal: vi.fn(async () => success(undefined)),
    createFolder: vi.fn(async (owner, name, parentId) => { catalog.folders.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name, parentId, createdAt: '2026-11-13T00:00:00.000Z' }); return publish(); }),
    renameFolder: vi.fn(async (owner, id, name) => { catalog.folders = catalog.folders.map(folder => folder.id === id ? { ...folder, name } : folder); return publish(); }),
    move: vi.fn(async (owner, ids, folderIds, destination) => { catalog.items = catalog.items.map(item => ids.includes(item.id) ? { ...item, folderId: destination } : item); return publish(); }),
    rename: vi.fn(async (owner, id, name) => { catalog.items = catalog.items.map(value => value.id === id ? { ...value, name } : value); return publish(); }),
    delete: vi.fn(async (owner, ids) => { catalog.items = catalog.items.filter(value => !ids.includes(value.id)); return publish(); }),
    duplicate: vi.fn(async () => publish()),
    beginUpload: vi.fn(async () => success({ id: 'upload', offset: 0 })),
    appendUpload: vi.fn(async (owner, id, offset, data) => success({ id, offset: offset + atob(data).length })),
    finishUpload: vi.fn(async () => { catalog.items.push(item('33333333-3333-4333-8333-333333333333', 'upload.png')); return publish(); }),
    cancelUpload: vi.fn(async () => success(undefined)),
  } };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('mixes assets with dropdown categories, previews and copies stable references, and preserves them on rename', async () => {
  await render();
  expect(container.querySelector('.category-tabs')).toBeNull(); expect(container.querySelectorAll('.asset-card')).toHaveLength(2); await click('筛选'); expect([...document.querySelectorAll('[role=menuitemcheckbox]')].map(value => value.textContent)).toEqual(['图片', '视频', '音频', '模型']);
  expect(container.querySelector('[role=menu]')).toBeNull();
  expect(document.querySelector('.asset-menu-layer [role=menu]')).toBeTruthy();
  await click('关闭菜单');
  expect(container.textContent).not.toContain('分组'); expect(container.textContent).not.toContain('版本');
  await click('预览 image.png'); expect(container.querySelector('[aria-label="资产引用地址"]').value).toBe(`asset://${first}`);
  await click('复制引用'); expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`asset://${first}`); await click('关闭弹窗');
  await click('image.png的更多操作'); await click('重命名');
  const input = container.querySelector('[aria-label="资产名称"]');
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'renamed.png'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(service.assets.rename).toHaveBeenCalledWith('synthetic-role', first, 'renamed.png');
  await click('预览 renamed.png'); expect(container.querySelector('[aria-label="资产引用地址"]').value).toBe(`asset://${first}`);
});

it('opens the managed file location by asset identity and hides the action when the Host cannot reveal files', async () => {
  await render(); await click('image.png的更多操作'); await click('打开所在目录');
  expect(service.assets.reveal).toHaveBeenCalledWith('synthetic-role', first);
  service.assets.canReveal.mockResolvedValueOnce(success(false));
  await render('another-role'); await click('image.png的更多操作');
  expect([...container.querySelectorAll('[role="menuitem"]')].some(value => value.textContent === '打开所在目录')).toBe(false);
});

it('filters formats, keeps deletion cancelled, and leaves a failed deletion reviewable for retry', async () => {
  await render(); await click('筛选'); await click('视频'); expect(container.querySelectorAll('.asset-card')).toHaveLength(0);
  await click('清除筛选'); await click('关闭菜单'); await click('image.png的更多操作'); await click('选择'); await click('全选'); await click('删除');
  expect(container.querySelector('[role="dialog"]').textContent).toContain('引用这些资产');
  await click('取消', container.querySelector('[role="dialog"]')); expect(service.assets.delete).not.toHaveBeenCalled();
  await click('删除'); service.assets.delete.mockResolvedValueOnce({ ok: false, error: { code: 'eleckoi/io/failed', message: 'Synthetic storage failure' } });
  await click('删除', container.querySelector('[role="dialog"]'));
  expect(container.querySelector('[role="dialog"]')).toBeTruthy(); expect(container.querySelectorAll('.asset-card')).toHaveLength(2);
  expect(container.textContent).toContain('Synthetic storage failure');
  await click('删除', container.querySelector('[role="dialog"]')); expect(container.querySelectorAll('.asset-card')).toHaveLength(0);
});

it('uploads a file in bounded transfer chunks, publishes only after completion and releases subscription on leaving', async () => {
  await render(); const input = container.querySelector('input[type=file]'), size = 2 * 1024 * 1024 + 3;
  const file = { name: 'upload.png', size, slice: (start, end) => ({ arrayBuffer: async () => new Uint8Array(Math.min(size, end) - start).buffer }) };
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(service.assets.beginUpload).toHaveBeenCalledWith('synthetic-role', { name: 'upload.png', size, folderId: null });
  expect(service.assets.appendUpload).toHaveBeenCalledTimes(3); expect(service.assets.finishUpload).toHaveBeenCalledOnce();
  expect(container.querySelectorAll('.asset-card')).toHaveLength(3);
  await render('another-role'); expect(watchers.size).toBe(1); expect(service.watchAssets).toHaveBeenLastCalledWith('another-role', expect.any(Function), expect.any(Function));
});

it('keeps every selected reference when clipboard access is unavailable', async () => {
  await render(); await click('image.png的更多操作'); await click('选择'); await click('全选');
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Synthetic clipboard denial'));
  await click('复制引用');
  expect(container.querySelector('textarea[aria-label="资产引用地址"]').value).toBe(`asset://${first}\nasset://${second}`);
});

it('creates and enters a mixed-media folder, moves a file without changing its reference and uploads into the current folder', async () => {
  catalog.items.push({ ...item('33333333-3333-4333-8333-333333333333', 'opening.wav'), type: 'audio', mimeType: 'audio/wav' });
  await render(); await click('新建文件夹');
  const input = container.querySelector('[aria-label="资产名称"]');
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '开场'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(service.assets.createFolder).toHaveBeenCalledWith('synthetic-role', '开场', null);
  expect(container.querySelector('.folder-front img')).toBeNull(); expect(container.querySelectorAll('.folder-item')).toHaveLength(0);
  await click('image.png的更多操作'); await click('选择'); await click('选择 opening.wav'); await click('移动到');
  await click('开场', container.querySelector('[role=dialog]')); await click('移到这里');
  const folderId = catalog.folders[0].id;
  expect(service.assets.move).toHaveBeenCalledWith('synthetic-role', [first, '33333333-3333-4333-8333-333333333333'], [], folderId);
  expect(container.querySelector('.folder-front img')).toBeNull(); expect(container.querySelector('.folder-item img')).toBeTruthy();
  await click('打开文件夹：开场'); expect(container.querySelector('h1').textContent).toBe('开场');
  expect(container.querySelectorAll('.asset-card')).toHaveLength(2);
  await click('预览 image.png'); expect(container.querySelector('[aria-label="资产引用地址"]').value).toBe(`asset://${first}`); await click('关闭弹窗');
  const fileInput = container.querySelector('input[type=file]');
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [{ name: 'empty.png', size: 0 }] });
  await act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  expect(service.assets.beginUpload).toHaveBeenLastCalledWith('synthetic-role', { name: 'empty.png', size: 0, folderId });
  await click('返回上一级'); expect(container.querySelector('h1').textContent).toBe('资产库');
});

it('opens the file chooser directly from both import buttons without an intermediate menu', async () => {
  await render(); const chooser = vi.spyOn(container.querySelector('input[type=file]'), 'click').mockImplementation(() => {});
  await click('添加文件'); expect(chooser).toHaveBeenCalledOnce();
  expect(container.querySelector('[role=menu]')).toBeNull();
  expect(container.querySelector('.upload-card').hasAttribute('aria-expanded')).toBe(false);
  await click('导入文件', container.querySelector('.library-create-actions')); expect(chooser).toHaveBeenCalledTimes(2);
});

it('uses the background context menu for importing and creating in the current folder, with keyboard dismissal', async () => {
  const folder = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: '开场', parentId: null, createdAt: '2026-11-13T00:00:00.000Z' };
  catalog.folders.push(folder); catalog.items[0].folderId = folder.id;
  await render(); await click('打开文件夹：开场');
  const background = container.querySelector('.character-asset-library'), chooser = vi.spyOn(container.querySelector('input[type=file]'), 'click').mockImplementation(() => {});
  const open = async () => act(() => background.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 300 })));
  await open(); let menu = document.querySelector('[role=menu][aria-label="资产库操作"]');
  expect(menu).toBeTruthy(); expect([...menu.querySelectorAll('button')].map(button => button.textContent)).toEqual(['导入文件', '新建文件夹']);
  await click('导入文件', menu); expect(chooser).toHaveBeenCalledOnce(); expect(document.querySelector('[aria-label="资产库操作"]')).toBeNull();
  await open(); menu = document.querySelector('[role=menu][aria-label="资产库操作"]');
  await act(() => menu.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(document.querySelector('[aria-label="资产库操作"]')).toBeNull(); expect(container.querySelector('h1').textContent).toBe('开场'); expect(document.activeElement).toBe(background);
  await act(() => background.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })));
  menu = document.querySelector('[role=menu][aria-label="资产库操作"]'); await click('新建文件夹', menu);
  await act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(service.assets.createFolder).toHaveBeenCalledWith('synthetic-role', '未命名文件夹', folder.id);
  await open(); await act(() => background.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(document.querySelector('[aria-label="资产库操作"]')).toBeNull();
  const search = container.querySelector('input[aria-label="搜索资产"]'), native = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  await act(() => search.dispatchEvent(native)); expect(native.defaultPrevented).toBe(false); expect(document.querySelector('[aria-label="资产库操作"]')).toBeNull();
});
