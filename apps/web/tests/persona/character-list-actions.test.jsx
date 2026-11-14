// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterListPanel } from '../../src/modules/persona/components/CharacterListPanel.jsx';
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, node;
beforeEach(()=>vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}}));
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const action = text => [...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);
async function click(button){expect(button).toBeTruthy();await act(async()=>button.click());}
async function context(){const row=node.querySelectorAll('.character-contact-row')[1];await act(()=>row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100})));}
async function mount(overrides={}){node=document.createElement('div');document.body.append(node);root=createRoot(node);
  const onExportCharacters=vi.fn().mockResolvedValue({canceled:false,written:[{characterId:'second'}],failures:[]}),onDeleteCharacters=vi.fn().mockResolvedValue(undefined);
  await act(()=>root.render(<CharacterListPanel characters={{groups:[],items:[{id:'first',name:'合成甲'},{id:'second',name:'合成乙'}]}}
    activeCharacterId="first" onSelectCharacter={()=>{}} onExportCharacters={onExportCharacters} onDeleteCharacters={onDeleteCharacters} {...overrides}/>));
  return {onExportCharacters,onDeleteCharacters};
}
describe('PC character sidebar context actions',()=>{
  it('edits the right-clicked character and places deletion last behind confirmation',async()=>{
    const open=vi.spyOn(window,'open').mockReturnValue(null);
    const {onDeleteCharacters}=await mount();await context();
    expect([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent)).toEqual(['编辑角色卡','导出角色','删除角色']);
    await click(action('编辑角色卡'));expect(open.mock.calls[0][0]).toContain('character=second');
    await context();await click(action('删除角色'));
    expect(document.querySelector('[role=alertdialog]').textContent).toContain('合成乙');
    expect(onDeleteCharacters).not.toHaveBeenCalled();
    await click([...document.querySelectorAll('[role=alertdialog] button')].find(e=>e.textContent==='删除角色'));
    expect(onDeleteCharacters).toHaveBeenCalledWith(['second']);
  });
  it.each(['PNG','ZIP'])('exports only the right-clicked character as %s through the existing save flow',async format=>{
    const {onExportCharacters}=await mount();await context();await click(action('导出角色'));
    expect(action('JSON')).toBeUndefined();
    await click(action(format));expect(onExportCharacters).toHaveBeenCalledExactlyOnceWith(['second'],format.toLowerCase());
    expect(document.querySelector('[role=menu]')).toBeNull();
  });
  it('shows export failures and permits reopening to retry without changing the active character',async()=>{
    const exportFile=vi.fn().mockResolvedValueOnce({canceled:false,failures:[{characterId:'second',message:'Synthetic export failure'}],written:[]}).mockResolvedValueOnce({canceled:true,failures:[],written:[]});
    await mount({onExportCharacters:exportFile});await context();await click(action('导出角色'));await click(action('ZIP'));
    expect(node.textContent).toContain('Synthetic export failure');
    await context();await click(action('导出角色'));await click(action('PNG'));
    expect(exportFile.mock.calls).toEqual([[['second'],'zip'],[['second'],'png']]);
    expect(node.textContent).not.toContain('Synthetic export failure');
  });
});
