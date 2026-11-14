// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharacterManager } from '../../src/modules/persona/components/CharacterManager.jsx';
import { PresetManager } from '../../src/modules/presets/components/PresetManager.jsx';
import { DisplayPreferencesProvider } from '../../src/modules/settings/model/DisplayPreferencesContext.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, node;
afterEach(async () => { if (root) await act(() => root.unmount()); root = null; document.body.replaceChildren(); vi.restoreAllMocks(); });
async function mount(element) { node = document.createElement('div'); document.body.append(node); root = createRoot(node); await act(() => root.render(element)); }
async function click(button) { expect(button).toBeTruthy(); await act(async () => button.click()); }
async function context(element) { await act(() => element.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true,clientX:80,clientY:100}))); }
const button = text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text || e.getAttribute('aria-label') === text);
const titles = () => [...node.querySelectorAll('.character-card-copy > strong')].map(e => e.textContent);
const characters = { groups: ['合成分组'], items: [
  { id: 'unknown', name: '合成角色 3', group: '', authorName: '合成作者甲' },
  { id: 'old', name: '合成角色 2', group: '合成分组', addedAtEpochMs: 10, editedAtEpochMs: 40 },
  { id: 'new', name: '合成角色 1', group: '合成分组', addedAtEpochMs: 30, editedAtEpochMs: 20 },
] };

describe('desktop catalog managers', () => {
  it('sorts the real character catalog, keeps desktop and mobile preferences independent, and restores after remount', async () => {
    let snapshot = { ui: { desktop_character_sort: 'newest', mobile_character_sort: 'edited', retained: true } };
    const listeners = new Set();
    const model = { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      updateUi: vi.fn(async update => { snapshot = { ui: update(snapshot.ui) }; listeners.forEach(fn => fn()); }) };
    const component = <DisplayPreferencesProvider model={model}><CharacterManager characters={characters} /></DisplayPreferencesProvider>;
    await mount(component);
    expect(titles()).toEqual(['合成角色 1', '合成角色 2', '合成角色 3']);
    expect([...node.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === '排序')).toHaveLength(1);
    expect(button('筛选')).toBeUndefined();
    await click(button('排序')); await click(button('最早导入'));
    expect(titles()).toEqual(['合成角色 2', '合成角色 1', '合成角色 3']);
    expect(snapshot.ui).toEqual({ desktop_character_sort: 'oldest', mobile_character_sort: 'edited', retained: true });
    await act(() => root.unmount()); root = null; await mount(component);
    expect(titles()[0]).toBe('合成角色 2');
    model.updateUi.mockRejectedValueOnce(new Error('Synthetic preference failure'));
    await click(button('排序')); await click(button('最近编辑'));
    expect(titles()[0]).toBe('合成角色 2');
    expect(node.textContent).toContain('Synthetic preference failure');
  });

  it('combines sort with group selection and leaves deleted group members in the ungrouped catalog', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await mount(<CharacterManager characters={characters} onSaveGroups={save} />);
    await click(button('排序')); await click(button('名称排序'));
    expect(titles()).toEqual(['合成角色 1', '合成角色 2', '合成角色 3']);
    const groupRow = [...node.querySelectorAll('.character-manager-group')].find(e=>e.textContent.startsWith('合成分组'));
    await click(groupRow);
    expect(titles()).toEqual(['合成角色 1','合成角色 2']);
    await context(groupRow);
    expect([...node.querySelectorAll('.character-group-context-menu button')].map(e=>e.textContent)).toEqual(['添加分组','重命名该组','删除分组']);
    await click(button('删除分组'));
    expect(save).toHaveBeenCalledWith([], [{ characterId: 'old', group: '' }, { characterId: 'new', group: '' }]);
    expect(titles()).toHaveLength(3);
  });

  it('keeps preset order and group context actions, and retains PNG/JSON export', async () => {
    const exportFile = vi.fn().mockResolvedValue(undefined);
    const catalog = { groups: [{ id:'g',name:'合成分组' }], presets: [
      { id:'p2', name:'合成预设 2', libraryGroupId:'g',profile:{authorName:'合成作者'} },
      { id:'p1', name:'合成预设 1',libraryGroupId:'',profile:{} },
    ] };
    function Presets() { const [group,setGroup]=useState('全部预设'); return <PresetManager catalogModel={{}} catalog={catalog}
      selectedGroup={group} onSelectGroup={setGroup} selectedPresetId="p2" onSelectPreset={()=>{}} onExport={exportFile} />; }
    await mount(<Presets />);
    expect([...node.querySelectorAll('.preset-manager-card-open strong')].map(e=>e.textContent)).toEqual(['合成预设 2','合成预设 1']);
    expect(button('排序')).toBeUndefined(); expect(button('筛选')).toBeUndefined();
    const groupRow = [...node.querySelectorAll('.catalog-manager-group-list button')].find(e=>e.textContent.startsWith('合成分组'));
    await click(groupRow);
    expect(node.querySelectorAll('.preset-manager-card')).toHaveLength(1);
    await context(groupRow);
    expect([...node.querySelectorAll('.preset-manager-group-menu button')].map(e=>e.textContent)).toEqual(['添加分组','重命名该组','删除分组']);
    await act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));
    await click(button('导出预设')); await click(button('JSON 预设'));
    expect(exportFile).toHaveBeenCalledWith('json');
    await click(button('导出预设')); await click(button('PNG 预设卡'));
    expect(exportFile).toHaveBeenCalledWith('png');
  });
});
