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
import { groupResponsesProjection, groupHistorySources } from './native-group-chat.mjs'
import { applyGroupCardPromptPlan } from './native-group-prompts.mjs'
import { currentRequestSnapshot } from './model-selection-migration.mjs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ASSISTANT_CONTINUATION_INSTRUCTION, ASSISTANT_CONTINUATION_SOURCE } from './assistant-continuation.mjs'
import { projectRequestInput, requestProjectionSnapshot, sessionInstructions } from './conversation-context.mjs'
import { capturedImageResult, prepareIllustration } from './generated-image-result.mjs'
import { evaluateWorldbookWithEvents, worldbookRandom, worldbookVectorInputs } from './worldbook-scanner.mjs'
import { worldbookTimedEffect } from './worldbook-timed-effects.mjs'

export { requestSnapshot } from './model-selection-migration.mjs'

/** Freeze product visibility onto native message identities for this Agent turn.
 * A hidden final reply excludes its complete assistant/tool flow together. */
export function hiddenSessionMessageIds(events, annotations) {
  const hidden = new Set(Object.entries(annotations).filter(([, value]) => value?.isHidden).map(([id]) => id))
  const hiddenTurns = new Set()
  for (const event of events) {
    if (event.type === 'assistant/message' && hidden.has(event.data?.message?.id)) hiddenTurns.add(event.data.turn)
  }
  for (const event of events) {
    if (event.type === 'eleckoi/input-continuation' && event.data.mode === 'continue'
      && hidden.has(event.data.targetAssistantMessageId)) hiddenTurns.add(event.data.turn)
    if (event.type === 'user/message' && event.data.source?.kind === ASSISTANT_CONTINUATION_SOURCE
      && hidden.has(event.data.source.targetAssistantMessageId)) hidden.add(event.data.id)
  }
  let turn = 0
  for (const event of events) {
    if (event.type === 'turn/start') turn = event.data.turn
    const message = event.type === 'user/message' ? event.data : event.data?.message
    if (message?.id && hiddenTurns.has(turn) && message.source?.kind !== 'user'
      && message.role !== 'system') hidden.add(String(message.id))
    if (event.type === 'turn/end') turn = 0
  }
  return [...hidden]
}

