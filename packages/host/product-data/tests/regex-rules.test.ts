import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { RegexRuleRepository } from '../src/domain/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { MessageDisplayProjector } from '../src/domain/conversations/MessageDisplayProjector'
import { mvuMessageDisplayCompatibility } from '@eleckoi/compatibility-mvu'
import { regexRuleCollectionSchema, type RegexRule } from '../../../shared/src/contracts/regex/schemas'
import { ELECKOI_FAILURE_CODES } from '../../../shared/src/contracts/errors/codes'
// @ts-expect-error Renderer editing helpers do not publish TypeScript declarations.
import { moveRegexRuleToScope } from '../../../../apps/web/src/modules/regex/model/regexRulesEditing.js'
import {
  includeImportedRulesInActiveVersion,
  rulesForSurface,
  transformCollectionSurface,
  transformWithRegexRules,
  validateRegexRule
} from '../../../shared/src/foundation/regex/RegexRuleProcessor'
import { decorateRichDisplayReplacement, detectRichMessagePresentation } from '../../../shared/src/foundation/richMessage'

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
  return { agentPresets, database, repository }
}

it('imports long replacements and saves ten thousand global, character and version rows without a SQL parameter ceiling', () => {
  const { repository, database } = harness()
  const initial = repository.get('card-a')
  const large = 'Synthetic EJS text '.repeat(500001) + 'tail-marker'
  const imported = repository.import('card-a', 'Character', [{ displayName: 'synthetic-large.json',
    json: JSON.stringify([{ scriptName: 'Synthetic EJS', findRegex: '/synthetic/g', replaceString: large, scope: 'Character' }]) }], initial.revision)
  expect(imported.collection.characterRules[0]?.replacement).toBe(large)
  const current = imported.collection
  const rules = Array.from({ length: 10001 }, (_, index) => rule({ id: `synthetic-rule-${index}`, replacement: `value-${index}`, enabled: false }))
  const versions = Array.from({ length: 10001 }, (_, index) => ({ id: `synthetic-version-${index}`, name: `Version ${index}`,
    globalEnabledIds: [], agentPresetEnabledIds: [], characterEnabledIds: [] }))
  const saved = repository.save('card-a', { ...current, globalRules: rules, characterRules: rules.map(item => ({ ...item, id: `character-${item.id}` })), versions, activeVersionId: versions[0]!.id }, current.revision)
  database.close(); database.open()
  const reopened = repository.get('card-a')
  expect(reopened.globalRules).toEqual(saved.globalRules)
  expect(reopened.characterRules).toEqual(saved.characterRules)
  expect(reopened.versions).toEqual(saved.versions)
  for (const index of [0, 5000, 10000]) expect(reopened.characterRules[index]?.replacement).toBe(`value-${index}`)
}, 60000)

const EMPTY_PRESET_REGEX_REVISION = '0'.repeat(64)

