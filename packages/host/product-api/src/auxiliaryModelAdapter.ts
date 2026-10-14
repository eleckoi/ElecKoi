import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmRuntime, ToolCallId, ReasoningEffortId, attributionHeaders, type GenerateOptions, type StreamChunk, type ReplayEnvelope } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { streamSimple, getSupportedThinkingLevels } from '@earendil-works/pi-ai/compat'
import type { Api, Model, Context as PiContext, Message as PiMessage, AssistantMessage, Usage, ThinkingLevel, TSchema } from '@earendil-works/pi-ai'
import { readModelApiKey } from './modelConnection.js'

type Value = Record<string, unknown>
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const zeroUsage = (): Usage => ({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}})

export function auxiliaryProtocol(source: string, fallback = 'openai-completions'): Api {
  return ({claude:'anthropic-messages',anthropic:'anthropic-messages',google:'google-generative-ai',makersuite:'google-generative-ai',
    openai:'openai-completions',custom:'openai-completions',deepseek:'openai-completions',openrouter:'openai-completions',mistralai:'openai-completions',
    openai_chat:'openai-completions',openai_responses:'openai-responses',responses:'openai-responses',anthropic_messages:'anthropic-messages',google_gemini:'google-generative-ai'} as Record<string,string>)[source] ?? (source || fallback)
}

/** Apply caller configuration at pi-ai's public, completed-payload hook. */
export function auxiliaryPayload(payload: unknown, api: string, input: Value, provider = ''): Value {
  const body={...object(payload)}, custom=object(input.custom_api)
  const pick=(name:string,camel=name):unknown=>custom[name]==='unset'?undefined:custom[name]===undefined||custom[name]==='same_as_preset'?input[camel]??input[name]:custom[name]
  for(const [name,camel] of [['temperature','temperature'],['top_p','topP'],['top_k','topK'],['frequency_penalty','frequencyPenalty'],['presence_penalty','presencePenalty'],['max_tokens','maxTokens']] as const) {
    const key=name==='max_tokens' ? api.includes('responses') ? 'max_output_tokens' : 'max_completion_tokens' in body ? 'max_completion_tokens' : 'max_tokens' : name
    if(custom[name]==='unset') {delete body[key];if(name==='max_tokens'){delete body.max_completion_tokens;delete body.max_output_tokens}continue}
    const value=pick(name,camel)
    if(value===undefined)continue
    if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`生成参数 ${name} 必须是有限数值。`)
    // Neutral preset defaults do not introduce provider-specific request fields.
    if (name === 'top_k' && value === 0) continue
    if (api === 'anthropic-messages' && ['frequency_penalty','presence_penalty'].includes(name) && value === 0) continue
    if(api.startsWith('google-'))body.config={...object(body.config),[({top_p:'topP',top_k:'topK',max_tokens:'maxOutputTokens',frequency_penalty:'frequencyPenalty',presence_penalty:'presencePenalty'} as Record<string,string>)[name]??name]:value}
    else body[key]=value
  }
  if(api.startsWith('openai-') || api === 'azure-openai-responses') {
    for(const name of ['repetition_penalty','min_p','top_a','seed']) if(input[name]!==undefined) {
      const value=input[name]; if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`生成参数 ${name} 必须是有限数值。`);
      if ((name === 'seed' && value < 0) || (['min_p','top_a'].includes(name) && value === 0) || (name === 'repetition_penalty' && value === 1)) continue;
      body[name]=value;
    }
    if(input.samplingParams!==undefined)Object.assign(body,object(input.samplingParams));
  }
  if(input.stop!==undefined) {
    if(api==='anthropic-messages')body.stop_sequences=input.stop
    else if(api.startsWith('google-'))body.config={...object(body.config),stopSequences:input.stop}
    else body.stop=input.stop
  }
  const schema=object(input.json_schema)
  if(input.json_schema!==undefined&&Array.isArray(input.tools)&&input.tools.length)throw new Error('json_schema 和 tools 不能同时使用。')
  const choice=input.tool_choice==='any'?'required':input.tool_choice, forced=text(object(object(choice).function).name)
  if(input.json_schema!==undefined) {
    if(!text(schema.name)||!schema.value||typeof schema.value!=='object')throw new TypeError('json_schema 需要名称和 JSON schema。')
    if(api==='anthropic-messages'){body.tools=[{name:schema.name,description:text(schema.description),input_schema:schema.value}];body.tool_choice={type:'tool',name:schema.name}}
    else if(api.startsWith('google-'))body.config={...object(body.config),responseMimeType:'application/json',responseJsonSchema:schema.value}
    else if(api.includes('responses'))body.text={...object(body.text),format:{type:'json_schema',name:schema.name,schema:schema.value,strict:schema.strict!==false,...(schema.description?{description:schema.description}:{})}}
    else body.response_format={type:'json_schema',json_schema:{name:schema.name,schema:schema.value,strict:schema.strict!==false,...(schema.description?{description:schema.description}:{})}}
  } else if(choice!==undefined) {
    if(!forced&&!['auto','required','none'].includes(String(choice)))throw new TypeError('tool_choice 无效。')
    if(api==='anthropic-messages'){if(choice==='none'){delete body.tools;delete body.tool_choice}else body.tool_choice=forced?{type:'tool',name:forced}:{type:choice==='required'?'any':'auto'}}
    else if(api.startsWith('google-'))body.config={...object(body.config),toolConfig:{functionCallingConfig:{mode:choice==='none'?'NONE':choice==='auto'?'AUTO':'ANY',...(forced?{allowedFunctionNames:[forced]}:{})}}}
    else body.tool_choice=forced?(api.includes('responses')?{type:'function',name:forced}:{type:'function',function:{name:forced}}):choice
  }
  if(custom.source==='custom') {
    Object.assign(body,object(custom.custom_include_body))
    if(custom.custom_exclude_body!==undefined&&(!Array.isArray(custom.custom_exclude_body)||custom.custom_exclude_body.some(key=>typeof key!=='string')))throw new TypeError('custom_exclude_body 必须是字段名数组。')
    for(const key of custom.custom_exclude_body as string[]??[])delete body[key]
  }
  if (provider === 'deepseek-official' && api === 'anthropic-messages') {
    const effort = text(input.reasoningEffort, 'high')
    body.thinking = { type: effort === 'off' ? 'disabled' : 'enabled' }
    if (effort === 'off') delete body.output_config
    else body.output_config = { ...object(body.output_config), effort }
  }
  return body
}

