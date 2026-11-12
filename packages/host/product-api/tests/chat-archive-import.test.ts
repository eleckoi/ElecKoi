import { Context } from '@deepseek-ai/cordis'
import SessionStore, { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { acceptedThrough } from '@deepseek-ai/dsh-session-log-deepseek'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ElecKoiConversationsApi } from '../lib/types/index.js'
import { importedSession } from '../lib/types/sessionArchive.js'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { ConversationRepository } from '../../product-data/src/domain/conversations/ConversationRepository'
import { ConversationArchiveRepository } from '../../product-data/src/domain/conversations/ConversationArchiveRepository'
import { SettingLibraryRepository } from '../../product-data/src/domain/settingLibraries/SettingLibraryRepository'
import { ConversationStateRepository } from '../../product-data/src/domain/conversations/ConversationStateRepository'
import { VariableStateRepository } from '../../product-data/src/domain/variables/VariableStateRepository'
import { VariableConfigRepository } from '../../product-data/src/domain/variables/VariableConfigRepository'

it.each([1, 2])('imports native archive v%s into the selected character and reopens its new Session without claiming old delivery receipts', async version => {
  const root = await mkdtemp(join(tmpdir(), 'eleckoi-chat-import-')), ctx = new Context()
  const db = new SqliteDatabase(join(root, 'product.sqlite'))
  try {
    db.open()
    db.native.prepare(`INSERT INTO characters(id,name,avatar,squareImage,coverImage,groupName,orderIndex,groupViewOrder,folder,
      frontendBeautyEnabled,assistantName,assistantAvatar,profileAge,profileSex,profileHeight,profileBirthday,profileLike,
      chatBackground,chatBackgroundOpacity,chatBackgroundBlur,chatBackgroundScrim)
      VALUES (?,'Synthetic character','','','','',0,0,'',0,'Synthetic assistant','','','','','','','',1,0,0)`)
      .run('synthetic-old-character')
    const character = db.native.prepare('SELECT * FROM characters WHERE id=?').get('synthetic-old-character') as Record<string, unknown>
    const target: Record<string, unknown> & { id: string } = { ...character, id: 'synthetic-selected-character' }, columns = Object.keys(target)
    db.native.prepare(`INSERT INTO characters (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(column => target[column]))
    const conversations = new ConversationRepository(db), settings = new SettingLibraryRepository(db)
    const archives = new ConversationArchiveRepository(db, { read: id => settings.snapshotConversationRuntimeState(id), restore: (id, value) => settings.restoreConversationRuntimeState(id, value) })
    const sourceId = conversations.create({ metadata: { characterId: 'synthetic-old-character' } }).conversation.id
    const history = new ConversationStateRepository(db)
    history.recordTurn(sourceId, sourceId, 1, 'before', { variableStateJson: '{"score":1}', settingLibraryStateJson: '[]' })
    history.recordTurn(sourceId, sourceId, 1, 'after', { variableStateJson: '{"score":2}', settingLibraryStateJson: '[]' })
    const variables = new VariableStateRepository(db, new VariableConfigRepository(db))
    variables.replaceCurrent(sourceId, '{"score":99}')
    await ctx.plugin(SessionStore);await ctx.plugin(Jsonl, { root, compression: 'none' })
    const source = ctx.sessions.create(SessionId(sourceId), { meta: { cwd: root } })
    source.append('turn/start', { turn: 1 });source.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    source.append('session-log-deepseek/delivery-accepted', { sessionId: source.id, sessionFormatVersion: 4, throughSeq: 1 as any })
    const snapshot = archives.parse(archives.export(sourceId))
    db.native.prepare('DELETE FROM characters WHERE id=?').run('synthetic-old-character')
    const events = [...source.snapshotEvents(), { type: 'synthetic/opaque', seq: 3, time: 1, ignorable: true,
      data: { sessionId: source.id, childId: source.id, text: source.id } }]
    const archive = { format: 'eleckoi.desktop-chat-history', version, snapshot,
      sessionLogs: [{ header: source.header, inheritedEventCount: 0, events }] }
    const deleted: string[] = [], publish = vi.fn(), commit = vi.fn(archives.import.bind(archives))
    const owner = Object.create(ctx)
    Object.defineProperty(owner, 'eleckoiSessionEditor', { value: { deleteSession: async (id: string) => {
      deleted.push(id)
    } } })
    const service = { ownerContext: owner, productData: { readCharacters: () => ({ items: [{ id: 'synthetic-selected-character' }] }),
      parseConversationArchive: archives.parse.bind(archives), conversationArchiveRuntimeSessionIds: archives.runtimeThreadIds.bind(archives),
      requiredConversationArchiveRuntimeSessionIds: archives.requiredRuntimeThreadIds.bind(archives), importConversationArchive: commit }, changeFeed: { publish } }
    const importArchive = (value = archive, characterId = 'synthetic-selected-character') => ElecKoiConversationsApi.prototype.importArchive.call(service as any, characterId, JSON.stringify(value))
    const imported = await importArchive()
    expect(commit.mock.calls[0]?.[1]).toBe('synthetic-selected-character');expect(imported).not.toBe(source.id)
    expect(conversations.getCharacterBinding(imported).characterId).toBe('synthetic-selected-character')
    expect(archives.parse(archives.export(imported)).characterId).toBe('synthetic-selected-character')
    expect(JSON.parse(variables.viewerStates(imported).currentStateJson)).toEqual({ score: 99 })
    expect(history.variablesByTurn(imported, String(commit.mock.calls[0]![2].get(source.id)))).toEqual({ 1: '{"score":2}' })
    expect(db.native.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    const opened = await ctx.sessionPersistence.open(SessionId(imported), 'read')
    let restored: Session
    try {
      const log = await opened.read()
      restored = Session.fromRestore(SessionId(imported), log.events, opened.header, opened.inheritedEventCount, log.eventState)
      expect(acceptedThrough(restored)).toBe(-1)
      expect(log.events.slice(0, events.length)).toEqual(events)
      expect(opened.inheritedEventCount).toBe(events.length)
      expect(log.events.find(event => event.type === 'session-log-deepseek/delivery-accepted')?.data).toMatchObject({ sessionId: source.id })
    } finally { await opened.close() }
    restored!.append('turn/start', { turn: 2 });restored!.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    const writer = await ctx.sessionPersistence.open(SessionId(imported), 'write')
    try { await writer.append(restored!.snapshotEvents().slice(events.length + 1));await writer.flush() } finally { await writer.close() }
    const reread = await ctx.sessionPersistence.open(SessionId(imported), 'read');await reread.close()
    expect(publish).toHaveBeenCalledTimes(1);expect(deleted).toEqual([])
    await expect(importArchive(archive, 'synthetic-missing')).rejects.toMatchObject({ code: 'eleckoi/character/not-found' })
    const corrupt = structuredClone(archive)
    ;(corrupt.sessionLogs[0]!.events[2]!.data as any).sessionId = 'synthetic-unrelated-session'
    await expect(importArchive(corrupt)).rejects.toThrow('wrong Session')
    expect(commit).toHaveBeenCalledTimes(1)
    const persistence = owner.sessionPersistence
    Object.defineProperty(owner, 'sessionPersistence', { value: { create: persistence.create.bind(persistence), open: async () => { throw Error('Synthetic read-back failure') } } })
    await expect(importArchive()).rejects.toThrow('Synthetic read-back failure')
    expect(deleted).toHaveLength(1);expect(commit).toHaveBeenCalledTimes(1)
    expect(archive.snapshot.characterId).toBe('synthetic-old-character')
  } finally { await ctx.fiber.dispose();db.close();await rm(root, { recursive: true, force: true }) }
}, 30000)

it('retains nested inherited receipt owners, remaps known child relationships and closes an open archived tail through the official seed builder', () => {
  const ancestor = Session.create(SessionId('synthetic-ancestor'))
  ancestor.append('turn/start', { turn: 1 });ancestor.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  ancestor.append('session-log-deepseek/delivery-accepted', { sessionId: ancestor.id, sessionFormatVersion: 4, throughSeq: 1 as any })
  const source = Session.create(SessionId('synthetic-branch'), ancestor.snapshotEvents(),
    { ...ancestor.header, id: SessionId('synthetic-branch'), isSeeded: true, parentSession: ancestor.id }, SessionLogOffset(ancestor.seq))
  ;(source as any).append('subagent/catalog', { version: 0, mode: 'one-shot', childId: 'synthetic-child', childCreatedAt: 1 })
  source.append('session-log-deepseek/delivery-accepted', { sessionId: source.id, sessionFormatVersion: 4, throughSeq: source.seq - 1 as any })
  source.append('turn/start', { turn: 2 })
  const target = importedSession({ header: source.header, inheritedEventCount: source.inheritedEventCount, events: source.snapshotEvents() },
    'synthetic-imported', new Map([['synthetic-ancestor', 'synthetic-imported-parent'], ['synthetic-child', 'synthetic-imported-child']]))
  expect(target.header.parentSession).toBe('synthetic-imported-parent')
  expect(target.inheritedEventCount).toBe(source.seq)
  expect(acceptedThrough(target)).toBe(-1)
  expect(target.snapshotEvents().filter(event => event.type === 'session-log-deepseek/delivery-accepted').map(event => event.data.sessionId)).toEqual([ancestor.id, source.id])
  expect(target.snapshotEvents().find(event => String(event.type) === 'subagent/catalog')?.data).toMatchObject({ childId: 'synthetic-imported-child' })
  expect(target.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 2, reason: { kind: 'forked' } } })
  expect(importedSession({ header: ancestor.header, inheritedEventCount: 0, events: [] }, 'synthetic-empty', new Map()).snapshotEvents())
    .toMatchObject([{ type: 'session/end-seed', data: { inherited: true } }])
})
