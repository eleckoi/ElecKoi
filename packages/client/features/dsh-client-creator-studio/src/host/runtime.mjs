import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { materializeAgentPreset, readRuntimePresetDefinition, currentRequestSnapshot, applyDisabledPolicy } from '@eleckoi/dsh-client-roleplay'
import { requireSessionMessage, sessionMessageText, sessionMessageTurn, productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { CREATOR_STUDIO_EVENT, creatorStudioProjection, creatorStudioStateSchema, resolveCreatorStudioSelection } from './projection.mjs'

export const CREATOR_RUNTIME_PRESET_ID = 'eleckoi-creator-active'
const legacyPresetId = id => /^eleckoi-creator-[0-9a-f]{64}$/.test(id ?? '')
const selectedPreset = inspection => inspection.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset ?? inspection.meta.agentPreset

/** Studio commands create ordinary DSH Sessions; the official Controller owns their Agent handles. */
export async function installCreatorStudioRuntime(ctx) {
  const template = process.env.ELECKOI_PRESET_TEMPLATE_PATH, presets = process.env.ELECKOI_PRESET_ROOT
  const cwd = process.env.ELECKOI_WORKSPACE_ROOT
  if (!template || !presets || !cwd) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'AI 创作工作室缺少 Host 运行目录。', { what: 'AI 创作工作室的 Host 运行目录' })
  const root = join(presets, 'creator-studio')
  mkdirSync(root, { recursive: true })
  let registration, queue = Promise.resolve()
  const bindings = new WeakMap(), preparedTurns = new WeakMap()
  const serialized = operation => {
    const task = queue.then(operation)
    queue = task.catch(() => undefined)
    return task
  }
  const currentPreset = () => {
    const catalog = ctx.eleckoiProductData.readAgentPresetCatalog()
    const preset = ctx.eleckoiProductData.readAgentPreset(catalog.activePresetIds.creator)
    if (preset.purpose !== 'creator') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前全局预设不是创作预设。', { what: '选择全局创作预设' })
    const disabledGroupIds = preset.toolGroups.filter(group => !group.included || !group.enabled).map(group => group.id)
    for (const groupId of ['builtin:variables', 'builtin:setting-library', 'builtin:roleplay-workflow']) {
      if (!disabledGroupIds.includes(groupId)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '创作预设中的角色对话工具不适用于 AI 创作工作室，请使用创作能力。', { what: '在创作预设中关闭角色对话工具' })
    }
    return { preset, disabledGroupIds }
  }
  const prepareDefinition = async (model = registration?.model ?? {}) => {
    const { preset, disabledGroupIds } = currentPreset()
    const generated = materializeAgentPreset(root, template, { ...preset, versionId: preset.activeVersionId }, { disabledGroupIds }, model,
      { id: CREATOR_RUNTIME_PRESET_ID, plugins: [{ id: 'creator-studio-agent', name: '@eleckoi/dsh-client-creator-studio/agent',
        config: { presetId: preset.id, creatorTools: !disabledGroupIds.includes('builtin:creator') } }] })
    if (registration?.revision !== generated.revision) {
      await registration?.dispose()
      registration = undefined
      const dispose = await ctx.agentPresets.register(readRuntimePresetDefinition(join(root, generated.id, 'preset.json'), generated.id, template, ['uploaded-file-tools']))
      registration = { revision: generated.revision, model, dispose }
    }
    return { ...generated, preset, disabledGroupIds }
  }
  // Inventory needs no model credentials. Each real turn resolves the selected
  // model before installing its model-dependent compaction configuration.
  await prepareDefinition({})

  // RETIRE WHEN: supported upgrade, import and rewind sources can no longer
  // select hashed Studio preset IDs. Remove this conversion, legacyPresetId,
  // its open/edit calls and the generated-directory cleanup together; keep the
  // current-selection helper and global binding. Session identities and history
  // stay; only append the official selection before retiring generated files.
  const migrateStoredPreset = async sessionId => {
    const handle = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
    try {
      const { events } = await handle.read()
      if (!legacyPresetId(selectedPreset({ meta: handle.header, events }))) return
      const previous = events.findLast(event => event.type === CREATOR_STUDIO_EVENT)
      if (!previous) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '旧创作配置缺少工作室会话标记。', { what: '旧创作工作室会话标记' })
      const session = Session.create(handle.id, events, handle.header, handle.inheritedEventCount)
      session.append('agent-preset/selected', { agentPreset: CREATOR_RUNTIME_PRESET_ID })
      const state = creatorStudioStateSchema.parse(previous.data)
      const presetId = currentPreset().preset.id
      if (state.presetId !== presetId) session.append(CREATOR_STUDIO_EVENT, { ...state, presetId }, { ignorable: true })
      await handle.append(session.snapshotEvents(events.length))
      await handle.flush()
    } finally { await handle.close() }
  }
  const legacyDirectories = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && legacyPresetId(entry.name) && existsSync(join(root, entry.name, 'preset.json')))
  if (legacyDirectories.length) {
    for (const stored of await ctx.sessionPersistence.list()) {
      if (legacyPresetId(stored.header.agentPreset)) await migrateStoredPreset(stored.header.id)
    }
    for (const entry of legacyDirectories) {
      const directory = join(root, entry.name), file = join(directory, 'preset.json')
      if (lstatSync(directory).isSymbolicLink() || lstatSync(file).isSymbolicLink()) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '旧创作配置目录不能是重定向目录。', { what: '旧创作配置目录', guard: 'creator-preset-directory' })
      readRuntimePresetDefinition(file, entry.name, template)
      unlinkSync(file)
      if (readdirSync(directory).length === 0) rmdirSync(directory)
    }
  }
  const bindCurrent = async (agent, state, prepared) => {
    const changed = bindings.get(agent) !== prepared.revision
    if (changed) {
      await ctx.agentPresets.recompose(agent.ctx, CREATOR_RUNTIME_PRESET_ID)
      applyDisabledPolicy(agent.ctx, prepared.disabledGroupIds, ctx.get('tools'))
      bindings.set(agent, prepared.revision)
    }
    if (selectedPreset({ meta: agent.session.header, events: agent.session.snapshotEvents() }) !== CREATOR_RUNTIME_PRESET_ID) {
      agent.session.append('agent-preset/selected', { agentPreset: CREATOR_RUNTIME_PRESET_ID })
    }
    const next = { ...state, presetId: prepared.preset.id }
    if (state.presetId !== next.presetId) agent.session.append(CREATOR_STUDIO_EVENT, next, { ignorable: true })
    return { changed, state: next }
  }
  const stopAssembly = ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next(), agent = context.agent
    if (!agent) return assembled
    const state = ctx.sessionProjections.stateOf(agent.session, creatorStudioProjection.key)
    if (!state) return assembled
    const boundary = ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')
    const turn = boundary?.openTurnStartSeq
    if (turn == null || preparedTurns.get(agent) === turn) return assembled
    context.signal?.throwIfAborted()
    const { changed } = await serialized(async () => {
      const prepared = await prepareDefinition(await currentRequestSnapshot(ctx))
      context.signal?.throwIfAborted()
      return bindCurrent(agent, state, prepared)
    })
    preparedTurns.set(agent, turn)
    // Providers were collected before this waterfall. Reassemble once after a
    // scope change so the first request already contains the current tool set.
    return changed ? agent.ctx.systemPrompt.assemble(context) : assembled
  }, { prepend: true })
  const requireCharacter = characterId => {
    if (characterId && !ctx.eleckoiProductData.readCharacters().items.some(item => item.id === characterId)) throw productFailure(ELECKOI_FAILURE_CODES.characterNotFound, '找不到所选角色。', { what: '角色' })
  }
  const readState = async sessionId => {
    const inspection = await ctx.sessionController.inspect(sessionId)
    const event = inspection.events.findLast(item => item.type === CREATOR_STUDIO_EVENT)
    if (!event) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '这不是 AI 创作工作室会话。', { what: 'AI 创作工作室会话' })
    return { inspection, state: resolveCreatorStudioSelection(creatorStudioStateSchema.parse(event.data), ctx.eleckoiProductData.readCharacters().items) }
  }
  const reopenAfterMessageEdit = async (sessionId, inspection, state) => {
    const rewound = await ctx.sessionController.inspect(sessionId)
    if (legacyPresetId(selectedPreset(rewound))) await migrateStoredPreset(sessionId)
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) throw resolved.error
    const { agent } = resolved
    const events = agent.session.snapshotEvents()
    const current = events.findLast(event => event.type === CREATOR_STUDIO_EVENT)?.data
    if (current?.presetId !== state.presetId || current?.characterId !== state.characterId) {
      agent.session.append(CREATOR_STUDIO_EVENT, state, { ignorable: true })
    }
    const title = inspection.events.findLast(event => event.type === 'session/title')?.data
    const currentTitle = events.findLast(event => event.type === 'session/title')?.data
    if (title?.source.kind === 'user' && (currentTitle?.source.kind !== 'user' || currentTitle.title !== title.title)) {
      await ctx.sessionController.rename({ sessionId, title: title.title })
    }
    const selection = inspection.events.findLast(event => event.type === 'model/selection')?.data
    const currentSelection = events.findLast(event => event.type === 'model/selection')?.data
    if (selection && JSON.stringify(selection) !== JSON.stringify(currentSelection)) {
      await ctx.sessionController.selectModel({ sessionId, ...selection })
    }
    await serialized(async () => bindCurrent(agent, state, await prepareDefinition()))
  }
  const service = {
    async list() {
      const { items } = await ctx.sessionController.list({})
      const characters = ctx.eleckoiProductData.readCharacters().items
      const presetId = currentPreset().preset.id
      return items.flatMap(item => {
        const state = item.projections?.values?.[creatorStudioProjection.key]
        if (!state) return []
        const pinIndex = ctx.workspaceRegistry.pinnedSessionIds.indexOf(item.sessionId)
        return [{ sessionId: String(item.sessionId), title: item.projections?.values?.title ?? '新对话', updatedAt: item.updatedAt, pinned: pinIndex >= 0, pinIndex,
          ...resolveCreatorStudioSelection(creatorStudioStateSchema.parse(state), characters), presetId }]
      })
    },
    async create(characterId = '') {
      requireCharacter(characterId)
      return serialized(async () => {
        const prepared = await prepareDefinition(await currentRequestSnapshot(ctx))
        const { sessionId } = await ctx.sessionController.create({ sessionId: `session-${randomUUID()}`, cwd, agentPreset: prepared.id })
        const agent = ctx.agents.get(sessionId)
        if (!agent) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'AI 创作工作室 Agent 未完成创建。', { what: 'AI 创作工作室 Agent' })
        bindings.set(agent, prepared.revision)
        agent.session.append(CREATOR_STUDIO_EVENT, { presetId: prepared.preset.id, characterId }, { ignorable: true })
        return { sessionId: String(sessionId), presetId: prepared.preset.id, characterId }
      })
    },
    async open(sessionId) {
      return serialized(async () => {
        const { inspection, state } = await readState(sessionId)
        const live = ctx.agents.get(sessionId)
        if (live?.status === 'running') return { sessionId, ...state }
        const prepared = await prepareDefinition()
        if (!live && legacyPresetId(selectedPreset(inspection))) await migrateStoredPreset(sessionId)
        const resolved = await ctx.sessionController.resolveAgent(sessionId)
        if ('error' in resolved) throw resolved.error
        if (resolved.agent.status === 'running') return { sessionId, ...state }
        const result = await resolved.agent.runMaintenance(() => bindCurrent(resolved.agent, state, prepared))
        return { sessionId, ...result.state }
      })
    },
    async rename(sessionId, title) {
      await readState(sessionId)
      await ctx.sessionController.rename({ sessionId, title })
    },
    async pin(sessionId, pinned) {
      await readState(sessionId)
      if (pinned) await ctx.workspaceRegistry.pinSession(sessionId)
      else await ctx.workspaceRegistry.unpinSession(sessionId)
    },
    async delete(sessionId) {
      await readState(sessionId)
      await ctx.eleckoiSessionEditor.deleteSession(sessionId)
      await ctx.workspaceRegistry.unpinSession(sessionId)
    },
    async messages(sessionId) {
      const { inspection } = await readState(sessionId)
      return inspection.events.flatMap((event, index) => {
        if (event.surfaceOp !== 'append') return []
        if (event.type !== 'assistant/message' && !(event.type === 'user/message' && event.data.source?.kind === 'user')) return []
        const text = sessionMessageText(event)
        if (!text.trim()) return []
        return [{ eventSeq: event.seq, role: event.type === 'user/message' ? 'user' : 'assistant', text, turn: sessionMessageTurn(inspection.events, index) }]
      })
    },
    async deleteMessagesFrom(sessionId, eventSeq, role) {
      const { inspection, state } = await readState(sessionId)
      const target = requireSessionMessage(inspection, eventSeq, role)
      const turn = sessionMessageTurn(inspection.events, target.index)
      if (ctx.agents.get(sessionId)?.status === 'running') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先停止生成再删除消息。', { what: '停止生成' })
      await ctx.eleckoiSessionEditor.transaction(sessionId, async () => {
        const changed = await ctx.eleckoiSessionEditor.rewind(sessionId, turn, eventSeq, false)
        if (changed === undefined) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前消息不能安全删除。', { what: '换一条可以安全删除的消息' })
        await reopenAfterMessageEdit(sessionId, inspection, state)
      })
    },
    async regenerate(sessionId) {
      const { inspection, state } = await readState(sessionId)
      const input = inspection.events.findLast(event => event.type === 'user/message' && event.surfaceOp === 'append' && event.data.source?.kind === 'user')
      if (!input) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '没有可以重新生成的用户输入。', { what: '可重新生成的用户输入' })
      if (ctx.agents.get(sessionId)?.status === 'running') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先停止生成再重新生成。', { what: '停止生成' })
      const target = requireSessionMessage(inspection, input.seq, 'user')
      const turn = sessionMessageTurn(inspection.events, target.index)
      await ctx.eleckoiSessionEditor.transaction(sessionId, async () => {
        const changed = await ctx.eleckoiSessionEditor.rewind(sessionId, turn, input.seq, false)
        if (changed === undefined) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前消息不能安全重新生成。', { what: '换一条可以安全重新生成的消息' })
        await reopenAfterMessageEdit(sessionId, inspection, state)
        const resolved = await ctx.sessionController.resolveAgent(sessionId)
        if ('error' in resolved) throw resolved.error
        resolved.agent.followup(input.data)
      })
    },
    async selectCharacter(sessionId, characterId) {
      requireCharacter(characterId)
      const opened = await service.open(sessionId)
      const agent = ctx.agents.get(sessionId)
      if (!agent || agent.status !== 'idle') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '正在生成，请先停止或等待完成后再选择角色。', { what: '停止生成或等待生成完成' })
      const state = { presetId: opened.presetId, characterId }
      agent.session.append(CREATOR_STUDIO_EVENT, state, { ignorable: true })
      return { sessionId, ...state }
    }
  }
  ctx.provide('eleckoiCreatorStudioRuntime', service)
  return async () => {
    stopAssembly()
    await queue
    await registration?.dispose()
  }
}
