// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SidebarSectionHeader } from '../../src/ui/ui/SidebarSectionHeader.jsx';
import { PresetProvider, PresetListPanel } from '../../src/modules/presets/components/PresetPanel.jsx';

vi.stubGlobal('React', React);
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const roots = [];
afterEach(async () => {
  for (const { root, node } of roots.splice(0)) { await act(async () => root.unmount()); node.remove(); }
});
async function mount(element) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push({ root, node });
  await act(async () => root.render(element));
  return node;
}
async function click(node) { await act(async () => node.click()); }
async function type(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
function Harness({ onCreate, onSearchFocus, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);
  return <SidebarSectionHeader title="消息" value={value} onValueChange={setValue}
    placeholder="搜索会话名称" searchLabel="搜索会话" createLabel="新建对话"
    onCreate={onCreate} onSearchFocus={onSearchFocus} />;
}

it('keeps search and creation available together and preserves the filter on outside clicks', async () => {
  const onCreate = vi.fn(), onSearchFocus = vi.fn();
  const node = await mount(<Harness onCreate={onCreate} onSearchFocus={onSearchFocus} />);
  const input = node.querySelector('input'), create = node.querySelector('[aria-label="新建对话"]');
  expect(input.tabIndex).toBe(0);
  expect(node.querySelector('.sidebar-section-label')).toBeNull();
  expect(document.activeElement).not.toBe(input);
  await click(node.querySelector('.sidebar-section-search'));
  expect(onSearchFocus).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(input);
  await type(input,'合成会话');
  await click(document.body);
  expect(input.value).toBe('合成会话');
  expect(create.closest('[inert]')).toBeNull();
  await click(create);
  expect(onCreate).toHaveBeenCalledOnce();
  expect(input.value).toBe('合成会话');
  await click(node.querySelector('[aria-label="清空搜索"]'));
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(create.isConnected).toBe(true);
});

it('clears an existing filter with Escape while keeping the input in the tab order', async () => {
  const node = await mount(<Harness initialValue="保留筛选" />);
  const input = node.querySelector('input');
  expect(input.value).toBe('保留筛选');
  await act(async () => input.focus());
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  await click(document.body);
  expect(input.tabIndex).toBe(0);
});

it('puts preset categories below the manager without activating another preset', async () => {
  const catalog = { groups:[], activePresetIds:{roleplay:'synthetic-role',creator:'synthetic-creator'}, presets:[
    {id:'synthetic-role',purpose:'roleplay',name:'合成角色预设',libraryGroupId:'',profile:{authorName:'',usageInstructions:'',authorAvatarPath:''}},
    {id:'synthetic-creator',purpose:'creator',name:'合成创作预设',libraryGroupId:'',profile:{authorName:'',usageInstructions:'',authorAvatarPath:''}},
  ] };
  const snapshot = { status:'ready', catalog, error:'' };
  const model = { subscribe:()=>()=>{}, getSnapshot:()=>snapshot, refresh:vi.fn(async()=>catalog), setActive:vi.fn() };
  const node = await mount(<PresetProvider catalogModel={model}><PresetListPanel /></PresetProvider>);
  const panel = node.querySelector('.preset-list-panel');
  expect(panel.querySelector('h2')).toBeNull();
  expect(panel.querySelector('.sidebar-section-label')).toBeNull();
  const manager = panel.querySelector('.preset-manager-entry'), categories = panel.querySelector('.preset-purpose-switch');
  expect(manager.nextElementSibling).toBe(categories);
  await click([...categories.querySelectorAll('button')].find(button=>button.textContent==='创作预设'));
  expect(panel.querySelector('.preset-list-row strong').textContent).toBe('合成创作预设');
  expect(model.setActive).not.toHaveBeenCalled();
  await click(panel.querySelector('[aria-label="新建预设"]'));
  expect([...panel.querySelectorAll('.preset-create-menu button')].map(button=>button.textContent)).toEqual(['新建预设','导入预设']);
  await act(async () => panel.querySelector('input').focus());
  expect(panel.querySelector('.preset-create-menu')).toBeNull();
});
