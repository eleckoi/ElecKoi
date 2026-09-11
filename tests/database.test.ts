import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'
import { commonTables } from '../src/main/platform/sqlite/schema/common'
import { installSchema } from '../src/main/platform/sqlite/installSchema'
import { commonSchemaSql } from '../src/main/platform/sqlite/migrations/commonSchemaSql'
import { ConversationRepository } from '../src/main/modules/conversations/ConversationRepository'
import { MessageRepository } from '../src/main/modules/conversations/MessageRepository'
import { RichMessageHeightRepository } from '../src/main/modules/conversations/RichMessageHeightRepository'
import { CharacterRepository } from '../src/main/modules/personas/CharacterRepository'
import { PersonaRepository } from '../src/main/modules/personas/PersonaRepository'
import { ModelRepository } from '../src/main/modules/models/ModelRepository'
import { GenerationRepository } from '../src/main/modules/agent/GenerationRepository'
import { ConversationCleanupRepository } from '../src/main/modules/conversations/ConversationCleanupRepository'
import { resolveConversationSeed } from '../src/main/modules/conversations/conversationSeed'
import { ConversationFiles } from '../src/main/platform/filesystem/ConversationFiles'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import { UserSettingsStore } from '../src/main/modules/settings/UserSettingsStore'
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '../src/shared/contracts/settings/schemas'
import { SettingLibraryRepository } from '../src/main/modules/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/main/modules/variables/VariableConfigRepository'
import { VariableStateRepository } from '../src/main/modules/variables/VariableStateRepository'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '../src/shared/contracts/variables/schemas'

const directories: string[] = []
const connections: Array<{ close(): void }> = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
  for (const directory of directories.splice(0)) {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }
})
function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-common-test-'))
  directories.push(directory)
  const path = join(directory, 'eleckoi.sqlite3')
  const database = new SqliteDatabase(path)
  database.open()
  connections.push(database)
  const conversations = new ConversationRepository(database)
  const media = new LocalMediaStore(join(directory, 'media'))
  return { path, database, conversations, media, characters: new CharacterRepository(database, conversations, media), messages: new MessageRepository(database) }
}
function card(id = 'card-a') {
  return { id, name: id, group: '', persona: { assistant_name: id, assistant_avatar: '', assistant_cover: '', opening: 'opening', show_opening: true } }
}
function schemaObjects(db: Database.Database) {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'desktop_%' ORDER BY type,name").all()
}

