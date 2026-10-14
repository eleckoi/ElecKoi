import { dirname, isAbsolute, join } from 'node:path'
export type { GeneratedImageFrame, ChatUserImageAttachment } from '@shared/contracts/entities/chat'
export { normalizeNovelAiImageSettings, NOVELAI_IMAGE_PROVIDER, AUTO_ILLUSTRATION_TOOL_GROUP, DEFAULT_NOVELAI_COMPILER_INSTRUCTION, MAX_STORY_IMAGES } from '@shared/contracts/agent/novelAiImageSettings'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import Database from 'better-sqlite3'
import { DataBankRepository } from '@product-data/domain/databank/DataBankRepository'
export { DataBankRepository } from '@product-data/domain/databank/DataBankRepository'
export type { DataBankDocument, DataBankDocumentInput, DataBankChunk } from '@product-data/domain/databank/DataBankRepository'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { PersonaRepository } from '@product-data/domain/personas/PersonaRepository'
import { CharacterRepository } from '@product-data/domain/personas/CharacterRepository'
import { CharacterTransferService } from '@product-data/domain/characterTransfer/CharacterTransferService'
import { RegexRuleRepository } from '@product-data/domain/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '@product-data/domain/agentPresets/AgentPresetRepository'
import { ScriptLibraryRepository } from '@product-data/domain/scripts'
import { agentPresetExists } from '@product-data/domain/agentPresets'
import { characterExists } from '@product-data/domain/personas'
import type { ScriptLibrary, ScriptLibraryScope } from '@shared/contracts/scripts/schemas'
export type { ScriptLibrary, ScriptLibraryScope, ScriptTree } from '@shared/contracts/scripts/schemas'
export { decodeScriptLibrary } from '@product-data/domain/scripts'
import { ConversationArchiveRepository, ConversationRepository, MessageDisplayProjector, MessageRepository } from '@product-data/domain/conversations'
import { resolveConversationSeed } from '@product-data/domain/conversations/conversationSeed'
import { CreatorProjectRepository } from '@product-data/domain/creatorStudio/CreatorProjectRepository'
export { creatorCapabilities, creatorToolsets, creatorAuthoringInstructions } from '@product-data/domain/creatorStudio/capabilities'
import { FrontendIndex, FrontendProjectRepository } from '@product-data/domain/frontends'
import { SettingLibraryRepository } from '@product-data/domain/settingLibraries/SettingLibraryRepository'
import { GLOBAL_SETTING_LIBRARY_ID } from '@shared/contracts/settingLibrary/scope'
export { GLOBAL_SETTING_LIBRARY_ID } from '@shared/contracts/settingLibrary/scope'
import { VariableConfigRepository } from '@product-data/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '@product-data/domain/variables/VariableStateRepository'
import {
  resolveSettingLibraryCharacterCardMacros,
  resolveVariableContextCharacterCardMacros
} from '@product-data/domain/agent/CharacterCardMacroResolver'
import { mergeAgentPresetAndCharacterLibraries } from '@product-data/domain/agentPresets'
import { projectAgentPresetRuntimeContext, projectAgentPresetRuntimeSelection, disabledAgentPresetToolGroupIds } from '@product-data/domain/agentPresets/AgentPresetRuntime'
import {
  characterCardMacroValues,
  resolveCharacterCardMacros,
  resolveCharacterCardMacrosInJson,
  type CharacterCardMacroValues
} from '@shared/foundation/characterCardMacros'
import { buildVariableViewerTimeline } from '@shared/foundation/variables/viewerTimeline'
import { mvuMessageDisplayCompatibility } from '@eleckoi/compatibility-mvu'
import {
  transformCollectionSurface,
  transformWithRegexRules,
  validateRegexRule
} from '@shared/foundation/regex/RegexRuleProcessor'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { LocalMediaStore } from '@product-data/storage/media/LocalMediaStore'
import { schema } from '@product-data/storage/sqlite/schema'
import { agentConversations, chatSessions, characters, chatSessionCharacterSnapshots, conversationSpeakers } from '@product-data/storage/sqlite/schema/common'
import { CURRENT_SCHEMA_VERSION } from '@product-data/storage/sqlite/schemaVersion'
import { installSchema } from '@product-data/storage/sqlite/installSchema'
import { recoverInterruptedState } from '@product-data/storage/sqlite/recoverInterruptedState'
import type { CharacterCollection, CharacterRecord, Persona } from '@shared/contracts/entities/persona'
import type { ChatMessage } from '@shared/contracts/entities/chat'
import type { SettingLibrary, SettingLibraryEntryUpdate } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import { normalizeChatDisplaySettings as normalizeCanonicalChatDisplaySettings } from '@shared/contracts/settings/schemas'
import type { CreatorProjectCollection, CreatorProjectMode } from '@shared/contracts/creatorStudio/schemas'
import type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetExportFormat,
  AgentPresetExportResult,
  AgentPresetImportDocument,
  AgentPresetImportResult,
  AgentPresetImportSource,
  AgentPresetPurpose,
} from '@shared/contracts/presets/schemas'
import type {
  RegexRule,
  RegexRuleCollection,
  RegexRuleImportDocument,
  RegexRuleScope,
  RegexRuleTarget
} from '@shared/contracts/regex/schemas'
import type {
  CharacterExportFormat,
  CharacterExportResult,
  CharacterImportFile,
  CharacterImportPreview,
  CharacterImportResult,
  CharacterImportSource
} from '@shared/contracts/characters/transfer'
import { APP_DEFAULT_CHAT_BACKGROUND, normalizeNewCharacterBackground } from '@shared/contracts/characters/chatBackground'

class HostSqliteStore implements ElecKoiSqliteStore {
  readonly db: ElecKoiDatabase

  constructor(readonly native: Database.Database) {
    this.db = drizzle(native, { schema })
  }

  withWriteTx<TResult>(operation: (db: ElecKoiDatabase) => TResult): TResult {
    return this.native.transaction(() => operation(this.db)).immediate()
  }
}

class HostPersonaConversationSync {
  constructor(private readonly store: HostSqliteStore) {}

  refreshUserIdentity(identity: {
    name: string
    avatar: string
    square: string
    portrait: string
  }, db: ElecKoiDatabase): void {
    db.update(conversationSpeakers).set({ displayName: identity.name, avatarAssetId: identity.avatar })
      .where(eq(conversationSpeakers.sourceSpeakerId, 'user')).run()
    for (const snapshot of db.select().from(chatSessionCharacterSnapshots).all()) {
      const persona = parseJsonObject(snapshot.personaJson)
      const next = JSON.stringify({
        ...persona,
        user_name: identity.name,
        user_avatar: identity.avatar,
        user_square: identity.square,
        user_portrait: identity.portrait
      })
      if (next !== snapshot.personaJson) {
        db.update(chatSessionCharacterSnapshots).set({ personaJson: next })
          .where(eq(chatSessionCharacterSnapshots.sessionId, snapshot.sessionId)).run()
      }
    }
  }

