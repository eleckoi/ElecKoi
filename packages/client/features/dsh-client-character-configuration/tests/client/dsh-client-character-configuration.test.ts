import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

type ConfigurationChange =
  | { kind: 'snapshot' }
  | { kind: 'configuration'; domain: 'openings' | 'settingLibraries' | 'globalSettingLibraries' | 'variables' | 'regexRules' | 'scripts' | 'agentPresets'; characterId?: string }

function configurationChanges() {
  const queue: ConfigurationChange[] = [{ kind: 'snapshot' }]
  let wake: (() => void) | undefined
  let stopped = false
  return {
    open(signal?: AbortSignal): AsyncIterable<ConfigurationChange> {
      const stop = () => { stopped = true; wake?.(); wake = undefined }
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', stop, { once: true })
      return (async function* () {
        try {
          while (!stopped) {
            if (queue.length > 0) {
              yield queue.shift()!
              continue
            }
            await new Promise<void>(resolve => { wake = resolve })
            wake = undefined
          }
        } finally {
          signal?.removeEventListener('abort', stop)
          stop()
        }
      })()
    },
    emit(change: ConfigurationChange) {
      queue.push(change)
      wake?.()
      wake = undefined
    },
    isStopped: () => stopped
  }
}

describe('DSH ElecKoi character configuration models', () => {

  it('uses DSH Remote for character and conversation settings and refreshes after a connection reset', async () => {
    const calls: string[] = []
    const inputs: Array<{ name: string; input: unknown }> = []
    const stopped: string[] = []
    let registration: { id: string; factory: (require?: (name: string) => unknown) => { apply: (ctx: unknown) => void } } | undefined
    let onReset: (() => void) | undefined
    let cleanup = () => {}
    const services = new Map<string, any>()
    let branches: unknown[] = []
    let preview = '最新 AI 回复'
    let previewFailure = false
    let scriptFailure = false
    let openFailure = false
    let opening = { characterId: 'character-1', enabled: true, defaultOpeningMessageId: 'synthetic-opening', openingMessages: [{ id: 'synthetic-opening', content: '合成独立开场' }] }
    const changes = configurationChanges()
    const reportError = vi.fn()
    let globalCollection = { revision: 0, libraries: [] }
    runInNewContext(source, {
      AbortController,
      console: { ...console, error: reportError },
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    expect(registration?.id).toBe('@eleckoi/dsh-client-character-configuration')
    registration!.factory(dshClientRequire).apply({
      remote: {
        session: { openWorkspacePath: async (input: unknown) => {
          inputs.push({ name: 'scripts.openDirectory', input })
          return openFailure ? { ok: false, error: new RemoteError('gateway/internal', 'Synthetic directory open failure', {}) } : { ok: true, value: undefined }
        } },
        eleckoiAgentPresets: { catalog: async () => ({ ok: true, value: { activePresetIds: { roleplay: 'preset-1', creator: 'synthetic-creator' }, presets: [{ id: 'preset-1', name: 'Synthetic preset' }] } }) },
        eleckoiConversations: {
          list: async () => {
            calls.push('query.conversations.list')
            return previewFailure ? { ok: false, error: new RemoteError('gateway/internal', '消息预览读取失败', {}) } : {
              ok: true, value: [{ id: 'conversation-1', preview }, { id: 'no-branch-chat', preview: '普通聊天' }]
            }
          }
        },
        eleckoiCharacterConfiguration: {
          readGlobalSettingLibraries: async (...args: unknown[]) => {
            expect(args).toHaveLength(0); calls.push('query.globals.read'); return { ok: true, value: globalCollection }
          },
          saveGlobalSettingLibraries: async (...args: unknown[]) => {
            expect(args).toHaveLength(1); globalCollection = { ...(args[0] as typeof globalCollection), revision: globalCollection.revision + 1 };
            return { ok: true, value: globalCollection }
          },
          readCharacterOpenings: async () => {
            calls.push('query.openings.read')
            return { ok: true, value: opening }
          },
          saveCharacterOpenings: async (characterId: string, value: typeof opening) => {
            inputs.push({ name: 'command.openings.save', input: { characterId, value } })
            opening = value
            return { ok: true, value }
          },
          importSettingLibrary: async (characterId: string, library: unknown, openingImports: unknown[]) => {
            inputs.push({ name: 'command.setting_library.import', input: { characterId, library, openingImports } })
            return { ok: true, value: library }
          },
          readScriptWorkspace: async (scope: string, ownerId: string) => {
            inputs.push({ name: 'scripts.workspace', input: { scope, ownerId } })
            return { ok: true, value: { path: `synthetic-workspace/${scope}/${ownerId}`, entries: [], version: 'synthetic-version' } }
          },
          changes: (signal?: AbortSignal) => changes.open(signal),
          readScriptLibrary: async (scope: string, ownerId: string) => {
            inputs.push({ name: 'scripts.read', input: { scope, ownerId } })
            return scriptFailure ? { ok: false, error: new RemoteError('gateway/internal', 'Synthetic script read failure', {}) } : {
              ok: true, value: { scope, ownerId, enabled: false, trees: [], variables: { value: 2 }, revision: 1 }
            }
          },
          saveScriptLibraries: async (libraries: any[]) => {
            inputs.push({ name: 'scripts.saveAll', input: libraries })
            return { ok: true, value: libraries.map(library => ({ ...library, revision: library.revision + 1 })) }
          },
          saveScriptLibrary: async (library: any) => {
            inputs.push({ name: 'scripts.save', input: library })
            return { ok: true, value: { ...library, revision: library.revision + 1 } }
          },
          readSettingLibrary: async (characterId: string) => {
            calls.push('query.setting_library.read')
            inputs.push({ name: 'query.setting_library.read', input: { characterId } })
            return { ok: true, value: { characterId, entries: [], groups: [], versions: [] } }
          },
          saveSettingLibrary: async (characterId: string, library: unknown) => {
            calls.push('command.setting_library.save')
            inputs.push({ name: 'command.setting_library.save', input: { characterId, library } })
            return { ok: true, value: library }
          },
          saveSettingLibraryViewState: async (characterId: string, expandedGroupIds: string[]) => {
            calls.push('command.setting_library.view_state.save')
            inputs.push({ name: 'command.setting_library.view_state.save', input: { characterId, expandedGroupIds } })
            return { ok: true, value: expandedGroupIds }
          },
          readConversationSettingLibraries: async (characterId: string) => {
            calls.push('query.setting_library.conversations')
            inputs.push({ name: 'query.setting_library.conversations', input: { characterId } })
            return { ok: true, value: branches }
          },
          saveConversationSettingLibrary: async (characterId: string, sessionId: string, library: unknown) => {
            calls.push('command.setting_library.conversation.save')
            inputs.push({ name: 'command.setting_library.conversation.save', input: { characterId, sessionId, library } })
            return { ok: true, value: library }
          },
          resetConversationSettingLibrary: async (characterId: string, sessionId: string) => {
            calls.push('command.setting_library.conversation.reset')
            inputs.push({ name: 'command.setting_library.conversation.reset', input: { characterId, sessionId } })
            return { ok: true, value: undefined }
          },
          saveConversationSettingLibraryVersion: async (characterId: string, sessionId: string, name: string) => {
            calls.push('command.setting_library.conversation.save_version')
            inputs.push({ name: 'command.setting_library.conversation.save_version', input: { characterId, sessionId, name } })
            return { ok: true, value: { characterId, entries: [], groups: [], versions: [] } }
          },
          readVariableConfig: async (characterId: string) => {
            calls.push('query.variable_config.read')
            inputs.push({ name: 'query.variable_config.read', input: { characterId } })
            return { ok: true, value: { characterId, objects: [], variables: [], versions: [] } }
          },
          saveVariableConfig: async (characterId: string, config: unknown) => {
            calls.push('command.variable_config.save')
            inputs.push({ name: 'command.variable_config.save', input: { characterId, config } })
            return { ok: true, value: config }
          },
          saveVariableConfigViewState: async (characterId: string, expandedObjectIds: string[]) => {
            calls.push('command.variable_config.view_state.save')
            inputs.push({ name: 'command.variable_config.view_state.save', input: { characterId, expandedObjectIds } })
            return { ok: true, value: expandedObjectIds }
          },
          readRegexRules: async (characterId: string) => {
            calls.push('query.regex_rules.read')
            inputs.push({ name: 'query.regex_rules.read', input: { characterId } })
            return { ok: true, value: { characterId, globalRules: [], agentPresetRules: [],
              characterRules: [], versions: [], revision: 1 } }
          },
          saveRegexRules: async (characterId: string, collection: unknown, expectedRevision: number) => {
            calls.push('command.regex_rules.save')
            inputs.push({ name: 'command.regex_rules.save', input: { characterId, collection, expectedRevision } })
            return { ok: true, value: { ...(collection as object), revision: 2 } }
          },
          importRegexRules: async () => ({ ok: true, value: null }),
          exportRegexRules: async () => ({ ok: true, value: { fileName: 'rules.json', json: '[]' } }),
          testRegexRule: async (text: string, rule: unknown, target: string) => {
            calls.push('command.regex_rules.test')
            inputs.push({ name: 'command.regex_rules.test', input: { text, rule, target } })
            return { ok: true, value: { output: 'matched', validationMessage: null } }
          }
        }
      },
      provide: (name: string, value: unknown) => { services.set(name, value) },
      effect: (run: () => () => void) => { cleanup = run() },
      on: (name: string, listener: () => void) => {
        expect(name).toBe('connection/reset')
        onReset = listener
        return () => { stopped.push('reset') }
      }
    })
    const libraries = services.get('eleckoiSettingLibraries')
    const globals = services.get('eleckoiGlobalSettingLibraries')
    await settle()
    await globals.read(); await globals.save(globalCollection)
    expect(globals.getSnapshot().value.revision).toBe(1)
    changes.emit({ kind: 'configuration', domain: 'globalSettingLibraries' }); await settle()
    expect(calls.filter(name => name === 'query.globals.read')).toHaveLength(2)
    const variables = services.get('eleckoiVariables')
    const regexRules = services.get('eleckoiRegexRules')
    const openings = services.get('eleckoiCharacterOpenings')
    expect(libraries).toBeDefined()
    expect(variables).toBeDefined()
    expect(regexRules).toBeDefined()
    await settle()
    await openings.read('character-1')
    await openings.save('character-1', { ...opening, openingMessages: [{ id: 'synthetic-opening', content: '合成已修改开场' }] })
    expect(openings.getSnapshot('character-1').value.openingMessages[0].content).toBe('合成已修改开场')
    expect(inputs.find(item => item.name === 'command.openings.save')?.input).toMatchObject({ characterId: 'character-1' })
    changes.emit({ kind: 'configuration', domain: 'openings', characterId: 'character-1' })
    await settle()
    expect(calls.filter(name => name === 'query.openings.read')).toHaveLength(2)
    const scripts = services.get('eleckoiScriptLibraries')
    for (const [scope, ownerId] of [['global', ''], ['character', 'character-1'], ['preset', 'preset-1']]) await scripts.openDirectory(scope, ownerId)
    expect(inputs.filter(item => item.name === 'scripts.workspace').map(item => item.input)).toEqual([
      { scope: 'global', ownerId: '' }, { scope: 'character', ownerId: 'character-1' }, { scope: 'preset', ownerId: 'preset-1' }
    ])
    expect(inputs.filter(item => item.name === 'scripts.openDirectory').map(item => item.input)).toEqual([
      { path: 'synthetic-workspace/global/' }, { path: 'synthetic-workspace/character/character-1' }, { path: 'synthetic-workspace/preset/preset-1' }
    ])
    openFailure = true
    await expect(scripts.openDirectory('character', 'character-1')).rejects.toThrow('Synthetic directory open failure')
    const scriptChanges: unknown[] = []
    const stopScriptListening = scripts.subscribe((...args: unknown[]) => scriptChanges.push(args))
    await settle()
    await scripts.read('global', '')
    await scripts.read('character', 'character-1')
    await scripts.read('preset', 'preset-1')
    expect(inputs.filter(item => item.name === 'scripts.read').map(item => item.input)).toEqual([
      { scope: 'global', ownerId: '' }, { scope: 'character', ownerId: 'character-1' }, { scope: 'preset', ownerId: 'preset-1' }
    ])
    const draft = scripts.getSnapshot('global', '').value
    await scripts.save({ ...draft, enabled: true })
    expect(inputs.findLast(item => item.name === 'scripts.save')?.input).toEqual({ ...draft, enabled: true })
    expect(scripts.getSnapshot('global', '').value.revision).toBe(2)
    await scripts.saveAll([scripts.getSnapshot('global', '').value, scripts.getSnapshot('preset', 'preset-1').value])
    expect(scripts.getSnapshot('global', '').value.revision).toBe(3)
    expect(scripts.getSnapshot('preset', 'preset-1').value.revision).toBe(2)
    scriptFailure = true
    await expect(scripts.read('global', '')).rejects.toThrow('Synthetic script read failure')
    expect(scripts.getSnapshot('global', '')).toMatchObject({ status: 'error', value: { revision: 3, enabled: true } })
    scriptFailure = false
    expect(await scripts.activePreset()).toEqual({ id: 'preset-1', name: 'Synthetic preset' })
    expect(scriptChanges.some((change: any) => change[0] === 'preset' && change[1] === 'preset-1')).toBe(true)
    stopScriptListening()
    await settle()

    await Promise.all([libraries.read('character-1'), variables.read('character-1'), regexRules.read('character-1')])
    await libraries.readConversations('character-1')
    expect(calls.filter(name => name === 'query.conversations.list')).toHaveLength(0)
    expect(libraries.getSnapshot('character-1').status).toBe('ready')
    expect(variables.getSnapshot('character-1').status).toBe('ready')
    expect(regexRules.getSnapshot('character-1').status).toBe('ready')

    const edited = regexRules.getSnapshot('character-1').value
    await regexRules.save('character-1', edited)
    expect(inputs.findLast(item => item.name === 'command.regex_rules.save')?.input).toMatchObject({
      characterId: 'character-1', expectedRevision: 1
    })
    expect(regexRules.getSnapshot('character-1').value.revision).toBe(2)
    await expect(regexRules.test('input', { id: 'rule-1' }, 'AiOutput')).resolves.toMatchObject({ output: 'matched' })
    const library = libraries.getSnapshot('character-1').value
    const openingImports = [{ id: 'synthetic-import-version' }]
    await libraries.save('character-1', { ...library, openingImports })
    expect(inputs.find(item => item.name === 'command.setting_library.import')?.input).toEqual({ characterId: 'character-1', library, openingImports })
    expect(libraries.getSnapshot('character-1').value.openingImports).toBeUndefined()
    await libraries.saveConversation('character-1', 'conversation-1', library)
    await libraries.resetConversation('character-1', 'conversation-1')
    await libraries.saveConversationVersion('character-1', 'conversation-1', '版本一')
    expect(inputs.filter(item => item.name.startsWith('command.setting_library.conversation.'))).toHaveLength(3)

    await settle()
    changes.emit({ kind: 'configuration', domain: 'variables', characterId: 'character-1' })
    await settle()
    expect(calls.filter(name => name === 'query.setting_library.read')).toHaveLength(1)
    expect(calls.filter(name => name === 'query.variable_config.read')).toHaveLength(2)
    expect(calls.filter(name => name === 'query.regex_rules.read')).toHaveLength(1)
    changes.emit({ kind: 'configuration', domain: 'agentPresets' })
    await settle()
    expect(calls.filter(name => name === 'query.regex_rules.read')).toHaveLength(2)

    onReset?.()
    await settle()
    expect(calls.filter(name => name === 'query.setting_library.read')).toHaveLength(2)
    expect(calls.filter(name => name === 'query.variable_config.read')).toHaveLength(3)
    expect(calls.filter(name => name === 'query.regex_rules.read')).toHaveLength(3)
    expect(calls.filter(name => name === 'query.setting_library.conversations')).toHaveLength(2)
    expect(calls.filter(name => name === 'query.openings.read')).toHaveLength(3)

    const subscriberError = new Error('Synthetic script notification failure')
    const disposeBrokenSubscriber = scripts.subscribeChanges(() => { throw subscriberError })
    const healthySubscriber = vi.fn()
    const disposeHealthySubscriber = scripts.subscribeChanges(healthySubscriber)
    try {
      changes.emit({ kind: 'configuration', domain: 'agentPresets' })
      await settle()
      expect(healthySubscriber).toHaveBeenCalledOnce()
      expect(reportError.mock.calls.some(args => args.includes(subscriberError))).toBe(true)
      changes.emit({ kind: 'configuration', domain: 'variables', characterId: 'character-1' })
      await settle()
      expect(calls.filter(name => name === 'query.variable_config.read')).toHaveLength(4)
      expect(changes.isStopped()).toBe(false)
      const publishError = new Error('Synthetic variables subscriber failure')
      const stopBrokenVariables = variables.subscribe(() => { throw publishError })
      const healthyVariables = vi.fn()
      const stopHealthyVariables = variables.subscribe(healthyVariables)
      try {
        await expect(variables.read('character-1')).resolves.toMatchObject({ characterId: 'character-1' })
        expect(healthyVariables).toHaveBeenCalledWith('configuration', 'character-1', expect.objectContaining({ status: 'ready' }))
        expect(reportError.mock.calls.some(args => args.includes(publishError))).toBe(true)
      } finally { stopBrokenVariables(); stopHealthyVariables() }
    } finally { disposeBrokenSubscriber(); disposeHealthySubscriber() }

    branches = [{ sessionId: 'conversation-1', summary: '开场', library }]
    expect(await libraries.readConversations('character-1')).toMatchObject([
      { sessionId: 'conversation-1', summary: '最新 AI 回复' }
    ])
    expect(libraries.getConversationSnapshot('character-1').value).toHaveLength(1)
    preview = '最后一条用户输入'
    await libraries.readConversations('character-1')
    expect(libraries.getConversationSnapshot('character-1').value[0].summary).toBe(preview)
    previewFailure = true
    await expect(libraries.readConversations('character-1')).rejects.toThrow('消息预览读取失败')
    expect(libraries.getConversationSnapshot('character-1')).toMatchObject({
      status: 'error', error: '消息预览读取失败', value: [{ summary: preview }]
    })
    cleanup()
    expect(stopped).toEqual(['reset'])
    expect(changes.isStopped()).toBe(true)
  })
})