describe('regex processor', () => {
  it('continues protecting standalone interactive fragments from later rules', () => {
    const result = transformWithRegexRules('SOURCE', [
      rule({ id: 'input', pattern: 'SOURCE', replacement: '<input id="synthetic-input" onclick="check(true || false)" />', order: 0 }),
      rule({ id: 'later', pattern: '\\|[^|]*\\|', replacement: 'Synthetic corrupted code', order: 1 }),
    ], 'AiOutput', { replacementDecorator: decorateRichDisplayReplacement, protectDecoratedReplacements: true })
    expect(result).toContain('true || false')
    expect(result).not.toContain('Synthetic corrupted code')
  })
  it.each(['fenced', 'raw'])('assembles a complete %s frontend before protecting its code from later display rules', kind => {
    const rules = [
      rule({ id: 'head', pattern: '<panel>', replacement: (kind === 'fenced' ? '```html\n' : '') + '<!doctype html><html><head></head><body>', order: 0 }),
      rule({ id: 'body', pattern: 'INFO', replacement: '<section>Synthetic info<script>const flag=true || false;</script></section>', order: 1 }),
      rule({ id: 'tail', pattern: '</panel>', replacement: '</body></html>' + (kind === 'fenced' ? '\n```' : ''), order: 2 }),
      rule({ id: 'later', pattern: '\\|[^|]*\\|', replacement: 'Synthetic corrupted code', order: 3 }),
    ]
    const text = transformWithRegexRules('<panel>INFO</panel>', rules, 'AiOutput', {
      replacementDecorator: decorateRichDisplayReplacement, protectDecoratedReplacements: true,
    })
    const presentation = detectRichMessagePresentation(text, false)!
    expect(presentation.parts).toHaveLength(1)
    const part = presentation.parts[0]!
    expect(part.kind).toBe('rich')
    if (part.kind !== 'rich') throw new Error('Expected one complete document')
    expect(part.document.source).toContain('<!doctype html>')
    expect(part.document.source).toContain('Synthetic info')
    expect(part.document.source).toContain('true || false')
    expect(part.document.source).not.toContain('Synthetic corrupted code')
  })
  it('maps a text position through global replacements and restored rich documents', () => {
    const position = { offset: 'prefix [CARD] <FINAL>'.length }
    const content = 'prefix [CARD] <FINAL>Body</FINAL> tail'
    const transformed = transformWithRegexRules(content, [
      rule({ pattern: '/\\[CARD\\]/g', replacement: '<section>Front panel</section>' }),
      rule({ id: 'wrapper', pattern: '<FINAL>([\\s\\S]*?)</FINAL>', replacement: '<article>$1</article>' })
    ], 'AiOutput', { position, protectDecoratedReplacements: true,
      replacementDecorator: value => `<rich>${value}</rich>` })
    expect(transformed.slice(0, position.offset)).toBe('prefix <rich><section>Front panel</section></rich> ')
    expect(transformed.slice(position.offset)).toBe('<rich><article>Body</article></rich> tail')
  })

  it('keeps persisted scope switches when a rule-only save omits enablement fields', () => {
    const { repository } = harness()
    let current = repository.get('card-a')
    current = repository.save('card-a', { ...current, globalEnabled: false, characterEnabled: false, agentPresetEnabled: false }, current.revision)
    const { globalEnabled: _global, characterEnabled: _character, agentPresetEnabled: _preset, ...rulesOnly } = current
    current = repository.save('card-a', { ...rulesOnly, characterRules: [rule()] }, current.revision)
    expect([current.globalEnabled, current.characterEnabled, current.agentPresetEnabled]).toEqual([false, false, false])
    const editor = repository.readEditor({ scope: 'character', ownerId: 'card-a' })
    const { globalEnabled: _editorGlobal, characterEnabled: _editorCharacter, ...editorRulesOnly } = editor
    expect(repository.saveEditor(editorRulesOnly)).toMatchObject({ globalEnabled: false, characterEnabled: false })
  })

  it('accepts extra configuration fields without persisting them', () => {
    const { repository } = harness()
    const current = repository.get('card-a')
    const input = {
      characterId: 'card-a', expectedRevision: current.revision,
      collection: regexRuleCollectionSchema.parse({
        ...current, editorOnly: true,
        characterRules: [{ ...rule(), editorOnly: true }]
      })
    }
    expect(input.collection).not.toHaveProperty('editorOnly')
    expect(input.collection.characterRules[0]).not.toHaveProperty('editorOnly')
    const saved = repository.save('card-a', input.collection, input.expectedRevision)
    expect(saved.characterRules).toHaveLength(1)
    expect(regexRuleCollectionSchema.safeParse({
      ...saved, characterRules: [{ ...rule(), enabled: 'yes' }]
    }).success).toBe(false)
  })

  it('matches Android delimiter, flags and replacement semantics', () => {
    expect(transformWithRegexRules('HELLO world', [rule()], 'AiOutput'))
      .toBe('HELLO, world / HELLO world / $ / HELLO world')
    expect(transformWithRegexRules('one one', [rule({ pattern: '/one/', replacement: 'two' })], 'AiOutput'))
      .toBe('two one')
    expect(transformWithRegexRules('one one', [rule({ pattern: '/one/g', replacement: 'two' })], 'AiOutput'))
      .toBe('two two')
    expect(transformWithRegexRules('abc', [rule({ pattern: '/^/g', replacement: '>' })], 'AiOutput'))
      .toBe('>abc')
    expect(validateRegexRule(rule({ pattern: '/x/u' }))).toBeNull()
    expect(transformWithRegexRules('sample', [rule({ pattern: '/\\p{Letter}+/u', replacement: 'word' })], 'AiOutput')).toBe('word')
    expect(validateRegexRule(rule({ pattern: '/x/z' }))).toBe('不支持的正则标志：z')
  })

  it('keeps scope priority and Android surface rules', () => {
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准',
      agentPresetRegexRevision: EMPTY_PRESET_REGEX_REVISION, revision: 0,
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
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准',
      agentPresetRegexRevision: EMPTY_PRESET_REGEX_REVISION, revision: 0,
      globalRules: [], agentPresetRules: [], characterRules: [shared], versions: [], activeVersionId: ''
    }
    expect(rulesForSurface(collection, 'AiOutput', 'Display').map((item) => item.id)).toEqual(['shared'])
    expect(rulesForSurface(collection, 'AiOutput', 'Prompt').map((item) => item.id)).toEqual(['shared'])
    expect(rulesForSurface(collection, 'AiOutput', 'Stored')).toEqual([])
  })

  it('applies a saved regex preset to all three rule scopes', () => {
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准',
      agentPresetRegexRevision: EMPTY_PRESET_REGEX_REVISION, revision: 0,
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
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准',
      agentPresetRegexRevision: EMPTY_PRESET_REGEX_REVISION, revision: 0,
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

  it('executes enabled rules by saved order within each scope', () => {
    const collection = {
      characterId: 'card-a', agentPresetId: 'preset', agentPresetName: '标准',
      agentPresetRegexRevision: EMPTY_PRESET_REGEX_REVISION, revision: 0,
      globalRules: [
        rule({ id: 'global-late', pattern: '/A/g', replacement: 'B', order: 20 }),
        rule({ id: 'global-early', pattern: '/B/g', replacement: 'C', order: 10 }),
      ],
      agentPresetRules: [],
      characterRules: [
        rule({ id: 'character-late', pattern: '/C/g', replacement: 'D', order: 20 }),
        rule({ id: 'character-early', pattern: '/B/g', replacement: 'C', order: 10 }),
      ],
      versions: [{ id: 'v1', name: '当前', globalEnabledIds: ['global-late', 'global-early'], agentPresetEnabledIds: [], characterEnabledIds: ['character-late', 'character-early'] }],
      activeVersionId: 'v1',
    }

    expect(rulesForSurface(collection, 'AiOutput', 'Display').map((item) => item.id))
      .toEqual(['global-early', 'global-late', 'character-early', 'character-late'])
    expect(transformWithRegexRules('A', rulesForSurface(collection, 'AiOutput', 'Display'), 'AiOutput'))
      .toBe('D')
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

  it('reports a malformed persisted target list as a shape error instead of storage corruption', () => {
    const { database, repository } = harness()
    const current = repository.get('card-a')
    repository.save('card-a', { ...current, characterRules: [rule()] }, current.revision)
    database.native.prepare('UPDATE character_regex_rules SET targetsJson = ?').run('"AiOutput"')
    let failure: unknown
    try { repository.get('card-a') } catch (error) { failure = error }
    // 形状不对是最具体的说法；重包成 storage/corrupt 会把功能内失败升级成应用级告警。
    expect(failure).toMatchObject({ code: ELECKOI_FAILURE_CODES.dataShapeInvalid, details: { what: '正则目标' } })
  })

  it('reads the active preset rules and rejects a stale page after the active preset changes', () => {
    const { agentPresets, repository } = harness()
    const initial = agentPresets.active()
    agentPresets.save({
      ...initial,
      regexRules: [rule({ id: 'preset-a', name: '预设 A' })]
    })
    const loaded = repository.get('card-a')
    expect(loaded.agentPresetRules.map((item) => item.id)).toEqual(['preset-a'])

    const next = agentPresets.create('预设 B')
    agentPresets.save({
      ...next,
      regexRules: [rule({ id: 'preset-b', name: '预设 B' })]
    })
    agentPresets.setActive(next.id)

    expect(repository.get('card-a')).toMatchObject({
      agentPresetId: next.id,
      agentPresetRules: [{ id: 'preset-b' }]
    })
    expect(() => repository.save('card-a', loaded, loaded.revision)).toThrow('当前 Agent 预设或其正则已在其他窗口更新')
    expect(agentPresets.active().regexRules.map((item) => item.id)).toEqual(['preset-b'])
  })

  it('rejects stale preset rules when the same active preset was edited elsewhere', () => {
    const { agentPresets, repository } = harness()
    const loaded = repository.get('card-a')
    const active = agentPresets.active()
    agentPresets.save({
      ...active,
      regexRules: [rule({ id: 'external', name: '外部更新' })]
    })

    expect(() => repository.save('card-a', {
      ...loaded,
      characterRules: [rule({ id: 'local', name: '本页修改' })]
    }, loaded.revision)).toThrow('当前 Agent 预设或其正则已在其他窗口更新')
    expect(agentPresets.active().regexRules.map((item) => item.id)).toEqual(['external'])
  })

  it('refreshes the same message after persisted preset edits without changing the regex state revision', () => {
    const { agentPresets, repository, database } = harness()
    const active = agentPresets.active()
    const displayRule = rule({ pattern: '/hello/g', replacement: '<section>Old display</section>', displayOnly: true })
    agentPresets.save({ ...active, regexRules: [displayRule] })
    const loaded = repository.get('card-a')
    const message = { id: 'assistant-a', conversationId: 'chat-a', role: 'assistant' as const,
      content: 'hello', variableStateJson: '{}', status: 'complete' as const, createdAt: '2026-10-10T00:00:00.000Z' }
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    expect(projector.project(message, loaded).displayContent).toContain('Old display')
    agentPresets.save({ ...agentPresets.active(), regexRules: [{ ...displayRule, replacement: 'New display' }] })
    const updated = repository.get('card-a')
    expect(updated.revision).toBe(loaded.revision)
    expect(updated.agentPresetRegexRevision).not.toBe(loaded.agentPresetRegexRevision)
    expect(projector.project(message, updated).displayContent).toBe('New display')
    const reread = new RegexRuleRepository(database, agentPresets).get('card-a')
    expect(reread.agentPresetRules[0]!.replacement).toBe('New display')
    expect(message.content).toBe('hello')
  }, 20_000)

  it('rejects a stale preset editor save after regex rules changed elsewhere', () => {
    const { agentPresets } = harness()
    const stale = agentPresets.active()
    agentPresets.save({
      ...stale,
      regexRules: [rule({ id: 'external', name: '外部更新' })]
    })

    expect(() => agentPresets.save({
      ...stale,
      name: '旧页面修改'
    }, stale.regexRules)).toThrow('当前预设正则已在其他窗口更新')
    expect(agentPresets.active()).toMatchObject({
      name: stale.name,
      regexRules: [{ id: 'external' }]
    })
  })

  it('imports Tavern rules and preserves native options after reopening and export', () => {
    const { repository, database, agentPresets } = harness()
    const empty = repository.get('card-a')
    const imported = repository.import('card-a', 'Global', [{
      displayName: 'rules.json',
      json: JSON.stringify({ regex_scripts: [
        { scriptName: '显示清理', findRegex: '/<x>/g', replaceString: '', placement: [2], markdownOnly: true },
        { scriptName: '角色规则', findRegex: '/a/g', replaceString: 'b', scope: 'Character' },
        { scriptName: '保留外部规则', findRegex: '/c/g', minDepth: 1, maxDepth: 4,
          trimStrings: ['prefix'], substituteRegex: 1 }
      ] })
    }], empty.revision)
    expect(imported.importedRuleCount).toBe(3)
    expect(imported.collection.globalRules[0]).toMatchObject({ name: '显示清理', displayOnly: true, targets: ['AiOutput'] })
    expect(imported.collection.globalRules[1]).toMatchObject({ name: '保留外部规则', minDepth: 1,
      maxDepth: 4, trimStrings: ['prefix'], substituteRegex: 1 })
    expect(imported.collection.characterRules[0]).toMatchObject({ name: '角色规则' })
    const exported = repository.export('card-a', imported.collection.globalRules.concat(imported.collection.characterRules).map((item) => item.id))
    expect(JSON.parse(exported.json)).toMatchObject({ format: 'eleckoi.regex-rules-export', version: 2 })
    expect(JSON.parse(exported.json).rules[1]).toMatchObject({ minDepth: 1, maxDepth: 4,
      trimStrings: ['prefix'], substituteRegex: 1 })
    database.close()
    database.open()
    const reopened = new RegexRuleRepository(database, agentPresets).get('card-a')
    expect(reopened.globalRules[1]).toEqual(imported.collection.globalRules[1])
  }, 20_000)
})


describe('regex editor ownership', () => {
  it('persists scope switches independently, preserves individual states and skips disabled scopes on all surfaces after reopen', () => {
    const { repository, agentPresets, database } = harness()
    const preset = agentPresets.active()
    const initial = repository.get('card-a')
    repository.save('card-a', { ...initial, globalRules: [rule({ id: 'global', pattern: '/a/g', replacement: 'g', targets: ['AiOutput', 'Reasoning'] })],
      agentPresetRules: [rule({ id: 'preset', pattern: '/g/g', replacement: 'p' })],
      characterRules: [rule({ id: 'character', pattern: '/p/g', replacement: 'c' })] }, initial.revision)
    expect(transformCollectionSurface('a', repository.get('card-a'), 'AiOutput', 'Display')).toBe('c')
    const target = { scope: 'preset' as const, ownerId: preset.id }
    repository.saveEditor({ ...repository.readEditor(target), globalEnabled: false, agentPresetEnabled: false })
    expect(repository.readEditor({ scope: 'character', ownerId: 'card-a' }).globalEnabled).toBe(false)
    const shared = repository.get('card-a')
    expect(shared.characterEnabled).toBe(true)
    expect(shared.globalRules[0]!.enabled).toBe(true)
    expect(shared.agentPresetRules[0]!.enabled).toBe(true)
    for (const surface of ['Display', 'Prompt', 'Stored'] as const) expect(transformCollectionSurface('a', shared, 'AiOutput', surface)).toBe('a')
    expect(rulesForSurface(shared, 'Reasoning', 'Display')).toEqual([])
    database.close(); database.open()
    expect(repository.get('card-a').agentPresetEnabled).toBe(false)
    repository.saveEditor({ ...repository.readEditor(target), globalEnabled: true, agentPresetEnabled: true })
    expect(transformCollectionSurface('a', repository.get('card-a'), 'AiOutput', 'Display')).toBe('c')
    const character = repository.readEditor({ scope: 'character', ownerId: 'card-a' })
    repository.saveEditor({ ...character, characterEnabled: false })
    expect(transformCollectionSurface('a', repository.get('card-a'), 'AiOutput', 'Display')).toBe('p')
  }, 30_000)
  it('moves scope membership in every enablement version and saves without losing inactive selections', () => {
    const { repository, agentPresets } = harness(), target = { scope: 'preset' as const, ownerId: agentPresets.active().id }
    const initial = repository.readEditor(target)
    const saved = repository.saveEditor({ ...initial, globalRules: [rule({ id: 'synthetic-movable' })],
      versions: ['synthetic-active', 'synthetic-inactive'].map(id => ({ id, name: id, globalEnabledIds: ['synthetic-movable'], agentPresetEnabledIds: [], characterEnabledIds: [] })), activeVersionId: 'synthetic-active' })
    const moved = repository.saveEditor(moveRegexRuleToScope(saved, 'Global', 'AgentPreset', 'synthetic-movable'))
    expect(moved.globalRules).toEqual([])
    expect(moved.agentPresetRules[0]!.id).toBe('synthetic-movable')
    expect(moved.versions.map(version => version.agentPresetEnabledIds)).toEqual([['synthetic-movable'], ['synthetic-movable']])
    expect(moved.versions.map(version => version.globalEnabledIds)).toEqual([[], []])
  })
  it('reads and saves a selected inactive preset without changing the character or active preset', () => {
    const { repository, agentPresets } = harness()
    const active = agentPresets.active(), inactive = agentPresets.create('Synthetic inactive preset', '', 'roleplay')
    repository.save('card-a', { ...repository.get('card-a'), characterRules: [rule({ id: 'synthetic-character-rule' })] }, 0)
    const characterBefore = repository.get('card-a').characterRules
    const target = { scope: 'preset' as const, ownerId: inactive.id }
    const editor = repository.readEditor(target)
    expect(editor.characterRules).toEqual([])
    repository.saveEditor({ ...editor, globalRules: [rule({ id: 'synthetic-global-rule' })], agentPresetRules: [rule({ id: 'synthetic-inactive-rule' })] })
    expect(agentPresets.get(inactive.id).regexRules.map(item => item.id)).toEqual(['synthetic-inactive-rule'])
    expect(agentPresets.active().id).toBe(active.id)
    expect(agentPresets.get(active.id).regexRules).toEqual(active.regexRules)
    expect(repository.get('card-a').characterRules).toEqual(characterBefore)
    expect(repository.readEditor({ scope: 'character', ownerId: 'card-a' }).globalRules.map(item => item.id)).toEqual(['synthetic-global-rule'])
    expect(repository.readEditor({ scope: 'character', ownerId: 'card-a' }).agentPresetRules).toEqual([])
  })

  it('saves character edits after a preset switch and retains hidden version memberships', () => {
    const { repository, agentPresets } = harness()
    const initial = repository.get('card-a'), active = agentPresets.active()
    repository.save('card-a', { ...initial, agentPresetRules: [rule({ id: 'synthetic-preset-rule' })], characterRules: [rule({ id: 'synthetic-character-rule' })],
      versions: [{ id: 'synthetic-version', name: 'Synthetic version', globalEnabledIds: [], agentPresetEnabledIds: ['synthetic-preset-rule'], characterEnabledIds: ['synthetic-character-rule'] }], activeVersionId: 'synthetic-version' }, initial.revision)
    const target = { scope: 'character' as const, ownerId: 'card-a' }, editor = repository.readEditor(target)
    expect(editor.versions[0]!.agentPresetEnabledIds).toEqual([])
    const other = agentPresets.create('Synthetic other preset', '', 'roleplay')
    agentPresets.setActive(other.id)
    repository.saveEditor({ ...editor, characterRules: editor.characterRules.map(item => ({ ...item, replacement: 'Synthetic changed' })) })
    expect(agentPresets.get(active.id).regexRules[0]!.id).toBe('synthetic-preset-rule')
    expect(repository.get('card-a').versions[0]!.agentPresetEnabledIds).toEqual(['synthetic-preset-rule'])
    expect(repository.get('card-a').characterRules[0]!.replacement).toBe('Synthetic changed')
  })

  it('rejects stale shared or owner drafts atomically and blocks hidden writes, imports and exports', () => {
    const { repository, agentPresets } = harness()
    const characterTarget = { scope: 'character' as const, ownerId: 'card-a' }, presetTarget = { scope: 'preset' as const, ownerId: agentPresets.active().id }
    const staleCharacter = repository.readEditor(characterTarget), presetDraft = repository.readEditor(presetTarget)
    repository.saveEditor({ ...presetDraft, globalRules: [rule({ id: 'synthetic-global' })] })
    expect(() => repository.saveEditor({ ...staleCharacter, characterRules: [rule({ id: 'synthetic-lost' })] })).toThrow('其他窗口更新')
    expect(repository.readEditor(characterTarget).characterRules).toEqual([])
    const stalePreset = repository.readEditor(presetTarget), preset = agentPresets.get(presetTarget.ownerId)
    agentPresets.save({ ...preset, regexRules: [rule({ id: 'synthetic-direct-preset' })] }, preset.regexRules)
    expect(() => repository.saveEditor(stalePreset)).toThrow('其他窗口更新')
    const character = repository.readEditor(characterTarget)
    expect(() => repository.saveEditor({ ...character, agentPresetRules: [rule()] })).toThrow('其他归属')
    expect(() => repository.saveEditor({ ...character, activeVersionId: 'synthetic-missing-version' })).toThrow('启用版本不存在')
    expect(() => repository.importEditor(character, 'Character', [{ displayName: 'synthetic.json', json: JSON.stringify([{ ...rule(), scope: 'AgentPreset' }]) }])).toThrow('其他归属')
    expect(() => repository.exportEditor(characterTarget, ['synthetic-direct-preset'])).toThrow('本编辑器')
    expect(repository.readEditor(characterTarget)).toEqual(character)
  })
})
