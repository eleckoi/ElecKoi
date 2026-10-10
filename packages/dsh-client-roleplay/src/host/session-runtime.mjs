import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { readSessionSnapshot, removeSessionSnapshot, snapshotPath, writeSessionSnapshot } from './session-snapshot.mjs'
import { historicalRuntimeState } from './historical-runtime-state.mjs'
import { historyStatsProjection } from './history-stats-projection.mjs'
import { durableProductPluginSpecifier } from './preset-definition.mjs'
import { turnOutcomesProjection } from './turn-outcomes-projection.mjs'
import { inputContinuationsProjection } from './input-continuations-projection.mjs'
import { currentRequestSnapshot } from './model-selection-migration.mjs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { projectRequestInput, requestProjectionSnapshot, sessionInstructions } from './conversation-context.mjs'

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
    const previous = readOptionalSnapshot(snapshotRoot, runtime.runtimeSessionId)
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
    return { runtime, previous, mainModel, effectiveToolPolicy, requestedPreset }
  }

  const prepare = async (conversationId, text, creating = false, signal) => {
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
    if (!creating) await requireIdleSession(ctx, runtime.runtimeSessionId)
    const worldbooks = optionalService(ctx, 'eleckoiWorldbookRounds')
    worldbooks?.release(runtime.runtimeSessionId)
    const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
    mkdirSync(sessionRoot, { recursive: true })
    const nextTurn = creating ? 1 : await nextSessionTurn(ctx, runtime.runtimeSessionId)
    const operationId = creating ? undefined : randomUUID()
    if (operationId) {
      await ctx.eleckoiConversationLifecycle.prepare({
        operationId, conversationId, runtimeSessionId: runtime.runtimeSessionId, turn: nextTurn,
        text, model: mainModel, runtime
      }, signal)
    }
    if (!creating && !generationOptions.get(conversationId)?.skipWIAN && worldbooks?.hasManagedBindings(conversationId)) {
      const context = runtime.conversationContext
      const round = await worldbooks.prepareRound({
        conversationId, runtimePreparation: runtime, modelSnapshot: mainModel,
        currentPromptText: context.currentPromptText ?? text
      })
      signal?.throwIfAborted()
      worldbooks.activate(runtime.runtimeSessionId, round)
    }
    writeRuntimeCheckpoint(
      sessionRoot,
      nextTurn,
      ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
    )
    const variableStateFile = join(sessionRoot, 'eleckoi-variable-state.json')
    const settingStateFile = join(sessionRoot, 'eleckoi-setting-library-state.json')
    const contextFile = join(sessionRoot, 'eleckoi-conversation-context.json')
    writeVariableBridge(variableStateFile, runtime.variableContext)
    writeSettingBridge(
      settingStateFile,
      runtime.conversationContext.currentPromptText ?? text,
      runtime.conversationContext
    )
    writeContextBridge(
      contextFile,
      runtime.conversationContext.currentPromptText ?? text,
      runtime.conversationContext
    )
    writeSessionSnapshot(snapshotRoot, runtime.runtimeSessionId, {
      conversationId,
      ...(operationId ? { operationId } : {}),
      generationVariableStateJson: ctx.eleckoiProductData.snapshotConversationRuntime(conversationId).variableStateJson,
      runtimeThreadId: runtime.runtimeSessionId,
      mountedPresetId,
      mountedPresetRevision,
      ...(presetChanged ? {
        pendingPresetId: requestedPreset.id,
        pendingPresetRevision: requestedPreset.revision
      } : {}),
      model: mainModel,
      variableStateFile,
      settingStateFile,
      contextFile,
      variablesEnabled: runtime.variableContext !== undefined,
      settingLibraryEnabled: runtime.conversationContext.settingLibrary !== undefined,
      settingLibraryBaseline: runtime.settingLibraryBaseline,
      disabledToolGroupIds: effectiveToolPolicy.disabledGroupIds,
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
    withGenerationOptions(conversationId, options, action) {
      if (generationOptions.has(conversationId)) throw new Error('当前聊天已有 SDK 生成准备。')
      generationOptions.set(conversationId, { ...options })
      return Promise.resolve().then(action).finally(() => generationOptions.delete(conversationId))
    },
    async adoptFork(conversationId, sourceConversationId, sourceTurn, afterTurn) {
      const sourceRoot = join(bridgeRoot, safePathPart(sourceConversationId))
      const state = readRuntimeCheckpoint(sourceRoot, sourceTurn + (afterTurn ? 1 : 0))?.state
      if (state) ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
      const prepared = await prepare(conversationId, '', true)
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
      await presetRegistrar.registerForSession(prepared.runtimeSessionId)
      const created = await ctx.sessionController.create({
        sessionId: prepared.runtimeSessionId,
        cwd: workspaceRoot,
        agentPreset: prepared.presetId
      })
      if (created.sessionId !== prepared.runtimeSessionId) {
        throw new Error('DSH Session 标识与聊天记录不一致。')
      }
      return prepared.runtimeSessionId
    },
    async preparePrompt(conversationId, text, signal) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      try {
        const prepared = await prepare(conversationId, text, false, signal)
        return prepared.runtimeSessionId
      } catch (error) {
        optionalService(ctx, 'eleckoiWorldbookRounds')?.release(sessionId)
        throw error
      }
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
        if (index < 0) throw new Error('预览的原始用户输入不在当前 Session 中。')
        surface = surface.slice(0, index + 1)
      } else surface = [...surface, createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })]
      let conversationContext = runtime.conversationContext
      const worldbooks = optionalService(ctx, 'eleckoiWorldbookRounds')
      if (!generationOptions.get(conversationId)?.skipWIAN && worldbooks?.hasManagedBindings(conversationId)) {
        const worldbookRound = await worldbooks.prepareRound({ conversationId, runtimePreparation: runtime,
          modelSnapshot: model, currentPromptText: conversationContext.currentPromptText ?? text, dryRun: true })
        conversationContext = { ...conversationContext, worldbookRound, settingLibrary: worldbooks.nativeStaticLibrary(runtime, worldbookRound) }
      }
      const messages = projectRequestInput(surface, requestProjectionSnapshot(conversationContext), {
        instructions: sessionInstructions({ model, conversationContext }) || null,
        currentPromptText: conversationContext.currentPromptText ?? text
      })
      return { model, messages, dryRun: true }
    },
    currentOperation(conversationId) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
      if (!snapshot.operationId) throw new Error('当前聊天尚未准备生成。')
      return snapshot.operationId
    },
    async prepareRegeneration(conversationId, text) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const state = ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
      const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
      const files = [
        snapshotPath(snapshotRoot, sessionId),
        checkpointPath(sessionRoot),
        ...['eleckoi-variable-state.json', 'eleckoi-setting-library-state.json', 'eleckoi-conversation-context.json']
          .map(name => join(sessionRoot, name))
      ].map(path => ({ path, content: existsSync(path) ? readFileSync(path) : undefined }))
      const rollback = () => {
        ctx.eleckoiConversationLifecycle.forget(conversationId)
        ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
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
      const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
      return Object.fromEntries(readRuntimeCheckpoints(sessionRoot)
        // `beforeTurn: N + 1` is the committed state after DSH turn N.
        .filter(item => item.beforeTurn > 1)
        .map(item => [String(item.beforeTurn - 1), item.state.variableStateJson]))
    },
    prepareRestoreBeforeTurn(conversationId, sessionId, fromTurn, beforeMessageId) {
      const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
      if (snapshot.conversationId !== conversationId) {
        throw new Error('DSH Session 与当前聊天不匹配，不能回退运行状态。')
      }
      const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
      const checkpoint = readRuntimeCheckpoint(sessionRoot, fromTurn)
      const hasRoleplayHistory = (!checkpoint || beforeMessageId)
        && ctx.eleckoiProductData.readConversationDetails(conversationId).metadata.characterId
      const archive = hasRoleplayHistory
        ? ctx.eleckoiProductData.exportConversationArchive(conversationId) : undefined
      const historical = archive && beforeMessageId
        ? historicalRuntimeState(archive, sessionId, fromTurn, beforeMessageId) : undefined
      const exactHistoricalInput = archive?.tables.agent_turns.some(row => row.id === beforeMessageId && row.kind === 'user')
      const state = exactHistoricalInput ? historical : checkpoint?.state
        ?? (archive && historicalRuntimeState(archive, sessionId, fromTurn))
      if (!state) throw new Error(`缺少第 ${fromTurn} 轮之前的历史运行状态，未修改聊天。`)
      ctx.eleckoiProductData.validateConversationRuntimeSnapshot(state)
      const previous = ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
      const checkpointFile = checkpointPath(sessionRoot)
      const checkpointContent = existsSync(checkpointFile) ? readFileSync(checkpointFile) : undefined
      return { state, apply() {
        ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
        mkdirSync(sessionRoot, { recursive: true })
        writeRuntimeCheckpoint(sessionRoot, fromTurn, state)
        trimRuntimeCheckpoints(sessionRoot, fromTurn)
        refreshSettingBranches()
      }, rollback() {
        ctx.eleckoiProductData.restoreConversationRuntime(conversationId, previous)
        if (checkpointContent === undefined) rmSync(checkpointFile, { force: true })
        else writeAtomically(checkpointFile, checkpointContent)
        refreshSettingBranches()
      } }
    },
    async removeArtifacts(conversationId, sessionId) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      ctx.eleckoiConversationLifecycle.forget(conversationId)
      optionalService(ctx, 'eleckoiWorldbookRounds')?.release(sessionId, conversationId)
      removeSessionSnapshot(snapshotRoot, sessionId)
      rmSync(join(bridgeRoot, safePathPart(conversationId)), { recursive: true, force: true })
      refreshSettingBranches()
    }
  }
  ctx.provide('eleckoiRoleplaySessions', service)

  const disposeCommit = ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    optionalService(ctx, 'eleckoiWorldbookRounds')?.release(session.id)
    let snapshot
    try {
      snapshot = readSessionSnapshot(snapshotRoot, session.id)
      if (snapshot.inheritedFromSessionId || !snapshot.operationId) return
      const turn = Number(event.data?.turn)
      if (!Number.isSafeInteger(turn) || turn < 1) {
        throw new Error('DSH 完成事件缺少有效轮次。')
      }
      if (!ctx.eleckoiConversationLifecycle.matches(snapshot.conversationId, snapshot.operationId, turn)) return
      ctx.eleckoiConversationLifecycle.track(snapshot.conversationId, snapshot.operationId, async () => {
        try {
          // 下一次准备先等待本次收尾，桥接文件仍属于当前轮次。
          const variableState = snapshot.variablesEnabled && event.data.reason.kind === 'completed'
            ? readVariableBridgeState(snapshot.variableStateFile) : undefined
          if (!await ctx.sessions.flush(session)) throw new Error('DSH Session 没有持久保存服务。')
          if (event.data.reason.kind === 'completed') {
            ctx.eleckoiProductData.commitConversationRuntime(snapshot.conversationId, variableState, undefined, undefined, snapshot.generationVariableStateJson)
            writeRuntimeCheckpoint(join(bridgeRoot, safePathPart(snapshot.conversationId)), turn + 1,
              ctx.eleckoiProductData.snapshotConversationRuntime(snapshot.conversationId))
            await ctx.eleckoiConversationLifecycle.afterSave({
              operationId: snapshot.operationId, conversationId: snapshot.conversationId,
              runtimeSessionId: session.id, turn
            })
          } else if (event.data.reason.kind !== 'aborted') {
            throw new Error(event.data.reason.error?.message || 'DSH 本轮生成未完成。')
          }
        } catch (error) {
          ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: String(error) })
          throw error
        }
        ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: '' })
      })
    } catch (error) {
      ctx.logger.error(`ElecKoi 会话运行状态提交失败：${String(error)}`)
      if (snapshot?.operationId && !snapshot.inheritedFromSessionId) {
        ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: String(error) })
      }
    }
  })
  return () => { disposeCommit(); disposeHistoryStats(); disposeTurnOutcomes(); disposeInputContinuations() }
}

