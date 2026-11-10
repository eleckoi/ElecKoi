import { CharacterOpeningRepository } from '../../packages/host/product-data/src/domain/characterOpenings'
import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { CharacterTransferService } from '../../packages/host/product-data/src/domain/characterTransfer/CharacterTransferService'
import { decodeVariableConfigSnapshot, encodeVariableConfigSnapshot } from '../../packages/host/product-data/src/domain/characterTransfer/portableSnapshots'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { resolveConversationSeed } from '../../packages/host/product-data/src/domain/conversations/conversationSeed'
import { SettingLibraryRepository } from '../../packages/host/product-data/src/domain/settingLibraries'
import { VariableConfigRepository } from '../../packages/host/product-data/src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../../packages/host/product-data/src/domain/variables/VariableStateRepository'
import { AgentPresetRepository } from '../../packages/host/product-data/src/domain/agentPresets'
import { RegexRuleRepository } from '../../packages/host/product-data/src/domain/regexRules/RegexRuleRepository'
import { SqliteDatabase } from '../helpers/SqliteDatabase'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
// @ts-expect-error Tool runtime has no TypeScript declaration.
import { apply as applyVariableTools } from '../../apps/desktop/resources/dsh/variable-tools.mjs'

const fixtures: Array<{ database: SqliteDatabase; directory: string }> = []
afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  for (const { database, directory } of fixtures.splice(0)) {
    database.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

const sourceSchema = `
  import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
  const Energy = initial => z.preprocess(value => Number(value ?? initial), z.number().min(0).max(20)).prefault(initial);
  const Member = z.object({ energy: Energy(2), note: z.string().nullable().prefault(null) });
  const Schema = z.object({
    status: z.object({ energy: Energy(4), label: z.string().prefault('  label  ') }),
    members: z.record(z.string(), Member).prefault({}),
  }).transform(state => ({ ...state, total: _.sum(Object.values(state.members).map(member => member.energy)) }));
  registerMvuSchema(Schema);
`

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-mvu-import-'))
  const database = new SqliteDatabase(join(directory, 'product.sqlite3'))
  database.open()
  fixtures.push({ database, directory })
  const libraries = new SettingLibraryRepository(database)
  const variables = new VariableConfigRepository(database)
  const conversations = new ConversationRepository(database, (characterId, db) => resolveConversationSeed(characterId, db, new CharacterOpeningRepository(database), variables))
  const media = new LocalMediaStore(join(directory, 'media'))
  const characters = new CharacterRepository(database, conversations, media)
  const presets = new AgentPresetRepository(database)
  presets.ensureInitialized()
  const transfers = new CharacterTransferService(database, characters, libraries, variables, new RegexRuleRepository(database, presets), media)
  const states = new VariableStateRepository(database, variables)
  const card = {
    spec: 'chara_card_v3', spec_version: '3.0', data: {
      name: 'Synthetic character', first_mes: 'Opening A',
      alternate_greetings: ['<initvar>{"status":{"energy":12},"members":{"two":{"energy":3}}}</initvar>'],
      character_book: { entries: [{ name: '[InitVar] Initial', enabled: false,
        content: '{"status":{"energy":4},"members":{"one":{"energy":8,"note":null}}}' }] },
      extensions: { tavern_helper: { scripts: [{ type: 'script', enabled: true, content: sourceSchema }] } },
    },
  }
  const preview = transfers.prepare([{ displayName: 'synthetic.json', mimeType: 'application/json',
    base64: Buffer.from(JSON.stringify(card)).toString('base64') }], 'sillytavern')
  expect(preview.items[0]?.importable).toBe(true)
  const characterId = transfers.commit(preview.token).importedCharacterIds[0]!
  return { database, directory, libraries, variables, conversations, states, characterId, transfers }
}

describe('MVU imported state persistence', () => {
  it('keeps every opening, dictionary seed and null through native tools, reopening and portable export', async () => {
    const f = setup()
    const imported = f.variables.get(f.characterId)
    expect(imported.versions).toHaveLength(2)
    expect(JSON.parse(imported.initialStateJson)).toEqual({
      status: { energy: 4, label: '  label  ' }, members: { one: { energy: 8, note: null } }, total: 8,
    })
    const conversationId = f.conversations.create({ metadata: { characterId: f.characterId } }).conversation.id
    const opening = new CharacterOpeningRepository(f.database).get(f.characterId).openingMessages[1]!
    f.conversations.selectOpening(conversationId, opening.id)
    const context = f.states.runtimeContext(conversationId, { characterId: f.characterId })!
    expect(JSON.parse(context.stateJson)).toEqual({
      status: { energy: 12, label: '  label  ' }, members: { two: { energy: 3, note: null } }, total: 3,
    })

    const snapshotRoot = join(f.directory, 'snapshots')
    mkdirSync(snapshotRoot)
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    const variableState = { enabled: true, config: {
      defaultState: JSON.parse(context.defaultStateJson), schemaCode: context.schemaCode,
      objects: context.objects, variables: context.variables,
    }, state: JSON.parse(context.stateJson) }
    const contexts = runtimeContextsFor(conversationId, { variables: variableState })
    const tools = new Map<string, { execute(args: unknown, execution: unknown): Promise<any> }>()
    applyVariableTools({ eleckoiRuntimeContexts: contexts, eleckoiVariableProcessing: new ElecKoiVariableProcessing({} as any), tools: { register(definition: any) { tools.set(definition.name, definition); return () => {} } } })
    const execution = { agent: { session: { id: conversationId } } }
    const patch = tools.get('eleckoi_apply_variable_patch')!
    expect(await patch.execute({ operations: [{ op: 'delta', path: '/members/two/energy', value: 5 }] }, execution)).toMatchObject({ status: 'ok' })
    const accepted = contexts.get(conversationId).variables.state
    expect(accepted.members.two).toEqual({ energy: 8, note: null })
    expect(accepted.total).toBe(8)
    expect(await patch.execute({ operations: [{ op: 'replace', path: '/status/energy', value: 21 }] }, execution))
      .toMatchObject({ status: 'validation_error', state_unchanged: true })
    expect(contexts.get(conversationId).variables.state).toEqual(accepted)
    f.states.replaceCurrent(conversationId, JSON.stringify(accepted))
    const selectedVersionId = f.variables.forConversation(conversationId, f.characterId)!.activeVersionId
    f.database.close()
    f.database.open()
    expect(JSON.parse(f.states.runtimeContext(conversationId, { characterId: f.characterId })!.stateJson)).toEqual(accepted)
    expect(f.variables.forConversation(conversationId, f.characterId)!.activeVersionId).toBe(selectedVersionId)
    const restored = decodeVariableConfigSnapshot(encodeVariableConfigSnapshot(f.variables.get(f.characterId)), f.characterId)
    expect(restored.versions.map(version => JSON.parse(version.initialStateJson))).toEqual(imported.versions.map(version => JSON.parse(version.initialStateJson)))
    expect(restored.versions.map(version => version.schemaCode)).toEqual(imported.versions.map(version => version.schemaCode))
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
    expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 60000)
})
