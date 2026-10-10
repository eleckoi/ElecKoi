import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';

/** The manager edits the same persisted documents, parsers and indexes as the Data Bank SDK. */
export async function openDataBank(context, api) {
  const target={conversationId:context.getCurrentChatId(),characterId:globalThis.getCharData('current')?.native_id};
  const document=globalThis.top?.__ElecKoiShared?globalThis.top.document:globalThis.document;
  const root=document.createElement('section'), title=document.createElement('h3'), error=document.createElement('p');
  title.textContent='Data Bank';error.setAttribute('role','alert');
  const source=document.createElement('select'), list=document.createElement('div');
  source.setAttribute('aria-label','Document scope');
  for(const name of ['all','global','character','chat']) { const option=document.createElement('option');option.value=name;option.textContent=name;source.append(option); }
  const name=document.createElement('input'), text=document.createElement('textarea'), save=document.createElement('button'), clear=document.createElement('button'), file=document.createElement('input');
  name.placeholder='Document name';name.setAttribute('aria-label','Document name');text.placeholder='Document text';text.setAttribute('aria-label','Document text');
  name.style.width='100%';text.style.cssText='box-sizing:border-box;width:100%;min-height:160px';save.textContent='Save';clear.textContent='New document';
  file.type='file';file.setAttribute('aria-label','Import document');
  root.append(title,source,list,name,text,save,clear,file,error);
  let editing=null, busy=false;
  const controls=[source,name,text,save,clear,file];
  const run=operation=>async()=>{
    if(busy) return;
    busy=true;controls.forEach(control=>control.disabled=true);error.textContent='';
    try { await operation(); }
    catch(failure) { error.textContent=failure.message || String(failure);globalThis.toastr?.error(error.textContent); }
    finally { busy=false;controls.forEach(control=>control.disabled=false); }
  };
  const options=()=>({...target,source:source.value});
  const reset=()=>{editing=null;name.value='';text.value='';};
  const render=async()=>{
    const entries=await api.databank.list(options());list.replaceChildren();
    if(!entries.length) { const empty=document.createElement('p');empty.textContent='No documents in this scope';list.append(empty); }
    for(const item of entries) {
      const row=document.createElement('div'), heading=document.createElement('span'), edit=document.createElement('button'), toggle=document.createElement('button'), remove=document.createElement('button');
      row.dataset.documentId=item.id;row.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0';
      heading.textContent=`${item.name} (${item.scope})`;edit.textContent='Edit';toggle.textContent=item.enabled===false?'Enable':'Disable';remove.textContent='Delete';
      edit.addEventListener('click',run(async()=>{ const value=await api.databank.get(item.id,options());editing=value;name.value=value.name;text.value=value.text; }));
      toggle.addEventListener('click',run(async()=>{await api.databank.setEnabled(item.id,item.enabled===false,options());await render();}));
      remove.addEventListener('click',run(async()=>{if(await Popup.show.confirm('Delete document?',item.name)){await api.databank.delete(item.id,options());if(editing?.id===item.id) reset();await render();}}));
      row.append(heading,edit,toggle,remove);list.append(row);
    }
  };
  source.addEventListener('change',run(async()=>{reset();await render();}));
  clear.addEventListener('click',reset);
  save.addEventListener('click',run(async()=>{
    if(!name.value.trim()) throw new Error('Document name is required');
    const value=await api.databank.put({...editing,...target,source:editing?.scope==='global'?'global':editing?.scope?.startsWith('character:')?'character':editing?'chat':source.value==='all'?'global':source.value,name:name.value.trim(),text:text.value});
    editing=value;await render();
  }));
  file.addEventListener('change',run(async()=>{const selected=file.files[0];if(selected){await api.databank.importFile(selected,{...options(),source:source.value==='all'?'global':source.value});file.value='';await render();}}));
  await render();
  await new Popup(root,POPUP_TYPE.TEXT,'',{wide:true,large:true,allowVerticalScrolling:true,okButton:'Close',cancelButton:false}).show();
  return '';
}
