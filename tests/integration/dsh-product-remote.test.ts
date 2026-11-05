import { createCharacterOpenings } from '../../packages/shared/src/contracts/characterOpenings/schemas'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries'
import { characterOpenings } from '@product-data/storage/sqlite/schema/common'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../support/owner-peer.js'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { Context } from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestPreviewStore } from '../../packages/client/features/dsh-client-roleplay/src/host/request-preview.mjs'
import ElecKoiSystemApi, {
  type AgentPresetCatalog,
  type AgentPreset,
  type AgentPresetExportResult,
  CharacterConfigurationChangeFeed,
  ElecKoiCharacterConfigurationApi,
  ConversationChangeFeed,
  ProductRecordChangeFeed,
  type PersonaProfile,
  type RegexRuleCollection,
  type SettingLibrary,
  type VariableConfig
} from '@eleckoi/dsh-product-api'
import type { RegexRuleEditorCollection } from '@eleckoi/dsh-product-api/types'
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { SqliteDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import { agentBranches, agentConversations, characters, chatSessionCharacterSnapshots, chatSessions } from '@product-data/storage/sqlite/schema/common'

const previousDatabasePath = process.env.ELECKOI_DATABASE_PATH
const previousMediaRoot = process.env.ELECKOI_MEDIA_ROOT
const previousWorkspaceRoot = process.env.ELECKOI_WORKSPACE_ROOT
const previousDshHome = process.env.DSH_HOME

afterEach(() => {
  if (previousDatabasePath === undefined) delete process.env.ELECKOI_DATABASE_PATH
  else process.env.ELECKOI_DATABASE_PATH = previousDatabasePath
  if (previousMediaRoot === undefined) delete process.env.ELECKOI_MEDIA_ROOT
  else process.env.ELECKOI_MEDIA_ROOT = previousMediaRoot
  if (previousWorkspaceRoot === undefined) delete process.env.ELECKOI_WORKSPACE_ROOT
  else process.env.ELECKOI_WORKSPACE_ROOT = previousWorkspaceRoot
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
})

describe('ElecKoi DSH Remote contract', () => {
  it('publishes the generated strict Host and Client descriptors', () => {
    const host = TYPERT as {
      package: string
      face: string
      invocations: unknown[]
    }
    expect(host.package).toBe('@eleckoi/dsh-product-api')
    expect(host.face).toBe('host')
    expect(host.invocations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacters/changes',
        service: 'eleckoiCharactersApi',
        namespace: 'eleckoiCharacters',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiPersona/read',
        service: 'eleckoiPersonaApi',
        namespace: 'eleckoiPersona',
        method: 'read',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiPersona/changes',
        service: 'eleckoiPersonaApi',
        namespace: 'eleckoiPersona',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiSystem/status',
        service: 'eleckoiSystemApi',
        namespace: 'eleckoiSystem',
        method: 'status',
        parameters: [],
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/changes',
        service: 'eleckoiCharacterConfigurationApi',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/readSettingLibrary',
        service: 'eleckoiCharacterConfigurationApi',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readSettingLibrary',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/readConversationSettingLibraries',
        service: 'eleckoiCharacterConfigurationApi',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readConversationSettingLibraries',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/saveVariableConfig',
        service: 'eleckoiCharacterConfigurationApi',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'saveVariableConfig',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/readRegexRules',
        service: 'eleckoiCharacterConfigurationApi',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readRegexRules',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiAgentPresets/catalog',
        service: 'eleckoiAgentPresetsApi',
        namespace: 'eleckoiAgentPresets',
        method: 'catalog',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCreatorStudio/create',
        service: 'eleckoiCreatorStudioApi',
        namespace: 'eleckoiCreatorStudio',
        method: 'create',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCreatorStudio/changes',
        service: 'eleckoiCreatorStudioApi',
        namespace: 'eleckoiCreatorStudio',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiDisplayPreferences/updateUi',
        service: 'eleckoiDisplayPreferencesApi',
        namespace: 'eleckoiDisplayPreferences',
        method: 'updateUi',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversationModels/current',
        service: 'eleckoiConversationModelsApi',
        namespace: 'eleckoiConversationModels',
        method: 'current',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversations/changes',
        service: 'eleckoiConversationsApi',
        namespace: 'eleckoiConversations',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversations/list',
        service: 'eleckoiConversationsApi',
        namespace: 'eleckoiConversations',
        method: 'list',
        result: expect.objectContaining({ mode: 'strict' })
      })
    ]))
    expect(host.invocations).toHaveLength(TYPERT_REMOTE.descriptors.length)
    expect(TYPERT_REMOTE.package).toBe('@eleckoi/dsh-product-api')
    expect(TYPERT_REMOTE.descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacters/changes',
        namespace: 'eleckoiCharacters',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiPersona/changes',
        namespace: 'eleckoiPersona',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiPersona/save',
        namespace: 'eleckoiPersona',
        method: 'save',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiSystem/status',
        namespace: 'eleckoiSystem',
        method: 'status',
        parameters: [],
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/changes',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/readVariableConfig',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readVariableConfig',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCharacterConfiguration/testRegexRule',
        namespace: 'eleckoiCharacterConfiguration',
        method: 'testRegexRule',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiAgentPresets/save',
        namespace: 'eleckoiAgentPresets',
        method: 'save',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCreatorStudio/changes',
        namespace: 'eleckoiCreatorStudio',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiCreatorStudio/delete',
        namespace: 'eleckoiCreatorStudio',
        method: 'delete',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiDisplayPreferences/setChatDisplay',
        namespace: 'eleckoiDisplayPreferences',
        method: 'setChatDisplay',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversationModels/select',
        namespace: 'eleckoiConversationModels',
        method: 'select',
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversations/changes',
        namespace: 'eleckoiConversations',
        method: 'changes',
        mode: 'stream',
        cancellation: { parameter: 'signal' },
        result: expect.objectContaining({ mode: 'strict' })
      }),
      expect.objectContaining({
        id: '@eleckoi/dsh-product-api#eleckoiConversations/list',
        namespace: 'eleckoiConversations',
        method: 'list',
        result: expect.objectContaining({ mode: 'strict' })
      })
    ]))
    expect(TYPERT_REMOTE.descriptors.length).toBeGreaterThanOrEqual(30)
  })

  it('streams conversation invalidations without retaining message history', async () => {
    const feed = new ConversationChangeFeed()
    const controller = new AbortController()
    const iterator = feed.stream(controller.signal)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { kind: 'snapshot' }
    })

    const next = iterator.next()
    feed.publish({ kind: 'catalog', conversationId: 'conversation-1', reason: 'created' })
    await expect(next).resolves.toEqual({
      done: false,
      value: { kind: 'catalog', conversationId: 'conversation-1', reason: 'created' }
    })

    controller.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    feed.close()
  })

  it('streams targeted character configuration invalidations', async () => {
    const feed = new CharacterConfigurationChangeFeed()
    const controller = new AbortController()
    const iterator = feed.stream(controller.signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: 'snapshot' } })

    const next = iterator.next()
    feed.publish({ kind: 'configuration', domain: 'variables', characterId: 'character-1' })
    await expect(next).resolves.toEqual({
      done: false,
      value: { kind: 'configuration', domain: 'variables', characterId: 'character-1' }
    })

    controller.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    feed.close()
  })

  it.each(['save', 'import'])('broadcasts shared regex invalidation after %s, beyond the edited character', async operation => {
    const feed = new CharacterConfigurationChangeFeed()
    const controller = new AbortController()
    const iterator = feed.stream(controller.signal)[Symbol.asyncIterator]()
    await iterator.next()
    const collection = { characterId: 'character-a', agentPresetId: 'preset-a', agentPresetName: 'Synthetic preset',
      agentPresetRegexRevision: '0'.repeat(64), revision: 1,
      globalRules: [], agentPresetRules: [], characterRules: [], versions: [], activeVersionId: '' }
    const imported = { collection, importedFileCount: 1, importedRuleCount: 0, failedFileNames: [] }
    const api = Object.assign(Object.create(ElecKoiCharacterConfigurationApi.prototype), {
      productData: { saveRegexRules: () => collection, importRegexRules: () => imported }, changeFeed: feed
    }) as ElecKoiCharacterConfigurationApi
    try {
      const notification = iterator.next()
      if (operation === 'save') expect(api.saveRegexRules('character-a', collection, 1)).toBe(collection)
      else expect(api.importRegexRules('character-a', 'Character', [], 1)).toBe(imported)
      await expect(notification).resolves.toEqual({ done: false, value: { kind: 'configuration', domain: 'regexRules' } })
    } finally { controller.abort(); feed.close() }
  })

  it('streams product record invalidations without retaining product data', async () => {
    const feed = new ProductRecordChangeFeed()
    const controller = new AbortController()
    const iterator = feed.stream(controller.signal)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: 'snapshot' } })

    const next = iterator.next()
    feed.publish({ kind: 'records', domain: 'characters', ids: ['character-1'] })
    await expect(next).resolves.toEqual({
      done: false,
      value: { kind: 'records', domain: 'characters', ids: ['character-1'] }
    })

    controller.abort()
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    feed.close()
  })

  it('manages blank Creator Studio projects without opening the product database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-creator-remote-'))
    const workspaceRoot = join(directory, 'workspace')
    const projectParent = join(directory, 'projects')
    mkdirSync(workspaceRoot)
    mkdirSync(projectParent)
    process.env.ELECKOI_DATABASE_PATH = join(directory, 'missing.sqlite3')
    delete process.env.ELECKOI_MEDIA_ROOT
    process.env.ELECKOI_WORKSPACE_ROOT = workspaceRoot
    const ctx = new Context()
    let unregister: (() => void) | undefined
    try {
      await ctx.plugin(TypertRegistry)
      unregister = ctx.typert.register(TYPERT as TypertContribution)
      await ctx.plugin(productDataPlugin)
      await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
      await ctx.plugin(ElecKoiSystemApi)

      expect(ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
      expect(ctx.get('eleckoiWorldbookRounds', false)).toBeUndefined()
      expect(ctx.get('eleckoiAuthorVariablesApi', false)).toBeDefined()
      expect(ctx.get('eleckoiAuthorScriptsApi', false)).toBeDefined()
      expect(ctx.get('eleckoiAuthorFrontendsApi', false)).toBeDefined()

      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio', method: 'list', args: {}
      })).toEqual({ items: [] })
      const created = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio',
        method: 'create',
        args: { input: { name: '纯文件项目', mode: 'blank', parentDirectory: projectParent } }
      }) as { items: Array<{ id: string; rootPath: string }> }
      expect(created.items).toHaveLength(1)
      expect(existsSync(join(created.items[0]!.rootPath, 'project.eleckoi.json'))).toBe(true)
      expect(existsSync(process.env.ELECKOI_DATABASE_PATH)).toBe(false)
      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio',
        method: 'delete',
        args: { projectId: created.items[0]!.id }
      })).toEqual({ items: [] })
    } finally {
      unregister?.()
      await ctx.fiber.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  }, 15_000)

  it('dispatches strict Remote calls through the Host and persists configuration data', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-product-remote-'))
    const path = join(directory, 'data.sqlite3')
    const database = new SqliteDatabase(path)
    database.open()
    database.db.insert(characters).values({
      id: 'character-1',
      name: '测试角色',
      avatar: '',
      squareImage: '',
      coverImage: '',
      groupName: '',
      orderIndex: 0,
      groupViewOrder: 0,
      folder: '',
      frontendBeautyEnabled: 0,
      assistantName: '测试角色',
      assistantAvatar: '',
      profileAge: '',
      profileSex: '',
      profileHeight: '',
      profileBirthday: '',
      profileLike: '',
      chatBackground: '',
      chatBackgroundOpacity: 1,
      chatBackgroundBlur: 0,
      chatBackgroundScrim: 0
    }).run()
    database.db.insert(characterOpenings).values({ characterId: 'character-1', configurationJson: JSON.stringify(createCharacterOpenings('character-1')) }).run()
    database.db.insert(chatSessions).values({
      id: 'conversation-1',
      title: '测试聊天',
      characterId: 'character-1',
      characterName: '测试角色',
      characterAvatar: '',
      historyMessageCount: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    }).run()
    database.db.insert(chatSessionCharacterSnapshots).values({
      sessionId: 'conversation-1',
      personaJson: JSON.stringify({ user_name: '旧用户', assistant_name: '测试角色' })
    }).run()
    database.db.insert(agentConversations).values({
      id: 'conversation-1', activeBranchId: 'branch-1', runtimeThreadId: 'conversation-1', variableVersionId: 'variable-config-default'
    }).run()
    database.db.insert(agentBranches).values({ id: 'branch-1', conversationId: 'conversation-1' }).run()
    database.close()

    const mediaRoot = join(directory, 'media')
    const workspaceRoot = join(directory, 'workspace')
    const projectParent = join(directory, 'projects')
    mkdirSync(workspaceRoot)
    mkdirSync(projectParent)
    process.env.ELECKOI_DATABASE_PATH = path
    process.env.ELECKOI_MEDIA_ROOT = mediaRoot
    process.env.ELECKOI_WORKSPACE_ROOT = workspaceRoot
    process.env.DSH_HOME = join(directory, 'dsh-home')
    const ctx = new Context()
    const createdSessionIds: string[] = []
    const deletedSessionIds: string[] = []
    const removedArtifacts: Array<{ conversationId: string; sessionId: string }> = []
    const editedMessages: Array<{ sessionId: string; eventSeq: number; role: string; content: string }> = []
    const rewoundTurns: Array<{ sessionId: string; fromTurn: number }> = []
    const preparedRestores: Array<{ conversationId: string; sessionId: string; fromTurn: number }> = []
    const restoredTurns: number[] = []
    const preparedPrompts: Array<{ conversationId: string; text: string }> = []
    const appendedMessages: unknown[] = []
    const regeneratedMessages: unknown[] = []
    const importedSessionIds: string[] = []
    const revealedPaths: string[] = []
    let sessionEvents: unknown[] = []
    let rejectNextSession = false
    let rejectNextDeletion = false
    let unregister: (() => void) | undefined
    try {
      await ctx.plugin(TypertRegistry)
      unregister = ctx.typert.register(TYPERT as TypertContribution)
      await ctx.plugin({
        name: 'test-session-controller',
        provide: 'sessionController',
        apply(owner) {
          owner.provide('sessionController', {
            inspect: async (sessionId: string) => ({
              meta: {
                version: 4,
                id: sessionId,
                createdAt: '2026-10-01T00:00:00.000Z',
                cwd: workspaceRoot,
                isSeeded: false,
                delegationDepth: 0
              },
              inheritedEventCount: 0,
              events: sessionEvents
            }),
            resolveAgent: async () => ({
              agent: {
                session: { append: (_type: string, message: unknown) => { appendedMessages.push(message) } },
                continueFromInput: (messageId: string) => { regeneratedMessages.push(messageId); return 2 }
              }
            }),
            selectModel: async ({ provider, model }: { provider: string; model: string }) => ({ selected: { provider, model } }),
            create: async ({ sessionId }: { sessionId: string }) => {
              if (rejectNextSession) {
                rejectNextSession = false
                throw new Error('DSH 创建失败')
              }
              createdSessionIds.push(sessionId)
              return { sessionId }
            },
            openWorkspacePath: async ({ path: target }: { path: string }) => {
              revealedPaths.push(target)
              return { opened: true }
            }
          } as never)
        }
      })
      await ctx.plugin({
        name: 'test-agent-session-storage',
        provide: ['agents', 'sessionPersistence', 'eleckoiRequestPreviews'],
        apply(owner) {
          const previews = new RequestPreviewStore()
          owner.provide('eleckoiRequestPreviews', previews)
          owner.effect(() => () => previews.close())
          owner.provide('agents', { get: () => undefined } as never)
          owner.provide('sessionPersistence', {
            create: async (header: { id: string }) => {
              importedSessionIds.push(header.id)
              return {
                append: async () => {},
                flush: async () => {},
                close: async () => {}
              }
            }
          } as never)
        }
      })
      await ctx.plugin({
        name: 'test-roleplay-sessions',
        provide: 'eleckoiRoleplaySessions',
        apply(owner) {
          owner.provide('eleckoiRoleplaySessions', {
            create: async (conversationId: string) => {
              if (rejectNextSession) {
                rejectNextSession = false
                throw new Error('DSH 创建失败')
              }
              createdSessionIds.push(conversationId)
              return conversationId
            },
            preparePrompt: async (conversationId: string, text: string) => {
              preparedPrompts.push({ conversationId, text })
              return conversationId
            },
            currentOperation: () => 'synthetic-operation',
            prepareSessionAccess: async () => {},
            prepareRegeneration: async () => ({ rollback() {} }),
            variableStatesByTurn: () => ({ 1: '{"score":1}' }),
            prepareRestoreBeforeTurn: (conversationId: string, sessionId: string, fromTurn: number) => {
              preparedRestores.push({ conversationId, sessionId, fromTurn })
              return { state: { variableStateJson: '{}', settingLibraryStateJson: '[]' },
                apply: () => { restoredTurns.push(fromTurn) }, rollback() {} }
            },
            removeArtifacts: (conversationId: string, sessionId: string) => {
              removedArtifacts.push({ conversationId, sessionId })
            }
          })
        }
      })
      await ctx.plugin({
        name: 'test-session-editor',
        provide: 'eleckoiSessionEditor',
        apply(owner) {
          owner.provide('eleckoiSessionEditor', {
            editMessage: async (sessionId: string, eventSeq: number, role: string, content: string) => {
              editedMessages.push({ sessionId, eventSeq, role, content })
            },
            rewind: async (sessionId: string, fromTurn: number) => {
              rewoundTurns.push({ sessionId, fromTurn })
              return fromTurn
            },
            transaction: async <T,>(_sessionId: string, operation: () => Promise<T>) => operation(),
            deleteSession: async (sessionId: string) => {
              if (rejectNextDeletion) {
                rejectNextDeletion = false
                throw new Error('Synthetic session deletion failed')
              }
              deletedSessionIds.push(sessionId)
            }
          })
        }
      })
      await ctx.plugin(productDataPlugin)
      await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
      await ctx.plugin(ElecKoiSystemApi)

      const display = ctx.eleckoiProductData.prepareDisplayUi({
        global_chat_wallpaper: {
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          opacity: 0.7
        }
      })
      display.commit()
      const wallpaper = display.value.global_chat_wallpaper as { image: string }
      expect(wallpaper.image).toMatch(/^eleckoi-media:\/\/asset\/v1\//)
      expect(existsSync(new LocalMediaStore(mediaRoot).pathForReference(wallpaper.image)!)).toBe(true)

      const status = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiSystem',
        method: 'status',
        args: {}
      })
      expect(status).toEqual({ architecture: 'dsh-remote', protocolVersion: 1 })

      const createdConversation = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'create',
        args: {
          input: {
            title: 'Remote 新聊天',
            metadata: {
              characterId: 'character-1',
              characterName: '测试角色',
              characterAvatar: '',
              characterPersona: {
                assistant_name: '测试角色', assistant_avatar: '', assistant_square: '', assistant_cover: ''
              }
            }
          }
        }
      }) as { conversation: { id: string; title: string }; runtimeSessionId: string }
      expect(createdConversation.conversation.title).toBe('Remote 新聊天')
      expect(createdConversation.runtimeSessionId).toBe(createdConversation.conversation.id)
      expect(createdSessionIds).toContain(createdConversation.runtimeSessionId)

      const exportedArchive = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'exportArchive',
        args: { conversationId: createdConversation.conversation.id }
      }) as string
      expect(JSON.parse(exportedArchive)).toMatchObject({
        format: 'eleckoi.desktop-chat-history',
        version: 2,
        snapshot: { conversationId: createdConversation.conversation.id },
        sessionLogs: [{ header: { id: createdConversation.runtimeSessionId } }]
      })
      const importedConversationId = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'importArchive',
        args: { characterId: 'character-1', json: exportedArchive }
      }) as string
      expect(importedConversationId).not.toBe(createdConversation.conversation.id)
      expect(importedSessionIds).toContain(importedConversationId)

      const digest = 'a'.repeat(64)
      sessionEvents = [{
        type: 'user/message', seq: 1, surfaceOp: 'append',
        data: {
          id: 'file-message', role: 'user', source: { kind: 'user' },
          content: [{ type: 'file', attachment: { attachmentId: `sha256:${digest}`, name: '资料.txt', bytes: 2 } }]
        }
      }]
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'revealFile',
        args: {
          conversationId: createdConversation.conversation.id,
          attachmentId: `sha256:${digest}`,
          name: '资料.txt'
        }
      })
      expect(revealedPaths.at(-1)).toBe(join(
        process.env.DSH_HOME!, 'attachments', 'v1', 'files', 'aa', digest, '资料.txt'
      ))

      sessionEvents = [
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        {
          type: 'user/message', seq: 2, surfaceOp: 'append',
          data: {
            id: 'user-message-1', role: 'user', source: { kind: 'user', rpcId: 'old-request' },
            content: [
              { type: 'text', text: '原始问题' },
              { type: 'image', attachment: { attachmentId: 'image-1', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } },
              { type: 'file', attachment: { attachmentId: 'file-1', name: '资料.txt', bytes: 2 } }
            ]
          }
        },
        {
          type: 'assistant/message', seq: 3, surfaceOp: 'append',
          data: { turn: 1, message: { id: 'assistant-message-1', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '原始回答' }] } }
        },
        { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } }
      ]
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'editMessage',
        args: { conversationId: createdConversation.conversation.id, eventSeq: 3, role: 'assistant', content: '修改后的回答' }
      })
      expect(editedMessages).toContainEqual({
        sessionId: createdConversation.runtimeSessionId,
        eventSeq: 3,
        role: 'assistant',
        content: '修改后的回答'
      })

      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'deleteMessagesFrom',
        args: { conversationId: createdConversation.conversation.id, eventSeq: 3, role: 'assistant' }
      })
      expect(preparedRestores.at(-1)).toEqual({
        conversationId: createdConversation.conversation.id,
        sessionId: createdConversation.runtimeSessionId,
        fromTurn: 1
      })
      expect(restoredTurns.at(-1)).toBe(1)
      expect(appendedMessages).toHaveLength(0)

      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'regenerateMessage',
        args: {
          conversationId: createdConversation.conversation.id,
          eventSeq: 2,
          requestId: 'new-request',
          replacementMessage: '替换后的问题'
        }
      })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'startRegeneration',
        args: { conversationId: createdConversation.conversation.id, requestId: 'new-request', cancelled: false }
      })
      expect(rewoundTurns.at(-1)).toEqual({ sessionId: createdConversation.runtimeSessionId, fromTurn: 1 })
      expect(preparedPrompts.at(-1)).toEqual({
        conversationId: createdConversation.conversation.id,
        text: '替换后的问题'
      })
      expect(regeneratedMessages.at(-1)).toBe('user-message-1')
      expect(editedMessages.at(-1)).toMatchObject({ eventSeq: 2, role: 'user', content: '替换后的问题' })

      sessionEvents = [
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        {
          type: 'user/message', seq: 2, surfaceOp: 'append',
          data: { id: 'user-message-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第一问' }] }
        },
        {
          type: 'assistant/message', seq: 3, surfaceOp: 'append',
          data: { turn: 1, message: { id: 'assistant-message-1', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '第一答' }] } }
        },
        { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
        {
          type: 'user/message', seq: 5, surfaceOp: 'append',
          data: { id: 'user-message-2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第二问' }] }
        },
        { type: 'turn/start', seq: 6, data: { turn: 2 } },
        {
          type: 'assistant/message', seq: 7, surfaceOp: 'append',
          // The turn marker is carried by the surrounding official events;
          // the product path must not require a redundant data.turn stamp.
          data: { message: { id: 'assistant-message-2', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '第二答' }] } }
        },
        { type: 'turn/end', seq: 8, data: { turn: 2, reason: { kind: 'completed' } } }
      ]
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'deleteMessagesFrom',
        args: { conversationId: createdConversation.conversation.id, eventSeq: 7, role: 'assistant' }
      })
      expect(rewoundTurns.at(-1)).toEqual({ sessionId: createdConversation.runtimeSessionId, fromTurn: 2 })
      expect(appendedMessages).not.toContainEqual(expect.objectContaining({ role: 'user' }))

      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'regenerateMessage',
        args: {
          conversationId: createdConversation.conversation.id,
          eventSeq: 5,
          requestId: 'request-before-turn-start'
        }
      })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'startRegeneration',
        args: { conversationId: createdConversation.conversation.id, requestId: 'request-before-turn-start', cancelled: false }
      })
      expect(rewoundTurns.at(-1)).toEqual({ sessionId: createdConversation.runtimeSessionId, fromTurn: 2 })
      expect(regeneratedMessages.at(-1)).toBe('user-message-2')

      sessionEvents = [
        { type: 'turn/start', seq: 1, data: { turn: 1 } },
        {
          type: 'user/message', seq: 2, surfaceOp: 'append',
          data: { id: 'user-message-1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第一问' }] }
        },
        {
          type: 'assistant/message', seq: 3, surfaceOp: 'append',
          data: { turn: 1, message: { id: 'assistant-message-1', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '第一答' }] } }
        },
        { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
        {
          type: 'user/message', seq: 5, surfaceOp: 'append',
          data: { id: 'queued-user-message', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '尚未开始的第二问' }] }
        }
      ]
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'regenerateMessage',
        args: {
          conversationId: createdConversation.conversation.id,
          eventSeq: 5,
          requestId: 'request-queued-before-next-turn'
        }
      })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'startRegeneration',
        args: { conversationId: createdConversation.conversation.id, requestId: 'request-queued-before-next-turn', cancelled: false }
      })
      expect(rewoundTurns.at(-1)).toEqual({ sessionId: createdConversation.runtimeSessionId, fromTurn: 2 })
      expect(regeneratedMessages.at(-1)).toBe('queued-user-message')

      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'delete',
        args: { conversationId: createdConversation.conversation.id }
      })
      expect(deletedSessionIds).toContain(createdConversation.runtimeSessionId)
      expect(removedArtifacts).toContainEqual({
        conversationId: createdConversation.conversation.id,
        sessionId: createdConversation.runtimeSessionId
      })
      const deletedReader = new Database(path, { readonly: true })
      try {
        expect(deletedReader.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE id = ?')
          .get(createdConversation.conversation.id)).toEqual({ count: 0 })
      } finally {
        deletedReader.close()
      }

      rejectNextSession = true
      await expect(ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'create',
        args: { input: { title: '应回滚的聊天' } }
      })).rejects.toThrow('DSH 创建失败')
      const rollbackReader = new Database(path, { readonly: true })
      try {
        expect(rollbackReader.prepare('SELECT COUNT(*) AS count FROM chat_sessions WHERE title = ?')
          .get('应回滚的聊天')).toEqual({ count: 0 })
      } finally {
        rollbackReader.close()
      }

      const persona = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiPersona',
        method: 'read',
        args: {}
      }) as PersonaProfile
      expect(persona.user_name).toBe('你')
      const savedPersona = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiPersona',
        method: 'save',
        args: {
          profile: {
            ...persona,
            user_name: 'Remote 用户',
            user_avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
          }
        }
      }) as PersonaProfile
      expect(savedPersona.user_name).toBe('Remote 用户')
      expect(savedPersona.user_avatar).toMatch(/^eleckoi-media:\/\/asset\/v1\//)
      expect(existsSync(new LocalMediaStore(mediaRoot).pathForReference(savedPersona.user_avatar)!)).toBe(true)
      const reader = new Database(path, { readonly: true })
      try {
        const row = reader.prepare('SELECT personaJson FROM chat_session_character_snapshots WHERE sessionId = ?')
          .get('conversation-1') as { personaJson: string }
        expect(JSON.parse(row.personaJson)).toMatchObject({
          user_name: 'Remote 用户',
          assistant_name: '测试角色'
        })
      } finally {
        reader.close()
      }

      const settingLibrary = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readSettingLibrary',
        args: { characterId: 'character-1' }
      }) as SettingLibrary
      expect(settingLibrary.characterId).toBe('character-1')
      const regexEditor = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'readRegexEditor',
        args: { target: { scope: 'character', ownerId: 'character-1' } } }) as RegexRuleEditorCollection
      expect(regexEditor).toMatchObject({ globalEnabled: true, characterEnabled: true })
      const disabledRegex = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'saveRegexEditor',
        args: { collection: { ...regexEditor, globalEnabled: false, characterEnabled: false } } }) as RegexRuleEditorCollection
      expect(disabledRegex).toMatchObject({ globalEnabled: false, characterEnabled: false })
      const runtimeRegex = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'readRegexRules',
        args: { characterId: 'character-1' } }) as RegexRuleCollection
      expect(runtimeRegex).toMatchObject({ globalEnabled: false, characterEnabled: false })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'saveRegexEditor',
        args: { collection: { ...disabledRegex, globalEnabled: true, characterEnabled: true } } })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'saveSettingLibrary',
        args: { characterId: 'character-1', library: { ...settingLibrary, name: 'Remote 设定库' } }
      })
      const currentSettingLibrary = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readSettingLibrary',
        args: { characterId: 'character-1' }
      }) as SettingLibrary
      const conversationLibrary = {
        ...currentSettingLibrary,
        entries: [...currentSettingLibrary.entries, {
          ...emptyEntry('conversation-entry-1'),
          id: 'conversation-entry-1',
          title: '聊天专属设定',
          kind: 'normal' as const,
          content: '聊天专属内容',
          triggerMode: 'agent_tool' as const,
          openingMessages: [],
          defaultOpeningMessageId: ''
        }]
      }
      await expect(ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration', method: 'saveConversationSettingLibrary',
        args: { characterId: 'character-1', conversationId: 'conversation-1', library: conversationLibrary }
      })).rejects.toThrow('只有设定修改工具成功提交变更')
      const settingRuntime = ctx.eleckoiProductData.prepareConversationRuntime('conversation-1', '合成输入')
      const projectedLibrary = settingRuntime.conversationContext.settingLibrary!
      ctx.eleckoiProductData.commitConversationRuntime('conversation-1', undefined,
        JSON.stringify({ ...projectedLibrary, entries: [...projectedLibrary.entries, conversationLibrary.entries.at(-1)!] }),
        settingRuntime.settingLibraryBaseline)
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'saveConversationSettingLibrary',
        args: { characterId: 'character-1', conversationId: 'conversation-1', library: conversationLibrary }
      })
      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readConversationSettingLibraries',
        args: { characterId: 'character-1' }
      })).toEqual([expect.objectContaining({ sessionId: 'conversation-1' })])
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'saveConversationSettingLibraryVersion',
        args: { characterId: 'character-1', conversationId: 'conversation-1', name: '聊天版本' }
      })
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'resetConversationSettingLibrary',
        args: { characterId: 'character-1', conversationId: 'conversation-1' }
      })
      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readConversationSettingLibraries',
        args: { characterId: 'character-1' }
      })).toEqual([])

      const variableConfig = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readVariableConfig',
        args: { characterId: 'character-1' }
      }) as VariableConfig
      expect(variableConfig.characterId).toBe('character-1')
      const schemaCode = 'export type State = Record<string, never>'
      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'saveVariableConfig',
        args: {
          characterId: 'character-1',
          config: {
            ...variableConfig,
            name: 'Remote 变量',
            schemaCode,
            versions: variableConfig.versions.map(version => version.id === variableConfig.activeVersionId
              ? { ...version, name: 'Remote 变量', schemaCode }
              : version)
          }
        }
      })

      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readSettingLibrary',
        args: { characterId: 'character-1' }
      })).toEqual(expect.objectContaining({ name: 'Remote 设定库' }))
      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacterConfiguration',
        method: 'readVariableConfig',
        args: { characterId: 'character-1' }
      })).toEqual(expect.objectContaining({ name: 'Remote 变量', schemaCode }))

      const presetCatalog = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiAgentPresets',
        method: 'catalog',
        args: {}
      }) as AgentPresetCatalog
      expect(presetCatalog.activePresetIds.roleplay).toBeTruthy()
      expect(presetCatalog.presets).toContainEqual(expect.objectContaining({ id: presetCatalog.activePresetIds.roleplay }))

      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      const toolPlugin = await ctx.plugin({ name: '合成骰子插件', inject: ['tools'], apply(owner) {
        owner.tools.register(defineTool({ name: 'synthetic_portable_dice', description: 'Synthetic plugin dice', parameters: {},
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: async () => '6' }))
      } })
      const readPreset = (presetId: string) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAgentPresets',
        method: 'read', args: { presetId } }) as Promise<AgentPreset>
      const withPlugin = await readPreset(presetCatalog.activePresetIds.roleplay)
      const extraTool = withPlugin.extraToolGroups!.find(group => group.id === 'plugin-tool:synthetic_portable_dice')!
      expect(extraTool).toMatchObject({ available: true, included: false })
      expect(extraTool.plugin?.name).toBe('合成骰子插件')
      expect(withPlugin.toolGroups.some(group => group.id === extraTool.id)).toBe(false)
      const directExport = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAgentPresets', method: 'export',
        args: { presetId: withPlugin.id, format: 'json' } }) as AgentPresetExportResult
      expect(Buffer.from(directExport.base64, 'base64').toString('utf8')).not.toContain('synthetic_portable_dice')
      const savedPreset = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAgentPresets', method: 'save', args: {
        preset: { ...withPlugin, autoIllustration: { enabled: true, modelConfigId: 'synthetic-image-route' }, toolGroups: [...withPlugin.toolGroups, { ...extraTool, included: true, name: '作者骰子', enabled: false }] }, expectedRegexRules: withPlugin.regexRules,
      } }) as AgentPreset
      expect(savedPreset.toolGroups.find(group => group.id === 'plugin-tool:synthetic_portable_dice')).toMatchObject({ name: '作者骰子', enabled: false })
      expect(savedPreset.extraToolGroups?.some(group => group.id === extraTool.id)).toBe(false)
      expect(savedPreset.autoIllustration).toEqual({ enabled: true, modelConfigId: 'synthetic-image-route' })
      expect((await readPreset(savedPreset.id)).autoIllustration).toEqual(savedPreset.autoIllustration)
      expect(savedPreset.toolGroups.some(group => group.id === 'builtin:auto-illustration')).toBe(false)
      const portablePreset = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAgentPresets', method: 'export',
        args: { presetId: withPlugin.id, format: 'json' } }) as AgentPresetExportResult
      expect(Buffer.from(portablePreset.base64, 'base64').toString('utf8')).not.toContain('"available"')
      expect(Buffer.from(portablePreset.base64, 'base64').toString('utf8')).not.toContain('extraToolGroups')
      await toolPlugin.dispose()
      const missingPreset = await readPreset(withPlugin.id)
      expect(missingPreset.toolGroups.find(group => group.id === 'plugin-tool:synthetic_portable_dice')).toMatchObject({ available: false, name: '作者骰子', enabled: false })
      const importedPreset = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAgentPresets', method: 'import',
        args: { source: 'eleckoi', purpose: 'roleplay', document: { displayName: portablePreset.fileName, mimeType: portablePreset.mimeType, base64: portablePreset.base64 } } }) as { preset: AgentPreset }
      expect(importedPreset.preset.toolGroups.find(group => group.id === 'plugin-tool:synthetic_portable_dice')).toMatchObject({ available: false, name: '作者骰子', enabled: false })
      expect(importedPreset.preset.toolGroups.find(group => group.id === extraTool.id)?.plugin?.name).toBe('合成骰子插件')

      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio',
        method: 'list',
        args: {}
      })).toEqual({ items: [] })
      const created = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio',
        method: 'create',
        args: {
          input: { name: 'Remote 项目', mode: 'blank', parentDirectory: projectParent }
        }
      }) as { items: Array<{ id: string; rootPath: string }> }
      expect(created.items).toHaveLength(1)
      expect(existsSync(join(created.items[0]!.rootPath, 'project.eleckoi.json'))).toBe(true)
      expect(await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCreatorStudio',
        method: 'delete',
        args: { projectId: created.items[0]!.id }
      })).toEqual({ items: [] })
      expect(existsSync(created.items[0]!.rootPath)).toBe(false)

      const characterCollection = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacters',
        method: 'list',
        args: {}
      }) as { items: Array<Record<string, unknown> & { id: string; persona: Record<string, unknown> }> }
      const currentCharacter = characterCollection.items.find(item => item.id === 'character-1')!
      const image = (content: string) => `data:image/png;base64,${Buffer.from(content).toString('base64')}`
      const updatedCharacters = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacters',
        method: 'update',
        args: {
          character: {
            ...currentCharacter,
            persona: {
              ...currentCharacter.persona,
              assistant_avatar: image('remote-avatar'),
              assistant_square: image('remote-square'),
              assistant_cover: image('remote-cover')
            }
          }
        }
      }) as { items: Array<{ id: string; persona?: Record<string, unknown> }> }
      const updatedCharacter = updatedCharacters.items.find(item => item.id === 'character-1')!
      expect(updatedCharacter.persona).toMatchObject({
        assistant_avatar: expect.stringMatching(/^eleckoi-media:\/\//),
        assistant_square: expect.stringMatching(/^eleckoi-media:\/\//),
        assistant_cover: expect.stringMatching(/^eleckoi-media:\/\//)
      })

      await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacters',
        method: 'create',
        args: { character: { ...currentCharacter, id: 'character-2', name: 'Synthetic Character Two',
          persona: { ...currentCharacter.persona, assistant_name: 'Synthetic Character Two' } } }
      })
      const otherConversation = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiConversations',
        method: 'create',
        args: { input: { title: 'Synthetic Other Chat', metadata: { characterId: 'character-2' } } }
      }) as { conversation: { id: string }; runtimeSessionId: string }
      const artifactsBeforeDeletion = removedArtifacts.length
      rejectNextDeletion = true
      await expect(ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacters',
        method: 'delete',
        args: { characterIds: ['character-1'] }
      })).rejects.toThrow('Synthetic session deletion failed')
      expect(removedArtifacts).toHaveLength(artifactsBeforeDeletion)
      expect(ctx.eleckoiProductData.readCharacters().items).toContainEqual(expect.objectContaining({ id: 'character-1' }))
      expect(ctx.eleckoiProductData.readConversationCatalog()).toContainEqual(expect.objectContaining({ id: 'conversation-1' }))

      const deletedChats = ctx.eleckoiProductData.readConversationCatalog()
        .filter(item => item.metadata.characterId === 'character-1').map(item => item.id)
      const conversationChanges = vi.spyOn(ctx.eleckoiConversationChanges, 'publish')
      const configurationChanges = vi.spyOn(ctx.eleckoiCharacterConfigurationChanges, 'publish')
      const remainingCharacters = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
        namespace: 'eleckoiCharacters',
        method: 'delete',
        args: { characterIds: ['character-1'] }
      }) as { items: Array<{ id: string }> }
      expect(remainingCharacters.items.map(item => item.id)).toEqual(['character-2'])
      expect(conversationChanges.mock.calls.map(([change]) => change)).toEqual(deletedChats.map(conversationId => ({
        kind: 'catalog', conversationId, reason: 'deleted',
      })))
      expect(Math.max(...conversationChanges.mock.invocationCallOrder)).toBeLessThan(configurationChanges.mock.invocationCallOrder[0]!)
      expect(deletedSessionIds).toContain('conversation-1')
      expect(deletedSessionIds).toContain(importedConversationId)
      expect(deletedSessionIds).not.toContain(otherConversation.runtimeSessionId)
      expect(removedArtifacts).toContainEqual({ conversationId: 'conversation-1', sessionId: 'conversation-1' })
      const deletionReader = new Database(path, { readonly: true })
      try {
        expect(deletionReader.prepare('SELECT id FROM characters ORDER BY id').all()).toEqual([{ id: 'character-2' }])
        expect(deletionReader.prepare('SELECT id FROM chat_sessions ORDER BY id').all()).toEqual([{ id: otherConversation.conversation.id }])
        expect(deletionReader.pragma('foreign_key_check')).toEqual([])
        expect(deletionReader.pragma('integrity_check', { simple: true })).toBe('ok')
      } finally { deletionReader.close() }
    } finally {
      unregister?.()
      await ctx.fiber.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
