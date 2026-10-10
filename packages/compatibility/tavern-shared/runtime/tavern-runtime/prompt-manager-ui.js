import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';

/** Prompt editor controls retain ST IDs while displaying in the shared visible document. */
export function installPromptManagerUi(manager, context, bridge) {
  let root, popup, selected, active, rendering = Promise.resolve();
  const doc = () => bridge.document();
  const control = name => root?.querySelector(`#${manager.configuration.prefix}prompt_manager_popup_entry_form_${name}`);
  const fieldMap = {name:'name',role:'role',prompt:'content',injection_position:'injection_position',injection_depth:'injection_depth',injection_order:'injection_order'};
  manager.promptSources = {charDescription:'Character Description',charPersonality:'Character Personality',scenario:'Character Scenario',
    personaDescription:'Persona Description',worldInfoBefore:'World Info (↑Char)',worldInfoAfter:'World Info (↓Char)'};
  manager.configuration = {...manager.configuration,prefix:'completion_',version:1};
  manager.init = (configuration, settings) => {
    manager.configuration = {...manager.configuration,...configuration};
    if (settings) manager.serviceSettings=settings;
    manager.sanitizeServiceSettings();
  };
  manager.sanitizeServiceSettings = () => {
    const settings=manager.serviceSettings;
    settings.prompts ||= []; settings.prompt_order ||= [];
    settings.prompts.forEach(prompt=>{if(prompt)prompt.identifier ??= manager.getUuidv4();});
    manager.checkForMissingPrompts(settings.prompts);
    if (manager.activeCharacter && !settings.prompt_order.some(order=>String(order.character_id)===String(manager.activeCharacter.id)))
      manager.addPromptOrderForCharacter(manager.activeCharacter,bridge.defaults().prompt_order[0].order);
    const order=manager.getPromptOrderForCharacter(manager.activeCharacter);
    for (let index=order.length-1;index>=0;index--) if (!settings.prompts.some(prompt=>prompt.identifier===order[index].identifier)) order.splice(index,1);
  };
  manager.checkForMissingPrompts = prompts => {
    for (const prompt of bridge.defaults().prompts) if (!prompts.some(item=>item.identifier===prompt.identifier)) prompts.push(structuredClone(prompt));
  };
  manager.handleCharacterSelected = event => {
    if (!['global','character'].includes(manager.configuration.promptOrder.strategy)) throw new Error('Unsupported prompt order mode.');
    active=manager.configuration.promptOrder.strategy==='global' ? {id:manager.configuration.promptOrder.dummyId} : {id:event.detail.id,...event.detail.character};
    if (!manager.getPromptOrderForCharacter(active).length) manager.addPromptOrderForCharacter(active,structuredClone(bridge.defaults().prompt_order[0].order));
  };
  manager.handleCharacterUpdated = event => {
    if (!['global','character'].includes(manager.configuration.promptOrder.strategy)) throw new Error('Prompt order strategy not supported.');
    active=manager.configuration.promptOrder.strategy==='global' ? {id:manager.configuration.promptOrder.dummyId} : {id:event.detail.id,...event.detail.character}; };
  manager.handleCharacterDeleted = event => { if (manager.configuration.promptOrder.strategy==='global') return;
    manager.removePromptOrderForCharacter({id:event.detail.id}); if (active?.id===event.detail.id) active=null; };
  manager.handleGroupSelected = event => manager.handleCharacterSelected({detail:{id:event.detail.id,character:{group:event.detail.group}}});
  Object.defineProperty(manager,'activeCharacter',{configurable:true,get:()=>manager.configuration.promptOrder.strategy==='global'
    ? {id:manager.configuration.promptOrder.dummyId} : active===undefined ? {id:context.characterId} : active,set:value=>{active=value;}});

  function element(tag, text, parent=root) {const node=doc().createElement(tag);if(text!==undefined)node.textContent=text;parent?.append(node);return node;}
  function button(label,action,parent=root) {const node=element('button',label,parent);node.type='button';node.onclick=()=>Promise.resolve().then(action).catch(bridge.report);return node;}
  function mount() {
    if(root) return root;
    root=element('section',undefined,null);root.className='eleckoi-prompt-manager';root.id=manager.configuration.prefix+'prompt_manager';
    const style=element('style',undefined,root);style.textContent='.eleckoi-prompt-manager{width:100%;text-align:left}.eleckoi-prompt-manager label{display:block;margin:8px 0}.eleckoi-prompt-manager input,.eleckoi-prompt-manager textarea,.eleckoi-prompt-manager select{box-sizing:border-box;max-width:100%;font:inherit}.eleckoi-prompt-manager textarea{width:100%;min-height:160px}.eleckoi-prompt-row{display:flex;align-items:center;gap:6px;padding:6px 0}.eleckoi-prompt-row span{flex:1}.eleckoi-prompt-manager button{font:inherit;margin:3px}.eleckoi-prompt-manager pre{white-space:pre-wrap;overflow-wrap:anywhere}';
    manager.containerElement=root;
    const list=element('section');list.id=manager.configuration.prefix+'prompt_manager_list';manager.listElement=list;
    button('新增 Prompt',()=>manager.loadPromptIntoEditForm({identifier:manager.getUuidv4(),name:'New Prompt',role:'system',content:''}));
    const edit=element('section');edit.id=manager.configuration.prefix+'prompt_manager_popup_edit';
    for(const [name,title,kind,options] of [['name','名称','input'],['role','角色','select',['system','user','assistant']],['prompt','内容','textarea'],
      ['injection_position','插入位置','select',['0','1']],['injection_depth','深度','input'],['injection_order','顺序','input'],
      ['injection_trigger','生成类型','select',['normal','continue','quiet','swipe','regenerate','impersonate']],['forbid_overrides','禁止覆盖','input']]) {
      const label=element('label',title,edit),input=element(kind,undefined,label);input.id=manager.configuration.prefix+'prompt_manager_popup_entry_form_'+name;
      if(name==='injection_depth')label.id=manager.configuration.prefix+'prompt_manager_depth_block';
      if(name==='injection_order')label.id=manager.configuration.prefix+'prompt_manager_order_block';
      if(name==='forbid_overrides')label.id=manager.configuration.prefix+'prompt_manager_forbid_overrides_block';
      if(options)for(const value of options){const option=element('option',value,input);option.value=value;}
      if(name==='injection_trigger')input.multiple=true;
      if(name==='forbid_overrides')input.type='checkbox'; else if(['injection_depth','injection_order'].includes(name))input.type='number';
      if(name==='injection_position')input.onchange=manager.handleInjectionPositionChange;
    }
    const source=element('label',undefined,edit);source.id=manager.configuration.prefix+'prompt_manager_popup_entry_source_block';
    const sourceName=element('span',undefined,source);sourceName.id=manager.configuration.prefix+'prompt_manager_popup_entry_source';
    const saveButton=button('保存 Prompt',async()=>{if(!selected)throw new Error('Select a prompt before saving');
      const prompt=manager.getPromptById(selected) || {identifier:selected};manager.updatePromptWithPromptEditForm(prompt);
      if(!manager.getPromptById(selected))manager.addPrompt(prompt,selected);
      await manager.save();await manager.renderPromptManagerListItems();},edit);
    saveButton.id=manager.configuration.prefix+'prompt_manager_popup_entry_form_save';
    const resetButton=button('重置 Prompt',()=>manager.handleResetPrompt({target:resetButton}),edit);
    resetButton.id=manager.configuration.prefix+'prompt_manager_popup_entry_form_reset';
    const inspect=element('section');inspect.id=manager.configuration.prefix+'prompt_manager_popup_inspect';inspect.hidden=true;
    const messages=element('section',undefined,inspect);messages.id=manager.configuration.prefix+'prompt_manager_popup_entry_form_inspect_list';
    const quick=element('section');quick.id='quick-edit-container';
    manager.clearEditForm(); return root;
  }
  manager.updatePromptWithPromptEditForm = prompt => {
    if(!root)throw new Error('Prompt editor is not mounted');
    for(const [name,key] of Object.entries(fieldMap))prompt[key]=name.startsWith('injection_') ? Number(control(name).value) : control(name).value;
    prompt.injection_trigger=Array.from(control('injection_trigger').selectedOptions,option=>option.value);
    prompt.forbid_overrides=control('forbid_overrides').checked;
  };
  manager.loadPromptIntoEditForm = prompt => {mount();selected=prompt.identifier;
    const defaults={name:'',role:'system',content:'',injection_position:0,injection_depth:4,injection_order:100};
    for(const [name,key]of Object.entries(fieldMap))control(name).value=prompt[key] ?? defaults[key];
    control('prompt').disabled=!!prompt.marker;control('forbid_overrides').checked=!!prompt.forbid_overrides;
    for(const option of control('injection_trigger').options)option.selected=prompt.injection_trigger?.includes(option.value) || false;
    manager.handleInjectionPositionChange({target:control('injection_position')});root.querySelector('[id$="popup_edit"]').hidden=false;
    const source=root.querySelector('[id$="entry_source_block"]');source.hidden=!Object.hasOwn(manager.promptSources,prompt.identifier);
    source.querySelector('span').textContent=manager.promptSources[prompt.identifier] || '';
    control('forbid_overrides').parentElement.style.visibility=manager.overridablePrompts.includes(prompt.identifier)?'visible':'hidden';
    control('save').dataset.pmPrompt=prompt.identifier;
    control('reset').hidden=prompt.system_prompt!==true;control('reset').dataset.pmPrompt=prompt.identifier;
  };
  manager.clearEditForm = () => {if(!root)return; selected=null;
    for(const [name,key]of Object.entries(fieldMap))control(name).value={role:'system',injection_position:0,injection_depth:4,injection_order:100}[key] ?? '';
    control('prompt').disabled=false;control('forbid_overrides').checked=false;for(const option of control('injection_trigger').options)option.selected=false;
    root.querySelector('[id$="popup_edit"]').hidden=true;
    root.querySelector('[id$="entry_source_block"]').hidden=true;root.querySelector('[id$="entry_source"]').textContent='';
    for(const name of ['injection_depth','injection_order','forbid_overrides'])control(name).parentElement.style.visibility='unset';
    control('role').disabled=false;control('injection_position').disabled=false;
  };
  manager.handleInjectionPositionChange = event => {for(const name of ['injection_depth','injection_order'])control(name).parentElement.style.visibility=Number(event.target.value)===1?'visible':'hidden';};
  manager.clearInspectForm = () => {if(root){root.querySelector('[id$="inspect_list"]').replaceChildren();root.querySelector('[id$="popup_inspect"]').hidden=true;}};
  manager.loadMessagesIntoInspectForm = messages => {if(!messages)return;mount();manager.clearInspectForm();
    const values=Array.isArray(messages)?messages:typeof messages.getCollection==='function'?messages.getCollection():[messages];
    const list=root.querySelector('[id$="inspect_list"]');
    if(!values.length)element('span','This marker does not contain any prompts.',list);
    for(const message of values){const item=element('details',undefined,list);element('summary',`${message.identifier || message.role} · ${message.getTokens?.() ?? ''}`,item);element('pre',message.content ?? '',item);}
    root.querySelector('[id$="popup_inspect"]').hidden=false;
  };
  manager.renderPromptManager = async () => {mount();};
  manager.renderPromptManagerListItems = async () => {mount();manager.listElement.replaceChildren();
    const order=manager.getPromptOrderForCharacter(manager.activeCharacter);
    for(const [index,entry]of order.entries()){const prompt=manager.getPromptById(entry.identifier);if(!prompt)throw new Error(`Missing prompt ${entry.identifier}`);
      const row=element('div',undefined,manager.listElement);row.className='eleckoi-prompt-row';row.dataset.pmIdentifier=prompt.identifier;
      const enabled=element('input',undefined,row);enabled.type='checkbox';enabled.checked=!!entry.enabled;
      enabled.onchange=()=>{entry.enabled=enabled.checked;manager.save().catch(bridge.report);};
      element('span',prompt.name || prompt.identifier,row);button('编辑',()=>manager.loadPromptIntoEditForm(prompt),row);
      for(const [label,step]of [['↑',-1],['↓',1]])button(label,async()=>{const target=index+step;if(target<0||target>=order.length)return;
        const previous=order[index];order[index]=order[target];order[target]=previous;await manager.save();await manager.renderPromptManagerListItems();},row);
      button('移除',async()=>{manager.detachPrompt(prompt,manager.activeCharacter);await manager.save();await manager.renderPromptManagerListItems();},row);
    }
  };
  manager.makeDraggable = () => {if(!manager.listElement)throw new Error('Prompt list is not mounted');
    for(const row of manager.listElement.children){row.draggable=true;row.ondragstart=e=>e.dataTransfer.setData('text/plain',row.dataset.pmIdentifier);
      row.ondragover=e=>e.preventDefault();row.ondrop=e=>{e.preventDefault();const order=manager.getPromptOrderForCharacter(manager.activeCharacter);
        const from=order.findIndex(item=>item.identifier===e.dataTransfer.getData('text/plain')),to=order.findIndex(item=>item.identifier===row.dataset.pmIdentifier);
        if(from<0||to<0)return;order.splice(to,0,...order.splice(from,1));manager.save().then(manager.renderPromptManagerListItems).catch(bridge.report);};}
  };
  manager.showPopup = (area='edit') => {mount();if(!['edit','inspect'].includes(area))throw new Error(`Unknown prompt editor area: ${area}`);
    root.querySelector('[id$="popup_edit"]').hidden=area!=='edit';root.querySelector('[id$="popup_inspect"]').hidden=area!=='inspect';
    if(popup?.dlg.open)return;
    popup=new Popup(globalThis.$(root),POPUP_TYPE.TEXT,'',{wide:true,large:true});popup.show().catch(bridge.report);};
  manager.hidePopup = () => {if(popup?.dlg.open)popup.complete(0).catch(bridge.report);};
  manager.render = (afterTryGenerate=true) => {
    if(manager.configuration.promptOrder.strategy==='character' && manager.activeCharacter===null)return;
    manager.error=null;
    rendering=rendering.then(async()=>{
      if(afterTryGenerate && typeof manager.tryGenerate==='function')await manager.tryGenerate();
      await manager.renderPromptManager();await manager.renderPromptManagerListItems();manager.makeDraggable();
    }).catch(error=>{manager.error=error.message;bridge.report(error);});
  };
  manager.createQuickEdit = (identifier,title) => {mount();const prompt=manager.getPromptById(identifier);if(!prompt)throw new Error(`Missing prompt ${identifier}`);
    const label=element('label',title,root.querySelector('#quick-edit-container')),input=element('textarea',undefined,label);input.id=identifier+'_prompt_quick_edit_textarea';input.value=prompt.content;
    input.onblur=()=>{prompt.content=input.value;manager.save().then(()=>manager.render(false)).catch(bridge.report);};};
  manager.updateQuickEdit = (identifier,prompt) => {const id=identifier+'_prompt_quick_edit_textarea';
    const input=Array.from(root?.querySelectorAll('textarea') || []).find(value=>value.id===id);
    if(!input)throw new Error(`Quick editor is not mounted: ${identifier}`);input.value=prompt.content;return input.id;};
  manager.export = (data,type,name='export') => {Promise.resolve(bridge.export({version:manager.configuration.version,type,data},`${name}-${manager.getFormattedDate()}.json`)).catch(bridge.report);};
  manager.import = data => {if(data?.version!==1||typeof data.type!=='string'||!Array.isArray(data.data?.prompts))throw new TypeError('Invalid PromptManager export');
    if(!['global','character'].includes(manager.configuration.promptOrder.strategy))throw new Error('Prompt order strategy not supported.');
    const prompts=new Map(manager.serviceSettings.prompts.map(prompt=>[prompt.identifier,prompt]));
    for(const prompt of data.data.prompts){if(!prompt.identifier)throw new Error('Imported prompt has no identifier');prompts.set(prompt.identifier,prompt);}
    manager.serviceSettings.prompts=Array.from(prompts.values());
    if(Array.isArray(data.data.prompt_order) && (manager.configuration.promptOrder.strategy==='global' || data.type==='character'))
      Object.assign(manager.getPromptOrderForCharacter(manager.activeCharacter),structuredClone(data.data.prompt_order));
    manager.save().then(()=>manager.render(false)).catch(bridge.report);
  };
  manager.handleResetPrompt = event => {const prompt=manager.getPromptById(event.target.dataset.pmPrompt);if(!prompt)throw new Error('Prompt to reset does not exist');
    const original=bridge.defaults().prompts.find(item=>item.identifier===prompt.identifier);
    if(original)Object.assign(prompt,structuredClone(original));
    if(Object.hasOwn(manager.configuration.defaultPrompts,prompt.identifier))prompt.content=manager.configuration.defaultPrompts[prompt.identifier];
    manager.loadPromptIntoEditForm(prompt);
  };
  const profiles=new Map();manager.profileStart=id=>{profiles.set(id,Date.now());};manager.profileEnd=id=>{if(!profiles.has(id))throw new Error(`Profiling has not started: ${id}`);const elapsed=Date.now()-profiles.get(id);profiles.delete(id);manager.log(`${id}: ${elapsed}ms`);};
  bridge.cleanup?.add(()=>{manager.renderDebounced?.cancel();manager.hidePopup();root?.remove();});
}
