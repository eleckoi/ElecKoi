import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';
import { isTrueBoolean } from '../vendor/sillytavern/public/scripts/utils.js';
import { slashCommandReturnHelper } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandReturnHelper.js';
import { processImagePrompt, imageDimensions } from '../vendor/sillytavern/public/scripts/eleckoi-image-processing.js';
const truth = value => value === true || isTrueBoolean(String(value));

const emotions = ['admiration','amusement','anger','annoyance','approval','caring','confusion','curiosity','desire','disappointment','disapproval','disgust','embarrassment','excitement','fear','gratitude','grief','joy','love','nervousness','optimism','pride','realization','relief','remorse','sadness','surprise','neutral'];
const sourceNames = { novelai:'novel', novelai_image:'novel', openai_image:'openai' };
const settings = context => context.extensionSettings.expressions ||= { fallback_expression:'neutral', custom:[], overrides:[], last:{} };
const current = (context, reference) => {
  if (!reference && context.groupId) reference=context.chat.findLast(message=>!message.is_user && !message.is_system)?.name;
  const card=globalThis.RawCharacter.find({name:reference || 'current'});
  if (!card) throw new Error(`Character not found: ${reference || 'current'}`);
  return card;
};
const folder = (context,card) => settings(context).overrides?.find(item=>item.name===card.name)?.path || '';
const scope = (context,card=current(context)) => ({conversationId:context.getCurrentChatId(),characterId:card.native_id});
async function showExpression(context,api,card,state) {
  const doc=api.ui.getChatDocument();
  let image=doc.getElementById('expression-image');
  if (!image) { image=doc.createElement('img');image.id='expression-image';
    image.style.cssText='position:fixed;right:0;bottom:56px;max-height:55vh;max-width:40vw;object-fit:contain;pointer-events:none;z-index:3';doc.body.append(image); }
  image.src=state.url;image.alt=state.label;image.dataset.character=card.avatar;image.hidden=false;
}
export async function restoreMediaPresentation(context,api) {
  const card=current(context), state=settings(context).last?.[card.avatar];
  const doc=api.ui.getChatDocument();
  if (!state) { const image=doc.getElementById('expression-image');if (image) image.hidden=true;return; }
  const sprites=await api.media.expressions({...scope(context,card),folder:folder(context,card)});
  const item=sprites.find(item=>item.name===state.name);
  if (item) await showExpression(context,api,card,item);
  else { const image=doc.getElementById('expression-image');if(image)image.hidden=true; }
}

