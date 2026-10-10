const text = content => typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text || '').join('\n') : '';
const parts = content => Array.isArray(content) ? content : [{ type: 'text', text: text(content) }];
const imageUrl = part => part.image_url?.url || part.image_url || part.url;
function imageSource(url) {
  if (!url.startsWith('data:')) return { type: 'url', url };
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
  if (!match) throw new TypeError('Image data URL must use base64');
  return { type: 'base64', media_type: match[1], data: match[2] };
}
export function protocolFor(api) {
  return /anthropic|claude|deepseek_messages/.test(api) ? 'AnthropicMessages' : /google|gemini|makersuite/.test(api) ? 'GoogleGemini'
    : /responses/.test(api) ? 'Responses' : 'ChatCompletions';
}
function anthropicContent(content) {
  return parts(content).map(part => ['image_url', 'input_image'].includes(part.type) ? { type: 'image', source: imageSource(imageUrl(part)) }
    : ['text', 'input_text'].includes(part.type) ? { type: 'text', text: part.text } : part);
}
function anthropicMessage(message) {
  const content = message.role === 'tool' ? [{ type: 'tool_result', tool_use_id: message.tool_call_id,
    content: typeof message.content === 'string' ? message.content : anthropicContent(message.content),
    ...(message.is_error === undefined ? {} : { is_error: message.is_error }) }]
    : anthropicContent(message.content);
  content.push(...(message.tool_calls || []).map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || '{}') })));
  return { role: message.role === 'assistant' ? 'assistant' : 'user', content };
}
function anthropicMessages(messages) {
  const result = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index], projected = anthropicMessage(message);
    // All results of a parallel call must be in the user message immediately
    // following its tool_use blocks, rather than separate user messages.
    if (message.role === 'tool') while (messages[index + 1]?.role === 'tool') {
      projected.content.push(...anthropicMessage(messages[++index]).content);
    }
    result.push(projected);
  }
  return result;
}
function geminiMessage(message) {
  const content = message.role === 'tool' ? [{ functionResponse: { name: message.name, id: message.tool_call_id, response: { result: text(message.content) } } }]
    : parts(message.content).map(part => {
      if (['image_url', 'input_image'].includes(part.type)) {
        const source = imageSource(imageUrl(part));
        return source.type === 'base64' ? { inlineData: { mimeType: source.media_type, data: source.data } }
          : { fileData: { fileUri: source.url, mimeType: part.mime_type || 'image/jpeg' } };
      }
      return ['text', 'input_text'].includes(part.type) ? { text: part.text } : part;
    });
  content.push(...(message.tool_calls || []).map(call => ({ functionCall: { id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments || '{}') },
    ...(call.thought_signature ? { thoughtSignature: call.thought_signature } : {}) })));
  return { role: message.role === 'assistant' ? 'model' : 'user', parts: content };
}
function responsesInput(messages) {
  return messages.flatMap(message => message.role === 'tool' ? [{ type: 'function_call_output', call_id: message.tool_call_id, output: text(message.content) }]
    : [{ ...message, tool_calls: undefined, content: Array.isArray(message.content) ? message.content.map(part => part.type === 'image_url'
      ? { type: 'input_image', image_url: imageUrl(part), ...(part.image_url.detail ? { detail: part.image_url.detail } : {}) }
      : part.type === 'text' ? { ...part, type: message.role === 'assistant' ? 'output_text' : 'input_text' } : part) : message.content },
      ...(message.tool_calls || []).map(call => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments }))]);
}

