import { Context } from '@deepseek-ai/cordis'
import Loader, { Group } from '@deepseek-ai/cordis-plugin-loader'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import AgentRegistry, { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SpawnSubagent from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as ForkSubagent from '@deepseek-ai/dsh-subagent-fork-in-process'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Commands from '@deepseek-ai/dsh-commands'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import * as compactCommand from '@deepseek-ai/dsh-command-compact'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { CharacterConfigurationChangeFeed, ProductRecordChangeFeed } from '../../packages/host/product-api/src/index'
import * as studioAgent from '../../packages/client/features/dsh-client-creator-studio/src/host/agent.mjs'
import { creatorStudioProjection, CREATOR_STUDIO_EVENT } from '../../packages/client/features/dsh-client-creator-studio/src/host/projection.mjs'
import { installCreatorStudioRuntime } from '../../packages/client/features/dsh-client-creator-studio/src/host/runtime.mjs'
import { readDshSessionLog, rewindDshSession } from '@eleckoi/dsh-runtime'
import { captureSerializedRequest } from '../helpers/captureModelRequest.js'
import { officialChatFixture } from '../helpers/officialTrajectory.js'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/index'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture(stream, creatorTools = true, { compaction = false, subagents = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  for (const [key, value] of Object.entries({ ELECKOI_DATABASE_PATH: join(root, 'product.sqlite'), ELECKOI_MEDIA_ROOT: join(root, 'media') })) {
    const previous = process.env[key]; process.env[key] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  mkdirSync(join(root, 'media'))
  const ctx = new Context()
  const modelParameters = { synthetic: {} }
  ctx.provide('settings', { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: {
    synthetic: { parameters: modelParameters }
  } } }] })
  cleanups.push(() => ctx.fiber.dispose())
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, Commands, TokenMeter]) await ctx.plugin(plugin)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  if (subagents) {
    await ctx.plugin(SessionQuery)
    ctx.provide('workingDirectory', {
      get: session => session.header.cwd ?? root,
      ensure: async agent => agent.session.header.cwd ?? root,
      set: async (_agent, directory) => directory,
    })
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(SpawnSubagent)
    await ctx.plugin(ForkSubagent)
  }
  await ctx.plugin(productDataPlugin)
  await ctx.plugin({ name: 'synthetic-studio-notifications', provide: ['eleckoiCharacterConfigurationChanges', 'eleckoiProductRecordChanges'], apply(owner) {
    const configuration = new CharacterConfigurationChangeFeed(), records = new ProductRecordChangeFeed()
    owner.provide('eleckoiCharacterConfigurationChanges', configuration); owner.provide('eleckoiProductRecordChanges', records)
    owner.on('dispose', () => { configuration.close(); records.close() })
  } })
  ctx.sessionProjections.register(creatorStudioProjection)
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  ctx.loader.builtins['synthetic-studio-agent'] = studioAgent
  ctx.loader.builtins['synthetic-compaction'] = BasicCompactionEngine
  ctx.loader.builtins['synthetic-compact-command'] = compactCommand
  await ctx.plugin(AgentPresetRegistry, { default: 'synthetic-studio-preset' })
  await ctx.agentPresets.register({ id: 'cordis', name: 'Synthetic baseline', plugins: [] })
  const requests = []
  const modelInfo = { synthetic: { reasoning: { efforts: [{ id: 'high', name: '合成高档位' }] }, defaultMaxTokens: 1024, context: { contextWindow: 1_000_000 } } }
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, ...modelInfo[id] } }
    async *stream(options) { requests.push(options); yield* stream(options, requests.length) }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const character = ctx.eleckoiProductData.createCharacter({ id: 'synthetic-character', name: '合成编辑目标', group: '', persona: { assistant_name: '合成角色', assistant_avatar: '', assistant_cover: '' } }).items[0]
  const config = { presetId: 'agent-preset-creator', creatorTools }
  const agentOptions = { provider: 'synthetic', model: 'synthetic' }
  await ctx.agentPresets.register({ id: 'synthetic-studio-preset', plugins: [
    ...(compaction ? [{ id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true }, config: [
      { id: 'basic', name: 'cordis:synthetic-compaction', config: { thresholdRatio: 0.007, retainTokens: 0, maxTokens: 8192, compactionRetries: 1 } },
      { id: 'command', name: 'cordis:synthetic-compact-command' },
    ] }] : []),
    { id: 'creator', name: 'cordis:synthetic-studio-agent', config },
  ] })
  const setup = async owner => { await ctx.agentPresets.mount(owner, 'synthetic-studio-preset') }
  let handle = await ctx.agents.create({ sessionId: SessionId('synthetic-studio-session'), meta: { agentPreset: 'synthetic-studio-preset' }, agentOptions, setup })
  handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: config.presetId, characterId: character.id }, { ignorable: true })
  cleanups.push(() => handle.dispose())
  return { ctx, root, modelParameters, modelInfo, get handle() { return handle }, character, requests,
    async close() { await handle.dispose() },
    async reopen() {
      await handle.dispose()
      handle = await ctx.agents.resume({ resumeSessionId: SessionId('synthetic-studio-session'), agentOptions, setup })
    } }
}
async function* text(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

describe('AI creator studio official Agent integration', { timeout: 30_000 }, () => {
  it.each(['spawn', 'fork'])('runs a first-turn %s child with its Studio binding and selected model', async provider => {
    const f = await fixture(async function* (options, step) {
      if (options.model === 'synthetic') { yield* text('合成父会话收尾'); return }
      expect(options.model).toBe('synthetic-child')
      expect(JSON.stringify(options.messages)).toContain('合成编辑目标')
      if (step === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'synthetic-child-read', name: 'eleckoi_call_capability',
          arguments: JSON.stringify({ capability_id: 'character.read', arguments: {} }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        const result = options.messages.find(message => message.role === 'tool' && message.toolCallId === 'synthetic-child-read')
        expect(JSON.stringify(result)).toContain('synthetic-character')
        yield* text('合成子代理已完成')
      }
    }, true, { subagents: true })
    const activation = await f.ctx.subagents.startActivation({
      provider, label: '合成子任务', delivery: 'caller', signal: new AbortController().signal,
      request: { parent: f.handle.agent, prompt: [{ type: 'text', text: '合成独立任务' }], agentOptions: { model: 'synthetic-child' } },
    })
    cleanups.push(() => activation.dispose())
    const result = await activation.result
    expect(result.stopReason).toBe('completed')
    expect(JSON.stringify(result.output)).toContain('合成子代理已完成')
    expect(f.requests).toHaveLength(2)
    const stored = readDshSessionLog(join(f.root, 'sessions'), activation.childId)
    expect(stored.events.filter(event => event.type === CREATOR_STUDIO_EVENT).map(event => event.data))
      .toEqual([{ presetId: 'agent-preset-creator', characterId: f.character.id }])
    expect(stored.events.find(event => event.type === 'tool/result').data.isError).not.toBe(true)
    await f.ctx.subagents.sendMessage(f.handle.agent, activation.childId, [{ type: 'text', text: '合成恢复后继续' }], { signal: new AbortController().signal })
    await f.ctx.subagents.waitForChildren(f.handle.agent)
    await f.handle.agent.whenIdle()
    const resumed = readDshSessionLog(join(f.root, 'sessions'), activation.childId)
    expect(resumed.events.filter(event => event.type === CREATOR_STUDIO_EVENT)).toHaveLength(1)
    expect(resumed.events.findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  })

  it('waits for regex EJS computation in the actual authoring tool and preserves the rule library', async () => {
    const f = await fixture(async function* () { yield* text('Synthetic completion') })
    const before = f.ctx.eleckoiProductData.readRegexRules(f.character.id)
    const rule = { id: 'synthetic-test-rule', name: 'Synthetic regex EJS', pattern: 'TOKEN', replacement: '<%= await Promise.resolve(getvar("score") * 2) %>',
      targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }
    const result = await f.handle.agent.ctx.tools.execute({ callId: 'synthetic-regex-test', name: 'eleckoi_call_capability',
      arguments: { capability_id: 'regex.test', arguments: { text: 'TOKEN', rule, target: 'AiOutput', surface: 'Display', variables: { score: 12 } } },
      agent: f.handle.agent, signal: new AbortController().signal })
    expect(result.isError, JSON.stringify(result)).not.toBe(true)
    expect(JSON.parse(result.content.find(item => item.type === 'text').text).value).toEqual({ output: '24', changed: true, appliesToSurface: true })
    expect(f.ctx.eleckoiProductData.readRegexRules(f.character.id)).toEqual(before)
  })
  it.each([101, 1_001, 10_001])('delivers every one of %i settings and complete large keyword bodies to the next actual Studio model request', async count => {
    const selectedIndexes = [0, Math.floor(count / 2), count - 1]
    const entries = Array.from({ length: count }, (_, index) => ({
      ...emptyEntry(`synthetic-volume-${index}`), title: `合成条目-${index}`,
      content: selectedIndexes.includes(index) ? `开始-${index}|${'合成正文𠮷'.repeat(26_215)}|末尾-${index}` : `合成正文-${index}`,
      agentReadStrategy: 'keyword', keywords: Array.from({ length: selectedIndexes.includes(index) ? 1_501 : 1 }, (_, key) => `合成关键词-${index}-${key}`),
      conditionKeywords: [`合成条件-${index}`], keywordCondition: 'all',
      order: index + 1, treeViewOrder: index + 1,
    }))
    let expectedEntries
    const resultFor = (options, id) => {
      const message = options.messages.find(message => message.role === 'tool' && message.toolCallId === id)
      expect(message, `missing ${id}`).toBeDefined()
      return JSON.parse(message.content.map(block => block.type === 'text' ? block.text : '').join('')).value
    }
    const f = await fixture(async function* (options, step) {
      if (step === 2) {
        const listed = resultFor(options, 'synthetic-volume-list')
        expect(listed.entries).toHaveLength(count)
        expect(listed.entries.map(entry => entry.id)).toEqual(expectedEntries.map(entry => entry.id))
        for (const index of selectedIndexes) {
          expect(listed.entries.find(entry => entry.id === entries[index].id)).toMatchObject({ title: entries[index].title, keywordMatch: true })
        }
      }
      if (step === 3) for (const index of selectedIndexes) {
        const actual = resultFor(options, `synthetic-volume-read-${index}`)
        expect(actual).toEqual(expectedEntries.find(entry => entry.id === entries[index].id))
        expect(actual.content.endsWith(`|末尾-${index}`)).toBe(true)
        expect(actual.keywords.at(-1)).toBe(`合成关键词-${index}-1500`)
      }
      if (step <= 2) {
        const calls = step === 1 ? [{ id: 'synthetic-volume-list', args: { capability_id: 'settings.list', arguments: {} } }]
          : selectedIndexes.map(index => ({ id: `synthetic-volume-read-${index}`, args: { capability_id: 'settings.read', arguments: { id: entries[index].id } } }))
        for (const [index, call] of calls.entries()) {
          yield { type: 'block-start', index, blockType: 'tool-call' }
          yield { type: 'block-end', index, block: { type: 'tool-call', id: call.id, name: 'eleckoi_call_capability', arguments: JSON.stringify(call.args) } }
        }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* text('合成完整读取结束')
    })
    const library = f.ctx.eleckoiProductData.readSettingLibrary(f.character.id)
    expectedEntries = f.ctx.eleckoiProductData.saveSettingLibrary(f.character.id, { ...library, entries: [...library.entries, ...entries] }).entries
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成大量条目与关键词读取测试' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests).toHaveLength(3)
    expect(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result')).toHaveLength(4)
    expect(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data.reason).toEqual({ kind: 'completed' })
    if (count === 10_001) for (const api of ['deepseek_messages', 'openai-completions', 'openai-responses']) {
      const wire = await captureSerializedRequest(api, f.requests.at(-1))
      const outputs = api === 'deepseek_messages'
        ? wire.messages.flatMap(message => message.content.filter(block => block.type === 'tool_result').map(block => block.content.map(part => part.text || '').join('')))
        : api === 'openai-completions' ? wire.messages.filter(message => message.role === 'tool').map(message => message.content)
          : wire.input.filter(item => item.type === 'function_call_output').map(item => item.output)
      const values = outputs.map(output => JSON.parse(output).value)
      expect(values, api).toHaveLength(4)
      expect(values.find(value => value.entries)?.entries.map(entry => entry.id), api).toEqual(expectedEntries.map(entry => entry.id))
      for (const index of selectedIndexes) expect(values.find(value => value.id === entries[index].id), api).toEqual(expectedEntries.find(entry => entry.id === entries[index].id))
    }
    await f.reopen()
    const restored = f.ctx.eleckoiProductData.readSettingLibrary(f.character.id).entries
    expect(restored).toEqual(expectedEntries)
    const persistedResults = f.handle.agent.session.deriveMessages().filter(message => message.role === 'tool')
    expect(persistedResults).toHaveLength(4)
    expect(JSON.stringify(persistedResults)).toContain(`合成关键词-${count - 1}-1500`)
  }, 120_000)

  it.each(['manual', 'automatic'])('uses the Studio model reasoning setting for %s compaction and resumes the same summary', async mode => {
    const f = await fixture(async function* (request) {
      if (request.purpose === 'compaction' && request.reasoningEffort !== 'high') throw new Error('Synthetic provider requires its selected reasoning effort')
      yield* text(request.purpose === 'compaction' ? 'Synthetic condensed history.' : 'Synthetic reply.')
    }, true, { compaction: true })
    f.modelParameters.synthetic = { reasoningEffort: 'high' }
    const send = async text => {
      f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
      await f.handle.agent.whenIdle()
    }
    const originalInput = 'Synthetic history. '.repeat(1800)
    await send(originalInput)
    expect(f.ctx.tokenMeter.measure(f.handle.agent.session).totalTokens).toBeGreaterThan(7000)
    if (mode === 'manual') {
      const commands = f.ctx.commands
      expect(commands.list(f.handle.agent).some(command => command.name === 'compact')).toBe(true)
      const result = await commands.execute(f.handle.agent, '/compact', [], new AbortController().signal)
      expect(result.result.kind, JSON.stringify(result)).toBe('success')
    } else await send('Synthetic continuation.')
    const compactions = f.requests.filter(request => request.purpose === 'compaction')
    expect(compactions).toHaveLength(1)
    expect(JSON.stringify(compactions[0].messages)).toContain(originalInput)
    expect(compactions[0]).toMatchObject({ provider: 'synthetic', model: 'synthetic', reasoningEffort: 'high', maxTokens: 8192 })
    expect(compactions[0].messages.at(-1).content[0].text).toContain('较早的创作工作室对话')
    expect(compactions[0].messages.at(-1).content[0].text).not.toContain('较早的角色扮演对话')
    expect(compactions[0].tools).toEqual(f.handle.agent.session.requestHeader().tools)
    expect(f.handle.agent.session.snapshotEvents().some(event => event.type === 'compaction/end')).toBe(true)
    expect(f.handle.agent.session.snapshotEvents().find(event => event.type === 'compaction/end').data.error).toBeUndefined()
    expect(f.handle.agent.status).toBe('idle')
    await f.reopen()
    expect(f.handle.agent.session.id).toBe('synthetic-studio-session')
    expect(JSON.stringify(f.handle.agent.session.deriveMessages())).toContain('Synthetic condensed history.')
    expect(f.handle.agent.session.snapshotEvents().some(event => event.type === 'user/message' && JSON.stringify(event.data).includes(originalInput))).toBe(true)
    await send('Synthetic resumed continuation.')
    expect(JSON.stringify(f.requests.at(-1).messages)).toContain('Synthetic condensed history.')
  })
  it('uses edited compaction instructions without leaking the template into ordinary requests or another Agent', async () => {
    const f = await fixture(async function* () { yield* text('Synthetic summary.') }, false, { compaction: true })
    const preset = f.ctx.eleckoiProductData.readAgentPreset('agent-preset-creator')
    const template = preset.entries.find(entry => entry.kind === 'history_compaction')
    f.ctx.eleckoiProductData.updateAgentPresetEntries(preset.id, [{ id: template.id, changes: { content: 'Synthetic custom compaction instructions.' } }])
    const selection = { current: { provider: 'synthetic', model: 'synthetic', reasoningEffort: 'high' } }
    cleanups.push(installModelSelection(f.handle.agent.ctx, selection))
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic history. '.repeat(100) }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests[0].reasoningEffort).toBe('high')
    expect(JSON.stringify(f.requests[0].messages)).not.toContain('Synthetic custom compaction instructions.')
    const compact = () => f.ctx.commands.execute(f.handle.agent, '/compact', [], new AbortController().signal)
    const customized = await compact()
    expect(customized.result.kind, JSON.stringify(customized)).toBe('success')
    expect(f.requests.at(-1)).toMatchObject({ purpose: 'compaction', reasoningEffort: 'high' })
    expect(f.requests.at(-1).messages.at(-1).content[0].text).toContain('Synthetic custom compaction instructions.')
    f.ctx.eleckoiProductData.updateAgentPresetEntries(preset.id, [{ id: template.id, changes: { enabled: false } }])
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic newer history. '.repeat(100) }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect((await compact()).result.kind).toBe('success')
    expect(f.requests.at(-1).messages.at(-1).content[0].text).not.toContain('Synthetic custom compaction instructions.')
    expect(f.requests.at(-1).reasoningEffort).toBe('high')
    const peer = await f.ctx.agents.create({ sessionId: SessionId('synthetic-compaction-peer'), agentOptions: { provider: 'synthetic', model: 'synthetic' } })
    cleanups.push(() => peer.dispose())
    const request = { provider: 'synthetic', model: 'synthetic', sessionId: peer.agent.id, purpose: 'compaction',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic peer summary instruction.' }] }], signal: new AbortController().signal }
    await Array.fromAsync(f.ctx.llm.stream(request))
    expect(f.requests.at(-1).messages).toEqual(request.messages)
    expect(f.requests.at(-1).reasoningEffort).toBeUndefined()
    f.modelInfo.synthetic.reasoning.efforts.push({ id: 'low', name: 'Synthetic low effort' })
    await Array.fromAsync(f.ctx.llm.stream({ ...request, sessionId: f.handle.agent.id, reasoningEffort: 'low' }))
    expect(f.requests.at(-1).reasoningEffort).toBe('low')
  })
  it('preserves the conversation and reports a failed summary without committing a replacement', async () => {
    const f = await fixture(async function* (request) {
      if (request.purpose === 'compaction') throw new Error('Synthetic summary service unavailable')
      yield* text('Synthetic reply.')
    }, true, { compaction: true })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic retained history.' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    const before = f.handle.agent.session.deriveMessages()
    const result = await f.ctx.commands.execute(f.handle.agent, '/compact', [], new AbortController().signal)
    expect(result.result.kind).toBe('error')
    expect(f.handle.agent.session.deriveMessages()).toEqual(before)
    const events = f.handle.agent.session.snapshotEvents()
    expect(JSON.stringify(events.find(event => event.type === 'compaction/end').data.error)).toContain('Synthetic summary service unavailable')
    expect(f.handle.agent.status).toBe('idle')
  })
  it('discovers and executes keyword batches and group edits through the actual scoped DSH tool dispatcher', async () => {
    const f = await fixture(async function* () { yield* text('Synthetic completion') })
    const execute = (name, args) => f.handle.agent.ctx.tools.execute({ callId: 'synthetic-authoring-fix', name, arguments: args, agent: f.handle.agent, signal: new AbortController().signal })
    const value = async (capability_id, args) => {
      const result = await execute('eleckoi_call_capability', { capability_id, arguments: args })
      expect(result.isError, JSON.stringify(result)).not.toBe(true)
      return JSON.parse(result.content.find(item => item.type === 'text').text).value
    }
    const guide = await execute('eleckoi_describe_toolset', { toolset_id: 'settings', operation_ids: ['settings.update_many', 'settings.update_group'], include_schema: true })
    expect(guide.isError, JSON.stringify(guide)).not.toBe(true)
    expect(JSON.stringify(guide)).toContain('keyword')
    const folder = await value('settings.create_group', { name: 'Synthetic folder', parentId: '', order: 1, treeViewOrder: 1 })
    const first = await value('settings.create', { title: 'Synthetic first', groupId: folder.id, content: 'Synthetic first content', keywords: ['trigger'] })
    const second = await value('settings.create', { title: 'Synthetic second', content: 'Synthetic second content', keywords: ['trigger'] })
    await value('settings.update_many', { updates: [first, second].map(item => ({ id: item.id, changes: { agentReadStrategy: 'keyword' } })) })
    await value('settings.update_group', { id: folder.id, changes: { name: 'Synthetic renamed folder' } })
    await value('character.update', { group: 'Synthetic character group' })
    const library = f.ctx.eleckoiProductData.readSettingLibrary(f.character.id)
    expect(library.entries.filter(item => item.agentReadStrategy === 'keyword').map(item => item.id)).toEqual([first.id, second.id])
    expect(library.groups.find(item => item.id === folder.id).name).toBe('Synthetic renamed folder')
    expect(f.ctx.eleckoiProductData.readCharacters().items.find(item => item.id === f.character.id).group).toBe('Synthetic character group')
    const group = await value('variables.create_object', { name: 'SyntheticGroup', parentId: '', enabled: true, description: '', updateRule: '', dynamicKey: false, order: 1, treeViewOrder: 1 })
    await value('variables.update_object', { id: group.id, changes: { name: 'SyntheticRenamedGroup' } })
    expect(f.ctx.eleckoiProductData.readVariableConfig(f.character.id).objects.find(item => item.id === group.id).name).toBe('SyntheticRenamedGroup')
    await value('variables.remove_object', { id: group.id })
    expect(f.ctx.eleckoiProductData.readVariableConfig(f.character.id).objects.some(item => item.id === group.id)).toBe(false)
  })

  it('allows explicit global and preset configuration without a selected character while enforcing character ownership', async () => {
    const f = await fixture(async function* () { yield* text('Synthetic completion') })
    const data = f.ctx.eleckoiProductData, presetId = data.readAgentPresetCatalog().activePresetIds.roleplay
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: '' }, { ignorable: true })
    const records = vi.spyOn(f.ctx.eleckoiProductRecordChanges, 'publish')
    const execute = args => f.handle.agent.ctx.tools.execute({ callId: 'synthetic-explicit-scope', name: 'eleckoi_call_capability', arguments: args, agent: f.handle.agent, signal: new AbortController().signal })
    const value = async (capability_id, args) => {
      const result = await execute({ capability_id, arguments: args })
      expect(result.isError, JSON.stringify(result)).not.toBe(true)
      return JSON.parse(result.content.find(item => item.type === 'text').text).value
    }
    for (const target of [{ scope: 'global' }, { scope: 'preset', presetId }]) {
      for (const kind of ['scripts', 'regex']) {
        const state = await value('editorVersions.read', { kind, target })
        expect(state.scope).toBe(target.scope)
        const document = kind === 'regex' ? data.readRegexEditor({ scope: 'preset', ownerId: presetId })
          : data.readScriptLibrary(target.scope, target.scope === 'global' ? '' : presetId)
        await value('editorVersions.save', { kind, documents: [JSON.stringify(document)], versions: [state] })
      }
    }
    const scripts = await value('presetScripts.read', { presetId })
    await value('presetScripts.save', { presetId, expectedRevision: scripts.revision, enabled: scripts.enabled, variables: { synthetic: 1 }, trees: scripts.trees })
    expect(data.readScriptLibrary('preset', presetId).variables).toEqual({ synthetic: 1 })
    expect(records).not.toHaveBeenCalled()
    for (const args of [
      { capability_id: 'editorVersions.read', arguments: { kind: 'regex', target: { scope: 'character' } } },
      { capability_id: 'editorVersions.save', arguments: { kind: 'scripts', documents: [JSON.stringify(data.readScriptLibrary('character', f.character.id))], versions: [] } },
    ]) {
      const result = await execute(args)
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain('选择角色')
    }
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: f.character.id }, { ignorable: true })
    data.createCharacter({ id: 'synthetic-unrelated-owner', name: 'Synthetic unrelated owner' })
    const denied = await execute({ capability_id: 'editorVersions.save', arguments: { kind: 'scripts', documents: [JSON.stringify(data.readScriptLibrary('character', 'synthetic-unrelated-owner'))], versions: [] } })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).toContain('不属于当前编辑角色')
    records.mockRestore()
  })

  it('does not offer creation when the creator tool group is disabled', async () => {
    const f = await fixture(async function* () { yield* text('合成普通回复') }, false)
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: '' }, { ignorable: true })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0].tools).toBeUndefined()
    expect(JSON.stringify(f.requests[0].messages)).not.toContain('character.create')
  })
  it('creates its own editing target without a binding, continues authoring and persists only that Session binding', async () => {
    const f = await fixture(async function* (_options, request) {
      if (request <= 2) {
        const args = request === 1 ? { capability_id: 'character.create', arguments: { name: '合成从零角色' } }
          : { capability_id: 'settings.create', arguments: { title: '合成新目标设定', content: '合成新目标正文' } }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-create-${request}`, name: 'eleckoi_call_capability', arguments: JSON.stringify(args) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* text('合成创作完成')
    })
    const peer = await f.ctx.agents.create({ sessionId: SessionId('synthetic-other-studio-binding'),
      meta: { agentPreset: 'synthetic-studio-preset' }, agentOptions: { provider: 'synthetic', model: 'synthetic' },
      setup: owner => f.ctx.agentPresets.mount(owner, 'synthetic-studio-preset').then(() => {}) })
    cleanups.push(() => peer.dispose())
    const binding = { presetId: 'agent-preset-creator', characterId: f.character.id }
    peer.agent.session.append(CREATOR_STUDIO_EVENT, binding, { ignorable: true })
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { ...binding, characterId: '' }, { ignorable: true })
    const originalSettings = f.ctx.eleckoiProductData.saveSettingLibrary(f.character.id, f.ctx.eleckoiProductData.readSettingLibrary(f.character.id))
    const before = f.ctx.eleckoiProductData.readCharacters()
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '从零创建合成角色并写设定' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    const state = f.ctx.sessionProjections.stateOf(f.handle.agent.session, creatorStudioProjection.key)
    expect(state.characterId).not.toBe('')
    expect(state.characterId).not.toBe(f.character.id)
    const created = f.ctx.eleckoiProductData.readCharacters().items.find(item => item.id === state.characterId)
    expect(created).toMatchObject({ name: '合成从零角色', avatar: '' })
    expect(f.ctx.eleckoiProductData.readSettingLibrary(state.characterId).entries).toEqual(expect.arrayContaining([expect.objectContaining({ title: '合成新目标设定' })]))
    expect(f.ctx.eleckoiProductData.readSettingLibrary(f.character.id)).toEqual(originalSettings)
    expect(f.ctx.eleckoiProductData.readCharacters().active_character_id).toBe(before.active_character_id)
    expect(f.ctx.sessionProjections.stateOf(peer.agent.session, creatorStudioProjection.key)).toEqual(binding)
    expect(JSON.stringify(f.requests[1].messages)).toContain(created.id)
    expect(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/result').every(event => !event.data.isError)).toBe(true)
    const peerCreated = await peer.agent.ctx.tools.execute({ callId: 'synthetic-peer-create', name: 'eleckoi_call_capability',
      arguments: { capability_id: 'character.create', arguments: { name: '合成另一工作室新角色' } }, agent: peer.agent, signal: new AbortController().signal })
    expect(peerCreated.isError).not.toBe(true)
    const peerState = f.ctx.sessionProjections.stateOf(peer.agent.session, creatorStudioProjection.key)
    expect(peerState.characterId).not.toBe(binding.characterId)
    expect(peerState.characterId).not.toBe(state.characterId)
    expect(f.ctx.sessionProjections.stateOf(f.handle.agent.session, creatorStudioProjection.key)).toEqual(state)
    await f.reopen()
    expect(f.ctx.sessionProjections.stateOf(f.handle.agent.session, creatorStudioProjection.key)).toEqual(state)
  })
  it('uses saved parameters for the selected Studio model without applying them to a roleplay Agent', async () => {
    const f = await fixture(async function* () { yield* text('合成回复') })
    f.modelParameters.synthetic = { temperature: 0.4, topP: 0.9, reasoningEffort: 'high' }
    const selection = { current: { provider: 'synthetic', model: 'synthetic' }, assembled: undefined }
    const disposeSelection = installModelSelection(f.handle.agent.ctx, selection)
    cleanups.push(disposeSelection)
    const roleplay = await f.ctx.agents.create({ sessionId: SessionId('synthetic-parameter-roleplay'),
      agentOptions: { provider: 'synthetic', model: 'synthetic' }, setup(owner) {
        owner.on('agent/request', async (_payload, next) => ({ ...await next(), temperature: 0.7, topP: 0.5 }))
      } })
    cleanups.push(() => roleplay.dispose())
    const send = async handle => {
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成参数输入' }], source: { kind: 'user' } }))
      await handle.agent.whenIdle()
    }
    await send(f.handle); await send(roleplay)
    expect(f.requests.find(request => request.sessionId === f.handle.agent.id), JSON.stringify(f.handle.agent.session.snapshotEvents().at(-1))).toMatchObject({ temperature: 0.4, topP: 0.9, reasoningEffort: 'high', maxTokens: 1024 })
    expect(f.requests.find(request => request.sessionId === roleplay.agent.id)).toMatchObject({ temperature: 0.7, topP: 0.5 })
    f.modelParameters['synthetic-peer'] = { temperature: 0.2, topP: 0.8 }
    f.modelInfo['synthetic-peer'] = { defaultMaxTokens: 512 }
    selection.current = { provider: 'synthetic', model: 'synthetic-peer' }
    await send(f.handle)
    expect(f.requests.at(-1)).toMatchObject({ model: 'synthetic-peer', temperature: 0.2, topP: 0.8, maxTokens: 512 })
    expect(f.requests.at(-1).reasoningEffort).toBeUndefined()
    f.modelParameters['synthetic-peer'] = {}
    await send(f.handle)
    expect(f.requests.at(-1).temperature).toBeUndefined()
    expect(f.requests.at(-1).topP).toBeUndefined()
  })
  it('leaves roleplay requests and tools unchanged while a standing studio preset is active', async () => {
    const f = await fixture(async function* () { yield* text('合成回复') })
    await f.ctx.agentPresets.register({ id: 'synthetic-roleplay-preset', plugins: [] })
    const roleplay = await f.ctx.agents.create({ sessionId: SessionId('synthetic-roleplay-session'),
      meta: { agentPreset: 'synthetic-roleplay-preset' }, agentOptions: { provider: 'synthetic', model: 'synthetic' },
      async setup(owner) {
        await f.ctx.agentPresets.mount(owner, 'synthetic-roleplay-preset')
        owner.tools.register(defineTool({ name: 'eleckoi_read_variables', description: '合成角色变量读取', parameters: {},
          output: { schema: { type: 'object', additionalProperties: true }, render: () => [] }, execute: () => ({}) }))
      } })
    cleanups.push(() => roleplay.dispose())
    for (const handle of [f.handle, roleplay]) handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }))
    await Promise.all([f.handle.agent.whenIdle(), roleplay.agent.whenIdle()])
    const request = f.requests.find(item => item.sessionId === roleplay.agent.id)
    expect(request).toBeDefined()
    expect(request.tools.map(item => item.name)).toEqual(['eleckoi_read_variables'])
    expect(request.messages).toEqual(roleplay.agent.session.deriveMessages().filter(message => message.role !== 'assistant'))
    expect(JSON.stringify(request.messages)).not.toContain('当前编辑目标')
    expect(roleplay.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data.reason).toEqual({ kind: 'completed' })
    expect(f.requests.find(item => item.sessionId === f.handle.agent.id).tools.map(item => item.name)).toEqual(expect.arrayContaining(['eleckoi_call_capability']))
  })
  it('keeps concurrently mounted studio presets and their editing targets separate after resume', async () => {
    const counts = new Map()
    const f = await fixture(async function* (options) {
      const count = (counts.get(options.sessionId) ?? 0) + 1
      counts.set(options.sessionId, count)
      if (count === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-read-${options.sessionId}`, name: 'eleckoi_call_capability',
          arguments: JSON.stringify({ capability_id: 'character.read', arguments: {} }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* text('合成回复')
    })
    const preset = f.ctx.eleckoiProductData.createAgentPreset('合成另一创作预设', '', 'creator')
    const target = f.ctx.eleckoiProductData.createCharacter({ id: 'synthetic-peer-character', name: '合成另一编辑目标' }).items.find(item => item.id === 'synthetic-peer-character')
    await f.ctx.agentPresets.register({ id: 'synthetic-peer-preset', plugins: [{ id: 'creator', name: 'cordis:synthetic-studio-agent', config: { presetId: preset.id, creatorTools: true } }] })
    const peer = await f.ctx.agents.create({ sessionId: SessionId('synthetic-peer-session'), meta: { agentPreset: 'synthetic-peer-preset' },
      agentOptions: { provider: 'synthetic', model: 'synthetic' }, setup: owner => f.ctx.agentPresets.mount(owner, 'synthetic-peer-preset').then(() => {}) })
    cleanups.push(() => peer.dispose())
    peer.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: preset.id, characterId: target.id }, { ignorable: true })
    for (const handle of [f.handle, peer]) handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成读取请求' }], source: { kind: 'user' } }))
    await Promise.all([f.handle.agent.whenIdle(), peer.agent.whenIdle()])
    for (const [agent, character, other] of [[f.handle.agent, f.character, target], [peer.agent, target, f.character]]) {
      const request = f.requests.find(item => item.sessionId === agent.id)
      expect(request).toBeDefined()
      const instructions = JSON.stringify(request.messages)
      expect(instructions).toContain(character.name)
      expect(instructions).not.toContain(other.name)
      const result = agent.session.snapshotEvents().find(event => event.type === 'tool/result')
      expect(result.data.isError).not.toBe(true)
      expect(JSON.stringify(result.data)).toContain(character.name)
      expect(JSON.stringify(result.data)).not.toContain(other.name)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data.reason).toEqual({ kind: 'completed' })
    }
    await f.reopen()
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成恢复后输入' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(JSON.stringify(f.requests.at(-1).messages)).toContain(f.character.name)
    expect(JSON.stringify(f.requests.at(-1).messages)).not.toContain(target.name)
  })
  it('reports invalid bindings in its own studio scope without failing roleplay requests', async () => {
    const f = await fixture(async function* () { yield* text('合成回复') })
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'synthetic-wrong-binding', characterId: f.character.id }, { ignorable: true })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests).toHaveLength(0)
    expect(JSON.stringify(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data)).toContain('缺少正式预设绑定')
    const roleplay = await f.ctx.agents.create({ sessionId: SessionId('synthetic-unbound-roleplay'), agentOptions: { provider: 'synthetic', model: 'synthetic' } })
    cleanups.push(() => roleplay.dispose())
    roleplay.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成角色输入' }], source: { kind: 'user' } }))
    await roleplay.agent.whenIdle()
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0].sessionId).toBe(roleplay.agent.id)
  })
  it('regenerates repeatedly on the same Session without retaining an empty completed turn', async () => {
    const f = await fixture(async function* (_options, request) {
      if (request === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'synthetic-delete-list-call', name: 'eleckoi_call_capability',
          arguments: JSON.stringify({ capability_id: 'character.read', arguments: {} }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* text(`合成回复 ${request}`)
    })
    const first = createUserMessage({ content: [{ type: 'text', text: '合成前一轮' }], source: { kind: 'user' } })
    const last = createUserMessage({ content: [{ type: 'text', text: '合成待重新生成输入' }], source: { kind: 'user' } })
    for (const input of [first, last]) { f.handle.agent.followup(input); await f.handle.agent.whenIdle() }
    const previous = {}
    for (const [key, value] of Object.entries({ ELECKOI_PRESET_ROOT: join(f.root, 'presets'), ELECKOI_PRESET_TEMPLATE_PATH: join(process.cwd(), 'apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'), ELECKOI_WORKSPACE_ROOT: f.root })) {
      previous[key] = process.env[key]; process.env[key] = value
    }
    cleanups.push(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
    let service
    const dispose = await installCreatorStudioRuntime({
      agents: f.ctx.agents, eleckoiProductData: f.ctx.eleckoiProductData,
      agentPresets: { readDocument: async () => ({ content: '[]' }), register: async () => () => {}, recompose: async () => {} },
      agentDefaultModel: { currentSelection: () => ({ provider: 'synthetic', model: 'synthetic' }) },
      llm: f.ctx.llm, settings: f.ctx.settings, sessionProjections: f.ctx.sessionProjections,
      on: f.ctx.on.bind(f.ctx), get: f.ctx.get.bind(f.ctx),
      provide: (_key, value) => { service = value },
      sessionController: {
        inspect: async () => ({ meta: f.handle.agent.session.header, events: f.handle.agent.session.snapshotEvents() }),
        resolveAgent: async () => { if (!f.ctx.agents.get('synthetic-studio-session')) await f.reopen(); return { agent: f.handle.agent } },
      },
      eleckoiSessionEditor: { transaction: async (_id, run) => run(), rewind: async (id, turn, seq, retain) => {
        await f.close(); return rewindDshSession(join(f.root, 'sessions'), id, turn, seq, retain)
      } },
    })
    cleanups.push(dispose)
    for (let attempt = 0; attempt < 2; attempt++) {
      await service.regenerate('synthetic-studio-session')
      await f.handle.agent.whenIdle()
      const events = f.handle.agent.session.snapshotEvents()
      expect(events.filter(event => event.type === 'turn/end').map(event => event.data)).toEqual([
        { turn: 1, reason: { kind: 'completed' } }, { turn: 2, reason: { kind: 'completed' } },
      ])
      expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').map(event => event.data.id)).toEqual([first.id, last.id])
      expect(events.filter(event => event.type === 'assistant/message')).toHaveLength(3)
      const chat = officialChatFixture().replace(events)
      const processes = [...chat.nodes.values()].filter(node => node.kind === 'turn-process')
      expect(processes.filter(node => node.data.turn === 2)).toHaveLength(1)
      expect(processes.every(node => node.data.turn === 1 || node.data.turn === 2)).toBe(true)
      const deletionList = await service.messages('synthetic-studio-session')
      expect(deletionList).toHaveLength(4)
      expect(deletionList.every(message => message.text.trim())).toBe(true)
      expect(f.requests.at(-1).messages.some(message => message.id === first.id)).toBe(true)
    }
    await f.close()
    expect(readDshSessionLog(join(f.root, 'sessions'), 'synthetic-studio-session').header.id).toBe('synthetic-studio-session')
  })
  it.each([false, true])('keeps complete native history in later requests and compaction after reopen=%s', async reopen => {
    const f = await fixture(async function* (_options, request) {
      if (request === 1) {
        yield { type: 'block-start', index: 0, blockType: 'reasoning' }
        yield { type: 'reasoning-delta', index: 0, text: '合成创作分析' }
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: '合成创作分析' } }
        yield { type: 'block-start', index: 1, blockType: 'tool-call' }
        yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'synthetic-history-call', name: 'eleckoi_call_capability',
          arguments: JSON.stringify({ capability_id: 'character.read', arguments: {} }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' }, replayState: {
          response: { id: 'synthetic-response' }, blocks: [{ id: 'synthetic-reasoning' }, { id: 'synthetic-tool' }] } }
      } else yield* text('合成创作回复')
    })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成第一轮需求' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    const previous = f.handle.agent.session.deriveMessages().filter(message => message.role !== 'system')
    expect(previous.some(message => message.content.some(block => block.type === 'reasoning'))).toBe(true)
    expect(previous.some(message => message.source?.kind === 'tool')).toBe(true)
    if (reopen) await f.reopen()
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '继续合成需求' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests).toHaveLength(3)
    for (const message of previous) expect(f.requests[2].messages.find(item => item.id === message.id)).toEqual(message)
    expect(f.handle.agent.session.id).toBe('synthetic-studio-session')
    const native = f.handle.agent.session.deriveMessages()
    const tools = f.handle.agent.session.requestHeader().tools
    await Array.fromAsync(f.handle.agent.ctx.llm.stream({
      provider: 'synthetic', model: 'synthetic', sessionId: f.handle.agent.id, purpose: 'compaction',
      messages: [...native, { role: 'user', content: [{ type: 'text', text: 'Synthetic native compaction instruction.' }] }],
      tools, toolHistory: f.handle.agent.session.toolHistory(), maxTokens: 8192,
    }))
    const compact = f.requests.at(-1)
    for (const message of native) expect(compact.messages.find(item => item.id === message.id)).toEqual(message)
    expect(compact.tools).toEqual(tools)
  })
  it('executes a character setting edit through the Agent loop and retains native tool events', async () => {
    const f = await fixture(async function* (options, request) {
      if (request === 1) {
        const call = { type: 'tool-call', id: 'synthetic-call', name: 'eleckoi_call_capability', arguments: JSON.stringify({ capability_id: 'settings.create', arguments: { title: '合成设定', content: '合成正文' } }) }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: call }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* text('已经保存合成设定。')
    })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '创建合成设定' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.requests).toHaveLength(2)
    expect(f.requests[0].tools.map(item => item.name).sort()).toEqual(['eleckoi_call_capability', 'eleckoi_describe_toolset', 'eleckoi_list_toolsets'])
    expect(JSON.stringify(f.requests[0].messages)).toContain('当前编辑目标')
    expect(JSON.stringify(f.requests[0].messages)).not.toContain('<FINAL>')
    expect(f.ctx.eleckoiProductData.readSettingLibrary(f.character.id).entries).toEqual(expect.arrayContaining([expect.objectContaining({ title: '合成设定', content: '合成正文' })]))
    const events = f.handle.agent.session.snapshotEvents()
    expect(events.some(event => event.type === 'tool/result' && !event.data.isError)).toBe(true)
    expect(events.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('已经保存合成设定'))).toBe(true)
  })
  it('diagnoses missing targets and invalid operations without writing another character', async () => {
    const f = await fixture(async function* () { yield* text('合成回复') })
    const execute = args => f.handle.agent.ctx.tools.execute({ callId: 'synthetic-direct', name: 'eleckoi_call_capability', arguments: args, agent: f.handle.agent, signal: new AbortController().signal })
    const describe = await f.handle.agent.ctx.tools.execute({ callId: 'synthetic-guide', name: 'eleckoi_describe_toolset', arguments: { toolset_id: 'scripts', operation_ids: ['scripts.create'], include_schema: true }, agent: f.handle.agent, signal: new AbortController().signal })
    expect(describe.isError, JSON.stringify(describe)).not.toBe(true)
    expect(JSON.stringify(describe)).toContain('api.ui.registerButton')
    expect(JSON.stringify(describe)).toContain('expectedRevision')
    expect(JSON.stringify(describe)).toContain('eleckoi-module')
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: '' }, { ignorable: true })
    const initial = f.ctx.eleckoiProductData.readSettingLibrary(f.character.id)
    const before = f.ctx.eleckoiProductData.saveSettingLibrary(f.character.id, initial)
    const missing = await execute({ capability_id: 'settings.create', arguments: { title: '不能保存', content: '合成内容' } })
    expect(missing.isError).toBe(true)
    expect(JSON.stringify(missing)).toContain('选择角色')
    const unchanged = f.ctx.eleckoiProductData.readCharacters()
    const malformed = await execute({ capability_id: 'character.create', arguments: { name: '   ' } })
    expect(malformed.isError).toBe(true)
    expect(f.ctx.eleckoiProductData.readCharacters()).toEqual(unchanged)
    expect(f.ctx.sessionProjections.stateOf(f.handle.agent.session, creatorStudioProjection.key).characterId).toBe('')
    const unknown = await execute({ capability_id: 'character.unknown', arguments: {} })
    expect(unknown.isError).toBe(true)
    expect(JSON.stringify(unknown)).toContain('未知创作操作')
    f.handle.agent.session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: f.character.id }, { ignorable: true })
    const invalid = await execute({ capability_id: 'settings.unknown', arguments: {} })
    expect(invalid.isError).toBe(true)
    expect(JSON.stringify(invalid)).toContain('未知创作操作')
    expect(f.ctx.eleckoiProductData.readSettingLibrary(f.character.id)).toEqual(before)
  })

  it.each([false, true])('keeps a Studio conversation usable after its selected character is deleted, reopen=%s', async reopen => {
    const f = await fixture(async function* () { yield* text('Synthetic retained Studio reply') })
    const send = async input => {
      f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'user' } }))
      await f.handle.agent.whenIdle()
    }
    await send('Synthetic initial Studio input')
    const before = f.handle.agent.session.deriveMessages()
    const data = f.ctx.eleckoiProductData
    data.createCharacter({ id: 'synthetic-surviving-character', name: 'Synthetic unrelated character' })
    data.deleteCharacters([f.character.id])
    if (reopen) await f.reopen()
    await send('Synthetic input after deleting the editing target')
    expect(f.handle.agent.session.id).toBe('synthetic-studio-session')
    expect(f.requests).toHaveLength(2)
    expect(f.handle.agent.session.deriveMessages().slice(0, before.length)).toEqual(before)
    expect(JSON.stringify(f.requests.at(-1).messages)).toContain('当前编辑目标：未选择角色')
    expect(f.handle.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    const execute = args => f.handle.agent.ctx.tools.execute({ callId: 'synthetic-deleted-target', name: 'eleckoi_call_capability',
      arguments: args, agent: f.handle.agent, signal: new AbortController().signal })
    const missing = await execute({ capability_id: 'character.read', arguments: {} })
    expect(missing.isError).toBe(true)
    expect(JSON.stringify(missing)).toContain('选择角色')
    const global = await execute({ capability_id: 'editorVersions.read', arguments: { kind: 'regex', target: { scope: 'global' } } })
    expect(global.isError, JSON.stringify(global)).not.toBe(true)
    const created = await execute({ capability_id: 'character.create', arguments: { name: 'Synthetic replacement editing target' } })
    expect(created.isError, JSON.stringify(created)).not.toBe(true)
    const selected = f.ctx.sessionProjections.stateOf(f.handle.agent.session, creatorStudioProjection.key)
    expect(selected.characterId).not.toBe(f.character.id)
    expect(selected.characterId).not.toBe('synthetic-surviving-character')
    const read = await execute({ capability_id: 'character.read', arguments: {} })
    expect(read.isError, JSON.stringify(read)).not.toBe(true)
    expect(JSON.parse(read.content.find(item => item.type === 'text').text).value.id).toBe(selected.characterId)
  })
})
