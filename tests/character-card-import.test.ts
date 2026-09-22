import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeCharacterCard } from '../src/main/modules/characterTransfer/characterCardFormats'
import { CharacterTransferService } from '../src/main/modules/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../src/main/modules/personas/CharacterRepository'
import { RegexRuleRepository } from '../src/main/modules/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/main/modules/agentPresets'
import { SettingLibraryRepository } from '../src/main/modules/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/main/modules/variables/VariableConfigRepository'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'
import { UserSettingsStore } from '../src/main/modules/settings/UserSettingsStore'
import { APP_DEFAULT_CHAT_BACKGROUND } from '../src/shared/contracts/characters/chatBackground'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import { decodeSettingLibrarySnapshot } from '../src/main/modules/characterTransfer/portableSnapshots'
import { readPngText } from '../src/main/platform/filesystem/PngTextChunkCodec'

const encoder = new TextEncoder()
const databases: SqliteDatabase[] = []
const directories: string[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function pngText(entries: Array<[string, string]>): Uint8Array {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunks = entries.map(([key, value]) => chunk('tEXt', Uint8Array.from(Buffer.from(`${key}\0${value}`, 'latin1'))))
  return concat([signature, ...chunks, chunk('IEND', new Uint8Array())])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12)
  new DataView(result.buffer).setUint32(0, data.length, false)
  result.set(encoder.encode(type), 4)
  result.set(data, 8)
  return result
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function tavernCard(name = '测试角色甲') {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name,
      description: '用于验证导入流程的虚构角色。',
      first_mes: '你好。',
      alternate_greetings: ['晚上好。', '你好。'],
      character_book: {
        name: '世界设定',
        entries: [
          { name: '舞台', content: '故事发生在未来舞台。', constant: true, enabled: true },
          { name: '歌声', content: '提到歌曲时读取。', keys: ['歌曲'], enabled: true },
          { name: '[initvar]初始变量', content: '{"关系":{"好感度":12}}', constant: true }
        ]
      },
      extensions: {
        tavern_helper: { variables: { 关系: { 好感度: 12 } } },
        regex_scripts: [
          {
            scriptName: '清理测试标签',
            findRegex: '/<sample>[\\s\\S]*?<\\/sample>/g',
            replaceString: '',
            placement: [2],
            minDepth: 1,
            maxDepth: 4
          },
          {
            scriptName: '保留双表面标记',
            findRegex: '/\\[sample-private\\][\\s\\S]*?\\[\\/sample-private\\]/g',
            replaceString: '',
            placement: [1, 2],
            markdownOnly: true,
            promptOnly: true,
            disabled: true
          }
        ]
      }
    }
  }
}

