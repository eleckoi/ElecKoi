import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { ModelConfig } from '@shared/contracts/entities/model'
import { discoverModels, testModelConnection } from '@main/modules/models/ModelDiscovery'

const servers = new Set<ReturnType<typeof createServer>>()

afterEach(async () => {
  await Promise.all([...servers].map(async (server) => {
    server.close()
    await once(server, 'close')
    servers.delete(server)
  }))
})

describe('model discovery', () => {
  it('reads the configured OpenAI-format model list and preserves current per-model settings', async () => {
    const requests: Array<{ url: string | undefined; authorization: string | undefined; client: string | undefined }> = []
    const server = createServer((request, response) => {
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        client: request.headers['x-eleckoi-client'] as string | undefined
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [
        { id: 'model-10', display_name: 'Model Ten', context_window: 128000, max_output_tokens: 8192 },
        { id: 'model-2', name: 'Model Two' }
      ] }))
    })
    servers.add(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo

    const config: ModelConfig = {
      id: 'custom-config',
      name: 'Local gateway',
      provider: 'custom',
      api_key: 'model-list-key',
      base_url: `http://127.0.0.1:${address.port}/v1`,
      proxy_url: '',
      model: 'model-10',
      model_options: [{ id: 'model-10', name: 'Saved name', temperature: 0.4, reasoningEffort: 'high' }],
      custom_headers: { 'X-ElecKoi-Client': 'desktop' },
      supports_tools: null,
      enabled: true,
      image_settings: {},
      api_format: 'responses'
    }

    await expect(discoverModels(config)).resolves.toEqual([
      { id: 'model-2', name: 'Model Two', isUserAdded: false, supportsImageInput: false },
      {
        id: 'model-10',
        name: 'Model Ten',
        contextWindowTokens: 128000,
        maxOutputTokens: 8192,
        temperature: 0.4,
        reasoningEffort: 'high',
        isUserAdded: false,
        supportsImageInput: false
      }
    ])
    expect(requests).toEqual([{
      url: '/v1/models',
      authorization: 'Bearer model-list-key',
      client: 'desktop'
    }])
  })

  it('validates a Responses API tool call and its result round trip', async () => {
    const bodies: Record<string, unknown>[] = []
    const server = createServer(async (request, response) => {
      const body = JSON.parse(await readRequestBody(request)) as Record<string, unknown>
      bodies.push(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(bodies.length === 1
        ? { output: [
            { type: 'reasoning', id: 'reasoning-1', content: [{ type: 'reasoning_text', text: 'check' }] },
            { type: 'function_call', name: 'eleckoi_capability_probe', call_id: 'call-1', arguments: '{"value":"ok"}' }
          ] }
        : { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] }))
    })
    servers.add(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo

    await expect(testModelConnection(modelConfig(`http://127.0.0.1:${address.port}/v1`, 'responses'))).resolves.toBeUndefined()
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toMatchObject({
      model: 'model-1'
    })
    expect(bodies[0]).not.toHaveProperty('tool_choice')
    expect(bodies[1]).toMatchObject({ model: 'model-1' })
    expect(bodies[1]?.input).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', id: 'reasoning-1' }),
      expect.objectContaining({ type: 'function_call', call_id: 'call-1' }),
      expect.objectContaining({ type: 'function_call_output', call_id: 'call-1' })
    ]))
  })

  it('rejects a chat completion endpoint that ignores the requested tool call without forcing tool_choice', async () => {
    const bodies: Record<string, unknown>[] = []
    const server = createServer(async (request, response) => {
      bodies.push(JSON.parse(await readRequestBody(request)) as Record<string, unknown>)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'plain text' } }] }))
    })
    servers.add(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo

    await expect(testModelConnection(modelConfig(
      `http://127.0.0.1:${address.port}/v1`,
      'chat_completions'
    ))).rejects.toThrow('当前接口不能完整支持 Agent 工具调用')
    expect(bodies[0]).not.toHaveProperty('tool_choice')
  })
})

function modelConfig(baseUrl: string, apiFormat: ModelConfig['api_format']): ModelConfig {
  return {
    id: 'tool-test',
    name: 'Tool test',
    provider: 'custom',
    api_key: 'test-key',
    base_url: baseUrl,
    proxy_url: '',
    model: 'model-1',
    model_options: [{ id: 'model-1', name: 'model-1' }],
    custom_headers: {},
    supports_tools: null,
    enabled: true,
    image_settings: {},
    api_format: apiFormat
  }
}

async function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
