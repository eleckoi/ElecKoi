import { isTrueBoolean } from '../vendor/sillytavern/public/scripts/utils.js';

export function summaryCommands(context,api) {
  const vectors=()=>context.extensionSettings.vectors ||= {};
  const vectorState=key=>async(_args,value)=>{
    if(String(value ?? '').trim()){vectors()[key]=isTrueBoolean(value);context.saveSettingsDebounced();await api.flush();}
    return String(vectors()[key] ?? (key==='enabled_world_info'));
  };
  return {
    'vector-worldinfo-state':vectorState('enabled_world_info'),
    'vector-chats-state':vectorState('enabled_chats'),
    'summarize':async(args,text)=>{
      const target={conversationId:context.getCurrentChatId(),characterId:globalThis.getCharData('current')?.native_id};
      const settings=context.extensionSettings.memory ||= {}, source=args.source || settings.source || 'main';
      if(source!=='main')throw new Error(`Summary provider is not configured: ${source}`);
      const history=await api.messages.read(target),chatSummary=!String(text || '').trim();
      const transcript=chatSummary ? history.filter(message=>message.metadata?.is_hidden!==true).map(message=>`${message.name || message.role}: ${message.content}`).join('\n') : text;
      if(!transcript.trim())return '';
      const words=settings.promptWords || 200;
      const prompt=context.substituteParams(args.prompt || settings.prompt || `Summarize the events, characters, important facts and unresolved threads in about ${words} words. Return only the summary.`,{words});
      const result=await api.generation.invokeRaw({...target,purpose:'memory-summary',messages:[{role:'system',content:prompt},{role:'user',content:transcript}],
        ...(Number(settings.overrideResponseLength)>0 ? {parameters:{max_tokens:Number(settings.overrideResponseLength)}} : {})});
      const summary=result.content.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
      if(!summary)throw new Error('Summarization returned empty content');
      if(chatSummary){
        const message=history[Math.max(0,history.length-2)],metadata={...message.metadata,extra:{...message.metadata?.extra,memory:summary}};
        await api.messages.update([{id:message.id,metadata,expectedContent:message.content}],target);
        if(context.getCurrentChatId()===target.conversationId)await context.reloadCurrentChat();
        if(!isTrueBoolean(args.quiet))globalThis.toastr?.success('Summary saved');
      }
      return summary;
    },
    'translate':async(args,text)=>{
      const settings=context.extensionSettings.translate || {}, target=args.target || settings.target_language || 'en',provider=args.provider || settings.provider || 'google';
      if(['main','llm'].includes(provider))return (await api.generation.invokeRaw({purpose:'translation',messages:[{role:'system',content:`Translate the following text to ${target}. Preserve formatting. Return only the translation.`},{role:'user',content:text}]})).content;
      let url,options={};
      if(provider==='google')url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
      else if(provider==='libre'){url=settings.url;if(!url)throw new Error('LibreTranslate endpoint is not configured');
        options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:text,source:'auto',target,api_key:settings.api_key || ''})};}
      else if(provider==='deepl'){url=settings.url || `https://api${settings.deepl_endpoint==='pro' ? '' : '-free'}.deepl.com/v2/translate`;
        if(!settings.api_key)throw new Error('DeepL API key is not configured');options={method:'POST',headers:{'Content-Type':'application/json',Authorization:`DeepL-Auth-Key ${settings.api_key}`},body:JSON.stringify({text:[text],target_lang:target.toUpperCase()})};}
      else throw new Error(`Translation provider is not configured: ${provider}`);
      const response=await api.net.fetch(url,options);if(!response.ok)throw new Error(`Translation HTTP ${response.status}: ${await response.text()}`);
      const value=await response.json();
      const result=provider==='google' ? value[0].map(row=>row[0]).join('') : provider==='deepl' ? value.translations?.map(item=>item.text).join('\n') : value.translatedText;
      if(typeof result!=='string')throw new Error('Translation response is missing translated text');return result;
    },
  };
}
