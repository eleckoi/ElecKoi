import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CharacterTransferService } from '../src/main/modules/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../src/main/modules/personas/CharacterRepository'
import { RegexRuleRepository } from '../src/main/modules/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/main/modules/agentPresets'
import { SettingLibraryRepository } from '../src/main/modules/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/main/modules/variables/VariableConfigRepository'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'

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
    flushCleanup() {},
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
    characters
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