class AuxiliaryModelAdapter extends LlmAdapter {
  constructor(private readonly owner:Context,private readonly model:Model<Api>,private readonly apiKey:string,private readonly input:Value){super()}
  providerInfo(provider:string){return {id:provider,name:'辅助生成'}}
  async listModels(provider:string){return [{provider,id:this.model.id,name:this.model.name,inputModalities:this.model.input}]}
  async resolveModel(provider:string,model:string){return {provider,id:model,name:this.model.name,context:{contextWindow:this.model.contextWindow},defaultMaxTokens:this.model.maxTokens,inputModalities:this.model.input,
    ...(this.model.reasoning?{reasoning:{efforts:getSupportedThinkingLevels(this.model).map(level=>({id:ReasoningEffortId(level),name:level}))}}:{})}}
  async requestContext(options:GenerateOptions):Promise<PiContext> {
    const messages:PiMessage[]=[],tools=new Map<string,string>()
    if(options.system)messages.push({role:'system',content:options.system,timestamp:0})
    for(const message of options.messages) {
      const content:Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}>=[]
      for(const block of message.content) {
        if(block.type==='text')content.push({type:'text',text:block.text})
        else if(block.type==='image'){
          const attachments=this.owner.get('attachments');if(!attachments)throw new Error('原生附件服务尚未加载。')
          if(block.offloaded)content.push({type:'text',text:'[image offloaded]'})
          else {const image=await attachments.readImage(block.attachment,options.signal);content.push({type:'image',data:Buffer.from(image.data).toString('base64'),mimeType:image.ref.mediaType})}
        } else if(block.type==='file')content.push({type:'text',text:this.owner.llm.fileRequestText(block.attachment)})
      }
      if(message.role==='system'||message.role==='developer')messages.push({role:'system',content:content.filter(part=>part.type==='text'),timestamp:0})
      else if(message.role==='user')messages.push({role:'user',content,timestamp:0})
      else if(message.role==='tool'){const id=String(message.source.callId);messages.push({role:'toolResult',toolCallId:id,toolName:tools.get(id)??'',content,isError:message.isError === true,timestamp:0})}
      else if(message.role==='assistant') {
        const replay=object(object(message.source).replayState),response=object(replay.response),metadata=Array.isArray(replay.blocks)?replay.blocks:[]
        const native:AssistantMessage['content']=message.content.map((block,index)=>{
          const extra=object(metadata[index])
          if(block.type==='reasoning'){const signature=extra.thinkingSignature??extra.signature;return {type:'thinking' as const,thinking:block.text,...(typeof signature==='string'?{thinkingSignature:signature}:{}),...(extra.redacted?{redacted:true}:{})}}
          if(block.type==='tool-call'){tools.set(String(block.id),block.name);return {type:'toolCall' as const,id:String(block.id),name:block.name,arguments:JSON.parse(block.arguments||'{}'),...(typeof extra.thoughtSignature==='string'?{thoughtSignature:extra.thoughtSignature}:{})}}
          return {type:'text' as const,text:block.type==='text'?block.text:'',...(typeof extra.textSignature==='string'?{textSignature:extra.textSignature}:{})}
        })
        messages.push({role:'assistant',content:native,api:this.model.api,provider:this.model.provider,model:this.model.id,usage:zeroUsage(),stopReason:text(response.stopReason,'stop') as AssistantMessage['stopReason'],timestamp:0,
          ...(typeof response.responseId==='string'?{responseId:response.responseId}:{}),...(typeof response.providerThinkingLevel==='string'?{providerThinkingLevel:response.providerThinkingLevel}:{})})
      }
    }
    return {messages,...(options.tools?.length?{tools:options.tools.map(tool=>({...tool,parameters:tool.parameters as TSchema}))}:{})}
  }
  async *stream(options:GenerateOptions):AsyncIterable<StreamChunk> {
    const context=await this.requestContext(options),custom=object(this.input.custom_api),extraHeaders=custom.source==='custom'?object(custom.custom_include_headers):{}
    const headers=Object.fromEntries(Object.entries({...this.model.headers,...object(custom.headers),...extraHeaders,...attributionHeaders()}).map(([key,value])=>[key,String(value)]))
    const stream=streamSimple(this.model,context,{...(options.signal ? {signal:options.signal} : {}),apiKey:this.apiKey,headers,maxRetries:0,
      ...(options.temperature===undefined?{}:{temperature:options.temperature}),...(options.topP===undefined?{}:{topP:options.topP}),...(options.maxTokens===undefined?{}:{maxTokens:options.maxTokens}),
      ...(options.reasoningEffort&&String(options.reasoningEffort)!=='off'?{reasoning:String(options.reasoningEffort) as ThinkingLevel}:{}),onPayload:payload=>auxiliaryPayload(payload,this.model.api,{...this.input,...(options.reasoningEffort===undefined?{}:{reasoningEffort:String(options.reasoningEffort)})},this.model.provider)})
    for await(const event of stream) {
      if(event.type==='text_start'||event.type==='thinking_start'||event.type==='toolcall_start')yield {type:'block-start',index:event.contentIndex,blockType:event.type==='text_start'?'text':event.type==='thinking_start'?'reasoning':'tool-call'}
      else if(event.type==='text_delta')yield {type:'text-delta',index:event.contentIndex,text:event.delta}
      else if(event.type==='thinking_delta')yield {type:'reasoning-delta',index:event.contentIndex,text:event.delta}
      else if(event.type==='toolcall_delta'){const call=event.partial.content[event.contentIndex];if(call?.type==='toolCall')yield {type:'tool-call-delta',index:event.contentIndex,id:ToolCallId(call.id),name:call.name,argumentsDelta:event.delta}}
      else if(event.type==='text_end')yield {type:'block-end',index:event.contentIndex,block:{type:'text',text:event.content}}
      else if(event.type==='thinking_end')yield {type:'block-end',index:event.contentIndex,block:{type:'reasoning',text:event.content}}
      else if(event.type==='toolcall_end')yield {type:'block-end',index:event.contentIndex,block:{type:'tool-call',id:ToolCallId(event.toolCall.id),name:event.toolCall.name,arguments:JSON.stringify(event.toolCall.arguments)}}
      else if(event.type==='error')throw new Error(event.error.errorMessage||`Provider ${event.reason}`)
      else if(event.type==='done'){
        const message=event.message,replayState:ReplayEnvelope={response:{kind:'pi-ai',version:2,api:this.model.api,model:this.model.id,provider:this.model.provider,stopReason:message.stopReason,
          ...(message.responseId?{responseId:message.responseId}:{}),...(message.providerThinkingLevel?{providerThinkingLevel:message.providerThinkingLevel}:{})},
          blocks:message.content.map(block=>block.type==='thinking'?{type:'reasoning',...(block.thinkingSignature?{thinkingSignature:block.thinkingSignature}:{}),...(block.redacted?{redacted:true}:{})}:block.type==='toolCall'?{type:'tool-call',...(block.thoughtSignature?{thoughtSignature:block.thoughtSignature}:{})}:{type:'text',...(block.textSignature?{textSignature:block.textSignature}:{})})}
        if (this.model.provider === 'deepseek-official' && this.model.api === 'anthropic-messages') {
          replayState.response = { kind: 'deepseek-messages', version: 1, model: this.model.id }
          replayState.blocks = message.content.map(block => block.type === 'thinking' ? { type: 'reasoning', ...(block.thinkingSignature ? { signature: block.thinkingSignature } : {}) } : { type: block.type === 'toolCall' ? 'tool-call' : 'text' })
        }
        yield {type:'usage',usage:{inputTokens:message.usage.input,outputTokens:message.usage.output,...(message.usage.cacheRead?{cacheReadTokens:message.usage.cacheRead}:{}),...(message.usage.reasoning===undefined?{}:{reasoningTokens:message.usage.reasoning})}}
        yield {type:'finish',reason:{kind:event.reason==='toolUse'?'tool-calls':event.reason==='length'?'max-tokens':'stop'},replayState}
      }
    }
  }
}