/** Used only for compatibility fields absent from LlmRuntime's provider-neutral call. */
export function providerRequest(format, model, messages, params) {
  const settings = { ...(params.presetSettings || {}) }, custom = params.custom_api || {}, stream = !!params.stream;
  if (settings.max_completion_tokens !== undefined) settings.max_tokens = settings.max_completion_tokens;
  for (const [key, target] of Object.entries({ maxTokens: 'max_tokens', topP: 'top_p', topK: 'top_k', temperature: 'temperature' })) if (params[key] !== undefined) settings[target] = params[key];
  for (const key of ['max_tokens', 'temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'top_k']) if (custom[key] !== undefined) {
    if (custom[key] === 'unset') delete settings[key];
    else if (custom[key] !== 'same_as_preset') {
      if (typeof custom[key] !== 'number' || !Number.isFinite(custom[key])) throw new TypeError(`custom_api.${key} must be a number, unset or same_as_preset`);
      settings[key] = custom[key];
    }
  }
  const tools = params.tools || [], choice = params.tool_choice, schema = params.json_schema;
  const copy = names => Object.fromEntries(names.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
  const system = messages.filter(message => message.role === 'system').map(message => text(message.content)).join('\n\n');
  const dialogue = messages.filter(message => message.role !== 'system');
  let body;
  if (format === 'ChatCompletions') body = { model, messages, stream, ...copy(['max_tokens', 'temperature', 'top_p', 'top_k', 'frequency_penalty', 'presence_penalty']) };
  else if (format === 'Responses') body = { model, input: responsesInput(messages), stream, ...copy(['temperature', 'top_p']), ...(settings.max_tokens === undefined ? {} : { max_output_tokens: settings.max_tokens }) };
  else if (format === 'AnthropicMessages') body = { model, system, messages: anthropicMessages(dialogue), stream, max_tokens: settings.max_tokens ?? 4096, ...copy(['temperature', 'top_p', 'top_k']) };
  else body = { systemInstruction: { parts: [{ text: system }] }, contents: dialogue.map(geminiMessage), generationConfig: Object.fromEntries(Object.entries({ max_tokens: 'maxOutputTokens', temperature: 'temperature', top_p: 'topP', top_k: 'topK', frequency_penalty: 'frequencyPenalty', presence_penalty: 'presencePenalty' })
    .filter(([key]) => settings[key] !== undefined).map(([key, target]) => [target, settings[key]])) };
  if (tools.length) {
    if (format === 'ChatCompletions') { body.tools = tools; if (choice !== undefined) body.tool_choice = choice === 'any' ? 'required' : choice; }
    else if (format === 'Responses') { body.tools = tools.map(tool => ({ ...tool.function, type: 'function' })); if (choice !== undefined) body.tool_choice = typeof choice === 'object' ? { type: 'function', name: choice.function.name } : choice === 'any' ? 'required' : choice; }
    else if (format === 'AnthropicMessages') { body.tools = tools.map(tool => { const { parameters, ...other } = tool.function; return { ...other, input_schema: parameters || { type: 'object' } }; }); if (choice !== undefined) body.tool_choice = typeof choice === 'object' ? { type: 'tool', name: choice.function.name } : { type: ['any', 'required'].includes(choice) ? 'any' : choice }; }
    else { body.tools = [{ functionDeclarations: tools.map(tool => tool.function) }]; if (choice !== undefined) body.toolConfig = { functionCallingConfig: { mode: typeof choice === 'object' || ['any', 'required'].includes(choice) ? 'ANY' : choice.toUpperCase(), ...(typeof choice === 'object' ? { allowedFunctionNames: [choice.function.name] } : {}) } }; }
  }
  if (schema || params.responseFormat === 'json') {
    const schemaFormat = schema ? { type: 'json_schema', name: schema.name, schema: schema.value, strict: schema.strict ?? true, ...(schema.description ? { description: schema.description } : {}) } : { type: 'json_object' };
    if (format === 'ChatCompletions') { const { type, ...value } = schemaFormat; body.response_format = schema ? { type, json_schema: value } : schemaFormat; }
    else if (format === 'Responses') body.text = { format: schemaFormat };
    else if (format === 'AnthropicMessages') { if (schema) body.output_config = { format: { type: 'json_schema', schema: schema.value } }; }
    else Object.assign(body.generationConfig, { responseMimeType: 'application/json', ...(schema ? { responseJsonSchema: schema.value } : {}) });
  }
  if (params.stop?.length) {
    if (format === 'AnthropicMessages') body.stop_sequences = params.stop;
    else if (format === 'GoogleGemini') body.generationConfig.stopSequences = params.stop;
    else if (format !== 'Responses') body.stop = params.stop;
    else throw new Error('Responses does not support stop sequences');
  }
  Object.assign(body, params.parameters || {}, custom.source === 'custom' ? custom.custom_include_body || {} : {});
  if (custom.source === 'custom') for (const key of custom.custom_exclude_body || []) delete body[key];
  return body;
}

/** Real packets remain available; this projects their cross-provider result contract. */
export class ProviderResponse {
  constructor(format) { this.format = format; this.content = ''; this.reasoning = ''; this.tools = new Map(); this.signatures = new Set(); this.indices = new Map(); this.signatureFragments = new Map(); }
  tool(index, { id = '', name = '', arguments: args = '', signature = '' }, append = false) {
    const previous = this.tools.get(index);
    this.tools.set(index, { id: previous?.id || id || `call_${index}`, type: 'function', function: { name: previous?.function.name || name,
      arguments: append ? (previous?.function.arguments || '') + args : args || previous?.function.arguments || '' },
      ...(signature || previous?.thought_signature ? { thought_signature: signature || previous.thought_signature } : {}) });
  }
  consume(packet, stream) {
    if (packet.error) throw new Error(`Provider error: ${JSON.stringify(packet.error)}`);
    let content = '', reasoning = '';
    if (this.format === 'ChatCompletions') {
      if (packet.choices?.[0]?.finish_reason) this.finishReason = packet.choices[0].finish_reason;
      const message = packet.choices?.[0]?.[stream ? 'delta' : 'message'] || {};
      content = text(message.content); reasoning = message.reasoning_content || message.reasoning || '';
      (message.tool_calls || []).forEach((call, index) => this.tool(call.index ?? index, { id: call.id, name: call.function?.name, arguments: call.function?.arguments, signature: call.thought_signature }, stream));
      for (const detail of message.reasoning_details || []) if (detail.data) this.signatures.add(detail.data);
    } else if (this.format === 'Responses') {
      const item = (value, index) => { if (value.type === 'function_call') { this.indices.set(value.id, index); this.tool(index, { id: value.call_id, name: value.name, arguments: value.arguments }); } if (value.encrypted_content) this.signatures.add(value.encrypted_content); };
      if (stream) {
        if (packet.type === 'response.output_text.delta') content = packet.delta;
        else if (['response.reasoning_summary_text.delta', 'response.reasoning_text.delta'].includes(packet.type)) reasoning = packet.delta;
        else if (['response.output_item.added', 'response.output_item.done'].includes(packet.type)) item(packet.item, packet.output_index);
        else if (packet.type === 'response.function_call_arguments.delta') this.tool(this.indices.get(packet.item_id) ?? packet.output_index, { arguments: packet.delta }, true);
        else if (['response.failed', 'response.incomplete', 'error'].includes(packet.type)) throw new Error(`Provider stream failed: ${JSON.stringify(packet)}`);
        else if (packet.type === 'response.completed') for (const [index, value] of (packet.response?.output || []).entries()) item(value, index);
      } else for (const [index, value] of (packet.output || []).entries()) { item(value, index); content += (value.content || []).map(part => part.text || '').join(''); reasoning += (value.summary || []).map(part => part.text || '').join(''); }
    } else if (this.format === 'AnthropicMessages') {
      if (packet.stop_reason || packet.delta?.stop_reason) this.finishReason = packet.stop_reason || packet.delta.stop_reason;
      const block = (value, index) => {
        if (['text', 'text_delta'].includes(value.type)) content += value.text || '';
        if (['thinking', 'thinking_delta'].includes(value.type)) reasoning += value.thinking || '';
        if (value.type === 'tool_use') this.tool(index, { id: value.id, name: value.name, arguments: stream && !Object.keys(value.input || {}).length ? '' : JSON.stringify(value.input) });
        if (value.type === 'input_json_delta') this.tool(index, { arguments: value.partial_json }, true);
        if (value.signature) { const signature = (this.signatureFragments.get(index) || '') + value.signature; this.signatureFragments.set(index, signature); }
      };
      if (stream) { if (packet.type === 'content_block_start') block(packet.content_block, packet.index); if (packet.type === 'content_block_delta') block(packet.delta, packet.index); }
      else (packet.content || []).forEach(block);
    } else for (const [index, part] of (packet.candidates?.[0]?.content?.parts || []).entries()) {
      if (part.text) { if (part.thought) reasoning += part.text; else content += part.text; }
      if (part.functionCall) this.tool(this.tools.size, { id: part.functionCall.id, name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}), signature: part.thoughtSignature });
      else if (part.thoughtSignature) this.signatures.add(part.thoughtSignature);
    }
    this.content += content; this.reasoning += reasoning;
    if (packet.usage || packet.usageMetadata) this.usage = { ...(this.usage || {}), ...(packet.usage || packet.usageMetadata) };
    return { content, reasoning };
  }
  result(id, model) { return { id, model, content: this.content, reasoning: this.reasoning, tool_calls: [...this.tools.values()],
    signatures: [...this.signatures, ...this.signatureFragments.values()], ...(this.signatureFragments.size ? { reasoning_signature: [...this.signatureFragments.values()].join('') } : {}),
    ...(this.usage ? { usage: this.usage } : {}) }; }
}
