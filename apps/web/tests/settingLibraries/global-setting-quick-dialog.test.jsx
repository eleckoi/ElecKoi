// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {GlobalSettingLibrariesQuickDialog} from '../../src/modules/settingLibraries/components/GlobalSettingLibrariesQuickDialog.jsx';

let root;
globalThis.React=React; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(async()=>{if(root)await act(()=>root.unmount());root=null;document.body.replaceChildren();});
async function mount(){
 const host=document.createElement('div');document.body.append(host);root=createRoot(host);
 const value={libraries:[{id:'synthetic-library',name:'合成共享库',enabled:true,entries:[]}]};
 const model={getSnapshot:()=>({status:'ready',value}),subscribe:()=>()=>{},read:vi.fn(async()=>value),save:vi.fn(async next=>next)};
 const onClose=vi.fn();await act(()=>root.render(<GlobalSettingLibrariesQuickDialog model={model} onClose={onClose}/>));
 await act(()=>document.querySelector('input[type=checkbox]').click());
 return {host,model,onClose};
}
const dialog=()=>document.querySelector('[role=dialog][aria-label="全局设定库"]');
const confirmation=()=>document.querySelector('[role=dialog][aria-label="保存修改？"]');
async function requestClose(){await act(()=>dialog().querySelector('button[aria-label="关闭"]').click());}
function action(label){return [...confirmation().querySelectorAll('.product-dialog-actions button')].find(b=>b.textContent===label);}

it('keeps the global draft when cancelling the top official leave confirmation, then discards without saving',async()=>{
 const {host,model,onClose}=await mount();await requestClose();
 expect(document.querySelectorAll('[role=dialog]')).toHaveLength(2);expect(host.querySelector('[role=dialog]')).toBeNull();
 expect([...confirmation().querySelectorAll('.product-dialog-actions button')].map(b=>b.textContent)).toEqual(['取消','不保存','保存']);
 await act(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 expect(confirmation()).toBeNull();expect(dialog().querySelector('input[type=checkbox]').checked).toBe(false);expect(onClose).not.toHaveBeenCalled();
 await requestClose();await act(()=>action('不保存').click());
 expect(model.save).not.toHaveBeenCalled();expect(onClose).toHaveBeenCalledOnce();
});

it('retains the changed global switches and the leave confirmation after a failed save and retries the same draft',async()=>{
 const {model,onClose}=await mount();model.save.mockRejectedValueOnce(new Error('合成保存失败'));
 await requestClose();await act(()=>action('保存').click());
 expect(onClose).not.toHaveBeenCalled();expect(confirmation().textContent).toContain('合成保存失败');
 expect(dialog().querySelector('input[type=checkbox]').checked).toBe(false);
 await act(()=>action('保存').click());expect(model.save).toHaveBeenCalledTimes(2);
 expect(model.save.mock.calls[1][0].libraries[0].enabled).toBe(false);expect(onClose).toHaveBeenCalledOnce();
});
