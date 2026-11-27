import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { CharacterTransferService } from '../src/domain/characterTransfer/CharacterTransferService'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { RegexRuleRepository } from '../src/domain/regexRules/RegexRuleRepository'
import { decodeCharacterCard } from '../src/domain/characterTransfer/characterCardFormats'

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const resources: Array<{ directory: string; database: SqliteDatabase }> = []
afterEach(() => {
  for (const { database, directory } of resources.splice(0)) { database.close(); rmSync(directory, { recursive: true, force: true }) }
})
function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-card-author-'))
  const database = new SqliteDatabase(join(directory, 'common.sqlite3'))
  database.open(); resources.push({ directory, database })
  const media = new LocalMediaStore(join(directory, 'media'))
  const characters = new CharacterRepository(database, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, media)
  const presets = new AgentPresetRepository(database)
  const transfers = new CharacterTransferService(database, characters, new SettingLibraryRepository(database), new VariableConfigRepository(database), new RegexRuleRepository(database, presets), media)
  return { database, media, characters, transfers }
}

it('persists author identity independently of the player, survives reopen and preserves omitted fields', () => {
  const { database, media, characters } = harness()
  characters.create({ id: 'card', name: '角色', authorName: '原作者', authorAvatar: image })
  const saved = characters.get().items[0]!
  const path = media.pathForReference(saved.authorAvatar!)!
  expect(saved).toMatchObject({ authorName: '原作者' })
  expect(saved.authorAvatar).toMatch(/^eleckoi-media:/)
  expect(readFileSync(path)).toEqual(Buffer.from(image.split(',')[1]!, 'base64'))
  characters.update({ id: 'card', name: '改名' })
  database.close(); database.open()
  expect(characters.get().items[0]).toMatchObject({ authorName: '原作者', authorAvatar: saved.authorAvatar })
  expect(existsSync(path)).toBe(true)
  characters.update({ ...characters.get().items[0]!, authorName: '', authorAvatar: '' })
  expect(characters.get().items[0]).toMatchObject({ authorName: '', authorAvatar: '' })
  expect(existsSync(path)).toBe(false)
})

it.each(['png', 'zip'] as const)('round trips author name and owned avatar in %s without source paths', format => {
  const { characters, transfers, media, database } = harness()
  characters.create({ id: 'card', name: '角色', authorName: '原作者 ✨', authorAvatar: image, persona: { assistant_cover: image } })
  const original = characters.get().items[0]!
  const exported = transfers.export('card', format)
  const decoded = decodeCharacterCard(Buffer.from(exported.base64, 'base64'), 'eleckoi')
  expect(decoded.packageData.character.authorName).toBe('原作者 ✨')
  expect(decoded.packageData.assets.find(asset => asset.key === 'author.avatar')?.bytes).toEqual(Buffer.from(image.split(',')[1]!, 'base64'))
  expect(JSON.stringify(decoded.packageData.character)).not.toContain('eleckoi-media:')
  const preview = transfers.prepare([{ displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }], 'eleckoi')
  const id = transfers.commit(preview.token).importedCharacterIds[0]!
  database.close(); database.open()
  const imported = characters.get().items.find(item => item.id === id)!
  expect(imported.authorName).toBe('原作者 ✨')
  expect(imported.authorAvatar).not.toBe(original.authorAvatar)
  characters.delete(['card'])
  expect(readFileSync(media.pathForReference(imported.authorAvatar!)!)).toEqual(Buffer.from(image.split(',')[1]!, 'base64'))
})

it('reads Tavern creator as author and leaves older cards without authors empty', () => {
  const { transfers, characters } = harness()
  for (const creator of ['酒馆原作者', undefined]) {
    const preview = transfers.prepare([{ displayName: 'card.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify({ spec: 'chara_card_v2', data: { name: '角色', creator, creator_notes: '这是说明，不是作者名' } })).toString('base64') }], 'sillytavern')
    const id = transfers.commit(preview.token).importedCharacterIds[0]!
    expect(characters.get().items.find(item => item.id === id)).toMatchObject({ authorName: creator ?? '', authorAvatar: '' })
  }
})

it('rolls back staged author media and metadata when a card transaction fails', () => {
  const { characters, media, database } = harness()
  characters.create({ id: 'card', name: '角色', authorName: '原作者', authorAvatar: image })
  const saved = characters.get().items[0]!
  const path = media.pathForReference(saved.authorAvatar!)!
  database.native.exec("CREATE TRIGGER reject_author BEFORE UPDATE ON character_text_contents WHEN NEW.kind = 'author_name' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
  expect(() => characters.update({ ...saved, authorName: '失败的修改', authorAvatar: '' })).toThrow('synthetic failure')
  expect(characters.get().items[0]).toMatchObject({ authorName: '原作者', authorAvatar: saved.authorAvatar })
  expect(existsSync(path)).toBe(true)
})
