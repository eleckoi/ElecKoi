import type { ModelConfig, ModelOption } from '@shared/contracts/entities/model'

const RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const TOOL_TEST_TIMEOUT_MS = 90_000
const PROBE_TOOL_NAME = 'eleckoi_capability_probe'
const PROBE_PROMPT = `Call ${PROBE_TOOL_NAME} exactly once with value ok.`
const PROBE_RESULT = '{"accepted":true}'

export async function discoverModels(config: ModelConfig): Promise<ModelOption[]> {
  if (isImageProvider(config.provider)) throw new Error('绘画模型不支持读取聊天模型列表。')
  const baseUrl = resolvedBaseUrl(config)
  if (!baseUrl) throw new Error('请先填写 API Base URL。')
  if (!config.api_key.trim()) throw new Error('请先填写 API Key。')

  const format = normalizeApiFormat(config.api_format)
  const endpoint = modelListEndpoint(baseUrl, format, config.api_key)
  const headers = requestHeaders(config, format)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, { method: 'GET', headers, signal: controller.signal })
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > RESPONSE_LIMIT_BYTES) throw new Error('模型列表响应过大。')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > RESPONSE_LIMIT_BYTES) throw new Error('模型列表响应过大。')
    const text = new TextDecoder().decode(bytes)
    if (!response.ok) {
      const detail = safeProviderMessage(text)
      throw new Error(`读取模型失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
    }
    const payload = JSON.parse(text) as Record<string, unknown>
    const rawItems = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : null
    if (rawItems === null) throw new Error('模型接口没有返回 data/models 列表。')
    const previous = new Map(config.model_options.map((item) => [item.id, item]))
    const unique = new Map<string, ModelOption>()
    for (const raw of rawItems) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
      const item = raw as Record<string, unknown>
      const id = String(item.id || item.name || '').trim()
      if (!id) continue
      const saved = previous.get(id)
      unique.set(id, {
        ...saved,
        id,
        name: String(item.display_name || item.displayName || item.name || saved?.name || id).trim() || id,
        contextWindowTokens: positiveInteger(item.context_window ?? item.context_length) ?? saved?.contextWindowTokens,
        maxOutputTokens: positiveInteger(item.max_output_tokens ?? item.max_tokens) ?? saved?.maxOutputTokens,
        isUserAdded: saved?.isUserAdded === true,
        supportsImageInput: saved?.supportsImageInput === true
      })
    }
    return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('读取模型超时，请检查地址、代理或网络。')
    if (error instanceof SyntaxError) throw new Error('模型接口返回的不是有效 JSON。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function testModelConnection(config: ModelConfig): Promise<void> {
  if (isImageProvider(config.provider)) throw new Error('绘画模型需要使用生图请求测试。')
  const baseUrl = resolvedBaseUrl(config)
  if (!baseUrl) throw new Error('请先填写 API Base URL。')
  if (!config.api_key.trim()) throw new Error('请先填写 API Key。')
  const model = config.model.trim() || config.model_options[0]?.id.trim() || ''
  if (!model) throw new Error('请先选择模型，再测试 Agent 工具连接。')

  switch (config.api_format) {
    case 'responses':
      await testResponsesTools(config, baseUrl, model)
      return
    case 'chat_completions':
      await testChatCompletionsTools(config, baseUrl, model)
      return
    case 'anthropic_messages':
      await testAnthropicTools(config, baseUrl, model)
      return
    case 'google_gemini':
      await testGoogleTools(config, baseUrl, model)
      return
    default:
      throw new Error(`未知模型接口格式：${config.api_format || '(空)'}`)
  }
}

async function testResponsesTools(config: ModelConfig, baseUrl: string, model: string): Promise<void> {
  const endpoint = operationEndpoint(baseUrl, 'responses')
  const tool = {
    type: 'function',
    name: PROBE_TOOL_NAME,
    description: 'Return the exact protocol probe value.',
    parameters: probeParameters()
  }
  const first = await postJson(endpoint, config, 'openai', {
    model,
    instructions: 'This is a protocol check. You must call the supplied capability tool exactly once.',
    input: [responsesMessage('user', PROBE_PROMPT)],
    tools: [tool]
  })
  const output = objectArray(first.output)
  const reasoning = output.find((item) => item.type === 'reasoning')
  const call = output.find((item) => item.type === 'function_call')
  assertProbeCall(call?.name, call?.arguments)
  const callId = stringValue(call?.call_id)
  if (!callId) unsupportedTools('工具调用缺少 call_id。')

  const second = await postJson(endpoint, config, 'openai', {
    model,
    instructions: 'Acknowledge the tool result with a short text response.',
    input: [
      responsesMessage('user', PROBE_PROMPT),
      ...(reasoning ? [reasoning] : []),
      call,
      { type: 'function_call_output', call_id: callId, output: PROBE_RESULT }
    ]
  })
  if (!objectArray(second.output).some((item) => item.type === 'message')) {
    unsupportedTools('工具结果回传后没有返回 assistant 消息。')
  }
}

async function testChatCompletionsTools(config: ModelConfig, baseUrl: string, model: string): Promise<void> {
  const endpoint = operationEndpoint(baseUrl, 'chat/completions')
  const tool = {
    type: 'function',
    function: {
      name: PROBE_TOOL_NAME,
      description: 'Return the exact protocol probe value.',
      parameters: probeParameters()
    }
  }
  const userMessage = { role: 'user', content: PROBE_PROMPT }
  const first = await postJson(endpoint, config, 'openai', {
    model,
    messages: [userMessage],
    tools: [tool],
    max_tokens: 64
  })
  const message = firstChoiceMessage(first)
  const call = objectArray(message.tool_calls)[0]
  const fn = objectValue(call?.function)
  assertProbeCall(fn?.name, fn?.arguments)
  const callId = stringValue(call?.id)
  if (!callId) unsupportedTools('工具调用缺少 tool_call_id。')

  const second = await postJson(endpoint, config, 'openai', {
    model,
    messages: [
      userMessage,
      {
        role: 'assistant',
        content: message.content ?? null,
        ...(typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}),
        tool_calls: [call]
      },
      { role: 'tool', tool_call_id: callId, name: PROBE_TOOL_NAME, content: PROBE_RESULT }
    ],
    max_tokens: 64
  })
  const finalMessage = firstChoiceMessage(second)
  if (objectArray(finalMessage.tool_calls).length > 0) unsupportedTools('工具结果回传后模型仍返回工具调用。')
  if (typeof finalMessage.content !== 'string' && !Array.isArray(finalMessage.content)) {
    unsupportedTools('工具结果回传后没有返回 assistant 消息。')
  }
}

async function testAnthropicTools(config: ModelConfig, baseUrl: string, model: string): Promise<void> {
  const endpoint = operationEndpoint(baseUrl, 'messages')
  const tool = {
    name: PROBE_TOOL_NAME,
    description: 'Return the exact protocol probe value.',
    input_schema: probeParameters()
  }
  const first = await postJson(endpoint, config, 'anthropic', {
    model,
    max_tokens: 64,
    messages: [{ role: 'user', content: PROBE_PROMPT }],
    tools: [tool],
    tool_choice: { type: 'tool', name: PROBE_TOOL_NAME }
  })
  const call = objectArray(first.content).find((item) => item.type === 'tool_use')
  assertProbeCall(call?.name, call?.input)
  const callId = stringValue(call?.id)
  if (!callId) unsupportedTools('工具调用缺少 tool_use_id。')

  const second = await postJson(endpoint, config, 'anthropic', {
    model,
    max_tokens: 64,
    messages: [
      { role: 'user', content: PROBE_PROMPT },
      { role: 'assistant', content: [{ type: 'tool_use', id: callId, name: PROBE_TOOL_NAME, input: { value: 'ok' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: callId, content: PROBE_RESULT }] }
    ]
  })
  if (!objectArray(second.content).some((item) => item.type === 'text')) {
    unsupportedTools('工具结果回传后没有返回 assistant 文本。')
  }
}

async function testGoogleTools(config: ModelConfig, baseUrl: string, model: string): Promise<void> {
  const endpoint = googleGenerationEndpoint(baseUrl, model, config.api_key)
  const functionDeclaration = {
    name: PROBE_TOOL_NAME,
    description: 'Return the exact protocol probe value.',
    parameters: probeParameters()
  }
  const first = await postJson(endpoint, config, 'google', {
    contents: [{ role: 'user', parts: [{ text: PROBE_PROMPT }] }],
    tools: [{ functionDeclarations: [functionDeclaration] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [PROBE_TOOL_NAME] } },
    generationConfig: { maxOutputTokens: 64 }
  })
  const candidate = objectArray(first.candidates)[0]
  const content = objectValue(candidate?.content)
  const callPart = objectArray(content?.parts).find((part) => objectValue(part.functionCall) !== undefined)
  const call = objectValue(callPart?.functionCall)
  assertProbeCall(call?.name, call?.args)

  const second = await postJson(endpoint, config, 'google', {
    contents: [
      { role: 'user', parts: [{ text: PROBE_PROMPT }] },
      { role: 'model', parts: [{ functionCall: { name: PROBE_TOOL_NAME, args: { value: 'ok' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: PROBE_TOOL_NAME, response: { accepted: true } } }] }
    ],
    generationConfig: { maxOutputTokens: 64 }
  })
  const finalCandidate = objectArray(second.candidates)[0]
  const finalContent = objectValue(finalCandidate?.content)
  if (!objectArray(finalContent?.parts).some((part) => typeof part.text === 'string')) {
    unsupportedTools('工具结果回传后没有返回模型文本。')
  }
}

async function postJson(
  endpoint: string,
  config: ModelConfig,
  format: 'openai' | 'anthropic' | 'google',
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TOOL_TEST_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...requestHeaders(config, format), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > RESPONSE_LIMIT_BYTES) throw new Error('工具调用测试响应过大。')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > RESPONSE_LIMIT_BYTES) throw new Error('工具调用测试响应过大。')
    const text = new TextDecoder().decode(bytes)
    if (!response.ok) {
      const detail = safeProviderMessage(text)
      throw new Error(`工具调用测试失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
    }
    const payload = JSON.parse(text) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('工具调用测试返回的不是 JSON 对象。')
    return payload as Record<string, unknown>
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('工具调用测试超时，请检查反代或稍后重试。')
    if (error instanceof SyntaxError) throw new Error('工具调用测试返回的不是有效 JSON。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function operationEndpoint(baseUrl: string, operation: string): string {
  const url = new URL(baseUrl)
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = `${path}/${operation}`.replace(/\/+/g, '/')
  return url.toString()
}

function googleGenerationEndpoint(baseUrl: string, model: string, apiKey: string): string {
  const url = new URL(baseUrl)
  const path = url.pathname.replace(/\/+$/, '')
  const root = path.endsWith('/v1beta') ? path : `${path}/v1beta`
  url.pathname = `${root}/models/${encodeURIComponent(model)}:generateContent`.replace(/\/+/g, '/')
  url.searchParams.set('key', apiKey.trim())
  return url.toString()
}

function probeParameters(): Record<string, unknown> {
  return {
    type: 'object',
    properties: { value: { type: 'string', enum: ['ok'] } },
    required: ['value'],
    additionalProperties: false
  }
}

function responsesMessage(role: 'user' | 'assistant', text: string): Record<string, unknown> {
  return {
    type: 'message',
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }]
  }
}

