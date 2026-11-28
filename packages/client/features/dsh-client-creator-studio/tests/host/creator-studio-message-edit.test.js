import { queryFromInspection } from '../../../../../../tests/helpers/session-query.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { deleteDshSessionMessagesFrom, editDshSessionMessage, readDshSessionLog, rewindDshSession } from '@eleckoi/dsh-runtime'
import { installCreatorStudioRuntime } from '../../src/host/runtime.mjs'
import { CREATOR_STUDIO_EVENT } from '../../src/host/projection.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture({ legacy = false, modelSelection, richInput = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-edit-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  for (const [name, value] of Object.entries({ ELECKOI_PRESET_TEMPLATE_PATH: join(root, 'template'), ELECKOI_PRESET_ROOT: join(root, 'presets'), ELECKOI_WORKSPACE_ROOT: root })) {
    const previous = process.env[name]; process.env[name] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous })
  }
  writeFileSync(join(root, 'template'), '- id: synthetic\n  name: synthetic\n' + ['variables', 'setting-library', 'web', 'workspace', 'collaboration', 'roleplay-workflow', 'workflow'].map(id => `# ELECKOI:${id}:BEGIN\n# ELECKOI:${id}:END\n`).join(''))
  const tools = { schemas: () => [] }
  const makeAgent = session => ({ session, model: {
    current: () => session.snapshotEvents().findLast(event => event.type === 'model/selection')?.data ?? { provider: 'synthetic', model: 'synthetic' },
    select: selection => session.append('model/selection', selection),
  }, ctx: { tools, on: () => () => {} }, status: 'idle', followup: vi.fn(), runMaintenance: action => action(new AbortController().signal) })
  const preset = { id: 'synthetic-creator', purpose: 'creator', name: 'Synthetic creator', activeVersionId: 'v1', roleplayPlan: { steps: [] },
    toolGroups: ['variables', 'setting-library', 'roleplay-workflow'].map(id => ({ id: `builtin:${id}`, included: false, enabled: false })) }
  const id = 'synthetic-studio-edit'
  const runtimePreset = legacy ? `eleckoi-creator-${'a'.repeat(64)}` : 'synthetic-runtime-preset'
  const session = Session.create(SessionId(id), [], { ...Session.create(SessionId(id)).header, cwd: root, agentPreset: runtimePreset })
  const initial = { presetId: 'synthetic-creator', characterId: 'synthetic-initial' }
  const selected = { ...initial, characterId: 'synthetic-selected' }
  const characters = [{ id: initial.characterId }, { id: selected.characterId }]
  session.append(CREATOR_STUDIO_EVENT, initial, { ignorable: true })
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const input = createUserMessage({ content: [{ type: 'text', text: '合成用户输入' }, ...(richInput ? [
    { type: 'image', attachment: { id: 'synthetic-image', mediaType: 'image/png', width: 12, height: 16 } },
    { type: 'file', attachment: { id: 'synthetic-file', name: '合成文件.txt', mediaType: 'text/plain' } },
    { type: 'text', text: '第二段' },
  ] : [])], source: { kind: 'user' } })
  const inputEvent = session.append('user/message', input, { surfaceOp: 'append' })
  if (richInput) session.append('assistant/message', { turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: '保留后续回复' }], source: { provider: 'synthetic', model: 'synthetic' } }), stream: [] }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append(CREATOR_STUDIO_EVENT, selected, { ignorable: true })
  session.append('session/title', { title: '合成自定义名称', messageSeqs: [], source: { kind: 'user' } })
  const permissions = [
    ['permission/preset', { preset: 'read-only' }],
    ['sandbox/mode', { mode: 'read-only' }],
    ['approval/policy', { policy: 'never' }],
  ]
  for (const [type, data] of permissions) session.append(type, data)
  if (modelSelection) session.append('model/selection', modelSelection)
  if (legacy) session.append('agent-preset/selected', { agentPreset: 'eleckoi-creator-active' })
  const persistence = new Context()
  cleanups.push(() => persistence.fiber.dispose())
  await persistence.plugin(JsonlSessionPersistence, { root: join(root, 'logs'), compression: 'none' })
  const writer = await persistence.sessionPersistence.create(session.header)
  try { await writer.append(session.snapshotEvents()); await writer.flush() } finally { await writer.close() }
  let agent = makeAgent(session), service
  const listeners = new Map()
  const meta = { cwd: root, agentPreset: runtimePreset }
  const controller = {
    list: vi.fn(async () => ({ items: [] })),
    inspect: vi.fn(async () => ({ meta, events: agent?.session.snapshotEvents() ?? readDshSessionLog(join(root, 'logs'), id).events })),
    create: vi.fn(),
    selectModel: vi.fn(async () => { throw new Error('no adapter registered for provider "synthetic-removed"') }),
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
    sessionPersistence: persistence.sessionPersistence,
    sessions: { messageProjections: [] },
    workspaceRegistry: { pinnedSessionIds: [] },
    sessionQuery: queryFromInspection(id => controller.inspect(id)),
    sessionController: controller, agents: { get: () => agent },
    eleckoiProductData: { readCharacters: () => ({ items: characters }), readAgentPresetCatalog: () => ({ activePresetIds: { creator: preset.id } }), readAgentPreset: () => preset },
    agentPresets: { readDocument: async () => ({ content: '[]' }), register: async () => () => {}, recompose: async () => {} },
    agentDefaultModel: { currentSelection: () => ({ provider: 'synthetic', model: 'synthetic' }) },
    llm: { resolveModelInfo: async provider => {
      if (provider === 'synthetic-removed') throw new Error('no adapter registered for provider "synthetic-removed"')
      return {}
    } }, settings: { describe: () => [] },
    on: (name, listener) => { listeners.set(name, listener); return () => {} }, get: key => key === 'tools' ? tools : undefined,
    eleckoiSessionEditor: {
      transaction: async (_id, action) => action(),
      rewind: async (_id, turn, seq, retain) => { agent = undefined; return rewindDshSession(join(root, 'logs'), id, turn, seq, retain) },
      deleteMessagesFrom: async (_id, seq, role) => { agent = undefined; deleteDshSessionMessagesFrom(join(root, 'logs'), id, seq, role) },
      editMessage: async (_id, seq, role, content) => {
        // The real closed-handle editor flushes its Agent before acquiring the writer.
        if (agent) {
          const handle = await persistence.sessionPersistence.open(SessionId(id), 'write')
          try { const saved = await handle.read(); await handle.append(agent.session.snapshotEvents(saved.events.length)); await handle.flush() }
          finally { await handle.close() }
        }
        agent = undefined; editDshSessionMessage(join(root, 'logs'), id, seq, role, content)
      },
    },
    provide: (_name, value) => { service = value },
  })
  cleanups.push(dispose)
  return { id, input, inputEvent, selected, characters, controller, service, listeners, permissions, current: () => agent }
}

