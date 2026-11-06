import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { CharacterTransferService } from '../src/domain/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { RegexRuleRepository } from '../src/domain/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { readPngText, writePngText } from '../src/storage/media/PngTextChunkCodec'
import { decodeCharacterCard } from '../src/domain/characterTransfer/characterCardFormats'

const databases: SqliteDatabase[] = []
const directories: string[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

function harness() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-export-files-'))
  directories.push(root)
  const database = new SqliteDatabase(join(root, 'data.sqlite3'))
  database.open()
  databases.push(database)
  const media = new LocalMediaStore(join(root, 'media'))
  const characters = new CharacterRepository(database, {
    deleteForCharacter() {},
    refreshCharacterIdentity() {}
  }, media)
  const settingLibraries = new SettingLibraryRepository(database)
  const variables = new VariableConfigRepository(database)
  const agentPresets = new AgentPresetRepository(database)
  agentPresets.ensureInitialized()
  const regexRules = new RegexRuleRepository(database, agentPresets)
  return {
    root,
    target: join(root, 'exported'),
    transfers: new CharacterTransferService(database, characters, settingLibraries, variables, regexRules, media),
    characters, settingLibraries
  }
}

function createCharacter(characters: CharacterRepository, id: string, name: string): void {
  characters.create({ id, name, group: '', persona: { assistant_name: name, opening: '你好。' } })
}