  deleteForCharacter(characterId: string): void {
    const sessions = this.store.db.select({ id: chatSessions.id }).from(chatSessions)
      .where(eq(chatSessions.characterId, characterId)).all()
    for (const { id } of sessions) {
      this.store.native.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id)
      this.store.native.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
    }
  }

  refreshCharacterIdentity(characterId: string, identity: {
    name: string
    avatar: string
    square: string
    portrait: string
  }, db: ElecKoiDatabase): void {
    db.update(chatSessions).set({ characterName: identity.name, characterAvatar: identity.avatar })
      .where(eq(chatSessions.characterId, characterId)).run()
    db.update(conversationSpeakers).set({ displayName: identity.name, avatarAssetId: identity.avatar })
      .where(eq(conversationSpeakers.sourceSpeakerId, characterId)).run()
    const sessions = db.select({ id: chatSessions.id }).from(chatSessions)
      .where(eq(chatSessions.characterId, characterId)).all()
    for (const session of sessions) {
      const snapshot = db.select().from(chatSessionCharacterSnapshots)
        .where(eq(chatSessionCharacterSnapshots.sessionId, session.id)).get()
      if (!snapshot) continue
      const persona = parseJsonObject(snapshot.personaJson)
      const next = JSON.stringify({
        ...persona,
        assistant_name: identity.name,
        assistant_avatar: identity.avatar,
        assistant_square: identity.square,
        assistant_cover: identity.portrait
      })
      if (next !== snapshot.personaJson) {
        db.update(chatSessionCharacterSnapshots).set({ personaJson: next })
          .where(eq(chatSessionCharacterSnapshots.sessionId, session.id)).run()
      }
    }
  }
}

class ProductDataStore {
  private connection: Database.Database | undefined
  private databank: DataBankRepository | undefined
  private personas: PersonaRepository | undefined
  private characters: CharacterRepository | undefined
  private transfers: CharacterTransferService | undefined
  private settingLibraries: SettingLibraryRepository | undefined
  private variables: VariableConfigRepository | undefined
  private variableStates: VariableStateRepository | undefined
  private projects: CreatorProjectRepository | undefined
  private frontends: FrontendProjectRepository | undefined
  private presets: AgentPresetRepository | undefined
  private scripts: ScriptLibraryRepository | undefined
  private regexRules: RegexRuleRepository | undefined
  private store: HostSqliteStore | undefined
  private conversations: ConversationRepository | undefined
  private archives: ConversationArchiveRepository | undefined
  private messages: MessageRepository | undefined
  private mediaAssets: LocalMediaStore | undefined
  private readonly messageDisplayProjector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
  private displayUi: Record<string, unknown> = {}
  private tavernRuntimeSource:()=>Record<string,unknown>=()=>({})

  setTavernRuntimeSource(reader:()=>Record<string,unknown>):void {this.tavernRuntimeSource=reader}

  constructor(
    private readonly path: string | undefined,
    private readonly mediaRoot: string | undefined,
    private readonly workspaceRoot: string | undefined
  ) {}

  private databaseRepositories(): {
    settingLibraries: SettingLibraryRepository
    variables: VariableConfigRepository
    personas: PersonaRepository
    characters: CharacterRepository
    transfers: CharacterTransferService
    store: HostSqliteStore
  } {
    if (!this.settingLibraries || !this.variables || !this.personas || !this.characters || !this.transfers || !this.store) {
      const connection = openProductDatabase(this.path)
      const store = new HostSqliteStore(connection)
      const media = new LocalMediaStore(requireMediaRoot(this.mediaRoot))
      const conversationSync = new HostPersonaConversationSync(store)
      this.connection = connection
      this.store = store
      this.messages = new MessageRepository(store)
      this.mediaAssets = media
      this.personas = new PersonaRepository(store, conversationSync, media)
      this.settingLibraries = new SettingLibraryRepository(store)
      this.variables = new VariableConfigRepository(store)
      this.variableStates = new VariableStateRepository(store, this.variables)
      this.conversations = new ConversationRepository(
        store,
        (characterId, db) => resolveConversationSeed(
          characterId,
          db,
          this.settingLibraries!,
          this.variables!
        )
      )
      this.archives = new ConversationArchiveRepository(store)
      this.characters = new CharacterRepository(
        store,
        conversationSync,
        media,
        () => normalizeNewCharacterBackground(this.displayUi.new_character_background) === 'app'
          ? APP_DEFAULT_CHAT_BACKGROUND
          : ''
      )
      try { this.scripts = new ScriptLibraryRepository(store, { character: characterExists, preset: agentPresetExists }) }
      catch (error) { this.close(); throw error }
      const presets = new AgentPresetRepository(store, media, this.scripts)
      presets.ensureInitialized()
      this.presets = presets
      this.regexRules = new RegexRuleRepository(store, presets)
      this.transfers = new CharacterTransferService(
        store,
        this.characters,
        this.settingLibraries,
        this.variables,
        this.regexRules,
        media,
        this.scripts
      )
    }
    return {
      personas: this.personas,
      characters: this.characters,
      transfers: this.transfers,
      settingLibraries: this.settingLibraries,
      variables: this.variables,
      store: this.store
    }
  }

  private withPrimaryOpenings(collection: CharacterCollection): CharacterCollection {
    const settingLibraries = this.databaseRepositories().settingLibraries
    return {
      ...collection,
      items: collection.items.map((character) => ({
        ...character,
        primaryOpening: settingLibraries.primaryOpening(character.id)
      }))
    }
  }

  readCharacters(): CharacterCollection {
    return this.withPrimaryOpenings(this.databaseRepositories().characters.get())
  }

  dataBank(): DataBankRepository {
    if (!this.databank) this.databank = new DataBankRepository(this.databaseRepositories().store.native)
    return this.databank
  }

  frontendProjects(): FrontendProjectRepository {
    if (!this.frontends) {
      if (!this.path || !isAbsolute(this.path)) throw new Error('Frontend projects require the product data directory')
      const index = new FrontendIndex(join(dirname(this.path), 'author-frontends'))
      this.frontends = new FrontendProjectRepository(index, id => characterExists(this.databaseRepositories().store.db, id))
    }
    this.frontends.recoverCharacterDeletions()
    return this.frontends
  }

  setDisplayPreferences(value: unknown): void {
    this.displayUi = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  }

  prepareDisplayUi(value: Record<string, unknown>): {
    value: Record<string, unknown>
    commit(): void
    rollback(): void
  } {
    this.databaseRepositories()
    const wallpaper = isRecord(value.global_chat_wallpaper) ? value.global_chat_wallpaper : undefined
    if (!wallpaper) return { value: { ...value }, commit() {}, rollback() {} }
    const media = this.mediaAssets!.prepareImage(
      'appearance/global',
      'chat-background',
      typeof wallpaper.image === 'string' ? wallpaper.image : ''
    )
    return {
      value: {
        ...value,
        global_chat_wallpaper: { ...wallpaper, image: media.reference }
      },
      commit: () => media.commit(),
      rollback: () => media.rollback()
    }
  }

