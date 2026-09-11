import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'
import { ConversationRepository } from '../src/main/modules/conversations/ConversationRepository'
import { CharacterRepository } from '../src/main/modules/personas/CharacterRepository'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import { RegexRuleRepository } from '../src/main/modules/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/main/modules/agentPresets'
import type { RegexRule } from '../src/shared/contracts/regex/schemas'
import {
  includeImportedRulesInActiveVersion,
  rulesForSurface,
  transformCollectionSurface,
  transformWithRegexRules,
  validateRegexRule
} from '../src/shared/foundation/regex/RegexRuleProcessor'

const databases: SqliteDatabase[] = []
const directories: string[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

function rule(patch: Partial<RegexRule> = {}): RegexRule {
  return {
    id: 'rule-a',
    name: '规则',
    pattern: '/(hello) (?<name>world)/gi',
    replacement: '$1, $<name> / $& / $$ / {{MATCH}}',
    targets: ['AiOutput'],
    enabled: true,
    displayOnly: false,
    promptOnly: false,
    runOnEdit: false,
    order: 0,
    ...patch
  }
}

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-regex-test-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'data.sqlite3'))
  database.open()
  databases.push(database)
  const conversations = new ConversationRepository(database)
  const characters = new CharacterRepository(database, conversations, new LocalMediaStore(join(directory, 'media')))
  characters.replaceAll({
    active_character_id: 'card-a',
    groups: [],
    items: [{
      id: 'card-a',
      name: 'A',
      persona: { assistant_name: 'A', assistant_avatar: '', assistant_cover: '', opening: '', show_opening: false }
    }]
  })
  const agentPresets = new AgentPresetRepository(database)
  agentPresets.ensureInitialized()
  const repository = new RegexRuleRepository(database, agentPresets)
  return { database, repository }
}

describe('regex processor', () => {
  it('matches Android delimiter, flags and replacement semantics', () => {
    expect(transformWithRegexRules('HELLO world', [rule()], 'AiOutput'))
      .toBe('HELLO, world / HELLO world / $ / HELLO world')
    expect(transformWithRegexRules('one one', [rule({ pattern: '/one/', replacement: 'two' })], 'AiOutput'))
      .toBe('two one')
    expect(transformWithRegexRules('one one', [rule({ pattern: '/one/g', replacement: 'two' })], 'AiOutput'))
      .toBe('two two')
    expect(transformWithRegexRules('abc', [rule({ pattern: '/^/g', replacement: '>' })], 'AiOutput'))
      .toBe('>abc')
    expect(validateRegexRule(rule({ pattern: '/x/u' }))).toBe('不支持的正则标志：u')
  })

  it('keeps scope priority and Android surface rules', () => {
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准', revision: 0,
      globalRules: [rule({ id: 'global', pattern: '/x/g', replacement: 'g' })],
      agentPresetRules: [rule({ id: 'preset', pattern: '/g/g', replacement: 'p', displayOnly: true })],
      characterRules: [rule({ id: 'character', pattern: '/p/g', replacement: 'c', promptOnly: true })],
      versions: [], activeVersionId: ''
    }
    expect(transformCollectionSurface('x', collection, 'AiOutput', 'Display')).toBe('p')
    expect(rulesForSurface(collection, 'AiOutput', 'Stored').map((item) => item.id)).toEqual(['global'])
    expect(rulesForSurface(collection, 'AiOutput', 'Prompt').map((item) => item.id)).toEqual(['character'])
  })

  it('allows one rule on both display and prompt surfaces without changing stored text', () => {
    const shared = rule({ id: 'shared', displayOnly: true, promptOnly: true })
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准', revision: 0,
      globalRules: [], agentPresetRules: [], characterRules: [shared], versions: [], activeVersionId: ''
    }
    expect(rulesForSurface(collection, 'AiOutput', 'Display').map((item) => item.id)).toEqual(['shared'])
    expect(rulesForSurface(collection, 'AiOutput', 'Prompt').map((item) => item.id)).toEqual(['shared'])
    expect(rulesForSurface(collection, 'AiOutput', 'Stored')).toEqual([])
  })

  it('applies a saved regex preset to all three rule scopes', () => {
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准', revision: 0,
      globalRules: [rule({ id: 'global' })],
      agentPresetRules: [rule({ id: 'preset' })],
      characterRules: [rule({ id: 'character' })],
      versions: [{
        id: 'preset-a',
        name: '常用',
        globalEnabledIds: [],
        agentPresetEnabledIds: ['preset'],
        characterEnabledIds: []
      }],
      activeVersionId: 'preset-a'
    }
    expect(rulesForSurface(collection, 'AiOutput', 'Stored').map((item) => item.id)).toEqual(['preset'])
  })

  it('adds enabled imported rules to the active version without enabling disabled rules', () => {
    const enabled = rule({ id: 'enabled-import' })
    const disabled = rule({ id: 'disabled-import', enabled: false })
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准', revision: 0,
      globalRules: [], agentPresetRules: [], characterRules: [enabled, disabled],
      versions: [{
        id: 'version-a', name: '常用', globalEnabledIds: [], agentPresetEnabledIds: [], characterEnabledIds: []
      }],
      activeVersionId: 'version-a'
    }
    const updated = includeImportedRulesInActiveVersion(collection, [
      { scope: 'Character', rule: enabled },
      { scope: 'Character', rule: disabled }
    ])
    expect(updated.versions[0]?.characterEnabledIds).toEqual(['enabled-import'])
    expect(rulesForSurface(updated, 'AiOutput', 'Stored').map((item) => item.id)).toEqual(['enabled-import'])
  })
})

