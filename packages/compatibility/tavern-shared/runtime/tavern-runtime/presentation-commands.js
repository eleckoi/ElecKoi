import Fuse from 'fuse.js';
import { showFontAwesomePicker } from '../vendor/sillytavern/public/scripts/eleckoi-icon-picker.js';
import icons from './icon-inventory.json';
import { openDataBank } from './databank-ui.js';

export function restorePresentation(context,api) {
  const power=context.extensionSettings.power_user || {};
  if(!power.waifuMode && !power.movingUIState)return;
  const doc=api.ui.getChatDocument();
  doc.documentElement.classList.toggle('waifuMode',!!power.waifuMode);
  let sheet=doc.getElementById('eleckoi-visual-novel-style');
  if(!sheet){sheet=doc.createElement('style');sheet.id='eleckoi-visual-novel-style';doc.head.append(sheet);}
  sheet.textContent='.waifuMode #chat{background:transparent}.waifuMode #chat .mes_text{background:var(--SmartThemeChatTintColor,#0009);padding:12px;border-radius:12px}.waifuMode #expression-image{max-height:85vh;max-width:75vw;bottom:0;z-index:0}.waifuMode #chat{position:relative;z-index:1}';
  for(const [id,properties] of Object.entries(power.movingUIState || {})){
    const element=doc.getElementById(id);if(!element)throw new Error(`Moving UI element is not present in this theme: #${id}`);
    Object.assign(element.style,properties);
  }
}

export function presentationCommands(context, api) {
  const capture = () => ({ conversationId: context.getCurrentChatId(), characterId: globalThis.getCharData('current')?.native_id });
  const style = name => async () => { await api.appearance.messageStyle(name); return ''; };
  return {
    'db': () => openDataBank(context, api),
    'vn':async()=>{
      const power=context.extensionSettings.power_user ||= {};power.waifuMode=!power.waifuMode;
      const doc=api.ui.getChatDocument();doc.documentElement.classList.toggle('waifuMode',power.waifuMode);
      // Render the stylesheet on both transitions, including the initial transition off.
      restorePresentation(context,api);context.saveSettingsDebounced();await api.flush();return '';
    },
    'movingui':async(_args,name)=>{
      const power=context.extensionSettings.power_user ||= {},list=context.extensionSettings.movingUIPresets || power.movingUIPresets || [];
      const preset=list.find(item=>item.name===name);if(!preset)throw new Error(`Moving UI preset not found: ${name}`);
      const previous=power.movingUIState;power.movingUIState=structuredClone(preset.movingUIState || preset.state || {});
      try{restorePresentation(context,api);}catch(error){power.movingUIState=previous;throw error;}
      power.movingUIPreset=name;context.saveSettingsDebounced();await api.flush();return '';
    },
    'panels': async () => { await api.ui.chatPanels('toggle'); return ''; },
    'resetpanels': async () => { await api.ui.chatPanels('reset'); return ''; },
    'lockbg': async () => { await api.appearance.lockBackground(true,capture()); return ''; },
    'unlockbg': async () => { await api.appearance.lockBackground(false,capture()); return ''; },
    'autobg': async () => {
      const target=capture(),state=await api.appearance.backgrounds(target);
      if (!state.items.length) throw new Error('No backgrounds available');
      const result=await api.generation.invoke({...target,purpose:'background-selection',prompt:`Select the background best fitting the current scene from this list: ${state.items.map(item=>item.name).join(', ')}. Return only its exact name.`});
      const selected=state.items.find(item=>item.name===result.content.trim());
      if(!selected) throw new Error(`The model did not select an available background: ${result.content}`);
      await api.appearance.selectBackground(selected.name,target);return '';
    },
    'single': style('single'), 'bubble': style('bubble'), 'flat': style('flat'),
    'theme': async (_args, name) => { await api.flush(); return api.appearance.theme(name); },
    'bg': async (_args, name) => {
      const target = capture(), state = await api.appearance.backgrounds(target);
      if (!name) return state.current;
      const found = state.items.find(item => item.name === name) || new Fuse(state.items, { keys:['name'] }).search(name)[0]?.item;
      if (!found) throw new Error(`Background does not exist: ${name}`);
      await api.appearance.selectBackground(found.name, target); return '';
    },
    'bgcol': async (args) => { await api.appearance.palette({ ...capture(), name:args.name, background:args.bg, force:globalThis.__ElecKoiSt.isTrueBoolean(args.force) }); return ''; },
    'css-var': async (args, value) => { api.ui.setCssVariable(args.to || 'chat', args.varname, value); return ''; },
    'pick-icon': async () => ((await showFontAwesomePicker(icons)) ?? false).toString(),
    'reload-page': async () => { await api.flush(); api.ui.reloadChat(); return ''; },
  };
}