function optionalService(ctx, name) {
  return typeof ctx.get === 'function' ? ctx.get(name, false) : ctx[name]
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

function checkpointPath(sessionRoot) {
  return join(sessionRoot, 'eleckoi-runtime-checkpoints.json')
}

function readRuntimeCheckpoints(sessionRoot) {
  const path = checkpointPath(sessionRoot)
  if (!existsSync(path)) return []
  const document = parsedObject(readFileSync(path, 'utf8'), '聊天运行状态检查点')
  if (document.version !== 1 || !Array.isArray(document.checkpoints)) {
    throw new Error('聊天运行状态检查点格式不正确。')
  }
  return document.checkpoints.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !Number.isSafeInteger(item.beforeTurn) || item.beforeTurn < 1
      || !item.state || typeof item.state !== 'object' || Array.isArray(item.state)
      || typeof item.state.variableStateJson !== 'string'
      || typeof item.state.settingLibraryStateJson !== 'string') {
      throw new Error('聊天运行状态检查点内容不正确。')
    }
    JSON.parse(item.state.variableStateJson)
    JSON.parse(item.state.settingLibraryStateJson)
    return {
      beforeTurn: item.beforeTurn,
      state: {
        variableStateJson: item.state.variableStateJson,
        settingLibraryStateJson: item.state.settingLibraryStateJson
      }
    }
  }).sort((left, right) => left.beforeTurn - right.beforeTurn)
}

