// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobilePresetsPage } from '../../src/mobile/MobilePresetsPage.jsx';
import { CatalogSlotsContext } from '../../src/ui/ui/CatalogSlotsContext.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, catalog, snapshot, listeners, model, view, handlers;
const group = (id, name, purpose='roleplay') => ({id,name,purpose});
const preset = (id,name,purpose='roleplay',libraryGroupId='') => ({id,name,purpose,libraryGroupId,profile:{authorName:'合成作者',authorAvatarPath:'data:image/png;base64,synthetic'},modelTags:[{id:'general',label:'通用'}]});
beforeEach(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  catalog={groups:[group('a','合成甲'),group('b','合成乙'),group('c','合成创作','creator')],presets:[preset('agent-preset-standard','默认扮演预设'),preset('p1','合成叙事','roleplay','a'),preset('p2','合成对话','roleplay','b'),preset('agent-preset-creator','默认创作预设','creator'),preset('p3','合成工具','creator','c')],activePresetIds:{roleplay:'agent-preset-standard',creator:'agent-preset-creator'}};
  listeners=new Set(); handlers=[];
  const adopt=next=>{catalog=next;snapshot={status:'ready',catalog,error:''};listeners.forEach(fn=>fn());return next;};adopt(catalog);
  model={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>snapshot,refresh:vi.fn(async()=>catalog),adopt,
    createGroup:vi.fn(async(name,purpose)=>adopt({...catalog,groups:[...catalog.groups,group('new',name,purpose)]})),
    renameGroup:vi.fn(async(id,name)=>adopt({...catalog,groups:catalog.groups.map(g=>g.id===id?{...g,name}:g)})),
    deleteGroup:vi.fn(async id=>adopt({...catalog,groups:catalog.groups.filter(g=>g.id!==id),presets:catalog.presets.map(p=>p.libraryGroupId===id?{...p,libraryGroupId:''}:p)})),
    reorderGroups:vi.fn(async(ids,purpose)=>adopt({...catalog,groups:[...catalog.groups.filter(g=>g.purpose!==purpose),...ids.map(id=>catalog.groups.find(g=>g.id===id))]})),
    setActive:vi.fn(async id=>adopt({...catalog,activePresetIds:{...catalog.activePresetIds,[catalog.presets.find(p=>p.id===id).purpose]:id}})),
  };
  view={presets:model,route:{kind:'root'},routeBusy:false,guardRef:{current:null},scrollPositions:new Map(),openDrawer:vi.fn(),pushRoute:vi.fn(),chat:{notify:vi.fn()},registerBackHandler:fn=>{handlers.push(fn);return()=>{handlers=handlers.filter(v=>v!==fn);};}};
});
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(catalogSlots){const node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root.render(<CatalogSlotsContext.Provider value={catalogSlots}><MainPageContext.Provider value={view}><main className="mobile-shell"><MobilePresetsPage/></main></MainPageContext.Provider></CatalogSlotsContext.Provider>));}
async function click(text,scope=document){const button=[...scope.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===text||node.textContent.trim()===text);expect(button,`Missing ${text}`).toBeTruthy();await act(async()=>button.click());}
async function input(value){const node=document.querySelector('[aria-label="名称"]');await act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
const cards=()=>[...document.querySelectorAll('.mobile-preset-open > strong')].map(node=>node.textContent);
const panel=()=>document.querySelector('.mobile-character-library-group-panel');

it('passes the visible Android preset library and exact menu targets to plugins', async () => {
  const openPreset = vi.fn(), bulk = vi.fn();
  const render = vi.fn((name, _owner, fallback) => fallback);
  const actions = (name, owner) => {
    if (name === 'eleckoi.preset.library.item.menu.actions') return <button type="button" role="menuitem"
      onClick={() => { owner.onDismiss(); openPreset(owner.preset.id); }}>插件预设操作</button>;
    if (name === 'eleckoi.preset.library.menu.actions') return <button type="button" role="menuitem"
      onClick={() => { owner.onDismiss(); bulk(owner.purpose, owner.menu); }}>插件批量操作</button>;
    return null;
  };
  await mount({ render, actions });
  await click('合成甲', document.querySelector('[aria-label="预设分组"]'));
  const list = render.mock.calls.filter(([name]) => name === 'eleckoi.preset.page.list').at(-1)[1];
  expect(list.surface).toBe('android');
  expect(list.presets.map(preset => preset.id)).toEqual(['p1']);
  await click('合成叙事的预设操作');
  await click('插件预设操作');
  expect(openPreset).toHaveBeenCalledExactlyOnceWith('p1');
  expect(document.activeElement.getAttribute('aria-label')).toBe('合成叙事的预设操作');
  await click('预设操作');
  await click('插件批量操作');
  expect(bulk).toHaveBeenCalledExactlyOnceWith('roleplay', 'bulk');
  expect(view.pushRoute).not.toHaveBeenCalled();
});

it('does not show an empty library before the first catalog and reopens the cached list without rereading',async()=>{
  let resolveRead;
  snapshot={status:'loading',catalog:null,error:''};
  model.refresh=vi.fn(()=>new Promise(resolve=>{resolveRead=resolve;}));
  await mount();
  expect(document.body.textContent).not.toContain('暂无预设');
  expect(document.querySelector('[role=status]').textContent).toContain('正在加载');
  await act(async()=>{model.adopt(catalog);resolveRead(catalog);});
  expect(cards()).toContain('合成叙事');
  const requests=model.refresh.mock.calls.length;
  await act(()=>root.render(null));await mount();
  expect(cards()).toContain('合成叙事');
  expect(model.refresh).toHaveBeenCalledTimes(requests);
});

it('uses compact purpose tabs, real author images and remembers each purpose’s selected group',async()=>{
  await mount();expect([...document.querySelectorAll('[role=tab]')].map(node=>node.textContent)).toEqual(['扮演','创作']);
  expect(document.querySelector('.mobile-preset-groups')).toBeNull();
  expect(document.querySelector('.mobile-preset-author img').getAttribute('src')).toBe('data:image/png;base64,synthetic');
  await click('合成甲',document.querySelector('[aria-label="预设分组"]'));expect(cards()).toEqual(['合成叙事']);
  await act(()=>document.querySelector('[role=tab][aria-selected=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(document.activeElement.textContent).toBe('创作');await click('合成创作',document.querySelector('[aria-label="预设分组"]'));expect(cards()).toEqual(['合成工具']);
  await click('扮演');expect(cards()).toEqual(['合成叙事']);expect(model.setActive).not.toHaveBeenCalled();
  await click('展开分组');await click('全部',panel());expect(cards()).toHaveLength(3);
  await click('合成叙事的预设操作');await click('使用此预设');expect(model.setActive).toHaveBeenCalledWith('p1');
});

it('uses the shared search entry without replacing the selected group with an inline field',async()=>{
  view.openSearch=vi.fn();await mount();
  await click('合成甲',document.querySelector('[aria-label="预设分组"]'));
  await click('搜索预设');expect(view.openSearch).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.mobile-search')).toBeNull();
  expect(cards()).toEqual(['合成叙事']);
  expect(document.querySelector('[aria-label="预设分组"]')).toBeTruthy();
});

it('renames by stable group ID, retries failed creation and removes only the group',async()=>{
  await mount();await click('展开分组');await click('进入编辑');await click('分组 合成甲，长按拖动，点击改名');await input('合成乙');await click('保存');expect(model.renameGroup).not.toHaveBeenCalled();
  await input('合成丙');await click('保存');expect(model.renameGroup).toHaveBeenCalledWith('a','合成丙');expect(catalog.presets.find(p=>p.id==='p1').libraryGroupId).toBe('a');
  await click('新建',panel());await input('合成新增');model.createGroup.mockRejectedValueOnce(new Error('合成保存失败'));await click('保存');expect(document.querySelector('[aria-label="名称"]').value).toBe('合成新增');await click('保存');expect(model.createGroup).toHaveBeenLastCalledWith('合成新增','roleplay');
  await click('删除分组 合成丙');await click('删除',document.querySelector('[role=dialog]'));expect(model.deleteGroup).toHaveBeenCalledWith('a');expect(catalog.presets.find(p=>p.id==='p1').libraryGroupId).toBe('');expect(catalog.presets).toHaveLength(5);
});

it('keeps reordered groups in edit mode until Done, preserves the order across rename and retries failures',async()=>{
  await mount();await click('展开分组');await click('进入编辑');
  const chip=document.querySelector('[data-reorder-group=b] button');await act(()=>chip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
  expect(model.reorderGroups).not.toHaveBeenCalled();await act(()=>handlers.at(-1)());expect(document.querySelector('.mobile-character-library-panel-reveal.is-open')).not.toBeNull();
  expect([...document.querySelectorAll('[role=tab]')].every(node=>node.disabled)).toBe(true);
  await click('分组 合成甲，长按拖动，点击改名');await input('合成改名');await click('保存');
  expect([...document.querySelectorAll('[data-reorder-group]')].map(node=>node.dataset.reorderGroup)).toEqual(['b','a']);
  model.reorderGroups.mockRejectedValueOnce(new Error('合成顺序保存失败'));await click('完成编辑');expect(panel().textContent).toContain('合成顺序保存失败');await click('完成编辑');expect(model.reorderGroups).toHaveBeenLastCalledWith(['b','a'],'roleplay');
  expect(catalog.groups.filter(g=>g.purpose==='roleplay').map(g=>g.id)).toEqual(['b','a']);expect([...document.querySelectorAll('[role=tab]')].every(node=>!node.disabled)).toBe(true);
});

it('rejects stale group-order writes instead of silently dropping a group added elsewhere',async()=>{
  await mount();await click('展开分组');await click('进入编辑');await act(()=>document.querySelector('[data-reorder-group=b] button').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
  await act(()=>model.adopt({...catalog,groups:[...catalog.groups,group('external','合成外部组')]}));await click('完成编辑');expect(model.reorderGroups).not.toHaveBeenCalled();expect(panel().textContent).toContain('预设分组已在别处被修改');
  await click('完成编辑');expect(document.querySelector('[data-reorder-group=external]')).not.toBeNull();
});

it('uses the shared character selection header for export, counts actual selections and cancels without a bottom bar',async()=>{
  await mount();await click('预设操作');await click('导出预设');
  const header=()=>document.querySelector('.mobile-library-selection-header');
  expect(header().classList.contains('has-actions')).toBe(true);
  expect(document.querySelector('.mobile-selection-bar')).toBeNull();
  expect(header().querySelector('[role=status]').textContent).toBe('0 项');
  expect(header().querySelector('select[aria-label="导出格式"]')).toBeTruthy();
  expect([...header().querySelectorAll('button')].find(node=>node.textContent==='导出').disabled).toBe(true);
  expect(document.querySelectorAll('.mobile-character-selection[data-selected="false"]')).toHaveLength(3);
  expect(document.querySelector('.mobile-character-selection svg')).toBeNull();
  await act(()=>[...document.querySelectorAll('.mobile-preset-open')].find(button=>button.querySelector('strong').textContent==='合成叙事').click());expect(header().querySelector('[role=status]').textContent).toBe('1 项');
  expect(document.querySelectorAll('.mobile-character-selection[data-selected="true"] svg')).toHaveLength(1);
  await click('全选',header());expect(header().querySelector('[role=status]').textContent).toBe('3 项');
  await click('取消',header());expect(header()).toBeNull();expect(document.querySelector('.mobile-selection-bar')).toBeNull();expect(view.pushRoute).not.toHaveBeenCalled();
});

it('keeps complete export IDs, the chosen format and only failed items selected for retry in the shared header',async()=>{
  vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:synthetic-export'),revokeObjectURL:vi.fn()}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const result={fileName:'synthetic.json',mimeType:'application/json',base64:btoa('{"synthetic":true}')};
  model.export=vi.fn(async()=>result);
  await mount();await click('预设操作');await click('导出预设');await click('全选');
  const header=document.querySelector('.mobile-library-selection-header'),format=header.querySelector('select');
  await act(()=>{format.value='json';format.dispatchEvent(new Event('change',{bubbles:true}));});
  model.export.mockRejectedValueOnce(new Error('合成导出失败'));
  await click('导出',header);
  expect(model.export.mock.calls).toEqual([['agent-preset-standard','json'],['p1','json'],['p2','json']]);
  expect(document.querySelector('.mobile-selection-summary').textContent).toBe('1 项');
  expect(document.querySelectorAll('.mobile-preset-open[aria-pressed=true]')).toHaveLength(1);
  expect(document.querySelector('[role=alert]').textContent).toContain('操作失败，请重试。');
  await click('导出',header);expect(model.export).toHaveBeenLastCalledWith('agent-preset-standard','json');
  expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
});
