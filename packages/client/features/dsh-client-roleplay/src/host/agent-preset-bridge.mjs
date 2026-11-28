/** Restores roleplay Sessions against the single global preset. */

import { installConversationContext } from './conversation-context.mjs'
import { createRoleplayHistoryReader } from './roleplay-history.mjs'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import { join } from 'node:path'
import { installRequestConfig } from './request-config.mjs'
import { readRuntimePresetDefinition } from './preset-definition.mjs'
import { commitSessionPreset, inheritSessionSnapshot, readSessionSnapshot, removeSessionSnapshot } from './session-snapshot.mjs'
import { applyDisabledPolicy } from './tool-policy.mjs'
import { ACTIVE_RUNTIME_PRESET_ID, installRoleplaySessionRuntime, materializeAgentPreset } from './session-runtime.mjs'
import { refreshSessionModelSnapshot } from './model-request-snapshot.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { RuntimeContexts, restoreRuntimeContext } from './runtime-contexts.mjs'
import { installRoleplayReply, roleplayReplyEnabled } from './roleplay-reply-tool.mjs'

export const name = 'eleckoi-agent-preset-bridge'
const legacyPresetId = id => /^agent-preset-[a-z0-9-]+-[0-9a-f]{16}$/.test(id ?? '')
export const inject = ['systemPrompt', 'agents', 'agentPresets', 'agentDefaultModel', 'llm', 'settings', 'sessionController', 'sessionQuery', 'sessionPersistence', 'sessions', 'eleckoiConversationLifecycle', 'eleckoiProductData']

