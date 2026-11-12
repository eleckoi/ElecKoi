import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, LlmAdapter, BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import * as deepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import { describe, expect, it, vi } from 'vitest'
import { materializeAgentPreset, requestSnapshot } from '../../src/host/session-runtime.mjs'
import { currentRequestSnapshot, refreshSessionModelSnapshot } from '../../src/host/model-request-snapshot.mjs'
import { writeSessionSnapshot } from '../../src/host/session-snapshot.mjs'

describe('model request parameters', () => {
  it('uses the saved default selection directly without persisting another selection', async () => {
    const selected = { provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'low' }
    const ctx = { agentDefaultModel: { currentSelection: () => selected, saveSelection: vi.fn() },
      llm: { resolveModelInfo: vi.fn(async () => ({ context: { contextWindow: 64000 }, defaultMaxTokens: 8000 })) } }
    expect(await currentRequestSnapshot(ctx)).toMatchObject({ provider: selected.provider, model: selected.model, reasoningEffort: 'low', contextWindow: 64000, maxTokens: 8000 })
    expect(ctx.llm.resolveModelInfo).toHaveBeenCalledExactlyOnceWith(selected.provider, selected.model)
    expect(ctx.agentDefaultModel.saveSelection).not.toHaveBeenCalled()
  })

  it.each([
    ['synthetic-display-name', 'synthetic-current-provider'],
    ['openai-responses-a1b2c3d4e5f6', 'synthetic-current-provider'],
    ['deepseek-default', 'deepseek-official'],
  ])('does not rewrite an unavailable saved provider %s even when %s is available', async (provider, available) => {
    const selected = { provider, model: 'synthetic-model' }, original = new Error('Synthetic saved provider is unavailable')
    const ctx = { agentDefaultModel: { currentSelection: () => selected, saveSelection: vi.fn() },
      llm: { resolveModelInfo: vi.fn(async actual => {
        if (actual !== available) throw original
        return { context: { contextWindow: 64000 }, defaultMaxTokens: 8000 }
      }) },
      settings: { describe: () => provider === 'deepseek-default' ? [] : [
        { ns: 'llm-pi-ai', value: { providers: { [available]: { displayName: provider, models: [{ id: selected.model }] } } } },
        { ns: 'eleckoi-client-models', value: { entries: { [available]: { model: selected.model } } } },
      ] } }
    await expect(currentRequestSnapshot(ctx)).rejects.toBe(original)
    expect(ctx.llm.resolveModelInfo).toHaveBeenCalledExactlyOnceWith(provider, selected.model)
    expect(ctx.agentDefaultModel.saveSelection).not.toHaveBeenCalled()
    expect(ctx.agentDefaultModel.currentSelection()).toEqual(selected)
  })

  it('restores the Session model snapshot from its own saved selection while the global default is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-session-model-'))
    const selected = { provider: 'synthetic-current-provider', model: 'synthetic-model', reasoningEffort: 'low' }
    const ctx = { agentDefaultModel: { currentSelection: vi.fn(() => ({ provider: 'unavailable-other-provider', model: 'another-model' })), saveSelection: vi.fn() },
      llm: { resolveModelInfo: async provider => {
        if (provider !== selected.provider) throw new Error('Synthetic default is unavailable')
        return { context: { contextWindow: 64000 }, defaultMaxTokens: 8000 }
      } },
      settings: { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: { [selected.provider]: { parameters: { [selected.model]: { temperature: .4 } } } } } }] } }
    try {
      writeSessionSnapshot(root, 'synthetic-session', { conversationId: 'synthetic-conversation', model: { provider: 'different-provider', model: 'different-model' } })
      await refreshSessionModelSnapshot(ctx, root, 'synthetic-session', selected)
      expect(JSON.parse(readFileSync(join(root, 'synthetic-session.json'), 'utf8')).model).toEqual({
        configId: selected.provider, ...selected, temperature: .4, maxTokens: 8000, contextWindow: 64000,
      })
      expect(ctx.agentDefaultModel.currentSelection).not.toHaveBeenCalled()
      expect(ctx.agentDefaultModel.saveSelection).not.toHaveBeenCalled()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('carries saved sampling and compaction parameters into main and subagent request snapshots', () => {
    const ctx = { settings: { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: {
      'example-provider': { parameters: { 'example-model': { temperature: 0, topP: 0.96, autoCompactTokenLimit: 32000, reasoningEffort: 'high' } } },
    } } }] } }
    expect(requestSnapshot(ctx, { provider: 'example-provider', model: 'example-model' }, { context: { contextWindow: 65536 }, defaultMaxTokens: 8192 }))
      .toMatchObject({ temperature: 0, topP: 0.96, autoCompactTokenLimit: 32000, maxTokens: 8192, contextWindow: 65536, reasoningEffort: 'high' })
    expect(requestSnapshot(ctx, { provider: 'example-provider', model: 'example-model', reasoningEffort: 'low' },
      { context: { contextWindow: 65536 }, defaultMaxTokens: 8192 })).toMatchObject({ reasoningEffort: 'low' })
  })

  it.each([
    { limit: 7000, compact: true },
    { limit: 12000, compact: false },
    { limit: undefined, compact: false },
    { limit: 7000, compact: true, sessionContextWindow: 20000 },
  ])('applies the saved $limit threshold to automatic step compaction', async ({ limit, compact, sessionContextWindow }) => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-auto-compaction-'))
    const ctx = new Context()
    const calls = []
    const events = []
    const selection = { provider: 'synthetic', model: 'synthetic-model' }
    ctx.provide('agentDefaultModel', { currentSelection: () => selection })
    ctx.provide('settings', { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: {
      synthetic: { parameters: { 'synthetic-model': { autoCompactTokenLimit: limit, contextWindowTokens: sessionContextWindow } } },
    } } }] })
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry, TokenMeter]) {
        await ctx.plugin(plugin)
      }
      await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
      class Adapter extends LlmAdapter {
        async resolveModel(provider, model) {
          return { provider, id: model, name: 'Synthetic model', context: { contextWindow: 1_000_000 }, defaultMaxTokens: 8192 }
        }
        async *stream(request) {
          calls.push(request)
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: request.purpose === 'compaction' ? 'Synthetic summary.' : 'Synthetic reply.' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      }
      ctx.llm.registerAdapter(['synthetic'], new Adapter())
      const snapshot = await currentRequestSnapshot(ctx)
      const preset = materializeAgentPreset(join(root, 'presets'), resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'), {
        id: 'synthetic-preset', name: 'Synthetic preset', versionId: 'synthetic-version', roleplayPlan: { steps: [] },
      }, { disabledGroupIds: [] }, snapshot)
      const definition = JSON.parse(readFileSync(join(root, 'presets', preset.id, 'preset.json'), 'utf8'))
      const config = definition.plugins.find(plugin => plugin.id === 'compaction').config
        .find(plugin => plugin.id === 'compaction-basic').config
      await ctx.plugin(BasicCompactionEngine, config)
      await ctx.plugin(AgentLoop, { agents: [] })
      const { agent } = await ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId('synthetic-session'), agentOptions: selection,
      })
      ctx.on('session/event', (session, event) => { if (session === agent.session) events.push(event) })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic history. '.repeat(1800) }], source: { kind: 'user' } }))
      await agent.whenIdle()
      const pressure = ctx.tokenMeter.measure(agent.session).totalTokens
      expect(pressure).toBeGreaterThan(7000)
      expect(pressure).toBeLessThan(12000)
      expect(calls.filter(request => request.purpose === 'compaction')).toHaveLength(0)

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic next input.' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(calls.filter(request => request.purpose === 'compaction')).toHaveLength(compact ? 1 : 0)
      expect(events.some(event => event.type === 'compaction/end')).toBe(compact)
      expect(snapshot.contextWindow).toBe(sessionContextWindow ?? 1_000_000)
      expect(config).toMatchObject({ thresholdRatio: limit === undefined ? 0.8 : limit / 1_000_000, retainTokens: 0 })
      if (compact) {
        expect(ctx.tokenMeter.measure(agent.session).totalTokens).toBeLessThan(7000)
        expect(calls.at(-2).purpose).toBe('compaction')
        expect(calls.at(-1).purpose).not.toBe('compaction')
      }
      expect(agent.status).toBe('idle')
    } finally {
      await ctx.fiber.dispose()
      rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)

  it.each(['deepseek_messages', 'openai-completions', 'openai-responses'])('sends Top P through the official %s serializer', async api => {
    const requests = []
    const server = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push(JSON.parse(Buffer.concat(chunks).toString()))
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Synthetic request captured.' } }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-probe-value', source: 'test' }) })
    try {
      await ctx.plugin(LlmRuntime)
      const baseURL = `http://127.0.0.1:${server.address().port}/v1`
      const provider = api === 'deepseek_messages' ? 'deepseek-official' : 'example-provider'
      const retryPolicy = { mode: 'normal', maxRetries: 0 }
      if (api === 'deepseek_messages') await ctx.plugin(deepSeek, { baseURL, retryPolicy, models: [{ id: 'example-model' }] })
      else await ctx.plugin(piAi, { providers: { [provider]: { baseURL, api, apiKeyEnv: 'SYNTHETIC_KEY', retryPolicy, models: [{ id: 'example-model' }] } } })
      const assembler = new BlockAssembler()
      for await (const chunk of ctx.llm.stream({ provider, model: 'example-model', topP: 0.96, temperature: 0.4,
        maxTokens: 128, messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic input.' }] }], signal: AbortSignal.timeout(5000) })) assembler.push(chunk)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ top_p: 0.96, temperature: 0.4 })
      expect(assembler.finish.kind).toBe('error')
    } finally {
      await ctx.fiber.dispose()
      server.closeAllConnections()
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }, 15_000)

  it('sends a custom profile reasoning effort through the official Responses serializer', async () => {
    const requests = []
    const server = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      requests.push(JSON.parse(Buffer.concat(chunks).toString()))
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Synthetic request captured.' } }))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-probe-value', source: 'test' }) })
    try {
      await ctx.plugin(LlmRuntime)
      const baseURL = `http://127.0.0.1:${server.address().port}/v1`
      await ctx.plugin(piAi, { providers: { 'example-provider': {
        baseURL,
        api: 'openai-responses',
        apiKeyEnv: 'SYNTHETIC_KEY',
        retryPolicy: { mode: 'normal', maxRetries: 0 },
        models: [{ id: 'example-model', reasoningEfforts: { off: null, low: 'low', high: 'high' } }],
      } } })
      const assembler = new BlockAssembler()
      for await (const chunk of ctx.llm.stream({
        provider: 'example-provider',
        model: 'example-model',
        reasoningEffort: 'high',
        maxTokens: 128,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic input.' }] }],
        signal: AbortSignal.timeout(5000),
      })) assembler.push(chunk)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ reasoning: { effort: 'high' } })
      expect(assembler.finish.kind).toBe('error')
    } finally {
      await ctx.fiber.dispose()
      server.closeAllConnections()
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }, 15_000)
})
