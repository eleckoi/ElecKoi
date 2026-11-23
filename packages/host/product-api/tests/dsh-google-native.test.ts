import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, LlmRuntime, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import { discoverDraftModels } from '@eleckoi/dsh-product-api'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

async function endpoint(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>) {
  const server = createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/gateway/v1beta`
}

function owner() {
  return { settings: { describe: () => [], mutate: vi.fn() }, credentials: {
    resolve: vi.fn(async () => ({ value: 'synthetic-stored-value' })), set: vi.fn(),
  } } as unknown as Context
}

function model(name: string, methods = ['generateContent']) {
  return { name: `models/${name}`, displayName: `Display ${name}`, inputTokenLimit: 65536,
    outputTokenLimit: 8192, supportedGenerationMethods: methods, thinking: true }
}

function frame(value: unknown) { return `data: ${JSON.stringify(value)}\n\n` }

it('replays the exact Gemini tool-call signature through the OpenAI-compatible DSH adapter', async () => {
  const signature = 'synthetic-gemini-tool-signature'
  const callId = 'synthetic-call'
  const modelId = 'synthetic-gemini'
  const provider = 'config-openai-compatible'
  const calls: any[] = []
  function chunk(delta: object, finishReason: string | null = null) {
    return frame({ id: 'synthetic-response', object: 'chat.completion.chunk', model: modelId,
      choices: [{ index: 0, delta, finish_reason: finishReason }] })
  }
  const baseURL = await endpoint(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const data of request) chunks.push(Buffer.from(data))
    const body = JSON.parse(Buffer.concat(chunks).toString())
    calls.push(body)
    if (calls.length === 2) {
      const previous = body.messages.find((message: any) => message.role === 'assistant')?.tool_calls[0]
      if (previous?.extra_content?.google?.thought_signature !== signature) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Synthetic gateway: Function call is missing a thought_signature' } }))
        return
      }
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end((calls.length === 1 ? chunk({ tool_calls: [{ index: 0, id: callId, type: 'function',
      function: { name: 'skill', arguments: '{"name":' }, extra_content: { google: { thought_signature: signature } } }] })
      + chunk({ tool_calls: [{ index: 0, function: { arguments: '"synthetic"}' } }] })
      + chunk({}, 'tool_calls') : chunk({ content: 'Synthetic reply after tool.' }) + chunk({}, 'stop')) + 'data: [DONE]\n\n')
  })
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-stored-value', source: 'test' }) })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(piAi, { providers: { [provider]: { api: 'openai-completions', baseURL,
    apiKeyEnv: 'SYNTHETIC_KEY', models: [{ id: modelId }], retryPolicy: { mode: 'normal', maxRetries: 0 },
  } } })
  const options = { provider, model: modelId, tools: [{ name: 'skill', description: 'Synthetic tool.',
    parameters: { type: 'object', properties: { name: { type: 'string' } } } }], signal: AbortSignal.timeout(5000) }
  const user = { role: 'user' as const, content: [{ type: 'text' as const, text: 'Synthetic input.' }] }
  const first = new BlockAssembler()
  for await (const data of ctx.llm.stream({ ...options, messages: [user] })) first.push(data)
  expect(first.finish.kind).toBe('tool-calls')
  const tool = first.blocks().find(block => block.type === 'tool-call')!
  expect(tool).toMatchObject({ id: callId, name: 'skill', arguments: '{"name":"synthetic"}' })
  const assistant = createAssistantMessage({ content: first.blocks(), source: {
    provider, model: modelId, replayState: JSON.parse(JSON.stringify(first.replayState)),
  } })
  const result = createToolResultMessage({ callId: tool.id, isError: false, content: [{ type: 'text', text: 'Synthetic skill result.' }] })
  const second = new BlockAssembler()
  for await (const data of ctx.llm.stream({ ...options, messages: [user, assistant, result] })) second.push(data)
  expect(second.finish).toEqual({ kind: 'stop' })
  expect(second.blocks()).toEqual([{ type: 'text', text: 'Synthetic reply after tool.' }])
  expect(calls).toHaveLength(2)
  expect(calls[1].messages.find((message: any) => message.role === 'assistant').tool_calls).toEqual([
    { id: callId, type: 'function', function: { name: 'skill', arguments: '{"name":"synthetic"}' },
      extra_content: { google: { thought_signature: signature } } },
  ])
}, 15_000)

describe('Google native provider through the locked DSH adapter', () => {
  it.each([true, false])('reads every model page with the draft endpoint, headers and key (typed: %s)', async typed => {
    const requests: Array<{ path: string | undefined; headers: IncomingMessage['headers'] }> = []
    const baseURL = await endpoint((request, response) => {
      requests.push({ path: request.url, headers: request.headers })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(requests.length === 1
        ? { models: [model('synthetic-model-one'), model('synthetic-embedding', ['embedContent'])], nextPageToken: 'page +/two' }
        : { models: [model('synthetic-model-two')] }))
    })
    const ctx = owner()
    const models = await discoverDraftModels(ctx, { configId: 'config-google', api: 'google-generative-ai',
      baseURL: `${baseURL}/`, ...(typed ? { apiKey: 'synthetic-draft-value' } : {}),
      headers: { 'x-model-probe': 'synthetic-header' } })
    expect(models).toEqual(['one', 'two'].map(suffix => ({ id: `synthetic-model-${suffix}`,
      name: `Display synthetic-model-${suffix}`, contextWindow: 65536, maxTokens: 8192 })))
    expect(requests).toHaveLength(2)
    expect(new URL(requests[0]!.path!, 'http://localhost').pathname).toBe('/gateway/v1beta/models')
    expect(new URL(requests[0]!.path!, 'http://localhost').searchParams.get('pageSize')).toBe('1000')
    expect(new URL(requests[1]!.path!, 'http://localhost').searchParams.get('pageToken')).toBe('page +/two')
    for (const request of requests) {
      expect(request.headers).toMatchObject({ 'x-goog-api-key': typed ? 'synthetic-draft-value' : 'synthetic-stored-value',
        'x-model-probe': 'synthetic-header' })
      expect(request.headers.authorization).toBeUndefined()
      expect(request.path).not.toContain('synthetic-')
    }
    expect(models.every(item => !('reasoningEfforts' in item))).toBe(true)
    expect(ctx.settings.mutate).not.toHaveBeenCalled()
    expect(ctx.credentials.set).not.toHaveBeenCalled()
    if (typed) expect(ctx.credentials.resolve).not.toHaveBeenCalled()
  }, 15_000)

  it.each([
    { body: { data: [{ id: 'synthetic-model' }] }, message: 'models' },
    { body: { models: [], nextPageToken: 7 }, message: 'nextPageToken' },
    { body: { models: [], nextPageToken: 'repeated-token' }, message: 'repeated' },
  ])('reports an invalid native listing instead of adopting another protocol ($message)', async ({ body, message }) => {
    const baseURL = await endpoint((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    })
    await expect(discoverDraftModels(owner(), { configId: 'config-google', api: 'google-generative-ai', baseURL }))
      .rejects.toThrow(message)
  }, 15_000)

  it.each([
    { name: 'synthetic-model', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/synthetic-model' },
  ])('uses the official parser for native names and optional generation metadata (%j)', async entry => {
    const baseURL = await endpoint((_request, response) => { response.end(JSON.stringify({ models: [entry] })) })
    await expect(discoverDraftModels(owner(), { configId: 'config-google', api: 'google-generative-ai', baseURL }))
      .resolves.toEqual([{ id: 'synthetic-model', name: 'synthetic-model' }])
  })

  it('reads all valid pages when their combined size exceeds the official single-response budget', async () => {
    let pages = 0
    const baseURL = await endpoint((_request, response) => {
      pages += 1
      response.end(JSON.stringify({ models: [model(`synthetic-model-${pages}`)], padding: 'x'.repeat(3 * 1024 * 1024),
        ...(pages === 1 ? { nextPageToken: 'synthetic-next' } : {}) }))
    })
    const models = await discoverDraftModels(owner(), { configId: 'config-google', api: 'google-generative-ai', baseURL })
    expect(models.map(item => item.id)).toEqual(['synthetic-model-1', 'synthetic-model-2'])
    expect(pages).toBe(2)
  }, 15_000)

  it('streams native reasoning and text with the saved key, headers and sampling parameters', async () => {
    const requests: any[] = []
    const baseURL = await endpoint(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push({ path: request.url, headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString()) })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(frame({ candidates: [{ content: { role: 'model', parts: [{ text: 'Synthetic reasoning.', thought: true }] } }] })
        + frame({ candidates: [{ content: { role: 'model', parts: [{ text: 'Synthetic ' }] } }] })
        + frame({ candidates: [{ content: { role: 'model', parts: [{ text: 'reply.' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 17 } }))
    })
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-stored-value', source: 'test' }) })
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(piAi, { providers: { 'config-google': { api: 'google-generative-ai', baseURL,
      apiKeyEnv: 'SYNTHETIC_KEY', headers: { 'x-model-probe': 'synthetic-header' },
      models: [{ id: 'synthetic-model', contextWindow: 65536, maxTokens: 8192 }], retryPolicy: { mode: 'normal', maxRetries: 0 },
    } } })
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({ provider: 'config-google', model: 'synthetic-model',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic input.' }] }],
      temperature: 0.4, topP: 0.96, maxTokens: 128, signal: AbortSignal.timeout(5000) })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('stop')
    expect(assembler.blocks()).toMatchObject([
      { type: 'reasoning', text: 'Synthetic reasoning.' }, { type: 'text', text: 'Synthetic reply.' },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ path: '/gateway/v1beta/models/synthetic-model:streamGenerateContent?alt=sse',
      headers: { 'x-goog-api-key': 'synthetic-stored-value', 'x-model-probe': 'synthetic-header' },
      body: { contents: [{ role: 'user', parts: [{ text: 'Synthetic input.' }] }],
        generationConfig: { temperature: 0.4, topP: 0.96, maxOutputTokens: 128 } } })
  }, 15_000)

  it.each([false, true])('tests native tool calls and propagates authentication failures (failure: %s)', async failure => {
    const requests: any[] = []
    const baseURL = await endpoint(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString()) })
      if (failure) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { code: 401, status: 'UNAUTHENTICATED', message: 'Synthetic credential rejected.' } }))
      } else {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(frame({ candidates: [{ content: { role: 'model', parts: [{ functionCall: {
          name: 'synthetic_tool', args: { nonce: 'synthetic-token' },
        } }] }, finishReason: 'STOP' }] }))
      }
    })
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-stored-value', source: 'test' }) })
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(piAi, { providers: { 'config-google': { api: 'google-generative-ai', baseURL, apiKeyEnv: 'SYNTHETIC_KEY', headers: { 'x-model-probe': 'synthetic-header' }, models: [{ id: 'synthetic-model' }], retryPolicy: { mode: 'normal', maxRetries: 0 } } } })
    const operation = (async () => {
      const assembler = new BlockAssembler()
      for await (const chunk of ctx.llm.stream({ provider: 'config-google', model: 'synthetic-model', signal: AbortSignal.timeout(5000), messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic input.' }] }], tools: [{ name: 'synthetic_tool', description: 'Synthetic test tool.', parameters: { type: 'object', properties: { nonce: { type: 'string' } }, required: ['nonce'] } }] })) assembler.push(chunk)
      if (assembler.finish.kind === 'error' || assembler.finish.kind === 'aborted') throw new Error(assembler.finish.failure.message)
      return assembler.blocks().filter(block => block.type === 'tool-call')
    })()
    if (failure) await expect(operation).rejects.toThrow('Synthetic credential rejected.')
    else await expect(operation).resolves.toMatchObject([{ type: 'tool-call', name: 'synthetic_tool' }])
    expect(requests).toHaveLength(1)
    expect(requests[0].body.tools[0].functionDeclarations[0].name).toBe('synthetic_tool')
    expect(requests[0].headers).toMatchObject({ 'x-goog-api-key': 'synthetic-stored-value', 'x-model-probe': 'synthetic-header' })
  }, 15_000)
})
