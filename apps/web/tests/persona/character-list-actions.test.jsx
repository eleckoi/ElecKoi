// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterListPanel } from '../../src/modules/persona/components/CharacterListPanel.jsx';
import { CatalogSlotsContext } from '../../src/ui/ui/CatalogSlotsContext.jsx';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, node;
beforeEach(()=>vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}}));
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const action = text => [...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);
async function click(button){expect(button).toBeTruthy();await act(async()=>button.click());}
async function context(){const row=node.querySelectorAll('.character-contact-row')[1];await act(()=>row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100})));}
async function mount(overrides={}, catalogSlots){node=document.createElement('div');document.body.append(node);root=createRoot(node);
  const onExportCharacters=vi.fn().mockResolvedValue({canceled:false,written:[{characterId:'second'}],failures:[]}),onDeleteCharacters=vi.fn().mockResolvedValue(undefined);
  await act(()=>root.render(<CatalogSlotsContext.Provider value={catalogSlots}>
    <CharacterListPanel characters={{groups:[],items:[{id:'first',name:'合成甲'},{id:'second',name:'合成乙'}]}}
      activeCharacterId="first" onSelectCharacter={()=>{}} onExportCharacters={onExportCharacters} onDeleteCharacters={onDeleteCharacters} {...overrides}/>
  </CatalogSlotsContext.Provider>));
  return {onExportCharacters,onDeleteCharacters};
}
describe('PC character sidebar context actions',()=>{
  it('appends an action for the exact role card and restores focus to that card',async()=>{
    const name = 'eleckoi.character.library.item.menu.actions';
    const slots = new SlotCore();
    const disposeRoot = slots.register({ name: 'root', children: { [name]: { kind: 'list', scope: 'root' } } }, () => null);
    const onAction = vi.fn();
    const disposeAction = slots.register({ name, id: 'sample' }, ({ onDismiss, character }) =>
      <button type="button" role="menuitem" onClick={() => { onDismiss(); onAction(character.id); }}>插件操作</button>);
    const catalogSlots = {
      render: (_name, _owner, fallback) => fallback,
      actions: (slot, owner) => slots.entriesOfSlot(slot).map(entry => <entry.component key={entry.entryId} {...owner} />),
    };
    try {
      const { onDeleteCharacters } = await mount({}, catalogSlots);
      await context();
      expect(action('编辑角色卡')).toBeDefined();
      await click(action('插件操作'));
      expect(onAction).toHaveBeenCalledExactlyOnceWith('second');
      expect(onDeleteCharacters).not.toHaveBeenCalled();
      expect(document.querySelector('[role=menu]')).toBeNull();
      expect(document.activeElement).toBe(node.querySelectorAll('.character-contact-row')[1]);
    } finally {
      disposeAction();
      disposeRoot();
    }
  });
  it('edits the right-clicked character and places deletion last behind confirmation',async()=>{
    const open=vi.spyOn(window,'open').mockReturnValue(null);
    const {onDeleteCharacters}=await mount();await context();
    expect([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent)).toEqual(['编辑角色卡','导出角色','删除角色']);
    await click(action('编辑角色卡'));expect(open.mock.calls[0][0]).toContain('character=second');
    await context();await click(action('删除角色'));
    expect(document.querySelector('[role=dialog]').textContent).toContain('合成乙');
    expect(onDeleteCharacters).not.toHaveBeenCalled();
    await click([...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent==='删除角色'));
    expect(onDeleteCharacters).toHaveBeenCalledWith(['second']);
  });
  it.each(['PNG','ZIP'])('exports only the right-clicked character as %s through the existing save flow',async format=>{
    const {onExportCharacters}=await mount();
    const saving = Promise.withResolvers();
    onExportCharacters.mockReturnValue(saving.promise);
    await context();await click(action('导出角色'));
    expect(action('JSON')).toBeUndefined();
    await click(action(format));expect(onExportCharacters).toHaveBeenCalledExactlyOnceWith(['second'],format.toLowerCase());
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(document.querySelector('.transfer-waiting-dialog').textContent).toContain(`合成乙${format}`);
    await act(async () => saving.resolve({ canceled: true, written: [], failures: [] }));
    expect(document.querySelector('.transfer-waiting-dialog')).toBeNull();
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