/** Rebase product state snapshots to the edited native Session turn order. */
export function projectMessageCheckpoints(previous, turns, messages, currentState) {
  const mapping = new Map(turns.map(item => [item.previous, item.current]))
  const next = previous.filter(item => item.phase === 'after' && mapping.has(item.turn))
    .map(item => ({ ...structuredClone(item), turn: mapping.get(item.turn) }))
  const initial = previous.filter(item => item.phase === 'before').sort((a,b) => a.turn - b.turn)[0]?.state ?? currentState
  const priorState = turn => next.filter(item => item.turn < turn).sort((a,b) => b.turn - a.turn)[0]?.state ?? initial
  for (const message of [...messages].filter(item => item.turn).sort((a,b) => a.turn - b.turn)) {
    const index = next.findIndex(item => item.turn === message.turn)
    const state = structuredClone(index >= 0 ? next[index].state : priorState(message.turn))
    state.variableStateJson = message.variableStateJson
    const checkpoint = { turn: message.turn, phase: 'after', state }
    if (index < 0) next.push(checkpoint); else next[index] = checkpoint
  }
  // Before-states follow the new order, including previously existing turns.
  // This makes rewind after rotation restore the preceding candidate's state.
  const before = [...new Set([...mapping.values(), ...messages.map(item => item.turn).filter(Boolean)])]
    .sort((a,b) => a - b).map(turn => ({ turn, phase: 'before', state: structuredClone(priorState(turn)) }))
  return [...before, ...next].sort((a,b) => a.turn - b.turn || a.phase.localeCompare(b.phase))
}

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
  const disposeGroupResponses = ctx.sessionProjections.register(groupResponsesProjection)
  const generationOptions = new Map()

  const releaseMainPrompts = async (conversationId, requestId) => {
    if (requestId) await ctx.get('eleckoiTavernCompatibilityApi')?.releaseMainPrompts(conversationId, requestId)
  }

  const prepareWorldbook = async (runtime, surface, currentInput, nativeTurn, contributions, signal, requestId, preview = false, model = {}) => {
    const context = runtime.conversationContext
    const authorNote = contributions.find(entry => entry.source === 'extension' && entry.sourceName === '2_floating_prompt')
    if (authorNote) context.authorNote = { content: authorNote.content, role: authorNote.role,
      depth: authorNote.depth, order: authorNote.order, position: authorNote.position }
    context.promptContributions = [...(context.promptContributions ?? []), ...contributions
      .filter(entry => entry !== authorNote && entry.position !== 'none').map(entry => ({
        id: `plugin:${entry.source}:${entry.id}`, content: entry.content, role: entry.role,
        anchor: { before_prompt: 'instructions', in_prompt: 'insert_point_2', in_chat: 'chat_depth' }[entry.position],
        depth: entry.depth, order: entry.order, title: entry.sourceName, source: entry.source
      }))]
    const hidden = new Set(context.hiddenMessageIds ?? [])
    const history = [...(context.history ?? []), ...surface.filter(message => !hidden.has(message.id)
      && (message.source?.kind === 'user' || message.role === 'assistant'
        && message.content?.some(block => block.type === 'text' && block.text?.trim())
        && !message.content?.some(block => block.type === 'tool-call')))
      .map(message => ({ role: message.role, content: message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }))]
    if (currentInput !== undefined) history.push({ role: 'user', content: currentInput })
    const dataBank = await ctx.get('eleckoiTavernCompatibilityApi')?.collectDataBankPrompt(runtime.conversationId, history, signal)
    if (dataBank) context.promptContributions.push(dataBank)
    const state = readWorldbookCheckpoint(bridgeRoot, runtime.conversationId, nativeTurn)
    const compatibility = ctx.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value?.state ?? {}
    const scanText = contributions.filter(entry => entry.scan).map(entry => entry.content)
    const settings = { ...compatibility.lorebookSettings, ...(context.generationParameters?.max_context === undefined
      ? {} : { max_context: context.generationParameters.max_context }) }
    const compatibilityApi = ctx.get('eleckoiTavernCompatibilityApi')
    const tokenCounter = await compatibilityApi.createWorldbookTokenCounter({ ...model,
      conversationId: runtime.conversationId, requestId }, signal)
    const result = await evaluateWorldbookWithEvents(context, { history, turn: history.length, state, scanText, settings, signal, preview,
      eventSources: compatibilityApi?.worldbookEventSources(runtime.conversationId, context),
      onEvent: requestId ? (name, payload, key) => compatibilityApi?.dispatchWorldbookEvent(runtime.conversationId,
        requestId, key, name, payload, signal ?? new AbortController().signal, preview) : undefined,
      resolveVectors: async entries => {
        const matches = new Set()
        const scanContext = { ...context, settingLibrary: { ...context.settingLibrary, entries } }
        for (const group of worldbookVectorInputs(scanContext, { history, scanText, settings })) {
          const ids = await compatibilityApi.matchWorldbookEntries(runtime.conversationId, group.entries, group.query, signal)
          for (const id of ids) matches.add(id)
        }
        return matches
      },
      random: worldbookRandom(`${runtime.runtimeSessionId}:${nativeTurn}`),
      tokenCount: tokenCounter.count })
    context.worldbookRound = result.round
    return { turn: nativeTurn, state: result.nextState, history }
  }

  const prepareCurrentPreset = async (conversationId, text, creating = false, requestId, signal) => {
    const controls = generationOptions.get(conversationId) ?? {}
    let runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text, { characterId: controls.characterId })
    const groupPlan = await ctx.get('eleckoiTavernCompatibilityApi')?.groupPromptContext(
      conversationId, runtime.conversationContext.characterId, runtime, requestId, signal)
    // Card macro writes have committed; refresh native variables without reevaluating the frozen text.
    if (groupPlan?.macrosFrozen) runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text, { characterId: controls.characterId })
    applyGroupCardPromptPlan(runtime, groupPlan)
    const annotation = ctx.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value?.state ?? {}
    const messages = annotation.messages?.[conversationId] ?? {}
    const inspection = creating ? { events: [] } : await ctx.sessionController.inspect(runtime.runtimeSessionId)
    runtime.conversationContext.hiddenMessageIds = hiddenSessionMessageIds(inspection.events, messages)
    if (annotation.hiddenOpenings?.[conversationId] || messages.opening?.isHidden) runtime.conversationContext.history = []
    const previous = readOptionalSnapshot(snapshotRoot, runtime.runtimeSessionId)
    runtime.conversationContext.groupSpeakers = groupHistorySources(inspection.events)
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

  const prepare = async (conversationId, text, creating = false, signal, continuation = false) => {
    signal?.throwIfAborted()
    await ctx.eleckoiConversationLifecycle.drain(conversationId)
    const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
    if (!creating) await requireIdleSession(ctx, sessionId)
    const priorOperation = readOptionalSnapshot(snapshotRoot, sessionId)?.operationId
    if (priorOperation) await releaseMainPrompts(conversationId, priorOperation)
    const operationId = creating ? undefined : randomUUID()
    let prepared = false
    try {
      // Generation listeners can change native settings and variables. Read product
      // state after they finish, then freeze their contributions for every tool step.
      const contributions = creating ? [] : await ctx.get('eleckoiTavernCompatibilityApi')?.collectMainPrompts(
        conversationId, operationId, signal ?? new AbortController().signal) ?? []
      const {
        runtime,
        previous,
        mainModel,
        effectiveToolPolicy,
        requestedPreset
      } = await prepareCurrentPreset(conversationId, text, creating, operationId, signal)
      const mountedPresetId = previous?.mountedPresetId ?? requestedPreset.id
      const mountedPresetRevision = previous?.mountedPresetRevision ?? requestedPreset.revision
      const presetChanged = mountedPresetId !== requestedPreset.id
        || mountedPresetRevision !== requestedPreset.revision
      const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
      mkdirSync(sessionRoot, { recursive: true })
      const nextTurn = creating ? 1 : await nextSessionTurn(ctx, runtime.runtimeSessionId)
      let worldbook
      if (!creating) {
        const resolved = await ctx.sessionController.resolveAgent(runtime.runtimeSessionId)
        if ('error' in resolved) throw resolved.error
        let surface = resolved.agent.session.deriveMessages()
        const cutoff = generationOptions.get(conversationId)?.historyCutoffId
        if (cutoff) {
          const index = surface.findIndex(message => message.id === cutoff)
          if (index < 0) throw new Error('世界书扫描的用户输入不在当前 Session 中。')
          surface = surface.slice(0, index + 1)
        }
        worldbook = await prepareWorldbook(runtime, surface, cutoff || continuation ? undefined : runtime.conversationContext.currentPromptText ?? text,
          nextTurn, contributions, signal, operationId, false, mainModel)
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
        runtime.conversationContext,
        worldbook?.history
      )
      writeContextBridge(
        contextFile,
        runtime.conversationContext.currentPromptText ?? text,
        runtime.conversationContext
      )
      writeSessionSnapshot(snapshotRoot, runtime.runtimeSessionId, {
        conversationId,
        ...(operationId ? { operationId } : {}),
        ...(worldbook ? { worldbook: { turn: worldbook.turn, state: worldbook.state } } : {}),
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
        toolModelConfigIds: structuredClone(runtime.agentPreset.toolModelConfigIds || {}),
        roleplayPlanSteps: runtime.agentPreset.roleplayPlan.steps,
        historyCompactionInstructions: runtime.agentPreset.historyCompactionInstructions ?? ''
      })
      if (!creating) await presetRegistrar.selectForSession(runtime.runtimeSessionId)
      signal?.throwIfAborted()
      if (operationId) ctx.eleckoiConversationLifecycle.begin({
        operationId, conversationId, runtimeSessionId: runtime.runtimeSessionId, turn: nextTurn
      })
      prepared = true
      return { runtimeSessionId: runtime.runtimeSessionId, presetId: requestedPreset.id }
    } finally {
      if (!prepared) await releaseMainPrompts(conversationId, operationId)
    }
  }

  const service = {
    readWorldbookState(conversationId) {
      return readWorldbookCheckpoint(bridgeRoot, conversationId, Infinity)
    },
    async worldbookTimedEffect(conversationId, entryId, kind, duration, value) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const resolved = await ctx.sessionController.resolveAgent(sessionId)
      if ('error' in resolved) throw resolved.error
      if (value !== undefined) await requireIdleSession(ctx, sessionId)
      const runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, '')
      const annotations = ctx.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value?.state?.messages?.[conversationId] ?? {}
      const hidden = new Set(hiddenSessionMessageIds(resolved.agent.session.snapshotEvents(), annotations))
      const history = resolved.agent.session.deriveMessages().filter(message => !hidden.has(message.id)
        && (message.source?.kind === 'user' || message.role === 'assistant'
          && message.content?.some(block => block.type === 'text' && block.text?.trim())
          && !message.content?.some(block => block.type === 'tool-call')))
      const turn = (runtime.conversationContext.history ?? []).length + history.length
      const result = worldbookTimedEffect(readWorldbookCheckpoint(bridgeRoot, conversationId, Infinity), entryId, kind, turn, duration, value)
      if (value !== undefined) writeWorldbookCheckpoint(bridgeRoot, conversationId, {
        turn: await nextSessionTurn(ctx, sessionId) - 1, state: result.state
      })
      return { active: result.active, remaining: result.remaining }
    },
    async readGeneratedImage(conversationId, batchId, frameId, attachmentId, signal) {
      const runtimeSessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const inspection = await ctx.sessionController.inspect(runtimeSessionId, signal)
      // Ordered updates replace the declared batch state, including cancellation.
      let current
      for (const event of inspection.events) if (event.type === 'eleckoi/illustration' && event.data.batchId === batchId) current = event.data
      if (!current || current.status === 'generating') throw new Error('图片不在当前聊天记录中。')
      const frames = current.frames.filter(frame => frame.id === frameId && frame.attachment?.attachmentId === attachmentId)
      if (frames.length !== 1) throw new Error('图片不在当前聊天记录中。')
      signal.throwIfAborted()
      const stored = await ctx.attachments.readImage(frames[0].attachment)
      return { mediaType: stored.ref.mediaType, data: Buffer.from(stored.data).toString('base64') }
    },
    async regenerateImage(conversationId, batchId, frameId, signal) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      const runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, '')
      await requireIdleSession(ctx, runtime.runtimeSessionId)
      const state = prepareIllustration(ctx.settings, { disabledToolGroupIds: runtime.disabledToolGroupIds,
        toolModelConfigIds: runtime.agentPreset.toolModelConfigIds })
      if (!state) throw new Error('当前预设没有启用配图配置。')
      return ctx.eleckoiSessionEditor.regenerateImage(runtime.runtimeSessionId, batchId, frameId, async previous => {
        const { seed, attachment, error, status, width, height, ...prompt } = previous
        let generated
        try { generated = await ctx.eleckoiImageGeneration.generate(state.entry, state.settings, [prompt], signal) }
        catch (failure) { generated = { status: 'failed', frames: [], error: String(failure?.message || failure) } }
        const next = capturedImageResult([prompt], state.settings, generated).frames[0]
        return next.status === 'failed' && attachment
          ? { ...previous, error: next.error }
          : { ...prompt, ...next }
      })
    },
    withGenerationOptions(conversationId, options, action) {
      if (generationOptions.has(conversationId)) throw new Error('当前聊天已有 SDK 生成准备。')
      generationOptions.set(conversationId, { ...options })
      return Promise.resolve().then(action).finally(() => generationOptions.delete(conversationId))
    },
    async adoptFork(conversationId, sourceConversationId, sourceTurn, afterTurn) {
      const sourceRoot = join(bridgeRoot, safePathPart(sourceConversationId))
      const state = (afterTurn ? readCompletedRuntimeCheckpoint(sourceRoot, sourceTurn)
        : readRuntimeCheckpoint(sourceRoot, sourceTurn))?.state
      if (!state) throw new Error(`缺少第 ${sourceTurn} 轮${afterTurn ? '完成后' : '开始前'}的历史运行状态，未复制当前变量。`)
      ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
      const prepared = await prepare(conversationId, '', true)
      writeWorldbookCheckpoints(bridgeRoot, conversationId, [{ turn: sourceTurn - (afterTurn ? 0 : 1),
        state: readWorldbookCheckpoint(bridgeRoot, sourceConversationId, sourceTurn + (afterTurn ? 1 : 0)) }])
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
      const prepared = await prepare(conversationId, text, false, signal)
      return prepared.runtimeSessionId
    },
    async prepareContinuation(conversationId, text, signal) {
      const prepared = await prepare(conversationId, text, false, signal, true)
      return prepared.runtimeSessionId
    },
    async previewPrompt(conversationId, text, continuation = false) {
      const requestId = randomUUID()
      try {
        const contributions = await ctx.get('eleckoiTavernCompatibilityApi')?.collectMainPrompts(
          conversationId, requestId, new AbortController().signal, true) ?? []
        if (continuation) {
          const resolved = await ctx.sessionController.resolveAgent(ctx.eleckoiProductData.runtimeSessionId(conversationId))
          if ('error' in resolved) throw resolved.error
          const input = resolved.agent.session.deriveMessages().findLast(message => message.role === 'user' && message.source?.kind === 'user')
          text = input?.content.filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
        }
        const controls = generationOptions.get(conversationId) ?? {}
        let runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text, { characterId: controls.characterId })
        const groupPlan = await ctx.get('eleckoiTavernCompatibilityApi')?.groupPromptContext(
          conversationId, runtime.conversationContext.characterId, runtime, requestId, undefined, true)
        if (groupPlan?.macrosFrozen) runtime = ctx.eleckoiProductData.prepareConversationRuntime(conversationId, text, { characterId: controls.characterId })
        applyGroupCardPromptPlan(runtime, groupPlan)
        const model = { ...await currentRequestSnapshot(ctx), ...(generationOptions.get(conversationId)?.responseLength
          ? { maxTokens: generationOptions.get(conversationId).responseLength } : {}) }
        const resolved = await ctx.sessionController.resolveAgent(runtime.runtimeSessionId)
        if ('error' in resolved) throw resolved.error
        const annotation = ctx.settings.describe().find(item => item.ns === 'eleckoi-product-api')?.value?.state ?? {}
        const messageAnnotations = annotation.messages?.[conversationId] ?? {}
        runtime.conversationContext.hiddenMessageIds = hiddenSessionMessageIds(resolved.agent.session.snapshotEvents(), messageAnnotations)
        if (annotation.hiddenOpenings?.[conversationId] || messageAnnotations.opening?.isHidden) runtime.conversationContext.history = []
        let surface = resolved.agent.session.deriveMessages()
        const cutoff = generationOptions.get(conversationId)?.historyCutoffId
        if (cutoff) {
          const index = surface.findIndex(message => message.id === cutoff)
          if (index < 0) throw new Error('预览的原始用户输入不在当前 Session 中。')
          surface = surface.slice(0, index + 1)
        } else surface = [...surface, createUserMessage({ content: [{ type: 'text', text: continuation ? ASSISTANT_CONTINUATION_INSTRUCTION : text }],
          source: { kind: continuation ? ASSISTANT_CONTINUATION_SOURCE : 'user' } })]
        const conversationContext = runtime.conversationContext
        await prepareWorldbook(runtime, surface, undefined, await nextSessionTurn(ctx, runtime.runtimeSessionId), contributions,
          undefined, requestId, true, model)
        const messages = projectRequestInput(surface, requestProjectionSnapshot(conversationContext), {
          instructions: sessionInstructions({ model, conversationContext }) || null,
          currentPromptText: conversationContext.currentPromptText ?? text
        })
        return { model, messages, dryRun: true }
      } finally { await releaseMainPrompts(conversationId, requestId) }
    },
    currentOperation(conversationId) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
      if (!snapshot.operationId) throw new Error('当前聊天尚未准备生成。')
      return snapshot.operationId
    },
    async releasePreparation(conversationId, operationId) {
      const sessionId = ctx.eleckoiProductData.runtimeSessionId(conversationId)
      const snapshot = readOptionalSnapshot(snapshotRoot, sessionId)
      if (snapshot?.operationId !== operationId) return
      await requireIdleSession(ctx, sessionId)
      if (!ctx.eleckoiConversationLifecycle.release(conversationId, operationId)) return
      const { operationId: _operation, worldbook: _worldbook, ...retained } = snapshot
      writeSessionSnapshot(snapshotRoot, sessionId, retained)
      await releaseMainPrompts(conversationId, operationId)
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
        .filter(item => item.phase === 'after')
        .map(item => [String(item.turn), item.state.variableStateJson]))
    },
    rewriteMessageCheckpoints(conversationId, turns, messages) {
      const sessionRoot = join(bridgeRoot, safePathPart(conversationId))
      const previous = readRuntimeCheckpoints(sessionRoot)
      const state = ctx.eleckoiProductData.snapshotConversationRuntime(conversationId)
      const next = projectMessageCheckpoints(previous, turns, messages, state)
      const previousTimers = readWorldbookCheckpoints(bridgeRoot, conversationId)
      const mapping = new Map(turns.map(item => [item.previous, item.current]))
      const timers = previousTimers.filter(item => mapping.has(item.turn)).map(item => ({ ...item, turn: mapping.get(item.turn) }))
      saveRuntimeCheckpoints(sessionRoot, next)
      writeWorldbookCheckpoints(bridgeRoot, conversationId, timers)
      return { rollback: () => { saveRuntimeCheckpoints(sessionRoot, previous); writeWorldbookCheckpoints(bridgeRoot, conversationId, previousTimers) } }
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
      const timers = readWorldbookCheckpoints(bridgeRoot, conversationId)
      return { state, apply() {
        ctx.eleckoiProductData.restoreConversationRuntime(conversationId, state)
        mkdirSync(sessionRoot, { recursive: true })
        writeRuntimeCheckpoint(sessionRoot, fromTurn, state)
        trimRuntimeCheckpoints(sessionRoot, fromTurn)
        writeWorldbookCheckpoints(bridgeRoot, conversationId, timers.filter(item => item.turn < fromTurn))
        refreshSettingBranches()
      }, rollback() {
        ctx.eleckoiProductData.restoreConversationRuntime(conversationId, previous)
        if (checkpointContent === undefined) rmSync(checkpointFile, { force: true })
        else writeAtomically(checkpointFile, checkpointContent)
        writeWorldbookCheckpoints(bridgeRoot, conversationId, timers)
        refreshSettingBranches()
      } }
    },
    async removeArtifacts(conversationId, sessionId) {
      await ctx.eleckoiConversationLifecycle.drain(conversationId)
      const previous = readOptionalSnapshot(snapshotRoot, sessionId)
      if (previous?.operationId) await releaseMainPrompts(conversationId, previous.operationId)
      ctx.eleckoiConversationLifecycle.forget(conversationId)
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
            if (snapshot.worldbook) writeWorldbookCheckpoint(bridgeRoot, snapshot.conversationId, snapshot.worldbook)
            writeCompletedRuntimeCheckpoint(join(bridgeRoot, safePathPart(snapshot.conversationId)), turn,
              ctx.eleckoiProductData.snapshotConversationRuntime(snapshot.conversationId))
          } else if (event.data.reason.kind !== 'aborted') {
            throw new Error(event.data.reason.error?.message || 'DSH 本轮生成未完成。')
          }
        } catch (error) {
          ctx.eleckoiConversationChanges?.publish({ kind: 'generation', conversationId: snapshot.conversationId, error: String(error) })
          throw error
        } finally {
          await releaseMainPrompts(snapshot.conversationId, snapshot.operationId)
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
  return () => { disposeCommit(); disposeHistoryStats(); disposeTurnOutcomes(); disposeInputContinuations(); disposeGroupResponses() }
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

function readWorldbookCheckpoints(root, conversationId) {
  const path = join(root, safePathPart(conversationId), 'eleckoi-worldbook-timers.json')
  if (!existsSync(path)) return []
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (value.version !== 1 || !Array.isArray(value.checkpoints)) throw new Error('世界书计时状态格式无效。')
  return value.checkpoints
}

function readWorldbookCheckpoint(root, conversationId, beforeTurn) {
  return readWorldbookCheckpoints(root, conversationId).filter(item => item.turn < beforeTurn)
    .sort((a, b) => b.turn - a.turn)[0]?.state ?? { version: 1, entries: {} }
}

function writeWorldbookCheckpoint(root, conversationId, checkpoint) {
  const checkpoints = [...readWorldbookCheckpoints(root, conversationId).filter(item => item.turn < checkpoint.turn), checkpoint]
  writeWorldbookCheckpoints(root, conversationId, checkpoints)
}

function writeWorldbookCheckpoints(root, conversationId, checkpoints) {
  mkdirSync(join(root, safePathPart(conversationId)), { recursive: true })
  writeAtomically(join(root, safePathPart(conversationId), 'eleckoi-worldbook-timers.json'), `${JSON.stringify({ version: 1, checkpoints })}\n`)
}

function readRuntimeCheckpoints(sessionRoot) {
  const path = checkpointPath(sessionRoot)
  if (!existsSync(path)) return []
  const document = parsedObject(readFileSync(path, 'utf8'), '聊天运行状态检查点')
  if (![1, 2].includes(document.version) || !Array.isArray(document.checkpoints)) {
    throw new Error('聊天运行状态检查点格式不正确。')
  }
  const identities = new Set()
  const checkpoints = document.checkpoints.map((item) => {
    // Old records identify a pre-input boundary, not an immutable completed reply.
    const turn = document.version === 1 ? item?.beforeTurn : item?.turn
    const phase = document.version === 1 ? 'before' : item?.phase
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !Number.isSafeInteger(turn) || turn < 1 || !['before', 'after'].includes(phase)
      || !item.state || typeof item.state !== 'object' || Array.isArray(item.state)
      || typeof item.state.variableStateJson !== 'string'
      || typeof item.state.settingLibraryStateJson !== 'string') {
      throw new Error('聊天运行状态检查点内容不正确。')
    }
    const identity = `${phase}:${turn}`
    if (identities.has(identity)) throw new Error(`聊天运行状态检查点重复：${identity}，未修改记录。`)
    identities.add(identity)
    parsedObject(item.state.variableStateJson, '历史变量状态')
    if (!Array.isArray(JSON.parse(item.state.settingLibraryStateJson))) {
      throw new Error('历史设定状态必须是 JSON array，未修改记录。')
    }
    return {
      turn, phase,
      state: {
        variableStateJson: item.state.variableStateJson,
        settingLibraryStateJson: item.state.settingLibraryStateJson
      }
    }
  }).sort((left, right) => left.turn - right.turn || left.phase.localeCompare(right.phase))
  if (document.version === 1) saveRuntimeCheckpoints(sessionRoot, checkpoints)
  return checkpoints
}

