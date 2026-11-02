import { renderRequestEjs } from './regex-ejs.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { readSessionSnapshot, removeSessionSnapshot, snapshotPath, writeSessionSnapshot } from './session-snapshot.mjs'
import { historyStatsProjection } from './history-stats-projection.mjs'
import { durableProductPluginSpecifier } from './preset-definition.mjs'
import { turnOutcomesProjection } from './turn-outcomes-projection.mjs'
import { inputContinuationsProjection } from './input-continuations-projection.mjs'
import { currentRequestSnapshot } from './model-selection-migration.mjs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { projectRequestInput, requestProjectionSnapshot, sessionInstructions, visibleDialogueHistory } from './conversation-context.mjs'

export { requestSnapshot } from './model-selection-migration.mjs'

export const ACTIVE_RUNTIME_PRESET_ID = 'eleckoi-active'

export function installRoleplaySessionRuntime(ctx, presetRegistrar) {
  if (!process.env.ELECKOI_PRESET_TEMPLATE_PATH
    || !process.env.ELECKOI_SESSION_BRIDGE_ROOT
    || !process.env.ELECKOI_WORKSPACE_ROOT
    || !ctx.eleckoiProductData
    || !ctx.sessionController
    || !ctx.sessionProjections
    || !ctx.agentDefaultModel
    || !ctx.llm) {
    return () => {}
  }
  const snapshotRoot = requiredEnv('ELECKOI_SESSION_SNAPSHOT_ROOT')
  const presetRoot = requiredEnv('ELECKOI_PRESET_ROOT')
  const templatePath = requiredEnv('ELECKOI_PRESET_TEMPLATE_PATH')
  const bridgeRoot = requiredEnv('ELECKOI_SESSION_BRIDGE_ROOT')
  const refreshSettingBranches = () => {
    try { ctx.eleckoiCharacterConfigurationChanges?.publish({ kind: 'snapshot' }) }
    catch (error) { ctx.logger?.warn(`分支设定刷新通知失败：${String(error)}`) }
  }
  const workspaceRoot = requiredEnv('ELECKOI_WORKSPACE_ROOT')
  const disposeHistoryStats = ctx.sessionProjections.register(historyStatsProjection)
  const disposeTurnOutcomes = ctx.sessionProjections.register(turnOutcomesProjection)
  const disposeInputContinuations = ctx.sessionProjections.register(inputContinuationsProjection)
  const generationOptions = new Map()

  const prepareCurrentPreset = async (conversationId, text, creating = false) => {
    const runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text)
    const controls = generationOptions.get(conversationId) ?? {}
    const mainModel = { ...await currentRequestSnapshot(ctx), ...(controls.responseLength ? { maxTokens: controls.responseLength } : {}) }
    const effectiveToolPolicy = { disabledGroupIds: [...(runtime.disabledToolGroupIds ?? [])] }
    const requestedPreset = materializeAgentPreset(
      presetRoot,
      templatePath,
      runtime.agentPreset,
      effectiveToolPolicy,
      mainModel
    )
    if (!creating) await presetRegistrar.prepareForSession(runtime.runtimeSessionId, requestedPreset.id)
    const previous = readOptionalSnapshot(snapshotRoot, runtime.runtimeSessionId)
    return { runtime, previous, mainModel, effectiveToolPolicy, requestedPreset }
  }

  const prepare = async (conversationId, text, creating = false, signal, initialTurn, retainedInputMessageId) => {
    signal?.throwIfAborted()
    await ctx.eleckoiConversationLifecycle.drain(conversationId)
    const {
      runtime,
      previous,
      mainModel,
      effectiveToolPolicy,
      requestedPreset
    } = await prepareCurrentPreset(conversationId, text, creating)
    const mountedPresetId = previous?.mountedPresetId ?? requestedPreset.id
    const mountedPresetRevision = previous?.mountedPresetRevision ?? requestedPreset.revision
    const presetChanged = mountedPresetId !== requestedPreset.id
      || mountedPresetRevision !== requestedPreset.revision
    const historySession = creating ? ctx.sessions.get(runtime.runtimeSessionId)
      : await requireIdleSession(ctx, runtime.runtimeSessionId)
    const nextTurn = initialTurn ?? (creating ? 1 : await nextSessionTurn(ctx, runtime.runtimeSessionId))
    const operationId = creating ? undefined : randomUUID()
    ctx.eleckoiProductData.recordRuntimeBeforeTurn(conversationId, runtime.runtimeSessionId, nextTurn)
    ctx.eleckoiRuntimeContexts.prepare(runtime.runtimeSessionId, runtime,
      visibleDialogueHistory(historySession?.deriveMessages() ?? [], retainedInputMessageId),
      runtime.conversationContext.currentPromptText ?? text,
      ctx.eleckoiProductData.snapshotConversationRuntime(conversationId).variableStateJson)
    writeSessionSnapshot(snapshotRoot, runtime.runtimeSessionId, {
      conversationId,
      ...(operationId ? { operationId } : {}),
      runtimeThreadId: runtime.runtimeSessionId,
      mountedPresetId,
      mountedPresetRevision,
      ...(presetChanged ? {
        pendingPresetId: requestedPreset.id,
        pendingPresetRevision: requestedPreset.revision
      } : {}),
      model: mainModel,
      variablesEnabled: runtime.variableContext !== undefined,
      settingLibraryEnabled: runtime.conversationContext.settingLibrary !== undefined,
      disabledToolGroupIds: effectiveToolPolicy.disabledGroupIds,
      toolModelConfigIds: structuredClone(runtime.agentPreset.toolModelConfigIds || {}),
      autoIllustration: runtime.agentPreset.autoIllustration ?? { enabled: false, modelConfigId: '' },
      roleplayPlanSteps: runtime.agentPreset.roleplayPlan.steps,
      historyCompactionInstructions: runtime.agentPreset.historyCompactionInstructions ?? ''
    })
    if (!creating) await presetRegistrar.selectForSession(runtime.runtimeSessionId)
    signal?.throwIfAborted()
    if (operationId) ctx.eleckoiConversationLifecycle.begin({
      operationId, conversationId, runtimeSessionId: runtime.runtimeSessionId, turn: nextTurn
    })
    return { runtimeSessionId: runtime.runtimeSessionId, presetId: requestedPreset.id }

  }

  const service = {
    configuration(sessionId) { return readOptionalSnapshot(snapshotRoot, sessionId) },
    async readGeneratedImage(conversationId, batchId, frameId, attachmentId, signal) {
      const runtimeSessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const inspection = await ctx.sessionController.inspect(runtimeSessionId, signal)
      // Ordered updates replace the declared batch state, including cancellation.
      let current
      for (const event of inspection.events) if (event.type === 'eleckoi/illustration' && event.data.batchId === batchId) current = event.data
      if (!current || current.status === 'generating') throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '图片不在当前聊天记录中。', { what: '图片记录' })
      const frames = current.frames.filter(frame => frame.id === frameId && frame.attachment?.attachmentId === attachmentId)
      if (frames.length !== 1) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '图片不在当前聊天记录中。', { what: '图片记录' })
      signal.throwIfAborted()
      const stored = await ctx.attachments.readImage(frames[0].attachment)
      return { mediaType: stored.ref.mediaType, data: Buffer.from(stored.data).toString('base64') }
    },
    async regenerateImage(conversationId, batchId, frameId, signal) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      const runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, '')
      await requireIdleSession(ctx, runtime.runtimeSessionId)
      const plugin = ctx.get('eleckoiAutoIllustration')
      if (!plugin) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '自动配图插件未启用，请在插件页启用后重画。', { what: '启用自动配图插件' })
      return plugin.regenerateImage(runtime.runtimeSessionId, batchId, frameId,
        { autoIllustration: runtime.agentPreset.autoIllustration }, signal)
    },
    withGenerationOptions(conversationId, options, action) {
      if (generationOptions.has(conversationId)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天已有 SDK 生成准备。', { what: '结束上一次 SDK 生成' })
      generationOptions.set(conversationId, { ...options })
      return Promise.resolve().then(action).finally(() => generationOptions.delete(conversationId))
    },
    async adoptFork(conversationId, sourceConversationId, sourceTurn, afterTurn) {
      const state = ctx.eleckoiProductData.runtimeStateAt(sourceConversationId,
        ctx.eleckoiProductData.runtimeSessionId(sourceConversationId), sourceTurn, afterTurn ? 'after' : 'before')
      ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
      const nextTurn = await nextSessionTurn(ctx, ctx.eleckoiProductData.runtimeSessionId(conversationId))
      const prepared = await prepare(conversationId, '', true, undefined, nextTurn)
      await presetRegistrar.registerForSession(prepared.runtimeSessionId)
      return prepared.runtimeSessionId
    },
    async prepareSessionAccess(conversationId) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      const prepared = await prepareCurrentPreset(conversationId, '')
      return prepared.runtime.runtimeSessionId
    },
    async create(conversationId) {
      const prepared = await prepare(conversationId, '', true)
      try {
        await presetRegistrar.registerForSession(prepared.runtimeSessionId)
        const created = await ctx.sessionController.create({
          sessionId: prepared.runtimeSessionId,
          cwd: workspaceRoot,
          agentPreset: prepared.presetId
        })
        if (created.sessionId !== prepared.runtimeSessionId) {
          throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'DSH Session 标识与聊天记录不一致。', { what: 'DSH Session 标识' })
        }
        return prepared.runtimeSessionId
      } catch (error) {
        ctx.eleckoiRuntimeContexts.forget(prepared.runtimeSessionId)
        throw error
      }
    },
    async preparePrompt(conversationId, text, signal, retainedInputMessageId) {
      const prepared = await prepare(conversationId, text, false, signal, undefined, retainedInputMessageId)
      return prepared.runtimeSessionId
    },
    async previewPrompt(conversationId, text) {
      const runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text)
      const model = { ...await currentRequestSnapshot(ctx), ...(generationOptions.get(conversationId)?.responseLength
        ? { maxTokens: generationOptions.get(conversationId).responseLength } : {}) }
      const resolved = await ctx.sessionController.resolveAgent(runtime.runtimeSessionId)
      if ('error' in resolved) throw resolved.error
      let surface = resolved.agent.session.deriveMessages()
      const cutoff = generationOptions.get(conversationId)?.historyCutoffId
      if (cutoff) {
        const index = surface.findIndex(message => message.id === cutoff)
        if (index < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '预览的原始用户输入不在当前 Session 中。', { what: '预览的原始用户输入' })
        surface = surface.slice(0, index + 1)
      } else surface = [...surface, createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })]
      const conversationContext = runtime.conversationContext
      const messages = projectRequestInput(surface, requestProjectionSnapshot(conversationContext), {
        instructions: sessionInstructions({ model, conversationContext }) || null,
        currentPromptText: conversationContext.currentPromptText ?? text
      })
      return { model, messages: await renderRequestEjs(messages, { conversationId, variables: runtime.variableContext ? JSON.parse(runtime.variableContext.stateJson) : null }), dryRun: true }
    },
    currentOperation(conversationId) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
      if (!snapshot.operationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天尚未准备生成。', { what: '准备生成' })
      return snapshot.operationId
    },
    async prepareRegeneration(conversationId, text) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const state = ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
      const history = ctx.eleckoiProductData.captureRuntimeHistory(conversationId)
      const previousContext = ctx.eleckoiRuntimeContexts.has(sessionId) ? ctx.eleckoiRuntimeContexts.get(sessionId) : undefined
      const files = [
        snapshotPath(snapshotRoot, sessionId)
      ].map(path => ({ path, content: existsSync(path) ? readFileSync(path) : undefined }))
      const rollback = () => {
        ctx.eleckoiConversationLifecycle.forget(conversationId)
        ctx.eleckoiProductData.restoreRuntimeHistory(conversationId, state, history)
        if (previousContext) ctx.eleckoiRuntimeContexts.set(sessionId, previousContext)
        else ctx.eleckoiRuntimeContexts.forget(sessionId)
        for (const file of files) {
          if (file.content === undefined) rmSync(file.path, { force: true })
          else writeAtomically(file.path, file.content)
        }
        refreshSettingBranches()
      }
      try {
        await requireIdleSession(ctx, sessionId)
        await ctx.eleckoiConversationLifecycle.drain(conversationId)
        return { rollback }
      } catch (error) {
        rollback()
        throw error
      }
    },
    variableStatesByTurn(conversationId) {
      return ctx.eleckoiProductData.runtimeVariablesByTurn(conversationId)
    },
    prepareRestoreBeforeTurn(conversationId, sessionId, fromTurn, beforeMessageId) {
      const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
      if (snapshot.conversationId !== conversationId) {
        throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'DSH Session 与当前聊天不匹配，不能回退运行状态。', { what: 'DSH Session 与当前聊天' })
      }
      const state = ctx.eleckoiProductData.runtimeStateAt(conversationId, sessionId, fromTurn, 'before', beforeMessageId)
      ctx.eleckoiProductData.validateConversationRuntimeSnapshot(state)
      const previous = ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
      const history = ctx.eleckoiProductData.captureRuntimeHistory(conversationId)
      return { state, apply(retainedInputIds) {
        ctx.eleckoiProductData.applyRuntimeRewind(conversationId, sessionId, fromTurn, state, retainedInputIds)
        refreshSettingBranches()
      }, rollback() {
        ctx.eleckoiProductData.restoreRuntimeHistory(conversationId, previous, history)
        refreshSettingBranches()
      } }
    },
    async removeArtifacts(conversationId, sessionId) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      ctx.eleckoiConversationLifecycle.forget(conversationId)
      ctx.eleckoiRuntimeContexts.forgetConversation(conversationId)
      removeSessionSnapshot(snapshotRoot, sessionId)
      rmSync(join(bridgeRoot, safePathPart(conversationId)), { recursive: true, force: true })
      refreshSettingBranches()
    }
  }
  ctx.provide('eleckoiRoleplaySessions', service)

  const disposeCommit = ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    let snapshot
    try {
      snapshot = readSessionSnapshot(snapshotRoot, session.id)
      if (snapshot.inheritedFromSessionId || !snapshot.operationId) return
      const turn = Number(event.data?.turn)
      if (!Number.isSafeInteger(turn) || turn < 1) {
        throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 完成事件缺少有效轮次。', { what: 'DSH 完成事件的轮次' })
      }
      if (!ctx.eleckoiConversationLifecycle.matches(snapshot.conversationId, snapshot.operationId, turn)) return
      const runtimeContext = ctx.eleckoiRuntimeContexts.get(session.id)
      ctx.eleckoiConversationLifecycle.track(snapshot.conversationId, snapshot.operationId, async () => {
        try {
          // 下一次准备先等待本次收尾，内存状态仍属于当前轮次。
          const variableState = snapshot.variablesEnabled && event.data.reason.kind === 'completed'
            ? JSON.stringify(runtimeContext.variables.state) : undefined
          if (!await ctx.sessions.flush(session)) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH Session 没有持久保存服务。', { what: 'DSH Session 持久保存服务' })
          if (event.data.reason.kind === 'completed') {
            ctx.eleckoiProductData.completeConversationRuntime(snapshot.conversationId, session.id, turn,
              variableState, runtimeContext.generationVariableStateJson)
          } else if (event.data.reason.kind !== 'aborted') {
            // LLM 的 `LlmFailure` 不是产品失败：折成兜底码 `eleckoi/internal`（与
            // packages/host/product-api/src/client/invalidResponse.ts 的 INTERNAL_FAILURE_CODE 同一个值），
            // provider 的 message 当诊断、code/status 进详情；不写 details.what，所以 provider 那句仍能给用户看。
            const llm = event.data.reason.error
            throw {
              isDSHRemoteError: true,
              code: 'eleckoi/internal',
              message: typeof llm?.message === 'string' && llm.message.trim() ? llm.message : 'DSH 本轮生成未完成。',
              details: {
                ...typeof llm?.code === 'string' && llm.code ? { code: llm.code } : {},
                ...llm?.status !== undefined ? { status: llm.status } : {}
              }
            }
          }
        } catch (error) {
          ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: failureMessage(error) })
          throw error
        }
        ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: '' })
      })
    } catch (error) {
      ctx.logger.error(`ElecKoi 会话运行状态提交失败：${failureMessage(error)}`)
      if (snapshot?.operationId && !snapshot.inheritedFromSessionId) {
        ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: failureMessage(error) })
      }
    }
  })
  return () => { disposeCommit(); disposeHistoryStats(); disposeTurnOutcomes(); disposeInputContinuations() }
}