function writeRuntimeCheckpoint(sessionRoot, beforeTurn, state) {
  if (!Number.isSafeInteger(beforeTurn) || beforeTurn < 1) {
    throw new Error('聊天运行状态检查点轮次不正确。')
  }
  JSON.parse(state.variableStateJson)
  JSON.parse(state.settingLibraryStateJson)
  const checkpoints = readRuntimeCheckpoints(sessionRoot)
    .filter(item => item.beforeTurn !== beforeTurn)
  checkpoints.push({ beforeTurn, state })
  checkpoints.sort((left, right) => left.beforeTurn - right.beforeTurn)
  writeAtomically(checkpointPath(sessionRoot), `${JSON.stringify({ version: 1, checkpoints }, null, 2)}\n`)
}

function readRuntimeCheckpoint(sessionRoot, fromTurn) {
  if (!Number.isSafeInteger(fromTurn) || fromTurn < 1) throw new Error('聊天回退轮次不正确。')
  const checkpoint = readRuntimeCheckpoints(sessionRoot)
    .find(item => item.beforeTurn === fromTurn)
  return checkpoint
}

function trimRuntimeCheckpoints(sessionRoot, fromTurn) {
  const checkpoints = readRuntimeCheckpoints(sessionRoot)
    .filter(item => item.beforeTurn <= fromTurn)
  writeAtomically(checkpointPath(sessionRoot), `${JSON.stringify({ version: 1, checkpoints }, null, 2)}\n`)
}

