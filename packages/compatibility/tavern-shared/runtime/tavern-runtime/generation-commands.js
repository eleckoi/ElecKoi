import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';
import { isTrueBoolean, isFalseBoolean, trimToEndSentence } from '../vendor/sillytavern/public/scripts/utils.js';
import { resolveVariable } from '../vendor/sillytavern/public/scripts/variables.js';
import { slashCommandReturnHelper } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandReturnHelper.js';

export function generationCommands(context, api) {
  const helper = globalThis;
  const capture = () => ({conversationId:context.getCurrentChatId(), characterId:helper.getCharData('current')?.native_id});
  const runClosure = async (closure,args) => {
    if (!closure) return;
    closure.scope.parent = args._scope; closure.abortController = args._abortController;
    closure.debugController = args._debugController; await closure.execute();
  };
  const stops = args => {
    const value=resolveVariable(args.stop,args._scope);
    if(!value)return undefined;
    const parsed=JSON.parse(value);
    if(!Array.isArray(parsed))throw new TypeError('/gen stop requires a JSON array');
    return parsed;
  };
  const locked = async (args,run) => {
    await api.input.clear();
    const lock=isTrueBoolean(args.lock);
    if(lock)context.deactivateSendButtons();
    try { return await run(); }
    finally { if(lock)context.activateSendButtons(); }
  };
  return {
    'send': async (args,value) => {
      const count=context.chat.length,requested=Number(args.at);
      const candidate=requested < 0 || Object.is(requested,-0) ? count+requested : requested;
      const index=Number.isInteger(candidate) && candidate >= 0 && candidate <= count ? candidate : count;
      const name=Object.hasOwn(args,'name') ? args.name || '' : context.name1;
      const avatar=Object.entries(context.powerUserSettings.personas || {}).find(([,value])=>value===name)?.[0] || helper.getCurrentPersonaId();
      let text=String(value ?? '').trim(),bias='';
      if(text.includes('{{bias')) {
        const hb=helper.__ElecKoiSt.libs.Handlebars.create(),parts=[];
        hb.registerHelper('bias',value=>{parts.push(value);return '';});
        hb.compile(text)({});
        if(parts.length)bias=` ${parts.join(' ')}`;
      }
      text=helper.__ElecKoiSt.getRegexedString(text,helper.__ElecKoiSt.regex_placement.USER_INPUT);
      text=context.substituteParams(text);
      const message={name,is_user:true,is_system:false,mes:text,send_date:new Date().toISOString(),extra:{isSmallSys:isTrueBoolean(args.compact)}};
      if(avatar)message.force_avatar=context.getThumbnailUrl('persona',avatar);
      if(bias){message.extra.bias=bias;message.mes=message.mes.replace(/\{\{[\s\S]*?\}\}/g,'');}
      if(context.powerUserSettings.message_token_count_enabled)message.extra.token_count=await context.getTokenCountAsync(message.mes,0);
      await helper.createChatMessages([{...message,role:'user'}],{insert_at:index === count ? 'end' : index});
      return slashCommandReturnHelper.doReturn(args.return ?? 'none',message,{objectToStringFunc:value=>value.mes});
    },
    'gen': (args,value) => locked(args,async()=>{
      const character=args.name ? helper.RawCharacter.find({name:args.name}) : null;
      const stop=stops(args);
      return context.generateQuietPrompt({quietPrompt:value,quietToLoud:args.as === 'char',quietName:character?.name ?? args.name,
        forceChId:character ? context.characters.findIndex(value=>value.native_id === character.native_id) : null,
        responseLength:Number(resolveVariable(args.length,args._scope)) || 0,trimToSentence:isTrueBoolean(args.trim),
        parameters:{...(stop ? {stop} : {})}});
    }),
    'genraw': (args,value) => !value ? '' : locked(args,()=>context.generateRaw({prompt:value,
      instructOverride:isFalseBoolean(args.instruct),quietToLoud:args.as === 'char',
      systemPrompt:resolveVariable(args.system,args._scope) || '',prefill:resolveVariable(args.prefill,args._scope) || '',
      responseLength:Number(resolveVariable(args.length,args._scope)) || 0,trimNames:!isFalseBoolean(args.trim),
      __eleckoiStop:stops(args)})),
    'closechat': async()=>{await api.chat.close();return '';},
    'tempchat': async()=>{await api.chat.close();await api.chat.temporary();return '';},
    'impersonate': (args,prompt) => context.generate('impersonate',{quiet_prompt:prompt || '',quietToLoud:!!prompt,
      await:isTrueBoolean(args.await),abortController:args._abortController}),
    'ask': async (args,prompt) => {
      const target=capture();
      await api.input.clear();
      if (context.groupId) { helper.toastr?.warning('Cannot run /ask command in a group chat!'); return ''; }
      if (!args.name) throw new Error('/ask requires a character name');
      const character=helper.RawCharacter.find({name:args.name});
      if (!character) throw new Error(`Character not found: ${args.name}`);
      const previous=await api.messages.read(target), previousIds=new Set(previous.map(message=>message.id));
      if (prompt?.trim()) {
        const content=helper.__ElecKoiSt.getRegexedString(prompt.trim(),helper.__ElecKoiSt.regex_placement.SLASH_COMMAND);
        await api.messages.insert([{role:'user',name:context.name1,content}],{...target,index:previous.length});
      }
      await context.generate('normal',{conversationId:target.conversationId,force_chid:character.native_id,
        await:true,abortController:args._abortController});
      const messages=await api.messages.read(target),reply=messages.findLast(message=>message.role==='assistant' && !previousIds.has(message.id));
      const message=reply ? {...reply.metadata,mes:reply.content,name:reply.name || character.name,is_user:false,is_system:false} : null;
      return slashCommandReturnHelper.doReturn(args.return || 'pipe',message,{objectToStringFunc:value=>value.mes});
    },
    'sysgen': async (args,prompt) => {
      if (!prompt) throw new Error('/sysgen requires a prompt');
      const target=capture(), name=args.name ?? context.chatMetadata.narrator_name ?? 'System';
      const result=await api.generation.invoke({...target,prompt,purpose:'narrator',raw:false});
      const content=isTrueBoolean(args.trim) ? trimToEndSentence(result.content) : result.content;
      const text=helper.__ElecKoiSt.getRegexedString(content,3);
      const count=(await api.messages.read(target)).length, requested=Number(args.at);
      const index=args.at === undefined ? count : requested < 0 || Object.is(requested,-0) ? count+requested : requested;
      if (!Number.isInteger(index) || index < 0 || index > count) throw new RangeError(`Message insertion index out of range: ${args.at}`);
      const message={name,is_user:false,is_system:false,mes:text,send_date:new Date().toISOString(),force_avatar:'',
        extra:{type:'narrator',isSmallSys:isTrueBoolean(args.compact),gen_id:Date.now(),api:'manual',model:'slash command'}};
      await api.messages.insert([{role:'system',name,content:text,metadata:message}],{...target,index});
      if (context.getCurrentChatId() === target.conversationId) await context.reloadCurrentChat();
      return slashCommandReturnHelper.doReturn(args.return || 'none',message,{objectToStringFunc:message=>message.mes});
    },
    'profile-genstream': async (args,prompt) => {
      const target=capture(), id=`profile-stream-${helper.__ElecKoiSt.uuidv4()}`;
      const options=await api.connections.requestOptions(args.profile);
      const doc=helper.top?.__ElecKoiShared ? helper.top.document : helper.document;
      const body=doc.createElement('section'), title=doc.createElement('h3'), thinking=doc.createElement('pre'), text=doc.createElement('pre');
      title.textContent=args.generating || 'Generating...';
      for (const node of [thinking,text]) { node.style.whiteSpace='pre-wrap'; node.style.overflowWrap='anywhere'; }
      body.append(title,thinking,text);
      let content='',reasoning='',stopped=false,finished=false,stopping;
      const requestController = new AbortController();
      const cancel=() => stopping ||= (async () => { stopped=true; requestController.abort(); await api.generation.cancel(id); await runClosure(args.onStop,args); })();
      const popup=new Popup(body,POPUP_TYPE.TEXT,'',{wide:true,large:true,allowVerticalScrolling:true,okButton:'Close',
        onClosing:async () => { if (!finished) await cancel(); }});
      if (args.stop === undefined || isTrueBoolean(args.stop)) {
        const button=doc.createElement('button'); button.textContent='Stop'; body.append(button);
        button.addEventListener('click',() => cancel().catch(error => { title.textContent=error.message; }));
      }
      const stopListening=api.events.on('generation.delta',packet => {
        if (packet.id !== id) return;
        content+=packet.delta || ''; reasoning+=packet.reasoning || '';
        text.textContent=content; thinking.textContent=reasoning;
      });
      const abort=() => cancel();
      args._abortController?.addEventListener('abort',abort);
      const display=popup.show();
      if (isTrueBoolean(args.lock)) context.deactivateSendButtons();
      try {
        if (args._abortController?.signal.aborted) throw new DOMException('Script aborted','AbortError');
        try {
          const messages=args.system ? [{role:'system',content:args.system},{role:'user',content:prompt}] : prompt;
          if (options.transport === 'textgenerationwebui') {
            const generate=await context.TextCompletionService.processRequest({...options.text_request,request_id:id,
              prompt:messages,stream:true,max_tokens:Number(args.length || 2048)},
              {presetName:options.preset_name,instructName:options.instruct_name},true,requestController.signal);
            for await (const packet of generate()) {
              content=packet.text; reasoning=packet.state?.reasoning || '';
              text.textContent=content; thinking.textContent=reasoning;
            }
          } else {
            const result=await api.generation.invokeRaw({...target,...options,id,prompt,stream:true,purpose:'profile-stream',
              ...(args.system ? {messages} : {}),parameters:{max_tokens:Number(args.length || 2048)}});
            content=result.content; reasoning=result.reasoning || ''; text.textContent=content; thinking.textContent=reasoning;
          }
        } catch (error) { if (!stopped) throw error; }
        if (stopping) await stopping;
        finished=true;
        title.textContent=stopped ? 'Stopped' : args.completed || 'Generated';
        if (!stopped) await runClosure(args.onComplete,args);
        const delay=args.delay === undefined ? 3000 : Number(args.delay);
        if (Number.isFinite(delay) && delay >= 0) setTimeout(() => popup.completeAffirmative().catch(error => { title.textContent=error.message; }),delay);
        // Popup stays open when delay=infinite. This command returns as soon as the request finishes.
        display.catch(error => { title.textContent=error.message; helper.toastr?.error(error.message); });
        return isTrueBoolean(args.reasoning) && reasoning ? helper.__ElecKoiSt.formatReasoning(reasoning, content).formatted : content;
      } catch (error) {
        finished=true; await popup.completeNegative(); await display; throw error;
      } finally {
        stopListening(); args._abortController?.removeEventListener('abort',abort);
        if (isTrueBoolean(args.lock) && !context.duringGenerating()) context.activateSendButtons();
      }
    },
  };
}