async function nextSessionTurn(ctx, sessionId) {
  const inspection = await ctx.sessionController.inspect(sessionId)
  const lastTurn = inspection.events.reduce((latest, event) => (
    event?.type === 'turn/start' && Number.isSafeInteger(event.data?.turn)
      ? Math.max(latest, event.data.turn)
      : latest
  ), 0)
  return lastTurn + 1
}

async function requireIdleSession(ctx, sessionId) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if ('error' in resolved) throw resolved.error
  if (resolved.agent.status !== 'idle') throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天仍在生成，不能提交新的消息。', { what: '等当前回复生成完成' })
  return resolved.agent.session
}

export function materializeAgentPreset(root, templatePath, preset, toolPolicy, mainModel, options = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(preset.id)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '预设编号不能用于 DSH Agent Preset。', { field: 'id' })
  const mountedPresetId = options.id ?? ACTIVE_RUNTIME_PRESET_ID
  if (!/^[a-z0-9][a-z0-9-]*$/.test(mountedPresetId)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'DSH 预设编号不正确。', { field: 'id' })
  const directory = join(root, mountedPresetId)
  mkdirSync(directory, { recursive: true })
  let composition = readFileSync(templatePath, 'utf8')
    .replace('__ELECKOI_SETTING_LIBRARY_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('setting-library-tools')))
    .replace('__ELECKOI_UPLOADED_FILE_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('uploaded-file-tools')))
    .replace('__ELECKOI_VARIABLE_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('variable-tools')))
    .replace('__ELECKOI_ROLEPLAY_PLAN_TOOL_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('roleplay-plan-tool')))
    .replace('__ELECKOI_ROLEPLAY_PLAN_STEPS__', JSON.stringify(preset.roleplayPlan.steps))
    .replace('__ELECKOI_COMPACTION_THRESHOLD_RATIO__', String(compactionRatio(mainModel)))
    .replace('__ELECKOI_COMPACTION_RETENTION__', 'retainTokens: 0')
  composition = applyPresetToolPolicy(composition, new Set(toolPolicy.disabledGroupIds))
  const plugins = parseYaml(composition)
  if (!Array.isArray(plugins)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH Agent 预设组合必须是插件列表。', { what: 'DSH Agent 预设组合' })
  plugins.push(...(options.plugins ?? []))
  const definition = {
    id: mountedPresetId,
    name: preset.name,
    description: `ElecKoi 预设版本 ${preset.versionId}`,
    plugins
  }
  const content = `${JSON.stringify(definition, null, 2)}\n`
  writeAtomically(join(directory, 'preset.json'), content)
  return {
    id: mountedPresetId,
    revision: createHash('sha256').update(content).digest('hex')
  }
}

function compactionRatio(model) {
  if (!Number.isFinite(model.autoCompactTokenLimit) || !Number.isFinite(model.contextWindow)) return 0.8
  return Math.max(Number.EPSILON, Math.min(1, model.autoCompactTokenLimit / model.contextWindow))
}

function applyPresetToolPolicy(source, disabled) {
  const sections = [
    ['variables', 'builtin:variables'],
    ['setting-library', 'builtin:setting-library'],
    ['web', 'builtin:web'],
    ['workspace', 'builtin:workspace'],
    ['collaboration', 'builtin:collaboration'],
    ['roleplay-workflow', 'builtin:roleplay-workflow'],
    ['workflow', 'builtin:workflow']
  ]
  return sections.reduce((content, [section, groupId]) => (
    disabled.has(groupId) ? removePresetSection(content, section) : content
  ), source)
}

function removePresetSection(source, section) {
  const begin = `# ELECKOI:${section}:BEGIN`
  const end = `# ELECKOI:${section}:END`
  const start = source.indexOf(begin)
  const finish = source.indexOf(end)
  if (start < 0 || finish < start) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `DSH 预设模板缺少工具段：${section}`, { what: 'DSH 预设模板里的工具段' })
  return `${source.slice(0, start)}${source.slice(finish + end.length).replace(/^\r?\n/, '')}`
}
function readOptionalSnapshot(root, sessionId) {
  try { return readSessionSnapshot(root, sessionId) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function writeAtomically(path, content) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, `${name} is required`, { what: '配置必需的运行环境变量' })
  return value
}

/** 抛出值的诊断文案：带码失败是普通对象（不是 Error 实例），仍要取它的 message。 */
function failureMessage(error) {
  return error instanceof Error || error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message : String(error)
}

function safePathPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'default'
}