async function requireIdleSession(ctx, sessionId) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if ('error' in resolved) throw resolved.error
  if (resolved.agent.status !== 'idle') throw new Error('当前聊天仍在生成，不能提交新的消息。')
}

export function materializeAgentPreset(root, templatePath, preset, toolPolicy, mainModel) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(preset.id)) throw new Error('预设编号不能用于 DSH Agent Preset。')
  const mountedPresetId = ACTIVE_RUNTIME_PRESET_ID
  const directory = join(root, mountedPresetId)
  mkdirSync(directory, { recursive: true })
  let composition = readFileSync(templatePath, 'utf8')
    .replace('__ELECKOI_SETTING_LIBRARY_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('setting-library-tools')))
    .replace('__ELECKOI_UPLOADED_FILE_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('uploaded-file-tools')))
    .replace('__ELECKOI_VARIABLE_TOOLS_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('variable-tools')))
    .replace('__ELECKOI_ROLEPLAY_PLAN_TOOL_PLUGIN__', JSON.stringify(durableProductPluginSpecifier('roleplay-plan-tool')))
    .replace('__ELECKOI_ROLEPLAY_PLAN_STEPS__', JSON.stringify(preset.roleplayPlan.steps))
    .replace('__ELECKOI_WEB_SEARCH_MAX_RESULTS__', '8')
    .replace('__ELECKOI_COMPACTION_THRESHOLD_RATIO__', String(compactionRatio(mainModel)))
    .replace('__ELECKOI_COMPACTION_RETENTION__', 'retainTokens: 0')
  composition = applyPresetToolPolicy(composition, new Set(toolPolicy.disabledGroupIds))
  const plugins = parseYaml(composition)
  if (!Array.isArray(plugins)) throw new Error('DSH Agent 预设组合必须是插件列表。')
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
  if (start < 0 || finish < start) throw new Error(`DSH 预设模板缺少工具段：${section}`)
  return `${source.slice(0, start)}${source.slice(finish + end.length).replace(/^\r?\n/, '')}`
}

function writeVariableBridge(path, context) {
  const value = context === undefined
    ? { enabled: false, config: null, state: {} }
    : {
        enabled: true,
        config: {
          initialState: parsedObject(context.initialStateJson, '变量初始状态'),
          schemaCode: context.schemaCode,
          objects: context.objects,
          variables: context.variables
        },
        state: parsedObject(context.stateJson, '当前变量状态')
      }
  writeAtomically(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeContextBridge(path, currentUserInput, context) {
  writeAtomically(path, `${JSON.stringify({ ...context, currentUserInput }, null, 2)}\n`)
}

function writeSettingBridge(path, currentUserInput, context) {
  writeAtomically(path, `${JSON.stringify({
    enabled: context.settingLibrary !== undefined,
    library: context.settingLibrary ?? null,
    frozenLibrary: context.settingLibrary ?? null,
    history: [...(context.history ?? []), { role: 'user', content: currentUserInput }]
  }, null, 2)}\n`)
}

function readVariableBridgeState(path) {
  const bridge = parsedObject(readFileSync(path, 'utf8'), '变量运行时桥接文件')
  const state = bridge.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('变量运行时返回的状态必须是 JSON object。')
  return JSON.stringify(state, null, 2)
}

function parsedObject(raw, label) {
  let value
  try { value = JSON.parse(raw || '{}') } catch (error) { throw new Error(`${label}不是合法 JSON。`, { cause: error }) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON object。`)
  return value
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
  if (!value) throw new Error(`${name} is required`)
  return value
}

function safePathPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'default'
}
