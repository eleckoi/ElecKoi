import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DshRuntime } from '@eleckoi/dsh-runtime'
import { describe, expect, it } from 'vitest'

describe('packaged DSH runtime composition', () => {
  it('boots the real Cordis plugin tree and completes the JSON-RPC handshake', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eleckoi-dsh-runtime-'))
    const runtime = new DshRuntime({
      configPath: resolve('resources/dsh/cordis.yml'),
      presetTemplatePath: resolve('resources/dsh/agent-preset-template/agent.cordis.yml'),
      workspaceRoot: join(root, 'workspace'),
      runtimeDataRoot: join(root, 'runtime'),
      executablePath: process.execPath
    })

    try {
      await expect(runtime.verify()).resolves.toBeUndefined()
    } finally {
      await runtime.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('streams a real Agent reply through the packaged runtime and a local DeepSeek endpoint', async () => {
    const requests: Array<{ authorization: string | undefined; body: Record<string, unknown> }> = []
    const server = createServer(async (request, response) => {
      let rawBody = ''
      for await (const chunk of request) rawBody += chunk.toString()
      requests.push({
        authorization: request.headers.authorization,
        body: JSON.parse(rawBody) as Record<string, unknown>
      })
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      })
      const base = {
        id: 'chatcmpl-local-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'deepseek-chat'
      }
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: '本地 Agent 回复' }, finish_reason: null }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })}\n\n`)
      response.end('data: [DONE]\n\n')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Local test server did not expose a TCP port')

    const root = await mkdtemp(join(tmpdir(), 'eleckoi-dsh-conversation-'))
    const runtime = new DshRuntime({
      configPath: resolve('resources/dsh/cordis.yml'),
      presetTemplatePath: resolve('resources/dsh/agent-preset-template/agent.cordis.yml'),
      workspaceRoot: join(root, 'workspace'),
      runtimeDataRoot: join(root, 'runtime'),
      executablePath: process.execPath
    })
    const deltas: string[] = []
    const finals: string[] = []

    try {
      await expect(runtime.stream('conversation-local-test', '你好', {
        apiKey: 'local-test-key',
        baseUrl: `http://127.0.0.1:${address.port}`,
        model: 'deepseek-chat',
        systemPrompt: '只返回本地测试文本。',
        apiFormat: 'openai-completions',
        customHeaders: {},
        contextWindow: 128000,
        autoCompactTokenLimit: 96000,
        temperature: 0.65,
        supportsImageInput: false
      }, {
        onDelta: (delta) => deltas.push(delta),
        onFinal: (content) => finals.push(content)
      }, {
        initialStateJson: '{}',
        schemaCode: '',
        objects: [],
        variables: [],
        stateJson: '{}'
      }, {
        characterId: 'card-a',
        characterName: '角色 A',
        persona: {},
        history: [
          { role: 'assistant', content: '你好啊', speakerName: '角色 A' }
        ],
        settingLibrary: {
          characterId: 'card-a',
          name: '设定库',
          entries: [],
          groups: [],
          promptPositions: []
        }
      }, 'runtime-thread-a', {
        disabledGroupIds: ['builtin:variables', 'builtin:other']
      })).resolves.toBe('complete')

      expect(deltas.join('')).toContain('本地 Agent 回复')
      expect(finals).toEqual(['本地 Agent 回复'])
      expect(requests).toHaveLength(1)
      expect(requests[0]?.authorization).toBe('Bearer local-test-key')
      expect(requests[0]?.body).toMatchObject({ model: 'deepseek-chat', stream: true, temperature: 0.65 })
      const dialogue = (requests[0]?.body.messages as Array<{ role?: string; content?: unknown }>)
        .filter((message) => message.role === 'user' || message.role === 'assistant')
      expect(dialogue.slice(0, 2).map((message) => message.role)).toEqual(['assistant', 'user'])
      expect(JSON.stringify(dialogue[0]?.content)).toContain('你好啊')
      expect(JSON.stringify(dialogue[1]?.content)).toContain('你好')
      expect(dialogue.filter((message) => message.role === 'user' && message.content === '你好')).toHaveLength(1)
      expect(JSON.stringify(dialogue)).not.toContain('prior transcript')
      expect(JSON.stringify(requests[0]?.body.tools)).toContain('eleckoi_read_setting_files')
      expect(JSON.stringify(requests[0]?.body.tools)).not.toContain('eleckoi_read_variables')
      expect(JSON.stringify(requests[0]?.body.tools)).toContain('web_search')
      expect(JSON.stringify(requests[0]?.body.tools)).toContain('web_fetch')
      expect(JSON.stringify(requests[0]?.body.tools)).toContain('update_roleplay_plan')

      const persistedRoot = join(root, 'runtime', 'sessions', 'conversation-local-test')
      expect((await readdir(persistedRoot, { recursive: true })).some((entry) => entry.split(/[\\/]/).at(-1) === 'runtime-thread-a')).toBe(true)
      const settingBridge = JSON.parse(await readFile(join(persistedRoot, 'eleckoi-setting-library-state.json'), 'utf8'))
      expect(settingBridge.history).toEqual([{ role: 'assistant', content: '你好啊', speakerName: '角色 A' }])
      expect(settingBridge.variableState).toEqual({})
      await expect(runtime.stream('conversation-local-test', '你好', {
        apiKey: 'local-test-key',
        baseUrl: `http://127.0.0.1:${address.port}`,
        model: 'deepseek-chat',
        systemPrompt: '只返回本地测试文本。',
        apiFormat: 'openai-completions',
        customHeaders: {},
        contextWindow: 128000,
        autoCompactTokenLimit: 96000,
        temperature: 0.65,
        supportsImageInput: false
      }, {
        onDelta: (delta) => deltas.push(delta),
        onFinal: (content) => finals.push(content)
      }, undefined, {
        characterId: 'card-a',
        characterName: '角色 A',
        persona: {},
        history: [{ role: 'assistant', content: '你好啊', speakerName: '角色 A' }]
      }, 'runtime-thread-b', undefined, ['runtime-thread-a'])).resolves.toBe('complete')
      expect(requests).toHaveLength(2)
      const regenerationDialogue = (requests[1]?.body.messages as Array<{ role?: string; content?: unknown }>)
        .filter((message) => message.role === 'user' || message.role === 'assistant')
      expect(regenerationDialogue.slice(0, 2).map((message) => message.role)).toEqual(['assistant', 'user'])
      expect(JSON.stringify(regenerationDialogue[0]?.content)).toContain('你好啊')
      expect(JSON.stringify(regenerationDialogue[1]?.content)).toContain('你好')
      expect(JSON.stringify(regenerationDialogue)).not.toContain('本地 Agent 回复')
      expect(regenerationDialogue.filter((message) => message.role === 'user' && message.content === '你好')).toHaveLength(1)
      const persistedAfterRegeneration = await readdir(persistedRoot, { recursive: true })
      expect(persistedAfterRegeneration.some((entry) => entry.split(/[\\/]/).at(-1) === 'runtime-thread-a')).toBe(false)
      expect(persistedAfterRegeneration.some((entry) => entry.split(/[\\/]/).at(-1) === 'runtime-thread-b')).toBe(true)
    } finally {
      await runtime.close()
      server.close()
      await once(server, 'close')
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('dispatches subagent calls through the selected child provider with its own model and request parameters', async () => {
    const requests: Array<{
      authorization: string | undefined
      childRouteHeader: string | undefined
      body: Record<string, unknown>
    }> = []
    let mainCalls = 0
    const server = createServer(async (request, response) => {
      let rawBody = ''
      for await (const chunk of request) rawBody += chunk.toString()
      const body = JSON.parse(rawBody) as Record<string, unknown>
      requests.push({
        authorization: request.headers.authorization,
        childRouteHeader: request.headers['x-child'] as string | undefined,
        body
      })
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const model = String(body.model)
      const base = { id: `chatcmpl-${requests.length}`, object: 'chat.completion.chunk', created: 1, model }
      const send = (choice: Record<string, unknown>) => {
        response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, ...choice }] })}\n\n`)
      }
      if (model === 'child-model') {
        send({ delta: { role: 'assistant', content: '' }, finish_reason: null })
        send({ delta: { content: '子模型结果' }, finish_reason: null })
        send({ delta: {}, finish_reason: 'stop' })
      } else if (mainCalls++ === 0) {
        send({ delta: { role: 'assistant', content: '' }, finish_reason: null })
        send({
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-subagent-1',
              type: 'function',
              function: {
                name: 'subagent',
                arguments: JSON.stringify({
                  description: '验证子模型路由',
                  prompt: '只回复“子模型结果”。',
                  run_in_background: false
                })
              }
            }]
          },
          finish_reason: null
        })
        send({ delta: {}, finish_reason: 'tool_calls' })
      } else {
        send({ delta: { role: 'assistant', content: '' }, finish_reason: null })
        send({ delta: { content: '主模型收到子结果' }, finish_reason: null })
        send({ delta: {}, finish_reason: 'stop' })
      }
      response.end('data: [DONE]\n\n')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Local test server did not expose a TCP port')

    const root = await mkdtemp(join(tmpdir(), 'eleckoi-dsh-subagent-'))
    const runtime = new DshRuntime({
      configPath: resolve('resources/dsh/cordis.yml'),
      presetTemplatePath: resolve('resources/dsh/agent-preset-template/agent.cordis.yml'),
      workspaceRoot: join(root, 'workspace'),
      runtimeDataRoot: join(root, 'runtime'),
      executablePath: process.execPath
    })
    const final: string[] = []
    try {
      await expect(runtime.stream(
        'conversation-subagent-test',
        '请调用子代理完成验证。',
        {
          apiKey: 'main-key',
          baseUrl: `http://127.0.0.1:${address.port}`,
          model: 'main-model',
          systemPrompt: '必须调用 subagent，并等待结果。',
          apiFormat: 'openai-completions',
          customHeaders: { 'X-Main': 'main' },
          contextWindow: 128_000,
          maxTokens: 9_000,
          temperature: 0.7,
          supportsImageInput: false
        },
        { onDelta: () => undefined, onFinal: (content) => final.push(content) },
        undefined,
        undefined,
        'runtime-thread-subagent',
        undefined,
        [],
        [],
        {
          id: 'agent-preset-standard',
          versionId: 'subagent-test-v1',
          name: '测试预设',
          roleplayPlan: { steps: ['先调研', '输出最终正文'] }
        },
        undefined,
        {
          apiKey: 'child-key',
          baseUrl: `http://127.0.0.1:${address.port}`,
          model: 'child-model',
          systemPrompt: '',
          apiFormat: 'openai-completions',
          customHeaders: { 'X-Child': 'child' },
          contextWindow: 96_000,
          maxTokens: 4_321,
          temperature: 0.25,
          reasoningEffort: 'high',
          supportsImageInput: false
        }
      )).resolves.toBe('complete')

      expect(final).toEqual(['主模型收到子结果'])
      expect(requests.map((item) => item.body.model)).toContain('child-model')
      const child = requests.find((item) => item.body.model === 'child-model')
      expect(child).toBeTruthy()
      expect(child?.authorization).toBe('Bearer child-key')
      expect(child?.childRouteHeader).toBe('child')
      expect(child?.body).toMatchObject({ model: 'child-model', temperature: 0.25 })
      expect(child?.body.max_tokens ?? child?.body.max_completion_tokens).toBe(4_321)
      expect(child?.body.reasoning_effort).toBe('high')
      expect(child?.body).toHaveProperty('messages')
      expect(requests.filter((item) => item.body.model === 'main-model')).toHaveLength(2)
      expect(requests.find((item) => item.body.model === 'main-model')?.authorization).toBe('Bearer main-key')
    } finally {
      await runtime.close()
      server.close()
      await once(server, 'close')
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)
})
