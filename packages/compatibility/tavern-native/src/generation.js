const copy = value => value === undefined ? undefined : structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
import { iframeEvents } from './iframe.js';
import { collectPromptContributions, copyGenerationConfiguration, copyPromptWithFilter } from './main-prompts.js';

/** Auxiliary requests use the same native LLM routes without starting an Agent turn. */
export function createGenerationApi(rt) {
  const active = rt.shared.helperGenerations ??= new Map();
  const injections = rt.shared.helperInjections ??= new Map();
  const owner = rt.snapshot.context.conversationId;
  const owned = new Set(), ownedInjections = new Map();
  const generationOwners = rt.shared.helperGenerationOwners ??= new Map();
  const macro = text => rt.substitute ? rt.substitute(String(text)) : String(text);
  const message = input => {
    const content = input.content ?? input.message ?? '';
    return { ...copy(input), role: input.role ?? 'system', content: typeof content === 'string' ? macro(content) : copy(content) };
  };
  const injectPrompts = (prompts, options = {}) => {
    if (!Array.isArray(prompts)) throw new TypeError('Prompt injections must be an array.');
    const ids = [];
    for (const prompt of prompts) {
      const id = String(prompt.id ?? rt.window.crypto.randomUUID());
      const entry = { ...copyPromptWithFilter(prompt), id, owner, conversationId: owner, ownerScript: rt.scriptId, runtime: rt, once: options.once === true };
      injections.set(id, entry); ownedInjections.set(id, entry); ids.push(id);
    }
    if (typeof options.once === 'string') {
      const remove = rt.on(options.once, () => { ids.forEach(id => injections.delete(id)); remove(); });
    }
    return { uninject: () => ids.forEach(id => injections.delete(id)) };
  };
  async function prepare(configuration, raw, generationId, signal) {
    signal.throwIfAborted();
    const config = copyGenerationConfiguration(configuration), overrides = object(config.overrides);
    const presets = rt.snapshot.presets?.items ?? [];
    const inUse = config.preset_name === undefined || ['in_use', 'current'].includes(config.preset_name);
    const selected = inUse ? rt.snapshot.presets?.inUse ?? presets.find(item => item.id === rt.snapshot.presets?.activeId) : presets.find(item => item.id === config.preset_name || item.name === config.preset_name);
    if (!selected && !raw) throw new Error(`Preset was not found: ${config.preset_name ?? 'in_use'}`);
    const history = rt.snapshot.messages.filter(item => !item.isHidden).map(item => message({ role: item.role, content: item.content }));
    const limit = config.max_chat_history ?? config.maxChatHistory;
    const limited = Number.isInteger(limit) && limit >= 0 ? (limit === 0 ? [] : history.slice(-limit)) : history;
    const historyOverride = overrides.chat_history;
    const chat = (Array.isArray(historyOverride) ? historyOverride : object(historyOverride).prompts ?? limited).map(message);
    const activeInjections = await collectPromptContributions(rt.shared, { conversationId: owner, requestId: generationId,
      runtime: rt, additional: config.injects ?? [], signal });
    signal.throwIfAborted();
    const character = rt.snapshot.characters?.items?.find(item => item.id === rt.snapshot.context.characterId) ?? {};
    const persona = rt.snapshot.personas?.items?.find(item => item.id === rt.snapshot.context.personaId) ?? {};
    const custom = object(config.custom_api), proxyName = String(custom.proxy_preset ?? '').trim();
    const proxy = proxyName ? rt.snapshot.connections?.find(item => (item.name ?? item.id) === proxyName) : undefined;
    const native = await rt.request('generation.prepare', {
      ...(config.model === undefined ? {} : { model: config.model }),
      ...(proxy?.id ?? config.provider ? { provider: proxy?.id ?? config.provider } : {}),
      custom_api: proxy ? { ...custom, apiurl: undefined, key: undefined } : custom,
      conversationId: owner, generationId, user_input: config.user_input ?? '', pending_input: config.user_input !== undefined,
      worldbook_turn: history.length + (config.user_input === undefined ? 0 : 1), ...(inUse ? {} : { presetId: selected?.id }), raw,
      chat_history: chat, overrides, scan_injects: activeInjections.filter(item => item.should_scan === true).map(copy),
      worldbook_controls: { with_depth_entries: object(historyOverride).with_depth_entries !== false,
        ...(selected?.settings?.max_context === undefined ? {} : { max_context: selected.settings.max_context }),
        ...(typeof object(historyOverride).author_note === 'string' ? { author_note: object(historyOverride).author_note } : {}) }
    });
    signal.throwIfAborted();
    const nativeInjections = native.injections ?? [];
    const worldbook = (native.worldbook_prompts ?? []).filter(item => typeof item.content === 'string' && (item.content.trim() || item.id === 'authors-note'));
    const authorNoteBlock = item => [
      ...worldbook.filter(entry => entry.position === 'beforeAuthorNote').map(message),
      ...(item.content.trim() ? [message(item)] : []),
      ...worldbook.filter(entry => entry.position === 'afterAuthorNote').map(message)
    ];
    const worldbookAt = (...positions) => worldbook.filter(item => positions.includes(item.position ?? item.anchor))
      .flatMap(item => item.id === 'authors-note' ? authorNoteBlock(item) : [message(item)]);
    const nativePersona = nativeInjections.find(item => item.source === 'persona');
    const nativeSection = anchors => nativeInjections.filter(item => item.source !== 'persona' && anchors.includes(item.anchor) && item.depth === undefined).map(item => item.content).join('\n\n');
    const sections = {
      char_description: character.description ?? character.data?.description ?? character.persona?.description ?? '',
      char_personality: character.personality ?? character.data?.personality ?? '',
      scenario: character.scenario ?? character.data?.scenario ?? '',
      persona_description: nativePersona?.anchor === 'chat_depth' ? '' : nativePersona?.content ?? persona.description ?? persona.user_description ?? '',
      dialogue_examples: character.mes_example ?? character.data?.mes_example ?? '',
      world_info_before: [...worldbookAt('beforeCharacterDefinition'), ...[nativeSection(['instructions', 'insert_point_1'])].filter(Boolean).map(content => ({ role: 'system', content }))],
      world_info_after: [...[nativeSection(['insert_point_2'])].filter(Boolean).map(content => ({ role: 'system', content })), ...worldbookAt('afterCharacterDefinition')],
      chat_history: chat,
      user_input: config.user_input === undefined ? [] : [{ role: 'user', content: config.user_input }],
    };
    for (const [key, value] of Object.entries(overrides)) if (key in sections && key !== 'chat_history') sections[key] = value;
    const placeholderIds = { worldInfoBefore: 'world_info_before', personaDescription: 'persona_description', charDescription: 'char_description', charPersonality: 'char_personality', scenario: 'scenario', worldInfoAfter: 'world_info_after', dialogueExamples: 'dialogue_examples', chatHistory: 'chat_history' };
    const usedSections = new Set(), dialogueTargets = new WeakSet();
    const expandSection = part => {
      usedSections.add(part);
      const value = sections[part];
      const content = Array.isArray(value) ? value.map(message) : value ? [{ role: part === 'persona_description' ? nativePersona?.role ?? 'system' : 'system', content: macro(value) }] : [];
      if (part === 'chat_history' || part === 'user_input') for (const item of content) dialogueTargets.add(item);
      if (part === 'dialogue_examples') return [...worldbookAt('beforeExamples'), ...worldbookAt('examples'), ...content, ...worldbookAt('afterExamples')];
      if (part === 'chat_history') return [...worldbookAt('beforeHistory'), ...content, ...worldbookAt('afterHistory')];
      return content;
    };
    const expand = part => {
      if (typeof part === 'string' && part in sections) return expandSection(part);
      if (typeof part === 'string') return [{ role: 'system', content: macro(part) }];
      if (!part || part.enabled === false) return [];
      const placeholder = placeholderIds[part.id ?? part.identifier];
      if (placeholder) return expandSection(placeholder);
      return [message(part)];
    };
    let messages;
    const depthPrompts = [];
    if (config.messages) messages = config.messages.map(message);
    else if (raw) messages = (config.ordered_prompts ?? config.prompts ?? [{ role: 'user', content: config.prompt ?? config.user_input ?? '' }]).flatMap(expand);
    else if (config.ordered_prompts) messages = config.ordered_prompts.flatMap(expand);
    else {
      const enabled = (selected?.prompts ?? selected?.entries ?? []).filter(item => item.enabled !== false);
      const relative = enabled.filter(item => object(item.position).type !== 'in_chat');
      messages = relative.flatMap(expand);
      const used = new Set(relative.map(item => placeholderIds[item.id ?? item.identifier]).filter(Boolean));
      if (!used.size) messages.push(...['world_info_before', 'persona_description', 'char_description', 'char_personality', 'scenario', 'world_info_after', 'dialogue_examples', 'chat_history'].flatMap(expand));
      messages.push(...expand('user_input'));
      for (const prompt of enabled.filter(item => object(item.position).type === 'in_chat')) depthPrompts.push({ ...message(prompt), depth: prompt.position.depth, order: prompt.position.order });
    }
    for (const item of nativeInjections) {
      if (item.source === 'persona' && (item.anchor !== 'chat_depth' || overrides.persona_description !== undefined)) continue;
      if (item.depth !== undefined) depthPrompts.push(item);
      else if (item.anchor === 'insert_point_3') { const index = messages.findLastIndex(item => item.role === 'user'); messages.splice(index < 0 ? messages.length : index, 0, message(item)); }
      else if (item.anchor === 'insert_point_4' || item.anchor === 'insert_point_5') messages.push(message(item));
    }
    if (usedSections.has('chat_history')) depthPrompts.push(...worldbook.filter(item => ['at_depth', 'chat_depth'].includes(item.position ?? item.anchor) && (item.id === 'authors-note' || object(historyOverride).with_depth_entries !== false)));
    messages.unshift(...worldbookAt('beforeBaseInstructions', 'instructions', 'insert_point_1'));
    const nativeAfter = worldbookAt('insert_point_2');
    if (nativeAfter.length) { const index = messages.findIndex(item => item.role !== 'system'); messages.splice(index < 0 ? messages.length : index, 0, ...nativeAfter); }
    const beforeInput = worldbookAt('beforeLatestUserInput', 'insert_point_3');
    if (beforeInput.length) { const index = messages.findLastIndex(item => item.role === 'user'); messages.splice(index < 0 ? messages.length : index, 0, ...beforeInput); }
    const afterInput = worldbookAt('afterLatestUserInput', 'insert_point_4');
    if (afterInput.length) { const index = messages.findLastIndex(item => item.role === 'user'); messages.splice(index < 0 ? messages.length : index + 1, 0, ...afterInput); }
    messages.push(...worldbookAt('insert_point_5'));
    const depthGroups = new Map();
    for (const item of depthPrompts.sort((left, right) => Number(right.depth || 0) - Number(left.depth || 0) || Number(left.order || 0) - Number(right.order || 0))) {
      const depth = Math.max(0, Number(item.depth) || 0), group = depthGroups.get(depth) ?? [];
      if (item.id === 'authors-note') group.push(...authorNoteBlock(item));
      else group.push(message(item));
      depthGroups.set(depth, group);
    }
    for (const [depth, group] of depthGroups) {
      const dialogueIndexes = messages.flatMap((item, index) => dialogueTargets.has(item) ? [index] : []);
      const index = dialogueIndexes.length ? depth === 0 ? dialogueIndexes.at(-1) + 1 : dialogueIndexes[Math.max(0, dialogueIndexes.length - depth)] : Math.max(0, messages.length - depth);
      messages.splice(index, 0, ...group);
    }
    if (usedSections.has('chat_history') && typeof object(historyOverride).author_note === 'string' && !(native.worldbook_prompts ?? []).some(item => item.id === 'authors-note')) messages.push(message({ role: 'system', content: object(historyOverride).author_note }));
    for (const injection of activeInjections) {
      if (injection.position === 'none') continue;
      const index = injection.position === 'in_chat' || injection.position === 'chat' ? Math.max(0, messages.length - (injection.depth ?? 0)) : ['in_prompt', 'after_prompt'].includes(injection.position) ? messages.findIndex(item => item.role !== 'system') : 0;
      messages.splice(index < 0 ? messages.length : index, 0, copy(injection));
    }
    if (!messages.length) messages.push({ role: 'user', content: '' });
    const outlets = object(native.worldbook_round?.outlets);
    const expandOutlets = text => String(text).replace(/\{\{outlet::([^}]+)\}\}/gi, (_match, name) =>
      Array.isArray(outlets[name.trim()]) ? outlets[name.trim()].join('\n\n') : '');
    for (const message of messages) {
      if (typeof message.content === 'string') message.content = expandOutlets(message.content);
      else if (Array.isArray(message.content)) message.content = message.content.map(block =>
        block.type === 'text' ? { ...block, text: expandOutlets(block.text) } : block);
    }
    const { injects: _injects, ...requestConfig } = config;
    return { ...object(selected?.settings), ...(typeof selected?.settings?.max_completion_tokens === 'number' ? { max_tokens: selected.settings.max_completion_tokens } : {}), ...requestConfig, conversationId: owner, messages };
  }
  async function generate(configuration, raw) {
    const id = String(configuration?.generation_id ?? rt.window.crypto.randomUUID());
    if (active.has(id)) throw new Error(`Generation ID is already running: ${id}`);
    const controller = new AbortController(); active.set(id, controller); owned.add(id); generationOwners.set(id, owner);
    let silence = false;
    let text = '', reasoning='', lastResult;
    try {
      // Listeners edit the actual configuration used to build this request.
      const configurationCopy = copyGenerationConfiguration(configuration);
      await rt.shared.eventHub.emitAndWait(iframeEvents.GENERATION_REQUESTED, configurationCopy, id);
      silence = configurationCopy.should_silence === true;
      rt.generationState(id, true, silence);
      const input = { ...await prepare(configurationCopy, raw, id, controller.signal), generationId: id }; 
      const custom=object(configurationCopy.custom_api);
      if(custom.proxy_preset) {
        const selected=rt.snapshot.connections.find(item=>(item.name??item.id)===custom.proxy_preset.trim());
        if(selected) { input.provider=selected.id; delete input.custom_api.apiurl; delete input.custom_api.key; }
      }
      const encode=async image=>{
        if(typeof image?.arrayBuffer==='function') {
          const bytes=new Uint8Array(await image.arrayBuffer()); let binary='';
          for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));
          return `data:${image.type||'image/png'};base64,${rt.window.btoa(binary)}`;
        }
        if(typeof image==='string'&&!/^(?:https?:|data:)/.test(image))return `data:${image.startsWith('/9j/')?'image/jpeg':'image/png'};base64,${image}`;
        return image;
      };
      if(input.image!==undefined)input.image=await Promise.all((Array.isArray(input.image)?input.image:[input.image]).map(encode));
      for(const message of input.messages)if(message.image!==undefined) {
        const images=await Promise.all((Array.isArray(message.image)?message.image:[message.image]).map(encode));
        message.content=[...(typeof message.content==='string'?[{type:'text',text:message.content}]:message.content),...images.map(url=>({type:'image_url',image_url:{url}}))]; delete message.image;
      }
      await rt.shared.eventHub.emitAndWait(iframeEvents.GENERATION_STARTED, id);
      const definitions = new Map();
      for (const tool of rt.tools?.() ?? []) if (await tool.shouldRegister()) { const schema = tool.toFunctionOpenAI(); definitions.set(schema.function.name, tool); }
      if (!input.tools && !input.json_schema && definitions.size) input.tools = [...definitions.values()].map(tool => ({ type: 'function', function: copy(tool.toFunctionOpenAI().function) }));
      for (;;) {
        let result;
        const prefix = text;
        for await (const event of rt.generate(input, controller.signal)) {
          if (event.kind === 'delta') {
            text = prefix + event.text;
            if (configurationCopy.should_stream === true) {
              await rt.shared.eventHub.emitAndWait(iframeEvents.STREAM_TOKEN_RECEIVED_INCREMENTALLY, event.delta, id);
              await rt.shared.eventHub.emitAndWait(iframeEvents.STREAM_TOKEN_RECEIVED_FULLY, text, id);
            }
          } else if(event.kind==='reasoning') {
            reasoning+=event.delta;
            if(configurationCopy.should_stream===true){ await rt.shared.eventHub.emitAndWait(iframeEvents.REASONING_TOKEN_RECEIVED_INCREMENTALLY,event.delta,id); await rt.shared.eventHub.emitAndWait(iframeEvents.REASONING_TOKEN_RECEIVED_FULLY,reasoning,id); }
          } else if (event.kind === 'finished') { result = event; text = prefix + event.text; if(!reasoning)reasoning=event.reasoning??''; }
        }
        if (!result) throw new Error('Generation stream ended without a result.');
        lastResult=result;
        if (!result.toolCalls?.length || configurationCopy.tools!==undefined) break;
        input.messages.push({ role: 'assistant', content: [
          ...(result.reasoning ? [{ type: 'reasoning', text: result.reasoning, signature: result.reasoningSignature }] : []),
          ...(result.text ? [{ type: 'text', text: result.text }] : []),
          ...result.toolCalls.map(call => ({ type: 'tool-call', ...call })),
        ], ...(result.replayState ? { replayState: result.replayState } : {}) });
        for (const call of result.toolCalls) {
          controller.signal.throwIfAborted();
          const tool = definitions.get(call.name);
          if (!tool) throw new Error(`Model requested an unregistered function tool: ${call.name}`);
          const value = await tool.invoke(call.arguments ? JSON.parse(call.arguments) : {});
          input.messages.push({ role: 'tool', tool_call_id: call.id, content: typeof value === 'string' ? value : JSON.stringify(value ?? null) });
        }
      }
      await rt.shared.eventHub.emitAndWait(iframeEvents.GENERATION_ENDED, text, id);
      return configurationCopy.should_return_reasoning || lastResult?.toolCalls?.length ? {content:text,...(reasoning?{reasoning}:{}),
        ...(lastResult?.reasoningSignature ? { reasoning_signature: lastResult.reasoningSignature } : {}),
        ...(lastResult?.toolCalls?.length?{tool_calls:lastResult.toolCalls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:call.arguments},...(call.thoughtSignature?{thought_signature:call.thoughtSignature}:{})}))}:{})}:text;
    } catch (error) {
      if (controller.signal.aborted) await rt.shared.eventHub.emitAndWait('generation_stopped', id);
      throw error;
    } finally { active.delete(id); owned.delete(id); generationOwners.delete(id); rt.generationState(id, false, silence); }
  }
  const stopGeneration = async id => {
    if (id === undefined) {
      const ids = [...active.keys()];
      for (const key of ids) active.get(key).abort(new Error('Generation stopped.'));
      await Promise.all(ids.map(generationId => rt.request('generation.cancel', { generationId })));
      return ids.length > 0;
    }
    const controller = active.get(String(id));
    controller?.abort(new Error('Generation stopped.'));
    return (await rt.request('generation.cancel', { generationId: String(id) })).cancelled;
  };
  rt.addCleanup(() => { for (const id of owned) active.get(id)?.abort(new Error('Author page closed.')); for (const [id, injection] of ownedInjections) if (injections.get(id) === injection) injections.delete(id); ownedInjections.clear(); });
  return { generate: config => generate(config, false), generateRaw: config => generate(config, true), stopGeneration, injectPrompts,
    uninjectPrompts: ids => { for (const id of typeof ids === 'string' ? [ids] : ids ?? []) injections.delete(id); },
    getGenerationDetails: id => rt.request('generation.details', { generationId: id }) };
}


