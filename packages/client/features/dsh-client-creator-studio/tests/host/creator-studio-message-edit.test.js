import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { readDshSessionLog, rewindDshSession } from '@eleckoi/dsh-runtime'
import { installCreatorStudioRuntime } from '../../src/host/runtime.mjs'
import { CREATOR_STUDIO_EVENT } from '../../src/host/projection.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-edit-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  for (const [name, value] of Object.entries({ ELECKOI_PRESET_TEMPLATE_PATH: join(root, 'template'), ELECKOI_PRESET_ROOT: join(root, 'presets'), ELECKOI_WORKSPACE_ROOT: root })) {
    const previous = process.env[name]; process.env[name] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous })
  }
  writeFileSync(join(root, 'template'), '- id: synthetic\n  name: synthetic\n' + ['variables', 'setting-library', 'web', 'workspace', 'collaboration', 'roleplay-workflow', 'workflow'].map(id => `# ELECKOI:${id}:BEGIN\n# ELECKOI:${id}:END\n`).join(''))
  const tools = { schemas: () => [] }
  const makeAgent = session => ({ session, ctx: { tools, on: () => () => {} }, status: 'idle', followup: vi.fn(), runMaintenance: action => action(new AbortController().signal) })
  const preset = { id: 'synthetic-creator', purpose: 'creator', name: 'Synthetic creator', activeVersionId: 'v1', roleplayPlan: { steps: [] },
    toolGroups: ['variables', 'setting-library', 'roleplay-workflow'].map(id => ({ id: `builtin:${id}`, included: false, enabled: false })) }
  const id = 'synthetic-studio-edit'
  const directory = join(root, 'logs', 'synthetic-project', 'synthetic-session'); mkdirSync(directory, { recursive: true })
  const path = join(directory, `session.v${sessionFormatCatalog.currentVersion}.jsonl`)
  const session = Session.create(SessionId(id))
  const initial = { presetId: 'synthetic-creator', characterId: 'synthetic-initial' }
  const selected = { ...initial, characterId: 'synthetic-selected' }
  const characters = [{ id: initial.characterId }, { id: selected.characterId }]
  session.append(CREATOR_STUDIO_EVENT, initial, { ignorable: true })
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const input = createUserMessage({ content: [{ type: 'text', text: '合成用户输入' }], source: { kind: 'user' } })
  const inputEvent = session.append('user/message', input, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append(CREATOR_STUDIO_EVENT, selected, { ignorable: true })
  session.append('session/title', { title: '合成自定义名称', messageSeqs: [], source: { kind: 'user' } })
  const save = value => writeFileSync(path, [sessionFormatCatalog.encodeCurrentHeader({ ...value.header, delegationDepth: 0 }, value.inheritedEventCount),
    ...value.snapshotEvents().map(event => sessionFormatCatalog.encodeCurrentEvent(event))].map(row => JSON.stringify(row)).join('\n') + '\n')
  save(session)
  let agent = makeAgent(session), service
  const meta = { cwd: root, agentPreset: 'synthetic-runtime-preset' }
  const controller = {
    inspect: vi.fn(async () => ({ meta, events: agent?.session.snapshotEvents() ?? readDshSessionLog(join(root, 'logs'), id).events })),
    create: vi.fn(),
    resolveAgent: vi.fn(async sessionId => {
      expect(sessionId).toBe(id)
      if (agent) return { agent }
      const log = readDshSessionLog(join(root, 'logs'), id)
      agent = makeAgent(Session.create(SessionId(id), log.events, log.header, log.inheritedEventCount))
      return { agent }
    }),
    rename: vi.fn(async ({ title }) => agent.session.append('session/title', { title, messageSeqs: [], source: { kind: 'user' } })),
  }
  const dispose = await installCreatorStudioRuntime({
    sessionController: controller, agents: { get: () => agent },
    eleckoiProductData: { readCharacters: () => ({ items: characters }), readAgentPresetCatalog: () => ({ activePresetIds: { creator: preset.id } }), readAgentPreset: () => preset },
    agentPresets: { register: async () => () => {}, recompose: async () => {} },
    agentDefaultModel: { currentSelection: () => ({ provider: 'synthetic', model: 'synthetic' }) },
    llm: { resolveModelInfo: async () => ({}) }, settings: { describe: () => [] },
    on: () => () => {}, get: () => tools,
    eleckoiSessionEditor: {
      transaction: async (_id, action) => action(),
      rewind: async (_id, turn, seq, retain) => { agent = undefined; return rewindDshSession(join(root, 'logs'), id, turn, seq, retain) },
    },
    provide: (_name, value) => { service = value },
  })
  cleanups.push(dispose)
  return { id, input, inputEvent, selected, characters, controller, service, current: () => agent }
}

describe('Studio message edits retain independent conversation preferences', { timeout: 30_000 }, () => {
  it('opens the same conversation after deleting its selected character and allows selecting another target', async () => {
    const f = await fixture()
    f.characters.splice(f.characters.findIndex(item => item.id === f.selected.characterId), 1)
    const before = f.current().session.snapshotEvents()
    await expect(f.service.open(f.id)).resolves.toEqual({ sessionId: f.id, ...f.selected, characterId: '' })
    expect(f.current().session.id).toBe(f.id)
    expect(f.current().session.snapshotEvents().slice(0, before.length)).toEqual(before)
    expect(f.current().session.snapshotEvents().findLast(event => event.type === CREATOR_STUDIO_EVENT).data).toEqual(f.selected)
    await expect(f.service.selectCharacter(f.id, 'synthetic-initial')).resolves.toEqual({
      sessionId: f.id, presetId: f.selected.presetId, characterId: 'synthetic-initial'
    })
    await expect(f.service.selectCharacter(f.id, '')).resolves.toEqual({ sessionId: f.id, ...f.selected, characterId: '' })
    await expect(f.service.selectCharacter(f.id, f.selected.characterId)).rejects.toThrow('找不到所选角色')
    expect(f.current().session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(1)
  })

  it.each(['delete', 'regenerate'])('keeps the current character and user title after %s removes later events', async operation => {
    const f = await fixture()
    if (operation === 'delete') await f.service.deleteMessagesFrom(f.id, f.inputEvent.seq, 'user')
    else await f.service.regenerate(f.id)
    const events = f.current().session.snapshotEvents()
    expect(f.current().session.id).toBe(f.id)
    expect(events.findLast(event => event.type === CREATOR_STUDIO_EVENT).data).toEqual(f.selected)
    expect(events.findLast(event => event.type === 'session/title').data).toMatchObject({ title: '合成自定义名称', source: { kind: 'user' } })
    expect(f.controller.rename).toHaveBeenCalledWith({ sessionId: f.id, title: '合成自定义名称' })
    const inputs = events.filter(event => event.type === 'user/message')
    expect(inputs).toHaveLength(0)
    if (operation === 'regenerate') expect(f.current().followup).toHaveBeenCalledWith(f.input)
  })
})