export function mediaCommands(context,api) {
  const save=async()=>{context.saveSettingsDebounced();await api.flush();};
  const pickImage=()=>new Promise(resolve=>{
    const input=api.ui.getChatDocument().createElement('input');input.type='file';input.accept='image/*';
    input.addEventListener('change',()=>{resolve(input.files?.[0] || null);input.remove();},{once:true});
    input.addEventListener('cancel',()=>{resolve(null);input.remove();},{once:true});input.click();
  });
  const available=async(args,card=current(context))=>{
    const sprites=await api.media.expressions({...scope(context,card),folder:folder(context,card)});
    const custom=settings(context).custom || [];
    let labels=[...new Set([...emotions,...custom])];
    if (args.custom === 'false' || args.custom === false) labels=labels.filter(label=>!custom.includes(label));
    if (args.custom === 'only') labels=labels.filter(label=>custom.includes(label));
    if (args.filter === undefined || truth(args.filter)) labels=labels.filter(label=>sprites.some(sprite=>sprite.label===label));
    return {labels,sprites};
  };
  const gallery=async(args={})=>{
    if(!args.group)return api.media.gallery(scope(context,current(context,args.char)));
    const group=context.groups.find(item=>item.id===args.group || item.name===args.group || truth(args.group) && item.id===context.groupId);
    if(!group)throw new Error(`Group not found: ${args.group}`);
    const entries=await Promise.all(group.members.map(avatar=>api.media.gallery(scope(context,current(context,avatar)))));
    return entries.flat().sort((a,b)=>(a.createdAt || 0)-(b.createdAt || 0));
  };
  return {
    'imagine-comfy-workflow':async(_args,name)=>{
      const workflows=context.extensionSettings.sd?.comfy_workflows || [],entry=workflows.find(item=>item.name===name);
      if(!entry)throw new Error(`ComfyUI workflow not found: ${name}`);
      const workflow=typeof entry.workflow==='string' ? JSON.parse(entry.workflow) : entry.workflow;
      if(!workflow || typeof workflow!=='object' || Array.isArray(workflow))throw new TypeError('ComfyUI workflow must be API-format JSON');
      await api.media.imageSettings({workflowName:entry.name,workflow});return '';
    },
    'imagine-source': async (_args,name)=>{
      const value=await api.media.imageSettings(name ? {source:String(name)} : undefined);
      return sourceNames[value.source] || value.source || '';
    },
    'imagine-style': async (_args,name)=>{
      const value=await api.media.imageSettings();if(!name)return value.style || '';
      const styles=context.extensionSettings.sd?.styles || [];
      const selected=styles.find(style=>style.name===name);
      if(!selected)throw new Error(`Image style not found: ${name}`);
      await api.media.imageSettings({style:selected.name,prefix:selected.prefix || '',negative:selected.negative || ''});return selected.name;
    },
    'imagine': async(args,value)=>{
      const target=scope(context), card=current(context), data=card.data || card;
      const modes={you:`Portrait of ${card.name}: ${data.description || ''}`,me:`Portrait of ${context.name1}: ${context.powerUserSettings.persona_description || ''}`,
        face:`Close-up face portrait of ${card.name}: ${data.description || ''}`,background:'Background and scenery of the current location without characters',
        scene:'A visible moment in the current scene',last:context.chat.findLast(message=>!message.is_system)?.mes || '',raw:context.chat.findLast(message=>!message.is_system)?.mes || '',raw_last:context.chat.findLast(message=>!message.is_system)?.mes || ''};
      const promptSettings=context.extensionSettings.sd || {};
      let prompt=String(value || 'scene').trim();const mode=prompt.toLowerCase();
      const processing=args.processing ?? (promptSettings.minimal_prompt_processing ? 'minimal' : 'standard');
      if(!['standard','minimal'].includes(processing))throw new Error(`Unknown image prompt processing: ${processing}`);
      const multimodal=truth(args.multimodal ?? promptSettings.multimodal_captioning) && ['you','me','face'].includes(mode);
      if(multimodal){
        let avatar=mode==='me' ? globalThis.getPersonaAvatarPath() : card.avatar_path;
        if(!avatar)throw new Error(`No avatar available for multimodal image prompt: ${mode}`);
        if(avatar.startsWith('/eleckoi-runtime/'))avatar=await api.media.read(avatar);
        prompt=(await api.generation.invokeRaw({conversationId:target.conversationId,purpose:'image-caption',messages:[{role:'user',content:[
          {type:'text',text:`Write only an image prompt based on this portrait. ${modes[mode]}`},{type:'image_url',image_url:{url:avatar}}]}]})).content;
        prompt=processImagePrompt(prompt,processing==='minimal');
      }else if(Object.hasOwn(modes,mode) && !['raw','raw_last'].includes(mode) || truth(args.extend ?? promptSettings.free_extend)) {
        const result=await api.generation.invoke({...target,purpose:'image-prompt',prompt:`Write only an image generation prompt for: ${modes[prompt] || prompt}. Describe visible composition, character appearance, action, location and lighting.`});
        prompt=processImagePrompt(result.content,processing==='minimal');
      }else if(['raw','raw_last'].includes(mode))prompt=modes[mode];
      const generationTypes={you:multimodal ? 8 : 0,me:multimodal ? 9 : 1,scene:2,raw:3,raw_last:3,last:4,face:multimodal ? 10 : 5,background:7};
      const eventData={prompt,generationType:generationTypes[mode] ?? (truth(args.extend ?? promptSettings.free_extend) ? 11 : 6),message:undefined,trigger:String(value || 'scene')};
      await context.eventSource.emit(context.eventTypes.SD_PROMPT_PROCESSING,eventData);prompt=eventData.prompt;
      if(typeof prompt!=='string' || !prompt.trim())throw new Error('Image prompt processing returned no prompt');
      if(truth(args.edit ?? promptSettings.edit)){prompt=await Popup.show.input('Image prompt',prompt);if(prompt===null)return '';}
      const config=await api.media.imageSettings();
      const options=Object.fromEntries(Object.entries(args).filter(([name])=>!name.startsWith('_') && !['quiet','gallery','extend','edit','multimodal','snap','processing'].includes(name)));
      const dimensions=Number(options.width ?? config.width)>0 && Number(options.height ?? config.height)>0 ? imageDimensions(mode,
        {width:Number(options.width ?? config.width),height:Number(options.height ?? config.height),snap:truth(args.snap ?? promptSettings.snap)}) : {};
      const image=await api.media.generate({...target,...options,...dimensions,prompt,negative:[config.negative,args.negative].filter(Boolean).join(', '),gallery:args.gallery===undefined || truth(args.gallery)});
      if(!truth(args.quiet)) {
        if(mode==='background'){
          await api.appearance.selectBackground(image.url,target);
          await context.eventSource.emit(context.eventTypes.FORCE_SET_BACKGROUND,{url:`url("${encodeURI(image.url)}")`,path:image.url});
        }
        const messages=await api.messages.read(target);
        await api.messages.insert([{role:'system',name:card.name,content:`![${prompt.replaceAll(']','')}](${image.url})`,
          metadata:{extra:{image:image.url,image_title:prompt,media:[{url:image.url,type:'image'}],inline_image:true}}}],{...target,index:messages.length});
      }
      return image.url;
    },
    'caption': async(args,prompt)=>{
      const target=scope(context);let image;
      if(args.mesId!==undefined){const messages=await api.messages.read(target), index=Number(args.mesId), message=messages[index<0 ? messages.length+index : index];
        if(!message)throw new RangeError(`Message index out of range: ${args.mesId}`);
        const media=[...(message.images || []),...(message.metadata?.extra?.media || [])];
        const item=media[Number(args.index || 0)] || (message.metadata?.extra?.image ? {url:message.metadata.extra.image} : null);
        if(!item)throw new Error('This message has no image');image=item.url;
      }else {image=await pickImage();if(!image)return '';}
      if(typeof image==='string' && image.startsWith('/eleckoi-runtime/'))image=await api.media.read(image);
      const result=await globalThis.generateRaw({ordered_prompts:[{role:'user',content:prompt || 'Describe this image.',image}],custom_api:{},max_chat_history:0});
      if(!isTrueBoolean(args.quiet))await api.messages.insert([{role:'user',name:context.name1,content:result}],{...target,index:(await api.messages.read(target)).length});
      return result;
    },
    'list-gallery': async(args)=>JSON.stringify((await gallery(args)).map(image=>image.url)),
    'show-gallery': async(args)=>{
      const images=await gallery(args);const doc=api.ui.getChatDocument(),body=doc.createElement('section');body.id='gallery';
      body.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px';
      if(!images.length)body.textContent='No images in this gallery.';
      for(const entry of images){const link=doc.createElement('a'),image=doc.createElement('img');link.href=entry.url;link.target='_blank';image.src=entry.url;image.alt=entry.prompt || '';image.style.width='100%';link.append(image);body.append(link);}
      await new Popup(body,POPUP_TYPE.TEXT,'',{wide:true,large:true,allowVerticalScrolling:true}).show();return '';
    },
    'expression-upload': async(args,url)=>{
      const card=current(context,args.name);const fields=Object.fromEntries(Object.entries(args).filter(([name])=>!name.startsWith('_')));
      const item=await api.media.uploadExpression({...scope(context,card),...fields,folder:args.folder ?? folder(context,card),url});
      if(!emotions.includes(item.label)){const config=settings(context);config.custom ||= [];if(!config.custom.includes(item.label))config.custom.push(item.label);await save();}return item.name;
    },
    'expression-set': async(args,label)=>{
      const card=current(context),{sprites}=await available({filter:true},card);
      const matches=sprites.filter(item=>args.type==='sprite' ? item.name===label : item.label===label);
      const item=matches[Math.floor(Math.random()*matches.length)];if(!item)throw new Error(`Expression sprite not found: ${label}`);
      await showExpression(context,api,card,item);(settings(context).last ||= {})[card.avatar]={name:item.name,label:item.label};await save();return item.label;
    },
    'expression-last': (_args,name)=>settings(context).last?.[current(context,name).avatar]?.label || '',
    'expression-fallback': async(_args,label)=>{
      const config=settings(context);if(label){if(![...emotions,...(config.custom || [])].includes(label))throw new Error(`Invalid expression: ${label}`);config.fallback_expression=label;await save();}
      return config.fallback_expression || 'neutral';
    },
    'expression-folder-override': async(args,path)=>{
      const card=current(context,args.name),config=settings(context);config.overrides ||= [];
      config.overrides=config.overrides.filter(item=>item.name!==card.name);
      if(path)config.overrides.push({name:card.name,path:/^[/\\]/.test(path) ? card.name+path : path});await save();return '';
    },
    'expression-list': async(args)=>slashCommandReturnHelper.doReturn(args.return || 'pipe',(await available(args)).labels),
    'expression-classify': async(args,text)=>{
      if(args.api && !['llm','main'].includes(args.api))throw new Error(`Classifier provider not configured: ${args.api}`);
      const {labels}=await available(args);if(!labels.length)throw new Error('No expression labels available');
      const result=await api.generation.invokeRaw({...scope(context),purpose:'expression-classification',messages:[
        {role:'system',content:args.prompt || `Choose exactly one emotion label from: ${labels.join(', ')}. Reply with the label only.`},{role:'user',content:text}]});
      const label=result.content.trim().toLowerCase().replace(/^["']|["']$/g,'');
      if(!labels.includes(label))throw new Error(`Classifier returned an unknown emotion label: ${result.content}`);return label;
    },
  };
}
