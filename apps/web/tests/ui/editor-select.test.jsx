// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorSelect } from '../../src/ui/ui/EditorSelect.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { EditorVersionManager } from '../../src/ui/ui/EditorVersionManager.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await act(() => root.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function mount(compact) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const change = vi.fn(), node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(() => root.render(<EditorPresentationContext.Provider value={{ compact }}><EditorSelect label="合成选项" value="a" onChange={change}
    options={[{value:'a',label:'合成甲'},{value:'b',label:'合成乙'}]} /></EditorPresentationContext.Provider>));
  return { change, control: document.querySelector('[aria-label="合成选项"]') };
}
function pointer(node, type, x, y) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, { pointerType: {value:'touch'}, clientX: {value:x}, clientY: {value:y} });
  node.dispatchEvent(event);
}
it('leaves a touch drag and cancelled scroll closed, then opens on a deliberate tap and selects through the official menu', async () => {
  const {control,change}=await mount(true);
  expect(document.querySelector('select')).toBeNull();
  for (const end of ['pointermove','pointercancel']) {
    await act(()=>{pointer(control,'pointerdown',20,20);pointer(control,end,20,70);control.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));});
    expect(control.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
  await act(()=>{pointer(control,'pointerdown',20,20);pointer(control,'pointerup',20,21);control.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));});
  expect(control.getAttribute('aria-expanded')).toBe('true');
  const option=[...document.querySelectorAll('[role="menuitem"]')].find(x=>x.textContent.includes('合成乙'));
  await act(()=>option.click());expect(change).toHaveBeenCalledExactlyOnceWith('b');
  expect(control.getAttribute('aria-expanded')).toBe('false');
  await act(()=>control.click());expect(control.getAttribute('aria-expanded')).toBe('true');
});
it('preserves the desktop select and its value change', async()=>{
  const {control,change}=await mount(false);expect(control.tagName).toBe('SELECT');
  await act(()=>{control.value='b';control.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(change).toHaveBeenCalledExactlyOnceWith('b');
});
it('uses the official menu for version and scope choices inside a mobile management modal', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const scope = vi.fn(), version = vi.fn(), node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(() => root.render(<EditorPresentationContext.Provider value={{compact:true}}><EditorVersionManager title="合成版本管理"
    versions={[{id:'a',name:'合成甲'},{id:'b',name:'合成乙'}]} activeVersionId="a" scope="character"
    scopes={[{id:'character',label:'角色'},{id:'global',label:'全局'}]} onScopeChange={scope} onSelect={version} onClose={()=>{}} /></EditorPresentationContext.Provider>));
  expect(document.querySelector('select')).toBeNull();
  await act(() => document.querySelector('[aria-label="当前版本"]').click());
  await act(() => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('合成乙')).click());
  expect(version).toHaveBeenCalledExactlyOnceWith('b');
  await act(() => document.querySelector('[aria-label="归属"]').click());
  await act(() => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('全局')).click());
  expect(scope).toHaveBeenCalledExactlyOnceWith('global');
});