function assertProbeCall(name: unknown, args: unknown): void {
  if (stringValue(name) !== PROBE_TOOL_NAME) unsupportedTools('模型没有调用指定的测试工具。')
  let value: unknown = args
  if (typeof args === 'string') {
    try { value = JSON.parse(args) } catch { unsupportedTools('工具参数不是有效 JSON。') }
  }
  if (objectValue(value)?.value !== 'ok') unsupportedTools('工具参数不是要求的 {"value":"ok"}。')
}

function firstChoiceMessage(payload: Record<string, unknown>): Record<string, unknown> {
  const choice = objectArray(payload.choices)[0]
  const message = objectValue(choice?.message)
  if (!message) unsupportedTools('接口没有返回 assistant 消息。')
  return message
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function unsupportedTools(message: string): never {
  throw new Error(`当前接口不能完整支持 Agent 工具调用：${message}`)
}

function resolvedBaseUrl(config: ModelConfig): string {
  const configured = config.base_url.trim()
  if (configured) return configured.replace(/\/+$/, '')
  switch (config.provider.trim().toLowerCase()) {
    case 'deepseek': return 'https://api.deepseek.com'
    case 'zhipu': return 'https://open.bigmodel.cn/api/paas/v4'
    case 'zai': return 'https://api.z.ai/api/paas/v4'
    case 'moonshot': return 'https://api.moonshot.cn/v1'
    case 'openai_image': return 'https://api.openai.com/v1'
    case 'novelai_image': return 'https://image.novelai.net'
    default: return ''
  }
}

function isImageProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase()
  return normalized === 'openai_image' || normalized === 'novelai_image'
}