describe('character card batch export', () => {
  it('writes every selected card into the chosen directory and reports them', async () => {
    // target 目录故意不预建：选完目录后被删掉时，导出不应整批按 ENOENT 失败。
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', '角色甲')
    createCharacter(characters, 'card-2', '角色乙')

    const result = await transfers.exportMany(['card-1', 'card-2'], 'png', target)

    expect(result.failures).toEqual([])
    expect(result.written.map((item) => item.fileName).sort()).toEqual(['角色甲.png', '角色乙.png'].sort())
    expect(readdirSync(target).sort()).toEqual(['角色甲.png', '角色乙.png'].sort())
  })

  it('keeps a character name from escaping the chosen directory', async () => {
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', '..\\..\\坏:名字*?')

    const result = await transfers.exportMany(['card-1'], 'json', target)

    expect(result.written).toHaveLength(1)
    expect(result.written[0]!.fileName).not.toMatch(/[\\/:*?"<>|]/)
    expect(readdirSync(target)).toEqual([result.written[0]!.fileName])
  })

  it('does not overwrite an existing file: the second export gets a numeric suffix', async () => {
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', '角色甲')

    const first = await transfers.exportMany(['card-1'], 'png', target)
    writeFileSync(join(target, '角色甲.png'), 'existing file')
    const second = await transfers.exportMany(['card-1'], 'png', target)

    expect(first.written[0]!.fileName).toBe('角色甲.png')
    expect(second.written[0]!.fileName).toBe('角色甲 (2).png')
    expect(readdirSync(target).sort()).toEqual(['角色甲 (2).png', '角色甲.png'].sort())
    expect(readFileSync(join(target, '角色甲.png'), 'utf8')).toBe('existing file')
  })

  it('truncates an over-long character name so the file name stays legal', async () => {
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', '角'.repeat(300))

    const result = await transfers.exportMany(['card-1'], 'png', target)

    expect(result.failures).toEqual([])
    const fileName = result.written[0]!.fileName
    expect(fileName.endsWith('.png')).toBe(true)
    // 契约里 fileName 上限 260；留出扩展名与 " (2)" 序号的空间
    expect(fileName.length).toBeLessThanOrEqual(260)
    expect(readdirSync(target)).toEqual([fileName])
  })

  it('avoids Windows reserved device names', async () => {
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', 'NUL')

    const result = await transfers.exportMany(['card-1'], 'png', target)

    expect(result.failures).toEqual([])
    expect(result.written[0]!.fileName).toBe('_NUL.png')
    expect(readdirSync(target)).toEqual(['_NUL.png'])
  })

  it('reports the failing card and still writes the others', async () => {
    const { target, transfers, characters } = harness()
    createCharacter(characters, 'card-1', '角色甲')

    const result = await transfers.exportMany(['card-1', 'missing-card'], 'png', target)

    expect(result.written.map((item) => item.characterId)).toEqual(['card-1'])
    expect(result.failures).toEqual([{ characterId: 'missing-card', message: '找不到对应的角色卡。' }])
    expect(existsSync(join(target, '角色甲.png'))).toBe(true)
  })
})

const privateGroup = 'synthetic-private-user-group'
const plainPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
function cardRoot(bytes: Uint8Array, format: 'json' | 'png') {
  return JSON.parse(format === 'json' ? Buffer.from(bytes).toString('utf8')
    : gunzipSync(Buffer.from(readPngText(bytes).get('eleckoi-card')!, 'base64')).toString('utf8'))
}

describe('character cards exclude user grouping', () => {
  it.each(['json', 'png'] as const)('does not export a user group in single or batch %s cards', async format => {
    const { target, transfers, characters } = harness()
    characters.create({ id: 'synthetic-grouped-card', name: '合成分享角色', group: privateGroup, persona: { assistant_name: '合成分享角色' } })
    const before = characters.get()
    const exported = transfers.export('synthetic-grouped-card', format)
    const root = cardRoot(Buffer.from(exported.base64, 'base64'), format)
    expect(root.character).not.toHaveProperty('group')
    expect(JSON.stringify(root)).not.toContain(privateGroup)
    const result = await transfers.exportMany(['synthetic-grouped-card'], format, target)
    expect(result.failures).toEqual([])
    expect(cardRoot(readFileSync(join(target, result.written[0]!.fileName)), format).character).not.toHaveProperty('group')
    expect(characters.get()).toEqual(before)
  }, 30_000)

  it.each(['json', 'png'] as const)('ignores an old %s card user group during decode and import', format => {
    const { transfers, characters } = harness()
    characters.create({ id: 'synthetic-local-card', name: '合成本地角色', group: 'synthetic-local-group', persona: { assistant_name: '合成本地角色' } })
    const source = JSON.stringify({ format: 'eleckoi.character-card', version: 1,
      character: { name: '合成旧版卡片', group: privateGroup }, assets: [], regex_rules: [] })
    const bytes = format === 'json' ? Buffer.from(source) : writePngText(plainPng,
      new Map([['eleckoi-card', gzipSync(Buffer.from(source)).toString('base64')]]))
    expect(decodeCharacterCard(bytes, 'eleckoi').packageData.character).not.toHaveProperty('group')
    const preview = transfers.prepare([{ displayName: `synthetic-old-card.${format}`,
      mimeType: format === 'json' ? 'application/json' : 'image/png', base64: Buffer.from(bytes).toString('base64') }], 'eleckoi')
    expect(preview.items[0]!.errorMessage).toBe('')
    const imported = transfers.commit(preview.token)
    expect(imported.importedCharacterIds).toHaveLength(1)
    const collection = characters.get()
    expect(collection.items.find(item => item.id === imported.importedCharacterIds[0])!.group).toBe('')
    expect(collection.groups).toEqual(['synthetic-local-group'])
    expect(collection.items.find(item => item.id === 'synthetic-local-card')!.group).toBe('synthetic-local-group')
    const root = cardRoot(Buffer.from(transfers.export(imported.importedCharacterIds[0]!, format).base64, 'base64'), format)
    expect(JSON.stringify(root)).not.toContain(privateGroup)
  }, 30_000)

  it.each(['json', 'png'] as const)('removes old card data carried inside avatar PNGs from %s exports', format => {
    const { transfers, characters } = harness()
    const oldPayload = gzipSync(Buffer.from(JSON.stringify({ format: 'eleckoi.character-card', version: 1,
      character: { name: '合成旧卡', group: privateGroup }, assets: [], regex_rules: [] }))).toString('base64')
    const portrait = writePngText(plainPng, new Map([['eleckoi-card', oldPayload], ['chara', 'synthetic-old-card-data'], ['ccv3', 'synthetic-old-card-data'], ['Software', 'Synthetic image tool']]))
    const image = `data:image/png;base64,${Buffer.from(portrait).toString('base64')}`
    characters.create({ id: 'synthetic-image-card', name: '合成图片卡', group: privateGroup,
      persona: { assistant_name: '合成图片卡', assistant_avatar: image, assistant_square: image, assistant_cover: image } })
    const exportedBytes = Buffer.from(transfers.export('synthetic-image-card', format).base64, 'base64')
    const root = cardRoot(exportedBytes, format)
    expect(root.character).not.toHaveProperty('group')
    for (const asset of root.assets) {
      const metadata = readPngText(Buffer.from(asset.data, 'base64'))
      for (const keyword of ['eleckoi-card', 'chara', 'ccv3']) expect(metadata.has(keyword)).toBe(false)
      expect(metadata.get('Software')).toBe('Synthetic image tool')
    }
    if (format === 'png') {
      const metadata = readPngText(exportedBytes)
      expect(metadata.has('chara')).toBe(false)
      expect(metadata.has('ccv3')).toBe(false)
    }
  }, 30_000)
})