function writeRuntimeCheckpoint(sessionRoot, beforeTurn, state) {
  writeRuntimeState(sessionRoot, beforeTurn, 'before', state)
}

function writeCompletedRuntimeCheckpoint(sessionRoot, turn, state) {
  writeRuntimeState(sessionRoot, turn, 'after', state)
}

function writeRuntimeState(sessionRoot, turn, phase, state) {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new Error('聊天运行状态检查点轮次不正确。')
  }
  parsedObject(state.variableStateJson, '历史变量状态')
  if (!Array.isArray(JSON.parse(state.settingLibraryStateJson))) throw new Error('历史设定状态必须是 JSON array。')
  const checkpoints = readRuntimeCheckpoints(sessionRoot)
    .filter(item => item.turn !== turn || item.phase !== phase)
  checkpoints.push({ turn, phase, state })
  checkpoints.sort((left, right) => left.turn - right.turn || left.phase.localeCompare(right.phase))
  saveRuntimeCheckpoints(sessionRoot, checkpoints)
}

function saveRuntimeCheckpoints(sessionRoot, checkpoints) {
  writeAtomically(checkpointPath(sessionRoot), `${JSON.stringify({ version: 2, checkpoints }, null, 2)}\n`)
}

function readRuntimeCheckpoint(sessionRoot, fromTurn) {
  if (!Number.isSafeInteger(fromTurn) || fromTurn < 1) throw new Error('聊天回退轮次不正确。')
  const checkpoints = readRuntimeCheckpoints(sessionRoot)
  return checkpoints.find(item => item.phase === 'before' && item.turn === fromTurn)
    ?? checkpoints.find(item => item.phase === 'after' && item.turn === fromTurn - 1)
}