describe('character card import', () => {
  it('rejects retired setting kinds embedded in an ElecKoi character package', () => {
    expect(() => decodeSettingLibrarySnapshot(JSON.stringify({
      format: 'eleckoi.setting-library-snapshot',
      active_version_id: 'v1',
      versions: [{
        id: 'v1', name: '设定', entries: [{ id: 'old-plan', kind: 'roleplay_plan' }],
        groups: [], prompt_positions: [], list_all_expanded: true, expanded_group_ids: []
      }]
    }), 'character'))
      .toThrow('角色卡设定类型不受支持')
  })

  it('converts SillyTavern JSON into the current desktop domains', () => {
    const decoded = decodeCharacterCard(jsonBytes(tavernCard()), 'sillytavern')

    expect(decoded.packageData.character).toMatchObject({
      name: '测试角色甲',
      opening: '你好。',
      showOpening: true
    })
    expect(decoded.packageData.character).not.toHaveProperty('chatBackgroundOpacity')
    expect(decoded.packageData.character).not.toHaveProperty('chatBackgroundBlur')
    expect(decoded.packageData.character).not.toHaveProperty('chatBackgroundScrim')
    expect(decoded.settingLibrary?.groups.map((group) => group.name)).toEqual(['角色基础设定', '世界设定'])
    expect(decoded.settingLibrary?.entries.map((entry) => entry.title)).toEqual(expect.arrayContaining([
      'AI角色开场白', '角色描述', '舞台', '歌声'
    ]))
    expect(decoded.settingLibrary?.entries.find((entry) => entry.title === '舞台')?.agentReadStrategy).toBe('required')
    expect(decoded.settingLibrary?.entries.find((entry) => entry.title === '歌声')?.keywords).toEqual(['歌曲'])
    expect(decoded.variableConfig?.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '好感度', defaultValue: '12' })
    ]))
    expect(decoded.regexRules).toEqual([
      expect.objectContaining({ name: '清理测试标签', targets: ['AiOutput'] }),
      expect.objectContaining({ name: '保留双表面标记', enabled: false, displayOnly: true, promptOnly: true })
    ])
    expect(decoded.summary).toContain('开场白 2')
  })

  it('uses ccv3 before chara and accepts the same card as PNG', () => {
    const ccv3 = Buffer.from(JSON.stringify(tavernCard('CCV3 角色'))).toString('base64')
    const chara = Buffer.from(JSON.stringify(tavernCard('旧字段角色'))).toString('base64')
    const decoded = decodeCharacterCard(pngText([['chara', chara], ['ccv3', ccv3]]), 'sillytavern')

    expect(decoded.packageData.character.name).toBe('CCV3 角色')
    expect(decoded.sourceImage).toBeInstanceOf(Uint8Array)
  })

  it('maps world book scan depth onto the keyword scan window', () => {
    const depthOf = (book: Record<string, unknown>, title: string): number | undefined => {
      const source = tavernCard('扫描深度')
      source.data.character_book = book as unknown as typeof source.data.character_book
      const decoded = decodeCharacterCard(jsonBytes(source), 'sillytavern')
      return decoded.settingLibrary?.entries.find((entry) => entry.title === title)?.keywordScanDepth
    }

    expect(depthOf({ entries: [{ name: '条目级优先', content: 'A', keys: ['甲'], extensions: { scan_depth: 4 } }] }, '条目级优先')).toBe(4)
    expect(depthOf({ scan_depth: 3, entries: [{ name: '跟随书级', content: 'B', keys: ['乙'], extensions: { scan_depth: null } }] }, '跟随书级')).toBe(3)
    expect(depthOf({ entries: [{ name: '缺省兜底', content: 'C', keys: ['丙'] }] }, '缺省兜底')).toBe(2)
    expect(depthOf({ entries: [{ name: '上限截断', content: 'D', keys: ['丁'], extensions: { scan_depth: 2000 } }] }, '上限截断')).toBe(1000)
    expect(depthOf({ entries: [{ name: '零值抬到最小', content: 'E', keys: ['戊'], extensions: { scan_depth: 0 } }] }, '零值抬到最小')).toBe(1)
    expect(depthOf({ scan_depth: 3, entries: [{ name: '条目级覆盖书级', content: 'F', keys: ['己'], extensions: { scan_depth: 5 } }] }, '条目级覆盖书级')).toBe(5)
  })

  it('keeps MVU schema field boundaries after supplementary Unicode characters', () => {
    const source = tavernCard('Unicode MVU')
    source.data.character_book.entries = [{
      name: '[initvar]初始变量',
      content: 'user:\n  名称: 主角\n  标签:\n    - 🎲 玩家\n    - 旅行者\n世界:\n  状态: 待激活',
      constant: true
    }]
    source.data.extensions.tavern_helper = {
      variables: {},
      scripts: [{
        name: 'MVU变量结构',
        enabled: true,
        content: `
          const Schema = z.object({
            user: z.object({
              名称: z.string().prefault('🎲 主角'),
              标签: z.array(z.string()),
            }),
            世界: z.object({
              状态: z.string().prefault('待激活'),
            }),
          });
          $(() => registerMvuSchema(Schema));
        `
      }]
    } as unknown as typeof source.data.extensions.tavern_helper

    const decoded = decodeCharacterCard(jsonBytes(source), 'sillytavern')

    expect(JSON.parse(decoded.variableConfig?.initialStateJson ?? '{}')).toEqual({
      user: { 名称: '主角', 标签: ['🎲 玩家', '旅行者'] },
      世界: { 状态: '待激活' }
    })
    expect(decoded.variableConfig?.objects.map((item) => item.name)).toEqual(['user', '世界'])
    expect(decoded.variableConfig?.variables.map((item) => item.title)).toEqual(['名称', '标签', '状态'])
  })

  it('does not treat third-party JSON as an ElecKoi character card', () => {
    expect(() => decodeCharacterCard(jsonBytes({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: { name: '本项目角色', first_mes: '开场白' }
    }), 'eleckoi')).toThrow('这不是 ElecKoi 角色卡')
  })

  it('exports one complete ElecKoi payload as both JSON and a single-block PNG', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-card-export-'))
    directories.push(directory)
    const database = new SqliteDatabase(join(directory, 'data.sqlite3'))
    database.open()
    databases.push(database)
    const media = new LocalMediaStore(join(directory, 'media'))
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
    const picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    characters.create({
      id: 'export-character',
      name: '完整角色',
      group: '测试组',
      frontendBeautyEnabled: true,
      profileAge: '18',
      profileSex: '女',
      profileHeight: '160',
      profileBirthday: '09-15',
      profileLike: '唱歌',
      chatBackground: picture,
      chatBackgroundOpacity: 0.25,
      chatBackgroundBlur: 9,
      chatBackgroundScrim: 0.8,
      persona: {
        assistant_name: '完整角色',
        assistant_avatar: picture,
        assistant_square: picture,
        assistant_cover: picture,
        image_prompt: '蓝色长发',
        opening: '你好。',
        show_opening: true
      }
    })
    const regex = regexRules.get('export-character')
    regexRules.save('export-character', {
      ...regex,
      characterRules: [{
        id: 'character-rule',
        name: '角色规则',
        pattern: '测试',
        replacement: '完成',
        targets: ['AiOutput'],
        enabled: false,
        displayOnly: true,
        promptOnly: false,
        runOnEdit: true,
        order: 0
      }]
    }, regex.revision)
    const transfers = new CharacterTransferService(database, characters, settingLibraries, variables, regexRules, media)

    const jsonExport = transfers.export('export-character', 'json')
    const root = JSON.parse(Buffer.from(jsonExport.base64, 'base64').toString('utf8'))
    expect(jsonExport.fileName).toBe('完整角色.json')
    expect(root).toMatchObject({ format: 'eleckoi.character-card', version: 1 })
    expect(root.character).not.toHaveProperty('chat_background_mode')
    expect(root.character).not.toHaveProperty('chat_background_opacity')
    expect(root.assets.map((asset: { key: string }) => asset.key)).toEqual([
      'avatar.circle', 'avatar.square', 'avatar.portrait'
    ])
    expect(JSON.parse(root.setting_library).versions.length).toBeGreaterThan(0)
    expect(JSON.parse(root.variable_config).versions.length).toBeGreaterThan(0)
    expect(root.regex_rules).toEqual([
      expect.objectContaining({ id: 'character-rule', enabled: false, display_only: true, run_on_edit: true })
    ])

    const pngExport = transfers.export('export-character', 'png')
    const pngBytes = Buffer.from(pngExport.base64, 'base64')
    const text = readPngText(pngBytes)
    expect([...text.keys()]).toEqual(['eleckoi-card'])
    expect(text.has('chara')).toBe(false)
    expect(text.has('ccv3')).toBe(false)
    const decodedPng = decodeCharacterCard(pngBytes, 'eleckoi')
    expect(decodedPng.packageData.character).toEqual(decodeCharacterCard(Buffer.from(jsonExport.base64, 'base64'), 'eleckoi').packageData.character)
    expect(decodedPng.regexRules).toEqual([
      expect.objectContaining({ id: 'character-rule', enabled: false, displayOnly: true, runOnEdit: true })
    ])

    const preview = transfers.prepare([{
      displayName: jsonExport.fileName,
      mimeType: jsonExport.mimeType,
      base64: jsonExport.base64
    }], 'eleckoi')
    const imported = transfers.commit(preview.token)
    const importedId = imported.importedCharacterIds[0]!
    expect(settingLibraries.get(importedId).versions.length).toBeGreaterThan(0)
    expect(variables.get(importedId).versions.length).toBeGreaterThan(0)
    expect(regexRules.get(importedId).characterRules).toEqual([
      expect.objectContaining({ name: '角色规则', enabled: false })
    ])
  })

  it('commits one converted card and its settings, variables and regex atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-card-import-'))
    directories.push(directory)
    const database = new SqliteDatabase(join(directory, 'data.sqlite3'))
    database.open()
    databases.push(database)
    const media = new LocalMediaStore(join(directory, 'media'))
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
    const transfers = new CharacterTransferService(database, characters, settingLibraries, variables, regexRules)
    const preview = transfers.prepare([{
      displayName: 'synthetic-character.json',
      mimeType: 'application/json',
      base64: Buffer.from(JSON.stringify(tavernCard())).toString('base64')
    }], 'sillytavern')

    expect(preview.items[0]).toMatchObject({ name: '测试角色甲', importable: true, imageAvailable: false })
    const result = transfers.commit(preview.token)
    const characterId = result.importedCharacterIds[0]!
    expect(result.collection.active_character_id).toBe(characterId)
    expect(result.collection.items[0]).toMatchObject({
      id: characterId,
      name: '测试角色甲',
      chatBackground: '',
      chatBackgroundOpacity: 0.72,
      chatBackgroundBlur: 2,
      chatBackgroundScrim: 0.5
    })
    expect(settingLibraries.get(characterId).entries.some((entry) => entry.title === '角色描述')).toBe(true)
    expect(variables.get(characterId).variables.some((variable) => variable.title === '好感度')).toBe(true)
    expect(regexRules.get(characterId).characterRules.map((rule) => rule.name)).toEqual([
      '清理测试标签',
      '保留双表面标记'
    ])
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('applies the saved default background to newly created and imported characters', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-card-background-import-'))
    directories.push(directory)
    const database = new SqliteDatabase(join(directory, 'data.sqlite3'))
    database.open()
    databases.push(database)
    const media = new LocalMediaStore(join(directory, 'media'))
    const userSettings = new UserSettingsStore(database, media)
    userSettings.write('appearance.ui', { new_character_background: 'app' })
    const characters = new CharacterRepository(database, {
      deleteForCharacter() {},
      flushCleanup() {},
      refreshCharacterIdentity() {}
    }, media, () => userSettings.read('appearance.ui').new_character_background === 'app'
      ? APP_DEFAULT_CHAT_BACKGROUND
      : '')
    const settingLibraries = new SettingLibraryRepository(database)
    const variables = new VariableConfigRepository(database)
    const agentPresets = new AgentPresetRepository(database)
    agentPresets.ensureInitialized()
    const regexRules = new RegexRuleRepository(database, agentPresets)
    characters.create({
      id: 'manual-character',
      name: '手动创建角色',
      group: '',
      chatBackground: '',
      persona: { assistant_name: '手动创建角色', assistant_avatar: '', opening: '', show_opening: false }
    })
    expect(characters.get().items.find((item) => item.id === 'manual-character')).toMatchObject({
      chatBackground: APP_DEFAULT_CHAT_BACKGROUND
    })

    const transfers = new CharacterTransferService(database, characters, settingLibraries, variables, regexRules)
    const preview = transfers.prepare([{
      displayName: 'solid-background.json',
      mimeType: 'application/json',
      base64: Buffer.from(JSON.stringify(tavernCard('纯色背景角色'))).toString('base64')
    }], 'sillytavern')

    const result = transfers.commit(preview.token)
    expect(result.collection.items.find((item) => item.name === '纯色背景角色')).toMatchObject({
      name: '纯色背景角色',
      chatBackground: APP_DEFAULT_CHAT_BACKGROUND
    })
  })
})