  runtimeSessionId(conversationId: string): string {
    this.databaseRepositories()
    const row = this.store!.db.select({ runtimeThreadId: agentConversations.runtimeThreadId })
      .from(agentConversations).where(eq(agentConversations.id, conversationId)).get()
    if (!row?.runtimeThreadId) throw new Error('找不到聊天对应的 DSH Session。')
    return row.runtimeThreadId
  }

  exportConversationArchive(conversationId: string) {
    this.databaseRepositories()
    return this.archives!.export(conversationId)
  }

  parseConversationArchive(value: unknown) {
    this.databaseRepositories()
    return this.archives!.parse(value)
  }

  conversationArchiveRuntimeSessionIds(snapshot: Parameters<ConversationArchiveRepository['runtimeThreadIds']>[0]) {
    this.databaseRepositories()
    return this.archives!.runtimeThreadIds(snapshot)
  }

  requiredConversationArchiveRuntimeSessionIds(snapshot: Parameters<ConversationArchiveRepository['requiredRuntimeThreadIds']>[0]) {
    this.databaseRepositories()
    return this.archives!.requiredRuntimeThreadIds(snapshot)
  }

  importConversationArchive(
    snapshot: Parameters<ConversationArchiveRepository['import']>[0],
    characterId: string,
    runtimeIds: ReadonlyMap<string, string>,
    conversationId: string,
    options?: { preserveIds?: boolean }
  ) {
    this.databaseRepositories()
    return this.archives!.import(snapshot, characterId, runtimeIds, conversationId, options)
  }

  snapshotConversationRuntime(conversationId: string) {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    return {
      variableStateJson: this.variableStates!.viewerStates(conversationId).currentStateJson,
      settingLibraryStateJson: this.settingLibraries!.snapshotConversationRuntimeState(conversationId)
    }
  }

  readRuntimeVariableHistory(conversationId: string, runtimeSessionId: string) {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    return this.messages!.runtimeVariableSnapshots(conversationId, runtimeSessionId)
  }