function readCompletedRuntimeCheckpoint(sessionRoot, turn) {
  if (!Number.isSafeInteger(turn) || turn < 1) throw new Error('聊天完成轮次不正确。')
  return readRuntimeCheckpoints(sessionRoot).find(item => item.phase === 'after' && item.turn === turn)
}

function trimRuntimeCheckpoints(sessionRoot, fromTurn) {
  const checkpoints = readRuntimeCheckpoints(sessionRoot)
    .filter(item => item.turn < fromTurn || (item.turn === fromTurn && item.phase === 'before'))
  saveRuntimeCheckpoints(sessionRoot, checkpoints)
}

async function requireIdleSession(ctx, sessionId) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if ('error' in resolved) throw resolved.error
  if (resolved.agent.status !== 'idle') throw new Error('当前聊天仍在生成，不能提交新的消息。')
}

export function materializeAgentPreset(root, templatePath, preset, toolPolicy, mainModel, options = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(preset.id)) throw new Error('预设编号不能用于 DSH Agent Preset。')
  const mountedPresetId = options.id ?? ACTIVE_RUNTIME_PRESET_ID
  if (!/^[a-z0-9][a-z0-9-]*$/.test(mountedPresetId)) throw new Error('DSH 预设编号不正确。')
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
  if (options.includeUploadedFiles === false) {
    const index = plugins.findIndex(plugin => plugin.id === 'uploaded-file-tools')
    if (index === -1) throw new Error('DSH Agent 模板缺少正式的附件工具声明。')
    plugins.splice(index, 1)
  }
  plugins.push(...(options.plugins ?? []))
  const imageConfigId = preset.toolModelConfigIds?.['builtin:auto-illustration']
  if (imageConfigId && !toolPolicy.disabledGroupIds.includes('builtin:auto-illustration')) {
    plugins.push({ id: 'image-generation-tools', name: durableProductPluginSpecifier('image-generation-tools'), config: { configId: imageConfigId } })
  }
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

function writeSettingBridge(path, currentUserInput, context, scanHistory) {
  writeAtomically(path, `${JSON.stringify({
    enabled: context.settingLibrary !== undefined,
    library: context.settingLibrary ?? null,
    frozenLibrary: context.settingLibrary ?? null,
    ...(context.worldbookRound ? { worldbookRound: context.worldbookRound } : {}),
    history: scanHistory ?? [...(context.history ?? []), { role: 'user', content: currentUserInput }]
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
  try { value = JSON.parse(raw) } catch (error) { throw new Error(`${label}不是合法 JSON。`, { cause: error }) }
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