export async function createAuxiliaryModelConnection(owner:Context,provider:string,modelId:string,input:Value){
  const custom=object(input.custom_api),descriptors=owner.settings.describe(),profiles=object(descriptors.find(row=>row.ns==='llm-pi-ai')?.value)
  const dedicated=provider==='deepseek-official'?object(descriptors.find(row=>row.ns==='llm-deepseek'||row.ns==='llm-deepseek-api-key')?.value):{}
  const profile=Object.keys(dedicated).length?{...dedicated,api:'anthropic-messages'}:object(object(profiles.providers)[provider])
  const source=text(custom.source),api=auxiliaryProtocol(text(custom.api,text(input.api,source)),text(profile.api,provider==='deepseek-official'?'anthropic-messages':'openai-completions'))
  const endpoints:Record<string,string>={openai:'https://api.openai.com/v1',claude:'https://api.anthropic.com',anthropic:'https://api.anthropic.com',google:'https://generativelanguage.googleapis.com',makersuite:'https://generativelanguage.googleapis.com',deepseek:'https://api.deepseek.com',openrouter:'https://openrouter.ai/api/v1'}
  const baseUrl=text(custom.apiurl,text(custom.baseURL,text(input.baseURL,text(input.base_url,text(input.apiurl,text(profile.baseURL,endpoints[source]??(provider==='deepseek-official'?'https://api.deepseek.com/anthropic':'')))))))
  if(!baseUrl)throw new Error('当前模型连接没有可用于辅助生成的 API 地址。')
  const explicit=custom.key!==undefined||custom.api_key!==undefined||input.apiKey!==undefined||input.api_key!==undefined
  const key=explicit?text(custom.key,text(custom.api_key,text(input.apiKey,text(input.api_key)))):await readModelApiKey(owner,provider)
  const declared=Array.isArray(profile.models)?profile.models.map(object).find(row=>row.id===modelId)??{}:{}
  const configured=provider==='deepseek-official'&&!declared.reasoningEfforts?{...declared,reasoningEfforts:{off:null,low:'low',high:'high',max:'max'}}:declared
  const effortMap=object(configured.reasoningEfforts),configuredThinking=Object.keys(effortMap).length?effortMap:object(configured.thinkingLevelMap)
  const thinkingLevelMap=Object.keys(configuredThinking).length?Object.fromEntries(['off','minimal','low','medium','high','xhigh','max'].map(level=>[level,level==='off'&&'off' in effortMap&&effortMap.off===null?undefined:level in configuredThinking?configuredThinking[level]:null])):undefined
  const model:Model<Api>={id:modelId,name:text(configured.name,modelId),api,provider:source||provider,baseUrl,reasoning:configured.reasoningEfforts!==false&&configured.reasoning!==false,
    input:Array.isArray(configured.input)?configured.input as Model<Api>['input']:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:Number(configured.contextWindow)||128000,maxTokens:Number(configured.maxTokens)||4096,
    ...(configured.compat?{compat:configured.compat as NonNullable<Model<Api>['compat']>}:{}),...(thinkingLevelMap?{thinkingLevelMap:thinkingLevelMap as NonNullable<Model<Api>['thinkingLevelMap']>}:{}),headers:object(profile.headers) as Record<string,string>}
  const context=new Context(),route='eleckoi-auxiliary'
  try {await context.plugin(LlmRuntime);context.llm.registerAdapter([...new Set([route,provider])],new AuxiliaryModelAdapter(owner,model,key,input));return {context,provider:route,dispose:()=>context.fiber.dispose()}}
  catch(error){await context.fiber.dispose();throw error}
}