export async function apply(ctx) {
  const runtimeContexts = new RuntimeContexts(id => ctx.eleckoiProductData.readConversationVariableContext(id))
  const readHistory = createRoleplayHistoryReader(ctx)
  ctx.provide('eleckoiRuntimeContexts', runtimeContexts)
  const snapshotRoot = process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  const presetRoot = process.env.ELECKOI_PRESET_ROOT
  const templatePath = process.env.ELECKOI_PRESET_TEMPLATE_PATH
  if (!snapshotRoot) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, 'ELECKOI_SESSION_SNAPSHOT_ROOT is required', { what: '配置必需的运行环境变量' })
  if (!presetRoot) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, 'ELECKOI_PRESET_ROOT is required', { what: '配置必需的运行环境变量' })
  let activeRegistration
  let registrationQueue = Promise.resolve()
  const sessionHandles = new Map()
  const sessionLocks = new Map()
  const configuredAgents = new WeakSet()
  const withSessionLock = async (sessionId, action) => {
    const previous = sessionLocks.get(sessionId) ?? Promise.resolve()
    let release
    const current = new Promise((resolve) => { release = resolve })
    sessionLocks.set(sessionId, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (sessionLocks.get(sessionId) === current) sessionLocks.delete(sessionId)
    }
  }
  const disposeTracked = async (sessionId) => {
    const handle = sessionHandles.get(sessionId)
    if (!handle) {
      if (ctx.agents.get(sessionId)) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, `DSH 会话 ${sessionId} 有未跟踪的写入句柄。`, { what: 'DSH 会话的写入句柄' })
      return false
    }
    await ctx.get('subagents')?.drainDescendants([handle.agent])
    await handle.dispose()
    if (sessionHandles.get(sessionId) === handle) sessionHandles.delete(sessionId)
    if (ctx.agents.get(sessionId)) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, `DSH 会话 ${sessionId} 的写入句柄未释放。`, { what: 'DSH 会话的写入句柄' })
    return true
  }
  ctx.provide('eleckoiSessionHandles', {
    dispose: (sessionId) => withSessionLock(sessionId, () => disposeTracked(sessionId)),
    withClosed: (sessionId, action) => withSessionLock(sessionId, async () => {
      await disposeTracked(sessionId)
      const result = await action()
      await migrateStoredPreset(sessionId, true)
      return result
    })
  })
  ctx.on('agent/disposed', ({ agent }) => {
    if (sessionHandles.get(agent.id)?.agent === agent) sessionHandles.delete(agent.id)
    runtimeContexts.forget(agent.id)
  })
  const disposeHandleTracking = installAgentHandleTracking(ctx.agents, (handle) => {
    sessionHandles.set(handle.agent.id, handle)
  }, withSessionLock)
  const registerActivePreset = () => {
    const id = ACTIVE_RUNTIME_PRESET_ID
    const path = join(presetRoot, id, 'preset.json')
    const revision = presetRevision(path)
    const operation = registrationQueue.then(async () => {
      if (activeRegistration?.revision === revision) return activeRegistration
      const definition = readRuntimePresetDefinition(path, id, templatePath)
      if (activeRegistration) {
        const previous = activeRegistration
        activeRegistration = undefined
        await previous.dispose()
      }
      const dispose = await ctx.agentPresets.register(definition)
      activeRegistration = { revision, dispose }
      return activeRegistration
    })
    registrationQueue = operation.catch(() => undefined)
    return operation
  }

  const activePath = join(presetRoot, ACTIVE_RUNTIME_PRESET_ID, 'preset.json')
  // The inventory and cold restores start from the actual global roleplay preset.
  const productData = typeof ctx.get === 'function' ? ctx.get('eleckoiProductData') : ctx.eleckoiProductData
  if (productData?.readAgentPresetCatalog) {
    const catalog = productData.readAgentPresetCatalog()
    const preset = productData.readAgentPreset(catalog.activePresetIds.roleplay)
    if (preset.purpose !== 'roleplay') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前全局预设不是角色对话预设。', { what: '选择全局角色对话预设' })
    const disabledGroupIds = preset.toolGroups.filter(group => !group.included || !group.enabled).map(group => group.id)
    materializeAgentPreset(presetRoot, templatePath, { ...preset, versionId: preset.activeVersionId }, { disabledGroupIds }, {})
  }
  if (existsSync(activePath)) await registerActivePreset()

  // RETIRE WHEN: supported upgrade, import and rewind sources no longer select
  // materialized roleplay preset IDs. Remove this conversion, legacyPresetId,
  // startup scan, prepare/closed-edit calls and projection replay regression
  // together. Keep active registration and normal restoration. Conversion
  // preserves projected message history and only updates preset selection.
  const migrateStoredPreset = async (sessionId, allowMissing = false) => {
    if (!ctx.sessionPersistence) return
    let reader, legacySelection, snapshot
    try {
      reader = await ctx.sessionPersistence.open(SessionId(sessionId), 'read')
      const { events } = await reader.read()
      const selected = storedPresetForInspection({ meta: reader.header, events })
      legacySelection = legacyPresetId(selected)
      if (!legacySelection && selected !== ACTIVE_RUNTIME_PRESET_ID) return
      try { snapshot = readSessionSnapshot(snapshotRoot, sessionId) }
      catch (error) { if (error?.code !== 'ENOENT') throw error }
      if (!legacySelection && !legacyPresetId(snapshot?.mountedPresetId) && !legacyPresetId(snapshot?.pendingPresetId)) return
    } catch (error) {
      if (allowMissing && error instanceof SessionPersistenceNotFoundError) return
      throw error
    } finally { await reader?.close() }
    const current = await registerActivePreset()
    if (legacySelection) {
      const writer = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
      try {
        const { events } = await writer.read()
        if (legacyPresetId(storedPresetForInspection({ meta: writer.header, events }))) {
          const session = Session.create(writer.id, events, writer.header, writer.inheritedEventCount, ctx.sessions.messageProjections)
          session.append('agent-preset/selected', { agentPreset: ACTIVE_RUNTIME_PRESET_ID })
          await writer.append(session.snapshotEvents(events.length))
          await writer.flush()
        }
      } finally { await writer.close() }
    }
    if (snapshot) commitSessionPreset(snapshotRoot, sessionId, ACTIVE_RUNTIME_PRESET_ID, current.revision)
  }
  if (ctx.sessionPersistence) {
    for (const stored of await ctx.sessionPersistence.list()) {
      if (!legacyPresetId(stored.header.agentPreset)) continue
      try { await migrateStoredPreset(stored.header.id) }
      catch (error) { ctx.logger.error(`角色会话 ${stored.header.id} 的全局预设恢复失败：${String(error)}`) }
    }
  }
  const presetRegistrar = {
    async prepareForSession(sessionId) {
      await registerActivePreset()
      if (!ctx.agents.get(sessionId)) await migrateStoredPreset(sessionId)
      return ACTIVE_RUNTIME_PRESET_ID
    },
    async registerForSession() {
      await registerActivePreset()
      return ACTIVE_RUNTIME_PRESET_ID
    },
    async selectForSession(sessionId) {
      return withSessionLock(sessionId, async () => {
        const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
        const agent = ctx.agents.get(sessionId)
        if (!agent) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, `DSH 会话 ${sessionId} 尚未激活，不能切换预设。`, { what: '激活这个 DSH 会话' })
        await configureAgent({ agent })
        const requested = snapshot.pendingPresetId
        const requestedRevision = snapshot.pendingPresetRevision
        if (!requested || !requestedRevision) return snapshot.mountedPresetId
        if (requested === snapshot.mountedPresetId
          && requestedRevision === snapshot.mountedPresetRevision) return snapshot.mountedPresetId
        if (agent.status !== 'idle') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, `DSH 会话 ${sessionId} 正在生成，不能切换预设。`, { what: '等这次生成结束再切换预设' })
        const current = await registerActivePreset()
        try {
          await ctx.agentPresets.recompose(agent.ctx, requested)
          agent.session.append('agent-preset/selected', { agentPreset: requested })
        } catch (error) {
          throw error
        }
        commitSessionPreset(snapshotRoot, sessionId, requested, current.revision)
        applyDisabledPolicy(agent.ctx, snapshot.disabledToolGroupIds, ctx.get('tools'))
        return requested
      })
    }
  }
  ctx.provide('eleckoiPresetRegistrar', presetRegistrar)
  const configureAgent = async ({ agent }) => {
    if (configuredAgents.has(agent)) return
    const child = agent.session.header.origin === 'subagent'
    const sourceSessionId = child ? agent.session.header.parentSession : agent.id
    if (!sourceSessionId) return
    let inherited = false
    try {
      const snapshot = child
        ? inheritSessionSnapshot(snapshotRoot, sourceSessionId, agent.id)
        : readSessionSnapshot(snapshotRoot, agent.id)
      inherited = child
      if (child) {
        if (!runtimeContexts.has(sourceSessionId)) {
          const resolved = await ctx.sessionController.resolveAgent(sourceSessionId)
          if ('error' in resolved) throw resolved.error
          await restoreRuntimeContext(ctx, resolved.agent.session, readSessionSnapshot(snapshotRoot, sourceSessionId), readHistory)
        }
        runtimeContexts.inherit(sourceSessionId, agent.id)
      } else {
        await restoreRuntimeContext(ctx, agent.session, snapshot, readHistory)
      }
      await registerActivePreset()
      const replyPolicySessionId = child ? runtimeContexts.get(agent.id).rootSessionId : agent.id
      installRoleplayReply(agent, () => roleplayReplyEnabled(readSessionSnapshot(snapshotRoot, replyPolicySessionId)),
        () => runtimeContexts.get(agent.id).conversationContext,
        () => child ? undefined : readSessionSnapshot(snapshotRoot, agent.id).autoIllustration,
        child ? () => ctx.sessions.get(replyPolicySessionId) : undefined)
      if (!child) {
        // Restoring history and the picker does not need a routable model.
        // Refresh model capabilities only when this Agent starts a request.
        agent.ctx.on('agent/prepare-step', async ({ agent: preparing }) => {
          if (preparing !== agent) return
          await refreshSessionModelSnapshot(ctx, snapshotRoot, agent.id, agent.model.current(), agent.session)
        }, { prepend: true })
        installRequestConfig(agent.ctx, snapshotRoot, agent.id, readHistory)
        installConversationContext(agent, snapshotRoot, ctx.eleckoiRequestPreviews, runtimeContexts, readHistory)
      }
      applyDisabledPolicy(agent.ctx, snapshot.disabledToolGroupIds, ctx.get('tools'))
      configuredAgents.add(agent)
    } catch (error) {
      if (inherited) {
        removeSessionSnapshot(snapshotRoot, agent.id)
        runtimeContexts.forget(agent.id)
      }
      if (error?.code === 'ENOENT') return
      throw error
    }
  }
  ctx.on('agent/created', configureAgent)
  const disposeRuntime = ctx.inject(['attachments', 'eleckoiSessionEditor'],
    owner => installRoleplaySessionRuntime(owner, presetRegistrar, readHistory))
  return async () => {
    await disposeRuntime.dispose()
    runtimeContexts.close()
    disposeHandleTracking()
    await registrationQueue
    await activeRegistration?.dispose()
  }
}

function presetRevision(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function installAgentHandleTracking(agents, track, withSessionLock) {
  // RETIRE WHEN: the locked registry offers equivalent factory admission.
  // Agent setup/created runs after writer acquisition and exposes no owned
  // handle. Admission retains the original factory/caller lifecycle while
  // excluding closed-log edits during that earlier activation interval.
  return agents.admitActivation((sessionId, proceed) => withSessionLock(sessionId, async () => {
    const handle = await proceed()
    track(handle)
    return handle
  }))
}

function storedPresetForInspection(inspection) {
  let selected = typeof inspection?.meta?.agentPreset === 'string'
    ? inspection.meta.agentPreset
    : undefined
  for (const event of inspection?.events ?? []) {
    if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      selected = event.data.agentPreset
    }
  }
  return selected
}