  validateConversationRuntimeSnapshot(snapshot: {
    variableStateJson: string
    settingLibraryStateJson: string
  }): void {
    this.databaseRepositories()
    const variables = JSON.parse(snapshot.variableStateJson)
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      throw new Error('聊天变量状态快照格式不正确。')
    }
    this.settingLibraries!.parseConversationRuntimeState(snapshot.settingLibraryStateJson)
  }

  restoreConversationRuntime(conversationId: string, snapshot: {
    variableStateJson: string
    settingLibraryStateJson: string
  }): void {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    this.validateConversationRuntimeSnapshot(snapshot)
    this.store!.withWriteTx((db) => {
      this.variableStates!.replaceCurrent(conversationId, snapshot.variableStateJson, db)
      this.settingLibraries!.restoreConversationRuntimeState(
        conversationId,
        snapshot.settingLibraryStateJson,
        db
      )
    })
  }

  readConversationCatalog() {
    this.databaseRepositories()
    return this.conversations!.list().map(({ conversation, metadata }) => {
      const persona = metadata.characterPersona
      return {
        ...conversation,
        metadata: {
          characterId: metadata.characterId,
          characterName: metadata.characterName,
          characterAvatar: metadata.characterAvatar,
          characterPersona: {
            assistant_name: stringValue(persona.assistant_name) || metadata.characterName,
            assistant_avatar: stringValue(persona.assistant_avatar) || metadata.characterAvatar,
            assistant_square: stringValue(persona.assistant_square),
            assistant_cover: stringValue(persona.assistant_cover),
            image_prompt: optionalString(persona.image_prompt),
            opening: optionalString(persona.opening),
            show_opening: optionalBoolean(persona.show_opening),
            user_name: optionalString(persona.user_name),
            user_avatar: optionalString(persona.user_avatar),
            user_square: optionalString(persona.user_square),
            user_portrait: optionalString(persona.user_portrait)
          }
        },
        runtimeSessionId: this.runtimeSessionId(conversation.id)
      }
    })
  }

  saveImportedTranscript(conversationId: string, messages: Array<{
    role: 'user' | 'assistant'; content: string; variableStateJson?: string; id: string; sessionEventSeq: number; turn: number | null
  }>, opening?: { content: string; variableStateJson?: string }, currentVariableStateJson?: string): void {
    this.databaseRepositories()
    const sessionId = this.runtimeSessionId(conversationId)
    this.store!.withWriteTx(() => {
      this.conversations!.restoreImportedOpening(conversationId, opening)
      if (opening?.variableStateJson !== undefined) this.variableStates!.replaceCurrent(conversationId, opening.variableStateJson)
      let userTurn: string | undefined
      for (const item of messages) {
        if (item.variableStateJson !== undefined) this.variableStates!.replaceCurrent(conversationId, item.variableStateJson)
        if (item.role === 'assistant' && !userTurn) throw new Error('导入的回复没有对应用户轮次。')
        const message = this.messages!.create(conversationId, item.role, item.content, 'complete', undefined, sessionId)
        if (item.role === 'user') userTurn = message.turnId
        else {
          this.messages!.bindHistoricalDshTurn(conversationId, message.id, sessionId, item.turn!)
          this.store!.native.prepare('DELETE FROM agent_pending_inputs WHERE turnId=?').run(message.turnId!)
        }
      }
      if (currentVariableStateJson !== undefined) this.variableStates!.replaceCurrent(conversationId, currentVariableStateJson)
    })
  }

  readConversationDetails(conversationId: string, beforeSequence?: number, limit = 50) {
    this.databaseRepositories()
    const conversation = this.conversations!.get(conversationId)
    const page = this.messages!.pageMetadata(conversationId, beforeSequence, limit)
    return {
      conversation,
      metadata: this.conversations!.getMetadata(conversationId),
      runtimeSessionId: this.runtimeSessionId(conversationId),
      messages: page.messages.map(({
        content,
        displayContent,
        process: _process,
        turnUsage: _turnUsage,
        inputImageAttachments: _inputImageAttachments,
        inputFileAttachments: _inputFileAttachments,
        dshMessageId: _dshMessageId,
        ...message
      }) => ({
        ...message,
        ...(message.id === 'opening' ? { content, displayContent } : {})
      })),
      hasMore: page.hasMore,
      beforeSequence: page.beforeSequence
    }
  }

  projectConversationMessages(
    conversationId: string,
    messages: Array<Pick<ChatMessage, 'id' | 'role' | 'content' | 'variableStateJson' | 'status' | 'createdAt'>>
  ) {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    const metadata = this.conversations!.getMetadata(conversationId)
    const macroValues = characterCardMacroValues(metadata, metadata.characterPersona.user_name)
    const collection: RegexRuleCollection = metadata.characterId
      ? this.requireRegexRules().get(metadata.characterId)
      : {
          characterId: conversationId,
          agentPresetId: '',
          agentPresetName: '',
          agentPresetRegexRevision: '0'.repeat(64),
          globalRules: [],
          agentPresetRules: [],
          characterRules: [],
          versions: [],
          activeVersionId: '',
          revision: 0
        }
    return messages.map((input, index) => {
      const projected = this.messageDisplayProjector.project({
        ...input,
        conversationId
      }, collection, macroValues, messages.length - index - 1)
      return {
        id: input.id,
        sourceContent: input.content,
        displayContent: projected.displayContent ?? projected.content,
        variableStateJson: projected.variableStateJson
      }
    })
  }

  readVariableTimeline(conversationId: string, sessionMessages: Array<Pick<ChatMessage, 'id' | 'conversationId' | 'role' | 'content' | 'variableStateJson' | 'status' | 'createdAt'>> = []) {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    const state = this.variableStates!.viewerStates(conversationId)
    const metadata = this.conversations!.getMetadata(conversationId)
    const macroValues = characterCardMacroValues(metadata, metadata.characterPersona.user_name)
    const initialStateJson = macroValues
      ? resolveCharacterCardMacrosInJson(state.initialStateJson, macroValues)
      : state.initialStateJson
    const currentStateJson = macroValues
      ? resolveCharacterCardMacrosInJson(state.currentStateJson, macroValues)
      : state.currentStateJson
    // Keep the product opening and its snapshots available even when the DSH
    // transcript is unavailable; normal reply snapshots are supplied by the
    // official Session projection above.
    const ledgerMessages = this.messages!.listMetadata(conversationId)
    // Normal DSH replies are authoritative in the Session log and are joined
    // by the Client projection. Keep the product opening, then use that same
    // official message projection for the later floors instead of expecting
    // a response row that the DSH Session owns.
    const messages = sessionMessages.length > 0
      ? [...ledgerMessages.filter((message) => message.id === 'opening'), ...sessionMessages]
      : ledgerMessages
    const projected = metadata.characterId
      ? messages.map((message) => this.messageDisplayProjector.project(
          { ...message, conversationId },
          this.requireRegexRules().get(metadata.characterId),
          macroValues
        ))
      : messages
    return buildVariableViewerTimeline(projected, initialStateJson, currentStateJson)
  }

  readAuthorConversationState(conversationId: string) {
    this.databaseRepositories()
    const metadata = this.conversations!.getMetadata(conversationId)
    const characterId = metadata.characterId
    const macroValues = characterCardMacroValues(metadata, metadata.characterPersona.user_name)
    const states = this.variableStates!.viewerStates(conversationId)
    if (!characterId) {
      return {
        initialVariableStateJson: states.initialStateJson,
        currentVariableStateJson: states.currentStateJson,
        variableConfig: null,
        settingLibrarySummary: null,
        settingLibrary: null
      }
    }
    const library = this.settingLibraries!.get(characterId)
    const runtimeLibrary = resolveSettingLibraryCharacterCardMacros(
      this.settingLibraries!.runtimeContext(conversationId, { characterId }),
      macroValues
    )
    return {
      initialVariableStateJson: states.initialStateJson,
      currentVariableStateJson: states.currentStateJson,
      variableConfig: this.variables!.forConversation(conversationId, characterId),
      settingLibrarySummary: {
        characterId: library.characterId,
        name: library.name,
        activeVersionId: library.activeVersionId,
        entryCount: library.entries.length,
        groupCount: library.groups.length
      },
      settingLibrary: runtimeLibrary ?? null
    }
  }

  replaceConversationVariableState(conversationId: string, stateJson: string): string {
    this.databaseRepositories()
    this.conversations!.get(conversationId)
    return this.variableStates!.replaceCurrent(conversationId, stateJson)
  }

  updateConversationVariables(conversationId: string, stateJson: string): string {
    this.databaseRepositories()
    const metadata = this.conversations!.getMetadata(conversationId)
    return this.variableStates!.replaceAuthored(conversationId, metadata.characterId, stateJson)
  }

  createConversation(input: Parameters<ConversationRepository['create']>[0]) {
    this.databaseRepositories()
    const created = this.conversations!.create(input)
    return this.readConversationDetails(created.conversation.id)
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.databaseRepositories()
    await this.conversations!.delete(conversationId)
  }

  listInputImageReferences() {
    this.databaseRepositories()
    return this.messages!.listInputImageReferences()
  }

  normalizeChatDisplaySettings(value: unknown): unknown {
    return normalizeCanonicalChatDisplaySettings(value)
  }

  renameConversation(conversationId: string, title: string) {
    this.databaseRepositories()
    this.conversations!.rename(conversationId, title)
    return this.readConversationDetails(conversationId)
  }

  selectConversationOpening(conversationId: string, openingId: string) {
    this.databaseRepositories()
    this.conversations!.selectOpening(conversationId, openingId)
    return this.readConversationDetails(conversationId)
  }

  updateConversationOpening(conversationId: string, content: string) {
    this.databaseRepositories()
    this.conversations!.updateOpening(conversationId, content)
    return this.readConversationDetails(conversationId)
  }

  prepareConversationRuntime(conversationId: string, text: string, options: { preset?: AgentPreset; persona?: Record<string, unknown>; characterId?: string } = {}) {
    this.databaseRepositories()
    const metadata=this.conversations!.getMetadata(conversationId), compatibility=this.tavernRuntimeSource()
    const currentPresetId=this.requirePresets().catalog().activePresetIds.roleplay, draft=isRecord(compatibility.presetDraft)?compatibility.presetDraft:{}
    const effectivePreset=options.preset??(draft.loadedId===currentPresetId&&isRecord(draft.preset)?structuredClone(draft.preset) as unknown as AgentPreset:undefined)
    const presetFields=isRecord(compatibility.presetFields)?compatibility.presetFields:{}
    const selectedFields=!options.preset&&draft.loadedId===currentPresetId&&isRecord(draft.fields)?draft.fields:presetFields[options.preset?.id??currentPresetId]
    const generationParameters=isRecord(selectedFields)&&isRecord(selectedFields.settings)?structuredClone(selectedFields.settings):undefined
    if (options.characterId) {
      const character = this.readCharacters().items.find(item => item.id === options.characterId)
      if (!character) throw new Error(`群聊成员不存在：${options.characterId}`)
      metadata.characterId = character.id; metadata.characterName = typeof character.name === 'string' ? character.name : character.id
      metadata.characterAvatar = typeof character.avatar === 'string' ? character.avatar : ''
      metadata.characterPersona = { ...metadata.characterPersona, ...(isRecord(character.persona) ? character.persona : {}) }
    }
    const personas=isRecord(compatibility.personas)?compatibility.personas:{}
    const connected=Object.values(personas).find(value=>isRecord(value)&&Array.isArray(value.connections)&&value.connections.some(connection=>isRecord(connection)&&connection.type==='character'&&connection.id===metadata.characterId))
    const activePersonaId=stringValue(compatibility.activePersonaId)||'default'
    const activePersona=isRecord(connected)?connected:isRecord(personas[activePersonaId])?personas[activePersonaId] as Record<string,unknown>:{}
    const persona={...activePersona,...options.persona}
    if(Object.keys(persona).length)metadata.characterPersona={...metadata.characterPersona,...persona,user_name:stringValue(persona.name)||metadata.characterPersona.user_name,user_avatar:stringValue(persona.avatar)||metadata.characterPersona.user_avatar}
    const personaBook = stringValue(persona.lorebook), globalLibrary = this.readGlobalSettingLibrary()
    const personaBookGroup = globalLibrary.groups.find(group => group.sillyTavern?.worldbook === true && group.name === personaBook)
    const nativePersonaBook = /\[([^\]]+)\]$/.exec(personaBook)?.[1]
    const personaBookKey = !personaBook ? undefined : personaBook === globalLibrary.name ? `native:${GLOBAL_SETTING_LIBRARY_ID}` : personaBookGroup ? `folder:${personaBookGroup.id}` : nativePersonaBook ? `native:${nativePersonaBook}` : undefined
    const characterBinding = { characterId: metadata.characterId, ...(personaBookKey ? { worldbookKeys: [personaBookKey] } : {}) }
    const macroValues = characterCardMacroValues(metadata, metadata.characterPersona.user_name)
    const variableContext = resolveVariableContextCharacterCardMacros(
      this.variableStates?.runtimeContext(conversationId, characterBinding),
      macroValues
    )
    const regexRules = metadata.characterId
      ? this.requireRegexRules().get(metadata.characterId)
      : undefined
    if(regexRules&&effectivePreset)regexRules.agentPresetRules=effectivePreset.regexRules
    const preset = this.requirePresets()
    const disabledToolGroupIds=effectivePreset?disabledAgentPresetToolGroupIds(effectivePreset):preset.disabledToolGroupIds()
    const rawSettingLibrary = mergeAgentPresetAndCharacterLibraries(
      effectivePreset?projectAgentPresetRuntimeContext(effectivePreset):preset.runtimeContext(),
      this.settingLibraries!.runtimeContext(conversationId, characterBinding)
    )
    const macroSettingLibrary = resolveSettingLibraryCharacterCardMacros(rawSettingLibrary, macroValues)
    const settingLibrary = macroSettingLibrary && regexRules
      ? {
          ...macroSettingLibrary,
          entries: macroSettingLibrary.entries.map((entry) => ({
            ...entry,
            content: transformCollectionSurface(entry.content, regexRules, 'SettingContent', 'Prompt')
          }))
        }
      : macroSettingLibrary
    const opening = this.conversations!.openingText(conversationId)
    const history = opening.trim()
      ? [{
          role: 'assistant' as const,
          content: runtimeText(opening, macroValues, regexRules, 'AiOutput')
        }]
      : []
    const currentPromptText = runtimeText(text, macroValues, regexRules, 'UserInput')
    const characterFields = isRecord(compatibility.characterFields) && isRecord(compatibility.characterFields[metadata.characterId])
      ? compatibility.characterFields[metadata.characterId] as Record<string, unknown> : {}
    const cardFields = { ...(isRecord(characterFields.data) ? characterFields.data : {}), ...characterFields }
    const chatMetadata = isRecord(compatibility.chatMetadata) && isRecord(compatibility.chatMetadata[conversationId])
      ? compatibility.chatMetadata[conversationId] as Record<string, unknown> : {}
    const note = isRecord(chatMetadata.author_note) ? chatMetadata.author_note : undefined
    const runtimePreset = effectivePreset ?? this.readAgentPreset(currentPresetId)
    const savedPromptFields = isRecord(selectedFields) && isRecord(selectedFields.promptFields) ? selectedFields.promptFields : {}
    const compatiblePreset = (isRecord(selectedFields) && selectedFields.compatibility === true)
      || runtimePreset.entries.some(entry => isRecord(entry.sillyTavern?.presetPrompt))
    const compatiblePrompts = compatiblePreset ? runtimePreset.entries.map(entry => {
      const savedPrompt = savedPromptFields[entry.id]
      const entryPrompt = entry.sillyTavern?.presetPrompt
      const preserved = { ...(isRecord(savedPrompt) ? savedPrompt : {}),
        ...(isRecord(entryPrompt) ? entryPrompt : {}) }
      return { ...preserved, id: entry.id, name: entry.title, role: entry.insertRole, enabled: entry.enabled,
        content: runtimeText(entry.content, macroValues, regexRules, 'SettingContent'),
        position: isRecord(preserved.position) ? preserved.position : { type: 'relative' } }
    }) : []
    const compatibleCard = { description: settingLibrary?.entries.find(entry => entry.id === 'tavern-character-description')?.content
        ?? runtimeText(stringValue(cardFields.description), macroValues, regexRules, 'SettingContent'),
      personality: runtimeText(stringValue(cardFields.personality), macroValues, regexRules, 'SettingContent'),
      scenario: runtimeText(stringValue(cardFields.scenario), macroValues, regexRules, 'SettingContent'),
      mes_example: runtimeText(stringValue(cardFields.mes_example), macroValues, regexRules, 'SettingContent'),
      system_prompt: runtimeText(stringValue(cardFields.system_prompt), macroValues, regexRules, 'SettingContent'),
      post_history_instructions: runtimeText(stringValue(cardFields.post_history_instructions), macroValues, regexRules, 'SettingContent') }
    return {
      conversationId,
      runtimeSessionId: this.runtimeSessionId(conversationId),
      promptTextContext: { macros: macroValues, rules: regexRules },
      variableContext,
      conversationContext: {
        characterId: metadata.characterId,
        characterName: metadata.characterName,
        characterDescription: settingLibrary?.entries.find(entry => entry.id === 'tavern-character-description')?.content ?? stringValue(cardFields.description),
        characterPersonality: stringValue(cardFields.personality),
        characterDepthPrompt: stringValue(isRecord(cardFields.extensions) && isRecord(cardFields.extensions.depth_prompt) ? cardFields.extensions.depth_prompt.prompt : ''),
        scenario: stringValue(cardFields.scenario),
        creatorNotes: stringValue(cardFields.creator_notes),
        personaDescription: stringValue(persona.description),
        ...(note ? { authorNote: {
          content: runtimeText(stringValue(note.content), macroValues, regexRules, 'SettingContent'),
          role: note.role === 1 ? 'user' : note.role === 2 ? 'assistant' : 'system',
          position: Number(note.position) === -1 ? 'none' : Number(note.position) === 0 ? 'in_prompt' : Number(note.position) === 2 ? 'before_prompt' : 'in_chat',
          depth: Math.max(0, Number(note.depth) || 0), order: Number(note.order) || 0,
          frequency: note.frequency === undefined ? 1 : Math.max(0, Math.trunc(Number(note.frequency) || 0))
        } } : {}),
        persona: metadata.characterPersona,
        history,
        historyMode: 'prefix' as const,
        currentPromptText,
        ...(generationParameters?{generationParameters}:{}),
        ...(compatiblePreset ? { compatibilityPreset: { compatibility: true, id: runtimePreset.id, name: runtimePreset.name,
          settings: generationParameters ?? {}, prompts: compatiblePrompts }, compatibilityCard: { data: compatibleCard },
          compatibilityPersona: { ...persona, description: runtimeText(stringValue(persona.description), macroValues, regexRules, 'SettingContent') } } : {}),
        promptContributions:stringValue(persona.description)?[{id:`persona:${stringValue(persona.avatar_id)||stringValue(compatibility.activePersonaId)}`,content:runtimeText(stringValue(persona.description),macroValues,regexRules,'SettingContent'),
          role:persona.role===1?'user' as const:persona.role===2?'assistant' as const:'system' as const,anchor:Number(persona.position)===0?'insert_point_2':'chat_depth',depth:Math.max(0,Number(persona.depth)||0),order:0,title:stringValue(persona.title)||'用户资料'}]:[],
        ...(settingLibrary ? { settingLibrary } : {})
      },
      disabledToolGroupIds,
      agentPreset:effectivePreset?projectAgentPresetRuntimeSelection(effectivePreset):preset.runtimeSelection(),
      settingLibraryBaseline: rawSettingLibrary && settingLibrary
        ? { source: rawSettingLibrary, projected: settingLibrary }
        : undefined
    }
  }

  /** Use the existing card macro and regex services for group field projection. */
  projectSettingPromptText(source: string, preparation: { promptTextContext: { macros?: CharacterCardMacroValues; rules?: RegexRuleCollection } },
    options: { characterName?: string; stage?: 'macros' | 'regex'; depth?: number } = {}): string {
    const macros = preparation.promptTextContext.macros && { ...preparation.promptTextContext.macros,
      ...(options.characterName === undefined ? {} : { characterName: options.characterName }) }
    const rules = preparation.promptTextContext.rules
    if (options.stage === 'macros') return macros ? resolveCharacterCardMacros(source, macros) : source
    if (options.stage !== 'regex') return runtimeText(source, macros, rules, 'SettingContent', options.depth)
    return rules ? transformCollectionSurface(source, rules, 'SettingContent', 'Prompt', {
      ...(options.depth === undefined ? {} : { depth: options.depth }),
      expandMacros: (value, escape) => macros ? resolveCharacterCardMacros(value, {
        userName: escape?.(macros.userName) ?? macros.userName,
        characterName: escape?.(macros.characterName) ?? macros.characterName
      }) : value
    }) : source
  }

  projectConversationPromptHistory<T extends { role: string; content: string }>(
    history: readonly T[],
    preparation: { promptTextContext: { macros?: CharacterCardMacroValues; rules?: RegexRuleCollection } }
  ): T[] {
    const { macros, rules } = preparation.promptTextContext
    // The pending input is depth zero; the latest saved message is depth one.
    // Keep identities, speaker bindings, attachments and extension fields intact.
    return history.map((message, index) => ({
      ...message,
      content: message.role === 'user' || message.role === 'assistant'
        ? runtimeText(message.content, macros, rules, message.role === 'user' ? 'UserInput' : 'AiOutput', history.length - index)
        : message.content
    }))
  }

  commitConversationRuntime(
    conversationId: string,
    variableStateJson: string | undefined,
    settingLibraryStateJson: string | undefined,
    settingLibraryBaseline: {
      source: NonNullable<ReturnType<SettingLibraryRepository['runtimeContext']>>
      projected: NonNullable<ReturnType<SettingLibraryRepository['runtimeContext']>>
    } | undefined,
    expectedVariableStateJson?: string
  ): void {
    this.databaseRepositories()
    const characterBinding = this.conversations!.getCharacterBinding(conversationId)
    this.store!.withWriteTx((db) => {
      if (expectedVariableStateJson !== undefined && variableStateJson !== undefined
        && this.variableStates!.viewerStates(conversationId).currentStateJson !== expectedVariableStateJson) {
        throw new Error('生成期间聊天变量已被其他操作修改，未覆盖当前变量。')
      }
      if (variableStateJson !== undefined) {
        this.variableStates!.replaceCurrent(conversationId, variableStateJson, db)
      }
      if (settingLibraryStateJson !== undefined && settingLibraryBaseline !== undefined) {
        this.settingLibraries!.replaceConversationRuntimeState(
          conversationId,
          settingLibraryStateJson,
          { characterId: settingLibraryBaseline.source.characterId || characterBinding.characterId },
          settingLibraryBaseline,
          db
        )
      }
    })
  }

  createCharacter(character: CharacterRecord): CharacterCollection {
    return this.withPrimaryOpenings(this.databaseRepositories().characters.create(character))
  }

  updateCharacter(character: CharacterRecord): CharacterCollection {
    return this.withPrimaryOpenings(this.databaseRepositories().characters.update(character))
  }

  selectCharacter(characterId: string): CharacterCollection {
    return this.withPrimaryOpenings(this.databaseRepositories().characters.select(characterId))
  }

  saveCharacterGroups(groups: string[], assignments: Array<{ characterId: string; group: string }>): CharacterCollection {
    return this.withPrimaryOpenings(this.databaseRepositories().characters.saveGroups(groups, assignments))
  }

  deleteCharacters(characterIds: string[], options: { deleteChats?: boolean } = {}): CharacterCollection {
    const { characters } = this.databaseRepositories()
    const current = characters.get(), removed = new Set(characterIds)
    try {
      const result = this.frontendProjects().deleteCharacterOwners(current.items.filter(item => removed.has(item.id)).map(item => item.id), () => this.scripts!.transaction(db => {
        for (const id of removed) this.scripts!.deleteOwnerInTransaction('character', id, db)
        return characters.replaceAll({ ...current, items: current.items.filter(item => !removed.has(item.id)) }, db, options)
      }))
      characters.commitMediaChanges()
      return this.withPrimaryOpenings(result)
    } catch (error) { characters.rollbackMediaChanges(); throw error }
  }

  exportCharacter(characterId: string, format: CharacterExportFormat): CharacterExportResult {
    return this.databaseRepositories().transfers.export(characterId, format)
  }

  prepareCharacterImports(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview {
    return this.databaseRepositories().transfers.prepare(files, source)
  }

  commitCharacterImports(token: string): CharacterImportResult {
    const result = this.databaseRepositories().transfers.commit(token)
    return { ...result, collection: this.withPrimaryOpenings(result.collection) }
  }

  discardCharacterImports(token: string): void {
    this.databaseRepositories().transfers.discard(token)
  }

  private projectRepository(): CreatorProjectRepository {
    this.projects ??= new CreatorProjectRepository(requireWorkspaceRoot(this.workspaceRoot))
    return this.projects
  }

  readPersona(): Persona {
    return this.databaseRepositories().personas.get()
  }

  savePersona(profile: Persona): Persona {
    return this.databaseRepositories().personas.save(profile)
  }

  readSettingLibrary(characterId: string): SettingLibrary {
    return this.databaseRepositories().settingLibraries.get(characterId)
  }

  readGlobalSettingLibrary(): SettingLibrary { return this.readSettingLibrary(GLOBAL_SETTING_LIBRARY_ID) }

  saveGlobalSettingLibrary(library: SettingLibrary): SettingLibrary {
    return this.saveSettingLibrary(GLOBAL_SETTING_LIBRARY_ID, library)
  }

  replaceGlobalSettingLibraryContent(library: Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>): SettingLibrary {
    return this.replaceSettingLibraryContent(GLOBAL_SETTING_LIBRARY_ID, library)
  }

  updateGlobalSettingLibraryEntries(updates: SettingLibraryEntryUpdate[]) {
    return this.updateSettingLibraryEntries(GLOBAL_SETTING_LIBRARY_ID, updates)
  }

  saveGlobalSettingLibraryViewState(expandedGroupIds: string[]): string[] {
    return this.saveSettingLibraryViewState(GLOBAL_SETTING_LIBRARY_ID, expandedGroupIds)
  }

  replaceSettingLibraryContent(
    characterId: string,
    library: Pick<SettingLibrary, 'characterId' | 'name' | 'entries' | 'groups' | 'promptPositions'>
  ): SettingLibrary {
    return this.databaseRepositories().settingLibraries.replaceContent(characterId, library)
  }

  updateSettingLibraryEntries(characterId: string, updates: SettingLibraryEntryUpdate[]) {
    return this.databaseRepositories().settingLibraries.updateEntries(characterId, updates)
  }

  saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary {
    return this.databaseRepositories().settingLibraries.save(characterId, library)
  }

  saveSettingLibraryViewState(characterId: string, expandedGroupIds: string[]): string[] {
    return this.databaseRepositories().settingLibraries.saveViewState(characterId, expandedGroupIds)
  }

  readConversationSettingLibraries(characterId: string) {
    const repositories = this.databaseRepositories()
    return this.conversations!.list()
      .filter(({ metadata }) => metadata.characterId === characterId)
      .flatMap(({ conversation, metadata }) => {
        const library = repositories.settingLibraries.conversationLibrary(characterId, conversation.id)
        return library ? [{
          sessionId: conversation.id,
          title: conversation.title,
          characterName: metadata.characterName,
          characterAvatar: metadata.characterAvatar,
          summary: conversation.preview,
          updatedAt: conversation.updatedAt,
          library
        }] : []
      })
  }

  saveConversationSettingLibrary(characterId: string, conversationId: string, library: SettingLibrary): SettingLibrary {
    this.requireStoryConversation(characterId, conversationId)
    const repository = this.databaseRepositories().settingLibraries
    if (!repository.conversationLibrary(characterId, conversationId)) {
      throw new Error('该聊天尚未产生分支设定。只有设定修改工具成功提交变更后才能编辑。')
    }
    return repository.replaceConversationLibrary(characterId, conversationId, library)
  }

  resetConversationSettingLibrary(characterId: string, conversationId: string): void {
    this.requireStoryConversation(characterId, conversationId)
    this.databaseRepositories().settingLibraries.deleteConversationChanges(characterId, conversationId)
  }

  saveConversationSettingLibraryVersion(characterId: string, conversationId: string, name: string): SettingLibrary {
    this.requireStoryConversation(characterId, conversationId)
    return this.databaseRepositories().settingLibraries.saveConversationAsVersion(characterId, conversationId, name)
  }

  private requireStoryConversation(characterId: string, conversationId: string): void {
    this.databaseRepositories()
    if (this.conversations!.getCharacterBinding(conversationId).characterId !== characterId) {
      throw new Error('这段对话不属于当前故事角色。')
    }
  }

  readVariableConfig(characterId: string): VariableConfig {
    return this.databaseRepositories().variables.get(characterId)
  }

  saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig {
    return this.databaseRepositories().variables.save(characterId, config)
  }

  saveVariableConfigViewState(characterId: string, expandedObjectIds: string[]): string[] {
    return this.databaseRepositories().variables.saveViewState(characterId, expandedObjectIds)
  }

  readRegexRules(characterId: string): RegexRuleCollection {
    this.databaseRepositories()
    return this.requireRegexRules().get(characterId)
  }

  readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary {
    this.databaseRepositories()
    return this.scripts!.get(scope, ownerId)
  }

  readScriptWorkspace(scope: ScriptLibraryScope, ownerId: string) {
    this.databaseRepositories()
    return this.scripts!.workspace(scope, ownerId)
  }

  readScriptAsset(scope: ScriptLibraryScope, ownerId: string, version: string, file: string): Uint8Array {
    this.databaseRepositories()
    return this.scripts!.asset(scope, ownerId, version, file)
  }

  watchScriptSources(changed: () => void): () => void {
    this.databaseRepositories()
    return this.scripts!.files.watch(changed)
  }

  saveScriptLibrary(library: ScriptLibrary): ScriptLibrary {
    this.databaseRepositories()
    return this.scripts!.save(library)
  }

  updateScriptSettings(scope: ScriptLibraryScope, ownerId: string, scriptId: string,
    target: 'script' | 'library', values: Record<string, unknown>, expectedRevision: number): ScriptLibrary {
    this.databaseRepositories()
    return this.scripts!.updateSettings(scope, ownerId, scriptId, target, values, expectedRevision)
  }

  saveScriptLibraries(libraries: ScriptLibrary[]): ScriptLibrary[] {
    this.databaseRepositories()
    return this.scripts!.saveAll(libraries)
  }

  saveRegexRules(characterId: string, collection: RegexRuleCollection, expectedRevision: number): RegexRuleCollection {
    this.databaseRepositories()
    return this.requireRegexRules().save(characterId, collection, expectedRevision)
  }

  importRegexRules(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ) {
    this.databaseRepositories()
    return this.requireRegexRules().import(characterId, fallbackScope, documents, expectedRevision)
  }

  exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string } {
    this.databaseRepositories()
    return this.requireRegexRules().export(characterId, ruleIds)
  }

  testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget): {
    output: string
    validationMessage: string | null
  } {
    return {
      output: transformWithRegexRules(text, [rule], target),
      validationMessage: validateRegexRule(rule)
    }
  }

  readAgentPresetCatalog(): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().catalog()
  }

  readAgentPreset(presetId: string): AgentPreset {
    this.databaseRepositories()
    return this.requirePresets().get(presetId)
  }

  creatorPresetRuntime(presetId: string) {
    const preset = this.readAgentPreset(presetId)
    if (preset.purpose !== 'creator') throw new Error('AI 创作工作室只能使用创作预设。')
    return { preset, settingLibrary: projectAgentPresetRuntimeContext(preset) }
  }

  updateAgentPresetEntries(presetId: string, updates: SettingLibraryEntryUpdate[]) {
    this.databaseRepositories()
    return this.requirePresets().updateEntries(presetId, updates)
  }

  saveAgentPreset(preset: AgentPreset, expectedRegexRules: RegexRule[], scriptLibrary?: ScriptLibrary): AgentPreset {
    this.databaseRepositories()
    if (!scriptLibrary) return this.requirePresets().save(preset, expectedRegexRules)
    if (scriptLibrary.scope !== 'preset' || scriptLibrary.ownerId !== preset.id) throw new Error('预设脚本库归属不匹配。')
    return this.scripts!.transaction(db => {
      const saved = this.requirePresets().save(preset, expectedRegexRules)
      this.scripts!.saveInTransaction(scriptLibrary, db)
      return saved
    })
  }

  createAgentPreset(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): AgentPreset {
    this.databaseRepositories()
    return this.requirePresets().create(name, libraryGroupId, purpose)
  }

  importAgentPreset(
    source: AgentPresetImportSource,
    document: AgentPresetImportDocument,
    purpose: AgentPresetPurpose
  ): AgentPresetImportResult {
    this.databaseRepositories()
    return this.requirePresets().import(document, source, purpose)
  }

  exportAgentPreset(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult {
    this.databaseRepositories()
    return this.requirePresets().export(presetId, format)
  }

  setActiveAgentPreset(presetId: string): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().setActive(presetId)
  }

  createAgentPresetGroup(name: string, purpose: AgentPresetPurpose): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().createGroup(name, purpose)
  }

  renameAgentPresetGroup(groupId: string, name: string): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().renameGroup(groupId, name)
  }

  assignAgentPresetGroup(presetId: string, groupId: string): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().assignGroup(presetId, groupId)
  }

  deleteAgentPresetGroup(groupId: string): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().deleteGroup(groupId)
  }

  deleteAgentPreset(presetId: string): AgentPresetCatalog {
    this.databaseRepositories()
    return this.requirePresets().delete(presetId)
  }

  readCreatorProjects(): CreatorProjectCollection {
    return this.projectRepository().list()
  }

  createCreatorProject(input: {
    name: string
    mode: CreatorProjectMode
    parentDirectory: string
    sourceCharacterId?: string
  }): CreatorProjectCollection {
    const projects = this.projectRepository()
    const sourceCharacterId = input.sourceCharacterId?.trim()
    const character = input.mode === 'existing' && sourceCharacterId
      ? this.databaseRepositories().store.db.select({ avatar: characters.avatar }).from(characters)
          .where(eq(characters.id, sourceCharacterId)).get()
      : undefined
    if (input.mode === 'existing' && character === undefined) {
      throw new Error('找不到要修改的角色。')
    }
    return projects.create({
      ...input,
      ...(sourceCharacterId === undefined ? {} : { sourceCharacterId }),
      coverImage: character?.avatar ?? ''
    })
  }

  deleteCreatorProject(projectId: string): CreatorProjectCollection {
    return this.projectRepository().delete(projectId)
  }

  close(): void {
    this.connection?.close()
    this.connection = undefined
    this.databank = undefined
    this.personas = undefined
    this.characters = undefined
    this.transfers = undefined
    this.settingLibraries = undefined
    this.variables = undefined
    this.variableStates = undefined
    this.projects = undefined
    this.frontends = undefined
    this.presets = undefined
    this.scripts = undefined
    this.regexRules = undefined
    this.store = undefined
    this.conversations = undefined
    this.messages = undefined
    this.mediaAssets = undefined
  }

  private requireRegexRules(): RegexRuleRepository {
    if (!this.regexRules) throw new Error('ElecKoi 正则规则数据服务尚未初始化。')
    return this.regexRules
  }

  private requirePresets(): AgentPresetRepository {
    if (!this.presets) throw new Error('ElecKoi Agent 预设数据服务尚未初始化。')
    return this.presets
  }
}