describe('Studio message edits retain independent conversation preferences', { timeout: 30_000 }, () => {
  it('edits only the selected user text, retains attachments and every later event, and survives cold reopen without submitting', async () => {
    const f = await fixture({ richInput: true })
    await f.service.open(f.id)
    const before = f.current().session.snapshotEvents()
    const text = `  修改后的第一行\n${'合成长正文。'.repeat(1500)}\n正文末尾  `
    await f.service.editUserMessage(f.id, f.inputEvent.seq, text)
    const events = f.current().session.snapshotEvents()
    expect(events.slice(0, before.length).filter(event => event.seq !== f.inputEvent.seq)).toEqual(before.filter(event => event.seq !== f.inputEvent.seq))
    // Official Session restoration appends one resume marker, never a new user or AI message.
    expect(events.slice(before.length)).toMatchObject([{ type: 'session/end-seed', data: {} }])
    const edited = events.find(event => event.seq === f.inputEvent.seq)
    expect(edited.data.content).toEqual([{ type: 'text', text }, ...f.input.content.filter(part => part.type !== 'text')])
    expect(edited.data.id).toBe(f.input.id)
    expect(edited.data.source).toEqual({ kind: 'user' })
    expect(f.current().followup).not.toHaveBeenCalled()
    await f.service.open(f.id)
    expect(f.current().session.snapshotEvents()).toEqual(events)
    expect(f.current().session.snapshotEvents().find(event => event.seq === f.inputEvent.seq).data.content[0].text).toBe(text)
  })
  it('rejects assistant, missing and empty targets without changing the Session and preserves running input', async () => {
    const f = await fixture({ richInput: true })
    await f.service.open(f.id)
    const before = f.current().session.snapshotEvents()
    const assistant = before.find(event => event.type === 'assistant/message')
    await expect(f.service.editUserMessage(f.id, assistant.seq, '不能修改 AI')).rejects.toBeTruthy()
    await expect(f.service.editUserMessage(f.id, 999999, '缺失消息')).rejects.toBeTruthy()
    await expect(f.service.editUserMessage(f.id, f.inputEvent.seq, '  ')).rejects.toBeTruthy()
    expect(f.controller.inspect.mock.calls.length).toBeGreaterThan(0)
    expect((await f.controller.inspect(f.id)).events).toEqual(before)
    await f.service.open(f.id)
    const restored = f.current().session.snapshotEvents()
    f.current().status = 'running'
    await expect(f.service.editUserMessage(f.id, f.inputEvent.seq, '生成中不改')).rejects.toBeTruthy()
    expect(f.current().session.snapshotEvents()).toEqual(restored)
    expect(f.current().followup).not.toHaveBeenCalled()
  })
  it.each(['delete', 'regenerate'])('keeps the saved model and history safe on %s with a removed provider', async operation => {
    const modelSelection = { provider: 'synthetic-removed', model: 'synthetic-model', reasoningEffort: 'high' }
    const f = await fixture({ modelSelection })
    if (operation === 'delete') await f.service.deleteMessagesFrom(f.id, f.inputEvent.seq, 'user')
    else {
      const before = f.current().session.snapshotEvents()
      await expect(f.service.regenerate(f.id)).rejects.toThrow('no adapter registered')
      expect(f.current().session.snapshotEvents()).toEqual(before)
      expect(f.current().followup).not.toHaveBeenCalled()
    }
    expect(f.current().model.current()).toEqual(modelSelection)
    expect(f.current().session.snapshotEvents().filter(event => event.type === 'model/selection')).toMatchObject([{ data: modelSelection }])
    expect(f.controller.selectModel).not.toHaveBeenCalled()
  })
  it('keeps child Sessions out of Studio history and preserves their composition at the request boundary', async () => {
    const f = await fixture()
    const item = { sessionId: 'synthetic-root', projections: { values: { eleckoiCreatorStudio: f.selected } } }
    f.controller.list.mockResolvedValue({ items: [item, { ...item, sessionId: 'synthetic-child', origin: 'subagent' }] })
    expect((await f.service.list()).map(item => item.sessionId)).toEqual(['synthetic-root'])
    const next = vi.fn(async () => 'synthetic-child-prompt')
    const child = { session: { header: { origin: 'subagent' } } }
    await expect(Promise.resolve(f.listeners.get('agent/prepare-step')({ agent: child })).then(next)).resolves.toBe('synthetic-child-prompt')
    expect(next).toHaveBeenCalledOnce()
  })
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

  it.each([['delete', false], ['regenerate', false], ['delete', true], ['regenerate', true]])('keeps the current character and user title after %s removes later events (historical header: %s)', async (operation, legacy) => {
    const f = await fixture({ legacy })
    if (operation === 'delete') await f.service.deleteMessagesFrom(f.id, f.inputEvent.seq, 'user')
    else await f.service.regenerate(f.id)
    const events = f.current().session.snapshotEvents()
    expect(f.current().session.id).toBe(f.id)
    expect(events.findLast(event => event.type === CREATOR_STUDIO_EVENT).data).toEqual(f.selected)
    expect(events.findLast(event => event.type === 'session/title').data).toMatchObject({ title: '合成自定义名称', source: { kind: 'user' } })
    expect(f.controller.rename).toHaveBeenCalledWith({ sessionId: f.id, title: '合成自定义名称' })
    for (const [type, data] of f.permissions) expect(events.findLast(event => event.type === type)?.data).toEqual(data)
    const inputs = events.filter(event => event.type === 'user/message')
    expect(inputs).toHaveLength(0)
    if (operation === 'regenerate') expect(f.current().followup).toHaveBeenCalledWith(f.input)
    if (legacy) expect(events.findLast(event => event.type === 'agent-preset/selected').data.agentPreset).toBe('eleckoi-creator-active')
  })
})