describe('shared SQLite baseline', () => {
  it('defaults appearance to light and persists only the three supported modes', () => {
    const { database, media } = harness()
    const settings = new UserSettingsStore(database, media)

    expect(settings.read('appearance.mode')).toBe('light')
    expect(settings.read('chat.display')).toEqual(DEFAULT_CHAT_DISPLAY_PREFERENCES)
    expect(settings.read('chat.display').reasoning_display_mode).toBe('collapsed')
    expect(settings.write('appearance.mode', 'system')).toBe('system')
    expect(settings.read('appearance.mode')).toBe('system')
    expect(settings.write('appearance.ui', {
      list_collapse_state: {
        characters: { 全部角色: true },
        presets: { 全部预设: true },
        models: { general: false, image: true }
      }
    })).toEqual({
      list_collapse_state: {
        characters: { 全部角色: true },
        presets: { 全部预设: true },
        models: { general: false, image: true }
      }
    })
    expect(settings.read('appearance.ui').list_collapse_state?.models).toEqual({ general: false, image: true })
    expect(() => settings.write('appearance.mode', 'sepia' as never)).toThrow()
  })

  it('installs all common tables, views, indexes and foreign keys exactly and maps every column', () => {
    const { database } = harness()
    const expected = new Database(':memory:')
    try {
      expected.exec(commonSchemaSql)
      expect(schemaObjects(database.native)).toEqual(schemaObjects(expected))
    } finally { expected.close() }
    const canonicalTableNames = [...commonSchemaSql.matchAll(/^CREATE TABLE IF NOT EXISTS `([^`]+)`/gm)].map((match) => match[1])
    const canonicalViewNames = [...commonSchemaSql.matchAll(/^CREATE VIEW `?([^`\s]+)`?/gm)].map((match) => match[1])
    expect(Object.values(commonTables).map(getTableName).sort()).toEqual(canonicalTableNames.sort())
    expect(database.native.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name").all())
      .toEqual(canonicalViewNames.sort().map((name) => ({ name })))
    for (const table of Object.values(commonTables)) {
      const fields = database.native.prepare(`PRAGMA table_info("${getTableName(table)}")`).all() as { name: string }[]
      expect(Object.values(getTableColumns(table)).map((column) => column.name)).toEqual(fields.map((column) => column.name))
    }
    expect(database.native.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.native.pragma('secure_delete', { simple: true })).toBe(2)
    expect(database.native.pragma('foreign_key_check')).toEqual([])
    expect(database.native.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(commonSchemaSql).toBe(readFileSync('resources/database/eleckoi-common-schema-v1.sql', 'utf8').replaceAll('\r\n', '\n'))
  })

  it('preserves records after reopening and refuses nonempty legacy or unknown databases', () => {
    const { database, path, conversations } = harness()
    const id = conversations.create({ title: '持久存档' }).conversation.id
    database.close()
    database.open()
    expect(conversations.get(id).title).toBe('持久存档')
    expect(new ConversationRepository(database).get(id).id).toBe(id)
    const old = new Database(':memory:')
    try {
      old.exec("CREATE TABLE messages(id TEXT PRIMARY KEY,content TEXT); INSERT INTO messages VALUES (1, 'preserve');")
      expect(() => installSchema(old)).toThrow('不会自动转换或删除数据')
      expect(old.prepare('SELECT content FROM messages').get()).toEqual({ content: 'preserve' })
    } finally { old.close() }
    expect(path).toContain('eleckoi.sqlite3')
  })

  it('updates only the changed character text and keeps user identity separate', () => {
    const { database, characters, conversations, media } = harness()
    const a = card(), b = card('card-b')
    characters.replaceAll({ active_character_id: a.id, groups: [], items: [a, b] })
    database.native.exec(`CREATE TEMP TABLE writes(kind TEXT,card TEXT);
      CREATE TEMP TRIGGER watch_text AFTER UPDATE ON character_text_contents BEGIN INSERT INTO writes VALUES (new.kind,new.characterId); END;
      CREATE TEMP TRIGGER watch_card AFTER UPDATE ON characters BEGIN INSERT INTO writes VALUES ('card',new.id); END;`)
    const current = characters.get()
    const changed = current.items.map((item) => item.id === a.id ? { ...item, persona: { ...(item.persona as object), opening: 'changed' } } : item)
    characters.replaceAll({ ...current, items: changed })
    expect(database.native.prepare('SELECT * FROM writes').all()).toEqual([{ kind: 'opening', card: a.id }])
    database.native.exec('DELETE FROM writes')
    characters.replaceAll(characters.get())
    expect(database.native.prepare('SELECT * FROM writes').all()).toEqual([])
    const profiles = new PersonaRepository(database, conversations, media)
    profiles.save({ ...profiles.get(), user_name: '用户' })
    expect(profiles.get().user_name).toBe('用户')
  })

  it('updates one character without deleting records created after an editor loaded', () => {
    const { characters } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card(), card('card-b')] })
    const staleCharacter = characters.get().items.find((item) => item.id === 'card-a')!

    characters.create(card('card-c'))
    characters.update({ ...staleCharacter, name: '只更新 A' })

    const saved = characters.get()
    expect(saved.items.map((item) => item.id)).toEqual(['card-a', 'card-b', 'card-c'])
    expect(saved.items.find((item) => item.id === 'card-a')?.name).toBe('只更新 A')
  })

  it('stores ordered replies by different speakers and rejects a cross-conversation turn', () => {
    const { conversations, messages, database } = harness()
    const a = conversations.create({}).conversation.id, b = conversations.create({}).conversation.id
    const user = messages.create(a, 'user', '原文', 'complete')
    messages.createResponse(a, user.turnId!, '旁白原文', 'complete', { id: 'narrator', name: '旁白', avatar: '', kind: 'narrator' })
    messages.createResponse(a, user.turnId!, '人物原文', 'complete', { id: 'member', name: '人物', avatar: '', kind: 'card_character' })
    expect(messages.list(a).map((message) => message.content)).toEqual(['原文', '旁白原文', '人物原文'])
    expect(messages.list(a).slice(1).map((message) => message.responseIndex)).toEqual([0, 1])
    expect(() => messages.createResponse(b, user.turnId!, 'wrong', 'complete', { id: 'member', name: '', avatar: '', kind: 'card_character' })).toThrow('活动分支')
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('pages turns without gaps or repeated messages', () => {
    const { conversations, messages } = harness()
    const id = conversations.create({}).conversation.id
    for (let i = 0; i < 125; i++) { messages.create(id, 'user', String(i), 'complete'); messages.create(id, 'assistant', 'reply '+i, 'complete') }
    let cursor: number | undefined
    const seen: string[] = []
    do {
      const page = messages.page(id, cursor, 40)
      seen.unshift(...page.messages.map((message) => message.content))
      if (!page.hasMore) break
      cursor = page.beforeSequence!
    } while (true)
    expect(seen).toHaveLength(250)
    expect(seen[0]).toBe('0')
    expect(seen.at(-1)).toBe('reply 124')
    expect(() => messages.page(id, -1)).toThrow('游标')
    expect(() => messages.page(id, undefined, 201)).toThrow('轮次数')
  })

  it('persists rich-message layout by content revision and removes it with the conversation', () => {
    const { conversations, database } = harness()
    const conversationId = conversations.create({}).conversation.id
    const repository = new RichMessageHeightRepository(database)
    const base = { conversationId, messageId: 'message-a', rootIndex: 0, viewportWidthPx: 800 }

    repository.save({ ...base, contentRevision: 'revision-a', heightPx: 640 })
    repository.save({ ...base, contentRevision: 'revision-a', heightPx: 650 })
    expect(repository.list(conversationId)).toHaveLength(1)
    expect(repository.list(conversationId)[0]).toMatchObject({ contentRevision: 'revision-a', heightPx: 650 })

    repository.save({ ...base, contentRevision: 'revision-b', heightPx: 700 })
    expect(repository.list(conversationId)).toHaveLength(1)
    expect(repository.list(conversationId)[0]).toMatchObject({ contentRevision: 'revision-b', heightPx: 700 })

    conversations.delete(conversationId)
    expect(repository.list(conversationId)).toEqual([])
  })

  it('keeps a terminal reply immutable when a late checkpoint or duplicate completion arrives', () => {
    const { conversations, messages, database } = harness()
    const id = conversations.create({}).conversation.id
    messages.create(id, 'user', 'input', 'complete')
    const reply = messages.create(id, 'assistant', '', 'streaming')
    messages.finish(reply.id, 'final', 'complete')
    const revision = database.native.prepare('SELECT revision FROM agent_conversations WHERE id=?').get(id)
    messages.appendCheckpoint(reply.id, 'late delta')
    expect(messages.finish(reply.id, 'late failure', 'error')).toMatchObject({ content: 'final', status: 'complete' })
    expect(database.native.prepare('SELECT revision FROM agent_conversations WHERE id=?').get(id)).toEqual(revision)
    expect(() => new GenerationRepository(database, messages).start('late-run', id, reply.id, 'model')).toThrow('本场回复')
  })

  it('projects the variable snapshot stored on each message instead of the latest conversation state', () => {
    const { conversations, messages, database } = harness()
    const id = conversations.create({}).conversation.id
    database.native.prepare("UPDATE chat_session_variable_states SET stateJson=? WHERE sessionId=? AND kind='current'")
      .run('{"step":1}', id)
    const first = messages.create(id, 'user', 'one', 'complete')
    const reply = messages.create(id, 'assistant', '', 'streaming')
    messages.finish(reply.id, 'answer', 'complete', undefined, '{"step":2}')
    database.native.prepare("UPDATE chat_session_variable_states SET stateJson=? WHERE sessionId=? AND kind='current'")
      .run('{"step":99}', id)

    expect(messages.get(id, first.id).variableStateJson).toBe('{"step":1}')
    expect(messages.get(id, reply.id).variableStateJson).toBe('{"step":2}')
    expect(messages.list(id).map((message) => message.variableStateJson)).toEqual(['{"step":1}', '{"step":2}'])
  })

  it('enforces deferred active variable versions and cascades the whole card-owned version tree', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card(), card('card-b')] })
    database.withWriteTx(() => {
      database.native.exec(`INSERT INTO variable_configs VALUES ('card-a','v1','now',0);
        INSERT INTO variable_config_versions VALUES ('card-a','v1',0,'version','[]','now','now');
        INSERT INTO variable_config_version_contents VALUES ('card-a','v1','schema','{}');
        INSERT INTO variable_config_objects VALUES ('card-a','v1','object',0,'{}');
        INSERT INTO variable_config_variables VALUES ('card-a','v1','variable',0,'{}');`)
    })
    expect(() => database.withWriteTx(() => database.native.exec("UPDATE variable_configs SET activeVersionId='missing' WHERE characterId='card-a'"))).toThrow('FOREIGN KEY')
    expect(database.native.prepare('SELECT activeVersionId FROM variable_configs').get()).toEqual({ activeVersionId: 'v1' })
    expect(() => database.native.exec("INSERT INTO variable_config_version_contents VALUES ('card-b','v1','schema','{}')")).toThrow('FOREIGN KEY')
    characters.delete(['card-a'])
    for (const table of ['variable_configs', 'variable_config_versions', 'variable_config_version_contents', 'variable_config_objects', 'variable_config_variables']) {
      expect(database.native.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    }
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('shares setting content between current and saved links without mixing their revisions', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    database.withWriteTx(() => database.native.exec(`
      INSERT INTO setting_libraries VALUES ('card-a','library','saved',1,'[]','{}','now');
      INSERT INTO setting_entry_contents VALUES ('card-a','entry','rev-old','{"text":"old"}');
      INSERT INTO setting_library_entry_links VALUES ('card-a','entry',0,'rev-old');
      INSERT INTO setting_library_versions VALUES ('card-a','saved',0,'saved',1,'[]','{}','now','now');
      INSERT INTO setting_library_version_entry_links VALUES ('card-a','saved','entry',0,'rev-old');`))
    database.withWriteTx(() => database.native.exec(`
      INSERT INTO setting_entry_contents VALUES ('card-a','entry','rev-new','{"text":"new"}');
      UPDATE setting_library_entry_links SET revisionId='rev-new';`))
    expect(database.native.prepare('SELECT payloadJson FROM setting_library_entries').get()).toEqual({ payloadJson: '{"text":"new"}' })
    expect(database.native.prepare('SELECT payloadJson FROM setting_library_version_entries').get()).toEqual({ payloadJson: '{"text":"old"}' })
    expect(() => database.native.exec("DELETE FROM setting_entry_contents WHERE revisionId='rev-old'")).toThrow('FOREIGN KEY')
    characters.delete(['card-a'])
    expect(database.native.prepare('SELECT * FROM setting_entry_contents').all()).toEqual([])
    expect(database.native.prepare('SELECT * FROM setting_library_version_entries').all()).toEqual([])
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('creates and persists the current setting-library tree without a second schema', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const repository = new SettingLibraryRepository(database)
    const empty = repository.get('card-a')
    expect(empty.entries.map((entry) => entry.id)).toEqual(['fixed-opening-assistant'])
    expect(repository.primaryOpening('card-a')).toBe('')

    const timestamp = new Date().toISOString()
    const group = { id: 'world', name: '世界', parentId: '', order: 1, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp }
    const entry = {
      id: 'capital', title: '王都', iconId: '', kind: 'normal' as const, groupId: group.id, content: '群山之间的城市。',
      openingMessages: [], defaultOpeningMessageId: '', agentSelectionHint: '', agentReadStrategy: 'normal' as const,
      agentReadCondition: '', dynamicMode: 'single_condition' as const, keywords: [], keywordScanDepth: 1,
      conditionKeywords: [], keywordCondition: 'none' as const, keywordUseRegex: false, keywordIgnoreCase: true,
      keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: 'always' as const, enabled: true,
      position: 'before_latest_user_input' as const, promptPositionId: '', insertRole: 'user' as const, order: 1,
      viewOrder: 0, groupViewOrder: 0, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
    }
    const opening = {
      ...empty.entries.find((candidate) => candidate.id === 'fixed-opening-assistant')!,
      content: '主开场',
      openingMessages: [
        { id: 'opening-main', title: '初次见面', content: '主开场', initialVariableStateJson: '{"好感":0}' },
        { id: 'opening-backup', title: '再次见面', content: '备用开场', initialVariableStateJson: '{"好感":10}' }
      ],
      defaultOpeningMessageId: 'opening-main'
    }
    const reference = {
      ...entry,
      id: 'reference-capital',
      title: '王都资料',
      content: '供 EJS 控制器读取。',
      agentReadStrategy: 'variable_condition' as const,
      dynamicMode: 'ejs_reference' as const,
      triggerMode: 'agent_tool' as const,
      enabled: true,
      treeViewOrder: 2
    }
    const saved = repository.save('card-a', {
      ...empty,
      groups: [group],
      entries: [opening, entry, reference]
    })
    expect(saved.groups).toEqual([expect.objectContaining({ id: 'world', name: '世界' })])
    expect(saved.entries).toContainEqual(expect.objectContaining({
      id: 'capital',
      groupId: 'world',
      content: '群山之间的城市。',
      position: 'before_latest_user_input'
    }))
    expect(saved.entries.find((candidate) => candidate.id === 'fixed-opening-assistant')).toMatchObject({
      content: '主开场',
      defaultOpeningMessageId: 'opening-main',
      openingMessages: [
        expect.objectContaining({ id: 'opening-main', content: '主开场' }),
        expect.objectContaining({ id: 'opening-backup', content: '备用开场' })
      ]
    })
    expect(repository.primaryOpening('card-a')).toBe('主开场')
    expect(saved.entries).toContainEqual(expect.objectContaining({
      id: 'reference-capital',
      agentReadStrategy: 'variable_condition',
      dynamicMode: 'ejs_reference',
      triggerMode: 'agent_tool'
    }))
    expect(database.native.prepare('SELECT COUNT(*) AS count FROM setting_library_entries WHERE characterId = ?').get('card-a')).toEqual({ count: 3 })
    expect(database.native.prepare('SELECT COUNT(*) AS count FROM setting_library_version_entries WHERE characterId = ?').get('card-a')).toEqual({ count: 3 })
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('reloads current author settings in an existing conversation and stores only real Agent mutations', () => {
    const { characters, conversations, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const settingLibraries = new SettingLibraryRepository(database)
    const empty = settingLibraries.get('card-a')
    const timestamp = new Date().toISOString()
    const entry = {
      id: 'identity', title: '身份', iconId: '', kind: 'normal' as const, groupId: '',
      content: '你是{{char}}，我是{{user}}', openingMessages: [], defaultOpeningMessageId: '',
      agentSelectionHint: '', agentReadStrategy: 'required' as const, agentReadCondition: '',
      dynamicMode: 'single_condition' as const, keywords: [], keywordScanDepth: 1,
      conditionKeywords: [], keywordCondition: 'none' as const, keywordUseRegex: false,
      keywordIgnoreCase: true, keywordWholeWord: false, keywordRecursionDepth: 0,
      triggerMode: 'agent_tool' as const, enabled: true, position: 'after_instructions' as const,
      promptPositionId: '', insertRole: 'user' as const, order: 1, viewOrder: 1,
      groupViewOrder: 0, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
    }
    settingLibraries.save('card-a', { ...empty, entries: [...empty.entries, entry] })
    const conversationId = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    const binding = conversations.getCharacterBinding(conversationId)
    const source = settingLibraries.runtimeContext(conversationId, binding)!
    const projected = structuredClone(source)
    projected.entries = projected.entries.map((candidate) => candidate.id === entry.id
      ? { ...candidate, content: '你是card-a，我是旧名字' }
      : candidate)

    expect(settingLibraries.runtimeContext(conversationId, binding)?.entries.find((candidate) => candidate.id === entry.id)?.content)
      .toBe('你是{{char}}，我是{{user}}')

    settingLibraries.replaceConversationRuntimeState(
      conversationId,
      JSON.stringify(projected),
      binding,
      { source, projected }
    )
    expect(database.native.prepare('SELECT COUNT(*) AS count FROM conversation_setting_changes WHERE sessionId=?')
      .get(conversationId)).toEqual({ count: 0 })

    const latest = settingLibraries.get('card-a')
    settingLibraries.save('card-a', {
      ...latest,
      entries: latest.entries.map((candidate) => candidate.id === entry.id
        ? { ...candidate, content: '最新设定：{{user}}' }
        : candidate)
    })
    const latestSource = settingLibraries.runtimeContext(conversationId, binding)!
    expect(latestSource.entries.find((candidate) => candidate.id === entry.id)?.content)
      .toBe('最新设定：{{user}}')

    const latestProjected = structuredClone(latestSource)
    latestProjected.entries = latestProjected.entries.map((candidate) => candidate.id === entry.id
      ? { ...candidate, content: '最新设定：米米' }
      : candidate)
    const agentResult = structuredClone(latestProjected)
    agentResult.entries = agentResult.entries.map((candidate) => candidate.id === entry.id
      ? { ...candidate, content: '会话专属改写' }
      : candidate)
    settingLibraries.replaceConversationRuntimeState(
      conversationId,
      JSON.stringify(agentResult),
      binding,
      { source: latestSource, projected: latestProjected }
    )

    expect(settingLibraries.runtimeContext(conversationId, binding)?.entries.find((candidate) => candidate.id === entry.id)?.content)
      .toBe('会话专属改写')
    const persisted = database.native.prepare(`SELECT payloadJson FROM conversation_setting_changes
      WHERE sessionId=? AND targetType='entry' AND targetId=?`).get(conversationId, entry.id) as { payloadJson: string }
    expect(JSON.parse(persisted.payloadJson)).toMatchObject({ id: entry.id, content: '会话专属改写' })
  })

  it('creates a story conversation with the saved primary opening as its first assistant message', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const settingLibraries = new SettingLibraryRepository(database)
    const variables = new VariableConfigRepository(database)
    const library = settingLibraries.get('card-a')
    const opening = library.entries.find((entry) => entry.id === 'fixed-opening-assistant')!
    settingLibraries.save('card-a', {
      ...library,
      entries: library.entries.map((entry) => entry.id === opening.id ? {
        ...opening,
        content: '保存后的开场白',
        openingMessages: [{
          id: 'opening-primary',
          title: '默认开场',
          content: '保存后的开场白',
          initialVariableStateJson: '{"好感":10}'
        }],
        defaultOpeningMessageId: 'opening-primary'
      } : entry)
    })
    const conversations = new ConversationRepository(database, undefined, (characterId, db, context) => (
      resolveConversationSeed(characterId, context.characterMode, context.metadata, db, settingLibraries, variables)
    ))
    const messages = new MessageRepository(database)

    const created = conversations.create({ metadata: { characterId: 'card-a' } })

    expect(messages.list(created.conversation.id)).toEqual([
      expect.objectContaining({ id: 'opening', role: 'assistant', content: '保存后的开场白', status: 'complete' })
    ])
    expect(conversations.list()[0]?.conversation.preview).toBe('保存后的开场白')
    expect(database.native.prepare("SELECT kind,stateJson FROM chat_session_variable_states WHERE sessionId=? ORDER BY kind")
      .all(created.conversation.id)).toEqual([
      { kind: 'current', stateJson: '{"好感":10}' },
      { kind: 'initial', stateJson: '{"好感":10}' }
    ])
    expect(database.native.prepare('SELECT historyMessageCount,historyUserMessageCount FROM chat_sessions WHERE id=?')
      .get(created.conversation.id)).toEqual({ historyMessageCount: 1, historyUserMessageCount: 0 })
  })

  it('switches and edits only the conversation opening before the first user message', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const settingLibraries = new SettingLibraryRepository(database)
    const variables = new VariableConfigRepository(database)
    const library = settingLibraries.get('card-a')
    settingLibraries.save('card-a', {
      ...library,
      entries: library.entries.map((entry) => entry.id === 'fixed-opening-assistant' ? {
        ...entry,
        content: '主开场',
        openingMessages: [
          { id: 'primary', title: '主开场', content: '主开场', initialVariableStateJson: '{"好感":1}' },
          { id: 'backup', title: '备用', content: '备用开场', initialVariableStateJson: '{"好感":2}' }
        ],
        defaultOpeningMessageId: 'primary'
      } : entry)
    })
    const conversations = new ConversationRepository(database, undefined, (characterId, db, context) => (
      resolveConversationSeed(characterId, context.characterMode, context.metadata, db, settingLibraries, variables)
    ))
    const messages = new MessageRepository(database)
    const conversationId = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id

    conversations.selectOpening(conversationId, 'backup')
    expect(messages.list(conversationId)[0]).toMatchObject({
      id: 'opening',
      content: '备用开场',
      selectedOpeningId: 'backup'
    })
    expect(conversations.get(conversationId).preview).toBe('备用开场')
    expect(database.native.prepare("SELECT stateJson FROM chat_session_variable_states WHERE sessionId=? AND kind='current'")
      .get(conversationId)).toEqual({ stateJson: '{"好感":2}' })

    conversations.updateOpening(conversationId, '只改当前对话的备用开场')
    expect(messages.list(conversationId)[0]).toMatchObject({
      content: '只改当前对话的备用开场',
      openingOptions: expect.arrayContaining([
        expect.objectContaining({ id: 'backup', content: '只改当前对话的备用开场' })
      ])
    })
    expect(settingLibraries.get('card-a').entries.find((entry) => entry.id === 'fixed-opening-assistant')?.openingMessages)
      .toContainEqual(expect.objectContaining({ id: 'backup', content: '备用开场' }))

    messages.create(conversationId, 'user', '开始聊天', 'complete')
    conversations.touch(conversationId, '最近的真实消息')
    expect(conversations.get(conversationId).preview).toBe('最近的真实消息')
    expect(() => conversations.selectOpening(conversationId, 'primary')).toThrow('对话开始后不能再切换开场白')
    expect(() => conversations.updateOpening(conversationId, '不能再改')).toThrow('对话开始后不能修改开场白')
  })

  it('regenerates from a user turn without deleting its unchanged input and restores its variable snapshot', () => {
    const { conversations, messages, database } = harness()
    const conversationId = conversations.create({}).conversation.id
    messages.create(conversationId, 'user', '第一轮', 'complete')
    messages.create(conversationId, 'assistant', '第一轮回复', 'complete', undefined, 'runtime-a')
    database.native.prepare("UPDATE chat_session_variable_states SET stateJson=? WHERE sessionId=? AND kind='current'")
      .run('{"轮次":1}', conversationId)
    const secondUser = messages.create(conversationId, 'user', '第二轮原文', 'complete')
    const secondAssistant = messages.create(conversationId, 'assistant', '第二轮回复', 'complete', undefined, 'runtime-b')
    database.native.prepare("UPDATE chat_session_variable_states SET stateJson=? WHERE sessionId=? AND kind='current'")
      .run('{"轮次":2}', conversationId)

    const prepared = messages.prepareRegeneration(conversationId, secondAssistant.id)
    expect(prepared).toMatchObject({ turnId: secondUser.turnId, text: '第二轮原文' })
    expect(prepared.runtimeThreadId).not.toBe('runtime-b')
    expect(prepared.obsoleteRuntimeThreadIds).toEqual(['runtime-a', 'runtime-b'])
    expect(messages.list(conversationId).map((message) => message.content)).toEqual(['第一轮', '第一轮回复', '第二轮原文'])
    expect(database.native.prepare("SELECT stateJson FROM chat_session_variable_states WHERE sessionId=? AND kind='current'")
      .get(conversationId)).toEqual({ stateJson: '{"轮次":1}' })
    expect(database.native.prepare('SELECT historyMessageCount,historyUserMessageCount FROM chat_sessions WHERE id=?')
      .get(conversationId)).toEqual({ historyMessageCount: 3, historyUserMessageCount: 2 })

    expect(messages.prepareRegeneration(conversationId, secondUser.id, '第二轮已编辑')).toMatchObject({ text: '第二轮已编辑' })
    expect(messages.list(conversationId).at(-1)?.content).toBe('第二轮已编辑')
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('persists complete variable versions and seeds new character conversations from the active state', () => {
    const { characters, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const repository = new VariableConfigRepository(database)
    const empty = repository.get('card-a')
    const timestamp = new Date().toISOString()
    const object = {
      id: 'status', name: '状态', parentId: '', enabled: true, description: '角色状态', updateRule: '发生变化时更新',
      dynamicKey: false, order: 1, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
    }
    const variable = {
      id: 'mood', title: '心情', objectId: object.id, enabled: true, type: 'string' as const, defaultValue: '平静',
      description: '当前心情', updateRule: '按剧情更新', readMode: 'required' as const, order: 1, treeViewOrder: 1,
      createdAt: timestamp, updatedAt: timestamp
    }
    const saved = repository.save('card-a', {
      ...empty,
      name: '正式版',
      initialStateJson: '{}',
      schemaCode: 'z.object({ 状态: z.object({ 心情: z.string() }) })',
      objects: [object],
      variables: [variable],
      expandedObjectIds: [object.id]
    })

    expect(saved.objects[0]).toMatchObject({ id: VARIABLE_INITIALIZATION_OBJECT_ID, name: '变量运行配置' })
    expect(saved.initialStateJson).toBe('{\n  "状态": {\n    "心情": "平静"\n  }\n}')
    expect(saved.versions).toHaveLength(1)
    expect(database.native.prepare('SELECT COUNT(*) AS count FROM variable_config_objects WHERE characterId = ?').get('card-a')).toEqual({ count: 2 })
    expect(database.native.prepare('SELECT COUNT(*) AS count FROM variable_config_variables WHERE characterId = ?').get('card-a')).toEqual({ count: 1 })

    const conversations = new ConversationRepository(database, undefined, (characterId, db) => repository.initialState(characterId, db))
    const conversationId = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    expect(database.native.prepare('SELECT kind,stateJson FROM chat_session_variable_states WHERE sessionId = ? ORDER BY kind').all(conversationId)).toEqual([
      { kind: 'current', stateJson: saved.initialStateJson },
      { kind: 'initial', stateJson: saved.initialStateJson }
    ])
    const states = new VariableStateRepository(database, repository)
    expect(states.runtimeContext(conversationId, conversations.getCharacterBinding(conversationId))).toMatchObject({
      schemaCode: saved.schemaCode,
      stateJson: saved.initialStateJson,
      variables: [expect.objectContaining({ id: 'mood', readMode: 'required' })]
    })
    expect(states.replaceCurrent(conversationId, '{"状态":{"心情":"开心"}}')).toBe('{\n  "状态": {\n    "心情": "开心"\n  }\n}')
    expect(database.native.prepare("SELECT stateJson FROM chat_session_variable_states WHERE sessionId=? AND kind='current'").get(conversationId)).toEqual({
      stateJson: '{\n  "状态": {\n    "心情": "开心"\n  }\n}'
    })
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('checkpoints only changed chunks and recovers interrupted executions without losing the prefix', () => {
    const { conversations, messages, database } = harness()
    const id = conversations.create({}).conversation.id
    messages.create(id, 'user', 'input', 'complete')
    const reply = messages.create(id, 'assistant', '', 'streaming')
    const generations = new GenerationRepository(database, messages)
    conversations.registerDeleteGuard(generations)
    generations.start('run-a', id, reply.id, 'model')
    const prefix = 'x'.repeat(64 * 1024 - 1) + '😀' + 'y'.repeat(100)
    messages.appendCheckpoint(reply.id, prefix)
    database.native.exec(`CREATE TEMP TABLE chunk_writes(chunk INTEGER); CREATE TEMP TRIGGER watch_parts AFTER UPDATE ON agent_content_parts BEGIN INSERT INTO chunk_writes VALUES(new.chunkIndex); END;`)
    messages.appendCheckpoint(reply.id, 'tail')
    expect(database.native.prepare('SELECT chunk FROM chunk_writes').all()).toEqual([{ chunk: 1 }])
    expect(() => conversations.delete(id)).toThrow('先停止')
    database.close(); database.open()
    expect(messages.list(id).at(-1)).toMatchObject({ content: prefix + 'tail', status: 'error' })
    expect(database.native.prepare("SELECT state FROM generation_attempts WHERE id='run-a'").get()).toEqual({ state: 'failed' })
    conversations.delete(id)
    expect(database.native.prepare('SELECT * FROM agent_content_parts').all()).toEqual([])
  })

  it('removes a card and its chats while preserving another card and shared configuration', () => {
    const { characters, conversations, messages, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card(), card('card-b')] })
    const a = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    const b = conversations.create({ metadata: { characterId: 'card-b' } }).conversation.id
    messages.create(a, 'user', 'a', 'complete'); messages.create(b, 'user', 'b', 'complete')
    database.native.prepare('INSERT INTO global_tool_config VALUES(1,?,?)').run('{}', 'now')
    characters.delete(['card-a'])
    expect(conversations.exists(a)).toBe(false)
    expect(messages.list(b).map((message) => message.content)).toEqual(['b'])
    expect(database.native.prepare('SELECT * FROM global_tool_config').all()).toHaveLength(1)
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('encrypts credentials, preserves common model fields, and does not rewrite identical saves', () => {
    const { database } = harness()
    const models = new ModelRepository(database, { encrypt: (value) => 'encrypted:'+value, decrypt: (value) => value.slice(10) })
    const input = { id: 'model', api_key: 'test-key', custom_headers: { 'X-Test': 'value' }, enabled: false, supports_tools: true, api_format: 'chat_completions' as const, image_settings: { size: 'large' } }
    models.save(input)
    expect(database.native.prepare('SELECT apiKey FROM model_configs').get()).toEqual({ apiKey: 'encrypted:test-key' })
    expect(models.list()[0]).toMatchObject(input)
    const before = database.native.prepare('SELECT total_changes() AS count').get()
    models.save(models.list()[0]!)
    expect(database.native.prepare('SELECT total_changes() AS count').get()).toEqual(before)
  })

  it('rolls back a model save when the current strict model data cannot be read', () => {
    const { database } = harness()
    const models = new ModelRepository(database, { encrypt: (value) => 'encrypted:'+value, decrypt: (value) => value.slice(10) })
    models.save({
      id: 'current',
      name: 'Current',
      provider: 'deepseek',
      api_key: 'test-key',
      base_url: 'https://api.deepseek.com',
      proxy_url: '',
      model: 'deepseek-chat',
      model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat' }],
      custom_headers: {},
      supports_tools: null,
      enabled: true,
      image_settings: {},
      api_format: 'responses'
    })
    database.native.prepare('UPDATE model_configs SET modelOptionsJson = ? WHERE id = ?').run('["legacy-string"]', 'current')

    expect(() => models.save({ id: 'must-not-survive', provider: 'custom' }))
      .toThrow('模型配置“current”的模型列表不是当前对象格式')
    expect(database.native.prepare('SELECT id FROM model_configs ORDER BY id').all())
      .toEqual([{ id: 'current' }])
  })

  it('retains failed file cleanup after database deletion and retries it after reopening', () => {
    const { database } = harness()
    let fail = true
    const removed: string[] = []
    const queue = new ConversationCleanupRepository(database, { remove: (id) => {
      if (fail) throw new Error('injected file failure')
      removed.push(id)
    } })
    const conversations = new ConversationRepository(database, queue)
    const id = conversations.create({}).conversation.id
    conversations.delete(id)
    expect(conversations.exists(id)).toBe(false)
    expect(database.native.prepare('SELECT targetId,state,attemptCount FROM cleanup_operations').all()).toEqual([{ targetId: id, state: 'failed', attemptCount: 1 }])
    database.close(); database.open()
    fail = false
    queue.drain(); queue.drain()
    expect(removed).toEqual([id])
    expect(database.native.prepare('SELECT * FROM cleanup_operations').all()).toEqual([])
  })

  it('cleans only the named conversation directories and rejects path traversal', () => {
    const { path } = harness()
    const directory = join(path, '..', 'files')
    const roots = [join(directory, 'workspaces'), join(directory, 'sessions')]
    for (const root of roots) {
      for (const id of ['owned', 'another']) {
        mkdirSync(join(root, id), { recursive: true })
        writeFileSync(join(root, id, 'record.txt'), id)
      }
    }
    const files = new ConversationFiles(roots)
    expect(() => files.remove('../another')).toThrow('编号无效')
    expect(() => files.remove('')).toThrow('编号无效')
    files.remove('owned')
    files.remove('owned')
    for (const root of roots) {
      expect(existsSync(join(root, 'owned'))).toBe(false)
      expect(readFileSync(join(root, 'another', 'record.txt'), 'utf8')).toBe('another')
    }
  })

  it('restores a consistent SQLite snapshot in an independent directory', async () => {
    const { database, characters, conversations, messages } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const id = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    messages.create(id, 'user', 'backup source', 'complete')
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-restore-test-'))
    directories.push(directory)
    const destination = join(directory, 'restored.sqlite3')
    await database.backupTo(destination)
    const restored = new SqliteDatabase(destination)
    connections.push(restored)
    restored.open()
    const restoredConversations = new ConversationRepository(restored)
    expect(restoredConversations.getMetadata(id).characterId).toBe('card-a')
    expect(new MessageRepository(restored).list(id)[0]?.content).toBe('backup source')
    expect(restored.native.pragma('foreign_key_check')).toEqual([])
    expect(restored.native.pragma('integrity_check', { simple: true })).toBe('ok')
    await expect(database.backupTo(destination)).rejects.toThrow('新的文件')
  })

  it('rejects an altered common view without rebuilding or clearing data', () => {
    const { database } = harness()
    database.native.exec('DROP VIEW setting_library_entries')
    database.close()
    expect(() => database.open()).toThrow('公共数据库结构不匹配')
  })

  it('refuses a renamed desktop preferences table without creating a replacement', () => {
    const { database } = harness()
    database.native.exec('ALTER TABLE desktop_preferences RENAME TO unknown_preferences')
    database.close()
    expect(() => database.open()).toThrow('未知表')
  })
})