function requireMediaRoot(path: string | undefined): string {
  if (!path || !isAbsolute(path)) throw new Error('ElecKoi DSH Host 缺少有效的媒体目录。')
  return path
}

function requireWorkspaceRoot(path: string | undefined): string {
  if (!path || !isAbsolute(path)) throw new Error('ElecKoi DSH Host 缺少有效的工作区目录。')
  return path
}

function runtimeText(
  source: string,
  macros: CharacterCardMacroValues | undefined,
  rules: RegexRuleCollection | undefined,
  target: RegexRuleTarget,
  depth = 0
): string {
  const expanded = macros ? resolveCharacterCardMacros(source, macros) : source
  return rules ? transformCollectionSurface(expanded, rules, target, 'Prompt', {
      depth, expandMacros: (value, escape) => macros ? resolveCharacterCardMacros(value, {
        userName: escape?.(macros.userName) ?? macros.userName, characterName: escape?.(macros.characterName) ?? macros.characterName
      }) : value
    }) : expanded
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function openProductDatabase(path: string | undefined): Database.Database {
  if (!path || !isAbsolute(path)) {
    throw new Error('ElecKoi DSH Host 缺少有效的产品数据库路径。')
  }
  const connection = new Database(path)
  try {
    connection.pragma('foreign_keys = ON')
    connection.pragma('busy_timeout = 5000')
    installSchema(connection)
    connection.pragma('journal_mode = WAL')
    connection.pragma('secure_delete = FAST')
    recoverInterruptedState(connection)
    const version = connection.pragma('user_version', { simple: true }) as number
    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`产品数据库结构不匹配：需要 v${CURRENT_SCHEMA_VERSION}。`)
    }
    if ((connection.pragma('foreign_key_check') as unknown[]).length > 0) {
      throw new Error('产品数据库外键校验失败。')
    }
    return connection
  } catch (error) {
    connection.close()
    throw error
  }
}

const productDataPlugin = {
  name: 'eleckoi-product-data',
  provide: 'eleckoiProductData',
  apply(ctx: Context) {
    const data = new ProductDataStore(
      process.env.ELECKOI_DATABASE_PATH,
      process.env.ELECKOI_MEDIA_ROOT,
      process.env.ELECKOI_WORKSPACE_ROOT
    )
    ctx.provide('eleckoiProductData', data)
    return () => data.close()
  }
} satisfies Plugin.Object

export default productDataPlugin
export { extractMvuSchema, MVU_SCHEMA_REGISTRATION_MODULES } from './domain/characterTransfer/mvuSchema'