function normalizeApiFormat(value: string | undefined): 'openai' | 'anthropic' | 'google' {
  const normalized = (value || '').trim().toLowerCase()
  if (normalized === 'anthropic_messages') return 'anthropic'
  if (normalized === 'google_gemini') return 'google'
  if (normalized === 'chat_completions' || normalized === 'responses') return 'openai'
  throw new Error(`未知模型接口格式：${value || '(空)'}`)
}

function modelListEndpoint(baseUrl: string, format: 'openai' | 'anthropic' | 'google', apiKey: string): string {
  const url = new URL(baseUrl)
  const path = url.pathname.replace(/\/+$/, '')
  if (format === 'google') {
    url.pathname = `${path.endsWith('/v1beta') ? path : `${path}/v1beta`}/models`.replace(/\/+/g, '/')
    url.searchParams.set('key', apiKey.trim())
  } else if (format === 'anthropic') {
    url.pathname = `${path.endsWith('/v1') ? path : `${path}/v1`}/models`.replace(/\/+/g, '/')
  } else {
    url.pathname = `${path}/models`.replace(/\/+/g, '/')
  }
  return url.toString()
}

function requestHeaders(config: ModelConfig, format: 'openai' | 'anthropic' | 'google'): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (format === 'anthropic') {
    headers['x-api-key'] = config.api_key.trim()
    headers['anthropic-version'] = '2023-06-01'
  } else if (format === 'openai') {
    headers.authorization = `Bearer ${config.api_key.trim()}`
  }
  for (const [name, value] of Object.entries(config.custom_headers ?? {})) {
    if (/^[A-Za-z0-9!#$%&'*+._`|~^-]+$/.test(name.trim())) headers[name.trim()] = value.trim()
  }
  return headers
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function safeProviderMessage(text: string): string {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>
    const error = payload.error
    if (typeof error === 'string') return error.slice(0, 240)
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      return typeof message === 'string' ? message.slice(0, 240) : ''
    }
  } catch { /* provider sent non-JSON */ }
  return ''
}