describe('regex repository', () => {
  it('persists all three scopes, enablement versions and optimistic revision', () => {
    const { database, repository } = harness()
    const empty = repository.get('card-a')
    expect(empty.agentPresetName).toBe('默认 Agent 预设')
    const saved = repository.save('card-a', {
      ...empty,
      globalRules: [rule({ id: 'global', pattern: '/foo/g', replacement: 'bar' })],
      agentPresetRules: [rule({ id: 'preset', pattern: '/bar/g', replacement: 'baz' })],
      characterRules: [rule({ id: 'character', pattern: '/baz/g', replacement: 'done' })],
      versions: [{
        id: 'version-a',
        name: '常用',
        globalEnabledIds: ['global'],
        agentPresetEnabledIds: ['preset'],
        characterEnabledIds: ['character']
      }],
      activeVersionId: 'version-a'
    }, empty.revision)
    expect(saved.revision).toBe(1)
    expect(saved.versions[0]?.agentPresetEnabledIds).toEqual(['preset'])
    expect(repository.transform('card-a', 'foo', 'AiOutput', 'Stored')).toBe('done')
    expect(database.native.prepare("SELECT content FROM agent_preset_contents WHERE kind='regex_rules'").get())
      .toEqual(expect.objectContaining({ content: expect.stringContaining('preset') }))
    expect(() => repository.save('card-a', saved, empty.revision)).toThrow('其他窗口更新')
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  })

  it('imports Tavern rules, keeps scopes and ignores unsupported depth metadata', () => {
    const { repository } = harness()
    const empty = repository.get('card-a')
    const imported = repository.import('card-a', 'Global', [{
      displayName: 'rules.json',
      json: JSON.stringify({ regex_scripts: [
        { scriptName: '显示清理', findRegex: '/<x>/g', replaceString: '', placement: [2], markdownOnly: true },
        { scriptName: '角色规则', findRegex: '/a/g', replaceString: 'b', scope: 'Character' },
        { scriptName: '保留外部规则', findRegex: '/c/g', minDepth: 1, maxDepth: 4 }
      ] })
    }], empty.revision)
    expect(imported.importedRuleCount).toBe(3)
    expect(imported.collection.globalRules[0]).toMatchObject({ name: '显示清理', displayOnly: true, targets: ['AiOutput'] })
    expect(imported.collection.globalRules[1]).toMatchObject({ name: '保留外部规则' })
    expect(imported.collection.characterRules[0]).toMatchObject({ name: '角色规则' })
    const exported = repository.export('card-a', imported.collection.globalRules.concat(imported.collection.characterRules).map((item) => item.id))
    expect(JSON.parse(exported.json)).toMatchObject({ format: 'eleckoi.regex-rules-export', version: 2 })
  })
})
