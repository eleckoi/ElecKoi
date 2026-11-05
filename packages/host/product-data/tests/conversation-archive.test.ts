import { createCharacterOpenings } from '../../../shared/src/contracts/characterOpenings/schemas'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteDatabase } from '../src/storage/sqlite/SqliteDatabase'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { ConversationArchiveRepository } from '../src/domain/conversations/ConversationArchiveRepository'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'

const directories: string[] = []
const connections: SqliteDatabase[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('imports a conversation with its message structure under new IDs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-archive-'))
  directories.push(directory)
  const db = new SqliteDatabase(join(directory, 'test.sqlite3'))
  db.open()
  connections.push(db)
  db.native.prepare(`INSERT INTO characters(
    id,name,avatar,squareImage,coverImage,groupName,orderIndex,groupViewOrder,folder,
    frontendBeautyEnabled,assistantName,assistantAvatar,profileAge,profileSex,profileHeight,
    profileBirthday,profileLike,chatBackground,chatBackgroundOpacity,
    chatBackgroundBlur,chatBackgroundScrim
  ) VALUES (?,'测试角色','','','','',0,0,'',0,'测试助手','','','','','','','',1,0,0)`).run('character-test')
  db.native.prepare('INSERT INTO character_openings VALUES (?, ?)').run('character-test', JSON.stringify(createCharacterOpenings('character-test')))
  const conversations = new ConversationRepository(db)
  const source = conversations.create({ metadata: { characterId: 'character-test' } }).conversation.id
  const branch = db.native.prepare('SELECT activeBranchId AS id FROM agent_conversations WHERE id=?').get(source) as { id: string }
  db.native.prepare("INSERT INTO conversation_speakers(id,conversationId,sourceSpeakerId,kind,displayName,avatarAssetId) VALUES ('speaker-a',?,'user','user','测试用户','')").run(source)
  db.native.prepare("INSERT INTO agent_turns(id,conversationId,speakerId,kind,createdAt,variableStateJson) VALUES ('turn-a',?,'speaker-a','user','2026-01-01T00:00:00.000Z','{}')").run(source)
  db.native.prepare("INSERT INTO agent_branch_turns(branchId,sequence,turnId) VALUES (?,0,'turn-a')").run(branch.id)
  db.native.prepare("INSERT INTO conversation_speakers(id,conversationId,sourceSpeakerId,kind,displayName,avatarAssetId) VALUES ('speaker-b',?,'assistant','assistant','测试助手','')").run(source)
  db.native.prepare("INSERT INTO agent_responses(id,conversationId,turnId,responseIndex,speakerId,status,createdAt,runtimeThreadId,dshTurn) VALUES ('response-a',?,'turn-a',0,'speaker-b','completed','2026-01-01T00:00:01.000Z',?,1)").run(source, source)

  const settings = new SettingLibraryRepository(db)
  const archive = new ConversationArchiveRepository(db, {
    read: id => settings.snapshotConversationRuntimeState(id), restore: (id, raw) => settings.restoreConversationRuntimeState(id, raw)
  })
  const snapshot = archive.parse(archive.export(source))
  const imported = archive.import(snapshot, 'character-test', new Map([[source, 'new-runtime']]))
  const newBranch = db.native.prepare('SELECT activeBranchId AS id,runtimeThreadId FROM agent_conversations WHERE id=?').get(imported) as { id: string; runtimeThreadId: string }
  const turn = db.native.prepare('SELECT id,speakerId FROM agent_turns WHERE conversationId=?').get(imported) as { id: string; speakerId: string }
  const placement = db.native.prepare('SELECT branchId,turnId FROM agent_branch_turns WHERE branchId=?').get(newBranch.id) as { branchId: string; turnId: string }
  const response = db.native.prepare('SELECT id,turnId,speakerId,runtimeThreadId FROM agent_responses WHERE conversationId=?').get(imported) as { id: string; turnId: string; speakerId: string; runtimeThreadId: string }
  expect(imported).not.toBe(source)
  expect(newBranch.runtimeThreadId).toBe('new-runtime')
  expect(newBranch.id).not.toBe(branch.id)
  expect(turn.id).not.toBe('turn-a')
  expect(placement.turnId).toBe(turn.id)
  expect(response.id).not.toBe('response-a')
  expect(response.turnId).toBe(turn.id)
  expect(response.speakerId).not.toBe('speaker-b')
  expect(response.runtimeThreadId).toBe('new-runtime')
  expect(db.native.prepare('SELECT variableVersionId FROM agent_conversations WHERE id=?').get(source)).toEqual({ variableVersionId: '' })
  expect(db.native.prepare('SELECT variableVersionId FROM agent_conversations WHERE id=?').get(imported)).toEqual({ variableVersionId: '' })
  expect(db.native.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
