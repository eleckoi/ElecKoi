import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import {
  DeepSeekHarness,
  TransportClosedError,
  type ContentBlock,
  type HarnessNotification
} from '@deepseek-ai/dsh-sdk-client'
import type { ImageAttachmentLimits, ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import {
  commitPreparedImageFile,
  DEFAULT_NORMALIZED_IMAGE_MAX_BYTES,
  DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION,
  DEFAULT_NORMALIZED_IMAGE_MAX_PIXELS,
  prepareImageFile,
  readImageFile
} from '@deepseek-ai/dsh-attachment-local'
import { DshProcessProjector, DshReplyProjector, finalReplyText } from './notifications'
import {
  createDshProviderCatalog,
  resolveDshProviderBinding,
  type DshProviderCatalog
} from './modelProfiles'
import {
  DshGenerationStatsProjector,
  emptyStoredGenerationStats,
  parseStoredGenerationStats,
  regenerationGenerationStats,
  type DshGenerationStats,
  type DshGenerationStatsAccumulated
} from './generationStats'
import type {
  DshConversationContext,
  DshRuntimeOptions,
  DshModelSettings,
  DshStreamCallbacks,
  DshVariableRuntimeContext,
  DshToolPolicy,
  DshEncodedImageAttachment,
  DshImageAttachmentRef,
  DshAgentPreset,
  DshWebSearchSettings
} from './types'

const resolveRuntimeModule = createRequire(import.meta.url).resolve
import {
  readDshTrajectory,
  type DshSessionEventRecord,
  type DshTrajectoryReadOptions
} from './trajectory'
import {
  discardRequestContexts,
  requestContextPath
} from './requestContext'
import { sessionRuntimeIdentityChanged, type DshSessionRuntimeIdentity } from './sessionSnapshot'

const imageLimits: ImageAttachmentLimits = {
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 20 * 1024 * 1024,
  maxImagePixels: 64_000_000,
  maxImageDimension: 8192,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
}
const imageNormalizationPolicy = {
  maxPixels: DEFAULT_NORMALIZED_IMAGE_MAX_PIXELS,
  maxDimension: DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION,
  maxBytes: DEFAULT_NORMALIZED_IMAGE_MAX_BYTES
}

interface ActiveRun {
  cancelled: boolean
  runtimeThreadId: string
}

export class DshRuntime {
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly startingRuns = new Map<string, ActiveRun>()
  private readonly cancellationTasks = new Map<string, Promise<void>>()
  private readonly conversationSessions = new Map<string, string>()
  private readonly generationStatsProjectors = new Map<string, DshGenerationStatsProjector>()
  private readonly trajectoryEvents = new Map<string, DshSessionEventRecord[]>()
  private harness: DeepSeekHarness | undefined
  private harnessKey = ''
  private harnessStartTask: Promise<DeepSeekHarness> | undefined
  private recoveryTask: Promise<void> | undefined
  private closed = false

  constructor(private readonly options: DshRuntimeOptions) {
    mkdirSync(options.workspaceRoot, { recursive: true })
    mkdirSync(join(options.runtimeDataRoot, 'home'), { recursive: true })
    mkdirSync(join(options.runtimeDataRoot, 'sessions'), { recursive: true })
    mkdirSync(join(options.runtimeDataRoot, 'session-snapshots'), { recursive: true })
  }

  async prepareImages(images: DshEncodedImageAttachment[]): Promise<DshImageAttachmentRef[]> {
    if (images.length > imageLimits.maxImagesPerMessage) throw new Error('每条消息最多添加 4 张图片。')
    const decoded = images.map(decodeImage)
    const totalBytes = decoded.reduce((total, image) => total + image.data.byteLength, 0)
    if (totalBytes > imageLimits.maxMessageImageBytes) throw new Error('每条消息的图片总计不能超过 20 MB。')
    const prepared = await Promise.all(decoded.map((image) => (
      prepareImageFile(image, imageLimits, imageNormalizationPolicy)
    )))
    const root = join(this.options.runtimeDataRoot, 'home', 'attachments', 'v1')
    const committed: DshImageAttachmentRef[] = []
    for (const image of prepared) {
      committed.push(await commitPreparedImageFile(root, image) as unknown as DshImageAttachmentRef)
    }
    return committed
  }

  async readImage(image: DshImageAttachmentRef): Promise<{ mediaType: DshImageAttachmentRef['mediaType']; data: string }> {
    const stored = await readImageFile(
      join(this.options.runtimeDataRoot, 'home', 'attachments', 'v1'),
      image as unknown as ImageAttachmentRef
    )
    return { mediaType: image.mediaType, data: Buffer.from(stored.data).toString('base64') }
  }

  removeImage(attachmentId: string): void {
    const match = /^sha256:([a-f0-9]{64})$/.exec(attachmentId)
    if (!match?.[1]) throw new Error('图片附件编号无效。')
    rmSync(join(this.options.runtimeDataRoot, 'home', 'attachments', 'v1', 'objects', match[1].slice(0, 2), match[1]), { force: true })
  }

  async stream(
    conversationId: string,
    text: string,
    settings: DshModelSettings,
    callbacks: DshStreamCallbacks,
    variableContext?: DshVariableRuntimeContext,
    conversationContext?: DshConversationContext,
    runtimeThreadId = conversationId,
    toolPolicy?: DshToolPolicy,
    discardRuntimeThreadIds: string[] = [],
    inputImages: DshImageAttachmentRef[] = [],
    agentPreset?: DshAgentPreset,
    webSearch?: DshWebSearchSettings,
    subagentSettings?: DshModelSettings,
    generationStatsSeed?: { previous?: DshGenerationStatsAccumulated | undefined; retainedTurns: number }
  ): Promise<'complete' | 'cancelled'> {
    if (this.activeRuns.has(conversationId) || this.startingRuns.has(conversationId)) {
      throw new Error('这个对话仍有回复正在生成。')
    }
    const selectedAgentPreset = agentPreset ?? defaultAgentPreset()
    const selectedWebSearch = webSearch ?? defaultWebSearchSettings()
    const effectiveSubagentSettings = subagentSettings ?? settings
    const catalog = createDshProviderCatalog([
      ...(this.options.modelCatalog?.() ?? []),
      settings,
      effectiveSubagentSettings
    ])
    const mainBinding = resolveDshProviderBinding(catalog, settings)
    const subagentBinding = resolveDshProviderBinding(catalog, effectiveSubagentSettings)
    const run: ActiveRun = { cancelled: false, runtimeThreadId }
    this.startingRuns.set(conversationId, run)
    try {
      await this.waitForCancellationBarrier(conversationId)
      if (run.cancelled) return 'cancelled'
      const harness = await this.ensureHarness(catalog, selectedWebSearch, settings)
      if (run.cancelled) return 'cancelled'
      this.startingRuns.delete(conversationId)
      this.activeRuns.set(conversationId, run)
      const sessionRoot = join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId))
      mkdirSync(sessionRoot, { recursive: true })
      if (generationStatsSeed) {
        const seeded = new DshGenerationStatsProjector(regenerationGenerationStats(
          generationStatsSeed.previous,
          generationStatsSeed.retainedTurns
        ))
        this.generationStatsProjectors.set(generationStatsKey(conversationId, runtimeThreadId), seeded)
        persistGenerationStats(sessionRoot, runtimeThreadId, seeded)
        callbacks.onGenerationStats?.(seeded.snapshot())
      }
      if (discardRuntimeThreadIds.length > 0) {
        await this.disposeRuntimeThreads(discardRuntimeThreadIds, runtimeThreadId)
        discardPersistedRuntimeThreads(
          join(this.options.runtimeDataRoot, 'sessions'),
          discardRuntimeThreadIds,
          runtimeThreadId
        )
        discardSessionSnapshots(
          join(this.options.runtimeDataRoot, 'session-snapshots'),
          discardRuntimeThreadIds,
          runtimeThreadId
        )
        this.discardGenerationStats(conversationId, sessionRoot, discardRuntimeThreadIds, runtimeThreadId)
        discardRequestContexts(sessionRoot, discardRuntimeThreadIds, runtimeThreadId)
      }
      const variableStateFile = join(sessionRoot, 'eleckoi-variable-state.json')
      writeVariableBridge(variableStateFile, variableContext)
      const settingStateFile = join(sessionRoot, 'eleckoi-setting-library-state.json')
      writeSettingBridge(settingStateFile, conversationContext, variableContext)
      const contextFile = join(sessionRoot, 'eleckoi-conversation-context.json')
      writeContextBridge(contextFile, text, conversationContext)
      const requestContextFile = requestContextPath(sessionRoot, runtimeThreadId)
      const effectiveToolPolicy = sessionToolPolicy(
        toolPolicy,
        variableContext !== undefined,
        conversationContext?.settingLibrary !== undefined,
        selectedAgentPreset.roleplayPlan.steps.length > 0
      )
      const mountedPresetId = this.materializeAgentPreset(
        selectedAgentPreset,
        effectiveToolPolicy,
        effectiveSubagentSettings,
        subagentBinding.provider,
        selectedWebSearch,
        settings
      )
      const snapshotRoot = join(this.options.runtimeDataRoot, 'session-snapshots')
      const previousSessionSnapshot = readSessionSnapshot(snapshotRoot, runtimeThreadId)
      const nextSessionSnapshot = {
        conversationId,
        runtimeThreadId,
        mountedPresetId,
        model: requestSnapshot(settings, mainBinding),
        subagentModel: requestSnapshot(effectiveSubagentSettings, subagentBinding),
        variableStateFile,
        settingStateFile,
        contextFile,
        requestContextFile,
        variablesEnabled: variableContext !== undefined,
        settingLibraryEnabled: conversationContext?.settingLibrary !== undefined,
        disabledToolGroupIds: effectiveToolPolicy.disabledGroupIds,
        roleplayPlanSteps: selectedAgentPreset.roleplayPlan.steps,
        historyCompactionInstructions: selectedAgentPreset.historyCompactionInstructions ?? '',
        conversationContext: conversationContext ?? {
          characterId: '', characterName: '', persona: {}, history: []
        }
      }
      if (sessionRuntimeIdentityChanged(previousSessionSnapshot, nextSessionSnapshot)) {
        await this.disposeRuntimeThreads([runtimeThreadId], '')
      }
      writeSessionSnapshot(
        snapshotRoot,
        runtimeThreadId,
        nextSessionSnapshot
      )
      this.conversationSessions.set(conversationId, runtimeThreadId)
      if (run.cancelled) return 'cancelled'
      const processProjector = new DshProcessProjector(runtimeThreadId, effectiveSubagentSettings.model)
      const replyProjector = new DshReplyProjector(runtimeThreadId)
      const generationStatsProjector = this.generationStatsProjector(conversationId, runtimeThreadId, sessionRoot)
      const content: string | ContentBlock[] = inputImages.length === 0
        ? text
        : [
            ...(text.trim() ? [{ type: 'text' as const, text }] : []),
            ...inputImages.map((attachment) => ({
              type: 'image' as const,
              attachment: attachment as unknown as ImageAttachmentRef
            }))
          ]
      const result = await this.runWithRecovery(
        harness,
        catalog,
        selectedWebSearch,
        settings,
        content,
        runtimeThreadId,
        (notification) => {
          maintainSubagentSessionSnapshot(join(this.options.runtimeDataRoot, 'session-snapshots'), notification)
          this.captureTrajectoryEvent(conversationId, runtimeThreadId, notification)
          if (run.cancelled) return
          const generationStats = generationStatsProjector.project(notification, runtimeThreadId)
          if (generationStats !== undefined) {
            persistGenerationStats(sessionRoot, runtimeThreadId, generationStatsProjector)
            callbacks.onGenerationStats?.(generationStats)
          }
          const delta = replyProjector.project(notification)
          if (delta !== undefined) callbacks.onDelta(delta)
          const processItem = processProjector.project(notification)
          if (processItem !== undefined) callbacks.onProcessItem?.(processItem)
        }
      )
      if (run.cancelled) return 'cancelled'
      const turnEnd = result.events.findLast((event) => event.type === 'turn/end')
      if (turnEnd === undefined) throw new Error('DSH session ended without a turn/end event')
      const turnFailure = turnEndFailureMessage(turnEnd)
      if (turnFailure !== undefined) throw new Error(turnFailure)
      if (variableContext !== undefined) callbacks.onVariableState?.(readVariableBridgeState(variableStateFile))
      if (conversationContext?.settingLibrary !== undefined) callbacks.onSettingLibraryState?.(readSettingBridgeState(settingStateFile))
      callbacks.onFinal(finalReplyText(result.finalResponse))
      return 'complete'
    } catch (error) {
      if (run.cancelled) return 'cancelled'
      throw error
    } finally {
      if (this.startingRuns.get(conversationId) === run) this.startingRuns.delete(conversationId)
      if (this.activeRuns.get(conversationId) === run) this.activeRuns.delete(conversationId)
    }
  }

  async stop(conversationId: string): Promise<boolean> {
    const starting = this.startingRuns.get(conversationId)
    if (starting !== undefined) {
      starting.cancelled = true
      this.startingRuns.delete(conversationId)
      return true
    }
    const run = this.activeRuns.get(conversationId)
    if (run === undefined) return false
    run.cancelled = true
    if (this.activeRuns.get(conversationId) === run) this.activeRuns.delete(conversationId)
    const harness = this.harness
    const cancellation = (async () => {
      if (harness === undefined) return
      try {
        await harness.client.request('session/cancel', { sessionId: run.runtimeThreadId })
      } catch (error) {
        if (!(error instanceof TransportClosedError)) throw error
      }
    })()
    this.cancellationTasks.set(conversationId, cancellation)
    try {
      await cancellation
      return true
    } finally {
      if (this.cancellationTasks.get(conversationId) === cancellation) {
        this.cancellationTasks.delete(conversationId)
      }
    }
  }

  private async waitForCancellationBarrier(conversationId: string): Promise<void> {
    const cancellation = this.cancellationTasks.get(conversationId)
    if (cancellation === undefined) return
    try {
      await cancellation
    } catch {
      // The previous cancellation is reported by its caller. A fresh runtime
      // thread can still start after the old cancellation has settled.
    }
  }

  async disposeConversation(conversationId: string, runtimeThreadIds: readonly string[] = []): Promise<void> {
    const run = this.activeRuns.get(conversationId)
    if (run !== undefined) {
      run.cancelled = true
      await this.stop(conversationId)
    }
    const runtimeThreadId = this.conversationSessions.get(conversationId)
    const discardedThreadIds = [...new Set([
      ...runtimeThreadIds,
      ...(runtimeThreadId ? [runtimeThreadId] : [])
    ])]
    if (discardedThreadIds.length > 0) {
      await this.disposeRuntimeThreads(discardedThreadIds, '')
      discardPersistedRuntimeThreads(join(this.options.runtimeDataRoot, 'sessions'), discardedThreadIds, '')
      discardSessionSnapshots(join(this.options.runtimeDataRoot, 'session-snapshots'), discardedThreadIds, '')
    }
    rmSync(join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId)), {
      recursive: true,
      force: true
    })
    this.conversationSessions.delete(conversationId)
    this.activeRuns.delete(conversationId)
    clearConversationEntries(this.trajectoryEvents, conversationId)
    clearConversationEntries(this.generationStatsProjectors, conversationId)
  }

  generationStats(conversationId: string, runtimeThreadId: string): DshGenerationStats | undefined {
    if (!runtimeThreadId) return undefined
    const sessionRoot = join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId))
    return this.generationStatsProjector(conversationId, runtimeThreadId, sessionRoot).snapshot()
  }

  trajectory(conversationId: string, runtimeThreadId: string, options?: DshTrajectoryReadOptions) {
    const sessionLogRoot = join(this.options.runtimeDataRoot, 'sessions')
    const conversationStateRoot = join(sessionLogRoot, safeConversationDirectory(conversationId))
    return readDshTrajectory(
      sessionLogRoot,
      runtimeThreadId,
      options,
      this.trajectoryEvents.get(trajectoryKey(conversationId, runtimeThreadId)),
      conversationStateRoot
    )
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const run of this.startingRuns.values()) run.cancelled = true
    for (const run of this.activeRuns.values()) run.cancelled = true
    await Promise.allSettled([
      ...(this.harnessStartTask === undefined ? [] : [this.harnessStartTask]),
      ...(this.recoveryTask === undefined ? [] : [this.recoveryTask]),
      ...this.cancellationTasks.values()
    ])
    const harness = this.harness
    this.harness = undefined
    this.harnessKey = ''
    if (harness !== undefined) await harness.close()
    discardInheritedSessionSnapshots(join(this.options.runtimeDataRoot, 'session-snapshots'))
    this.activeRuns.clear()
    this.startingRuns.clear()
    this.cancellationTasks.clear()
    this.conversationSessions.clear()
    this.trajectoryEvents.clear()
    this.generationStatsProjectors.clear()
  }

  async verify(): Promise<void> {
    const agentPreset = defaultAgentPreset()
    const settings: DshModelSettings = {
      configId: 'eleckoi-runtime-health-check',
      provider: 'deepseek',
      apiKey: 'eleckoi-runtime-health-check',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      systemPrompt: 'ElecKoi DSH runtime health check.',
      apiFormat: 'openai-completions',
      customHeaders: {},
      contextWindow: 128000,
      supportsImageInput: false
    }
    const catalog = createDshProviderCatalog([settings])
    this.materializeAgentPreset(agentPreset, undefined, settings, resolveDshProviderBinding(catalog, settings).provider)
    const harness = this.createHarness(catalog, defaultWebSearchSettings(), settings)
    try {
      await harness.start()
    } finally {
      await harness.close()
    }
  }

  private createHarness(
    catalog: DshProviderCatalog,
    webSearch: DshWebSearchSettings,
    defaultSettings: DshModelSettings
  ): DeepSeekHarness {
    const binding = resolveDshProviderBinding(catalog, defaultSettings)
    const runtimePatchPath = this.materializeRuntimePatch(catalog)
    const harness = new DeepSeekHarness({
      profile: 'sdk',
      patches: [this.options.configPath, runtimePatchPath],
      dshHome: join(this.options.runtimeDataRoot, 'home'),
      processCwd: this.options.workspaceRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...catalog.credentials,
        DSH_MODEL: binding.model,
        DSH_SYSTEM_PROMPT: 'You are ElecKoi.',
        DSH_CWD: this.options.workspaceRoot,
        DSH_SESSION_ROOT: join(this.options.runtimeDataRoot, 'sessions'),
        ELECKOI_SESSION_SNAPSHOT_ROOT: join(this.options.runtimeDataRoot, 'session-snapshots'),
        DSH_WEB_SEARCH_PROVIDER: webSearch.mode === 'tavily' ? 'tavily' : 'deepseek-official',
        ELECKOI_NATIVE_WEB_SEARCH_API_KEY: officialDeepSeekWebSearchApiKey(defaultSettings),
        ELECKOI_WEB_SEARCH_MAX_RESULTS: String(webSearch.maxResults),
        ELECKOI_TAVILY_API_KEY: webSearch.tavilyApiKey,
        DSH_PERMISSION_MODE: 'workspace-write',
        DSH_TELEMETRY_DISABLED: '1'
      },
      shutdownTimeoutMs: 1500,
      disposeEofGraceMs: 2500,
      disposeGraceMs: 1500,
      cwd: this.options.workspaceRoot,
      provider: binding.provider,
      model: binding.model
    })
    return harness
  }

  /**
   * DSH patch files are configuration documents, not JavaScript containers.
   * Materializing the provider dictionaries as literal JSON keeps the complete
   * route set on the official llm-pi-ai / llm-deepseek configuration path.
   */
  private materializeRuntimePatch(catalog: DshProviderCatalog): string {
    const deepseek = catalog.deepseek ?? {
      apiKeyEnv: 'ELECKOI_DEEPSEEK_API_KEY',
      baseURL: 'https://api.deepseek.com',
      defaultContextWindow: 1_000_000,
      models: []
    }
    const document = [
      { id: 'llm-pi-ai', config: { providers: catalog.providers } },
      {
        id: 'llm-deepseek',
        config: {
          apiKeyEnv: deepseek.apiKeyEnv,
          baseURL: deepseek.baseURL,
          defaultContextWindow: deepseek.defaultContextWindow,
          models: deepseek.models
        }
      }
    ]
    const content = `${JSON.stringify(document, null, 2)}\n`
    const fingerprint = createHash('sha256').update(content).digest('hex').slice(0, 16)
    const directory = join(this.options.runtimeDataRoot, 'generated-config')
    const path = join(directory, `providers-${fingerprint}.patch.yml`)
    mkdirSync(directory, { recursive: true })
    writeAtomically(path, content)
    return path
  }

  private async ensureHarness(
    catalog: DshProviderCatalog,
    webSearch: DshWebSearchSettings,
    defaultSettings: DshModelSettings
  ): Promise<DeepSeekHarness> {
    if (this.closed) throw new Error('DSH 运行时已经关闭。')
    const key = JSON.stringify({
      providers: catalog.providers,
      deepseek: catalog.deepseek,
      credentials: catalog.credentials,
      webSearch,
      nativeWebSearchKey: officialDeepSeekWebSearchApiKey(defaultSettings)
    })
    if (this.harness !== undefined && this.harnessKey === key) return this.harness
    if (this.harnessStartTask !== undefined) {
      await this.harnessStartTask
      if (this.harness !== undefined && this.harnessKey === key) return this.harness
    }
    const startTask = (async () => {
      if (this.harness !== undefined && this.harnessKey === key) return this.harness
      if (this.harness !== undefined && this.activeRuns.size > 0) {
        throw new Error('模型连接配置已变化；请等待当前回复完成后再试。')
      }
      const previous = this.harness
      this.harness = undefined
      this.harnessKey = ''
      if (previous !== undefined) await previous.close()
      const harness = this.createHarness(catalog, webSearch, defaultSettings)
      await harness.start()
      this.harness = harness
      this.harnessKey = key
      return harness
    })()
    this.harnessStartTask = startTask
    try {
      return await startTask
    } finally {
      if (this.harnessStartTask === startTask) this.harnessStartTask = undefined
    }
  }

  private async runWithRecovery(
    harness: DeepSeekHarness,
    catalog: DshProviderCatalog,
    webSearch: DshWebSearchSettings,
    defaultSettings: DshModelSettings,
    content: string | ContentBlock[],
    runtimeThreadId: string,
    onNotification: (notification: HarnessNotification) => void
  ) {
    try {
      return await harness.run(content, { sessionId: runtimeThreadId, onNotification })
    } catch (error) {
      if (!(error instanceof TransportClosedError)) throw error
      await this.recoverHarness(harness, catalog, webSearch, defaultSettings)
      const recovered = this.harness
      if (recovered === undefined) throw error
      return recovered.run(content, { sessionId: runtimeThreadId, onNotification })
    }
  }

  private async recoverHarness(
    failedHarness: DeepSeekHarness,
    catalog: DshProviderCatalog,
    webSearch: DshWebSearchSettings,
    defaultSettings: DshModelSettings
  ): Promise<void> {
    if (this.harness !== failedHarness) return
    this.recoveryTask ??= (async () => {
      if (this.harness !== failedHarness) return
      this.harness = undefined
      this.harnessKey = ''
      try {
        await failedHarness.close()
      } catch {
        // The transport is already gone; close remains best-effort here.
      }
      if (this.closed) return
      const recovered = this.createHarness(catalog, webSearch, defaultSettings)
      await recovered.start()
      this.harness = recovered
      this.harnessKey = JSON.stringify({
        providers: catalog.providers,
        deepseek: catalog.deepseek,
        credentials: catalog.credentials,
        webSearch,
        nativeWebSearchKey: officialDeepSeekWebSearchApiKey(defaultSettings)
      })
    })().finally(() => {
      this.recoveryTask = undefined
    })
    await this.recoveryTask
  }

  private async disposeRuntimeThreads(threadIds: readonly string[], selectedThreadId: string): Promise<void> {
    const harness = this.harness
    if (harness === undefined) return
    for (const sessionId of new Set(threadIds)) {
      if (!sessionId || sessionId === selectedThreadId) continue
      try {
        await harness.client.request('session/dispose', { sessionId })
      } catch (error) {
        if (!(error instanceof TransportClosedError)) throw error
      }
    }
  }

  private captureTrajectoryEvent(
    conversationId: string,
    runtimeThreadId: string,
    notification: HarnessNotification
  ): void {
    if (notification.method !== 'session.event' || notification.params.sessionId !== runtimeThreadId) return
    const event = notification.params.event
    if (!isRecord(event) || typeof event.type !== 'string') return
    const key = trajectoryKey(conversationId, runtimeThreadId)
    const events = this.trajectoryEvents.get(key) ?? []
    const seq = typeof event.seq === 'number' && Number.isSafeInteger(event.seq) && event.seq >= 0
      ? event.seq
      : undefined
    const existingIndex = seq === undefined ? -1 : events.findIndex((item) => item.seq === seq)
    if (existingIndex >= 0) events[existingIndex] = event
    else events.push(event)
    if (events.length > 20_000) events.splice(0, events.length - 20_000)
    this.trajectoryEvents.set(key, events)
  }

  private materializeAgentPreset(
    preset: DshAgentPreset,
    toolPolicy?: DshToolPolicy,
    subagentSettings?: DshModelSettings,
    subagentProvider?: string,
    webSearch: DshWebSearchSettings = defaultWebSearchSettings(),
    mainSettings?: DshModelSettings
  ): string {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(preset.id)) throw new Error('预设编号不能用于 DSH Agent Preset。')
    const mountedPresetId = runtimePresetId(preset, toolPolicy, subagentSettings, subagentProvider, webSearch, mainSettings)
    const root = join(this.options.runtimeDataRoot, 'home', '.agent-presets')
    const directory = join(root, mountedPresetId)
    mkdirSync(directory, { recursive: true })
    const pluginRoot = join(dirname(this.options.presetTemplatePath), '..')
    const compaction = resolveCompactionPolicy(mainSettings)
    let composition = readFileSync(this.options.presetTemplatePath, 'utf8')
      .replace('__ELECKOI_SETTING_LIBRARY_TOOLS_PLUGIN__', JSON.stringify(join(pluginRoot, 'setting-library-tools.mjs')))
      .replace('__ELECKOI_VARIABLE_TOOLS_PLUGIN__', JSON.stringify(join(pluginRoot, 'variable-tools.mjs')))
      .replace('__ELECKOI_ROLEPLAY_PLAN_TOOL_PLUGIN__', JSON.stringify(join(pluginRoot, 'roleplay-plan-tool.mjs')))
      .replace('__ELECKOI_ROLEPLAY_PLAN_STEPS__', JSON.stringify(preset.roleplayPlan.steps))
      .replace('__ELECKOI_WEB_SEARCH_MAX_RESULTS__', String(webSearch.maxResults))
      .replace('__ELECKOI_COMPACTION_THRESHOLD_RATIO__', compaction.thresholdRatio)
      .replace('__ELECKOI_COMPACTION_RETENTION__', compaction.retention)
      .replaceAll('__ELECKOI_SUBAGENT_OPTIONS__', subagentSettings ? [
        '    agentOptions:',
        `      provider: ${JSON.stringify(subagentProvider ?? 'custom')}`,
        `      model: ${JSON.stringify(resolveDshProviderBinding(
          createDshProviderCatalog([subagentSettings]),
          subagentSettings
        ).model)}`,
        ...(subagentSettings.maxTokens === undefined ? [] : [`      maxTokens: ${subagentSettings.maxTokens}`])
      ].join('\n') : '')
    composition = resolvePresetPluginSpecifiers(composition)
    const disabled = new Set(toolPolicy?.disabledGroupIds ?? [])
    composition = applyPresetToolPolicy(composition, disabled)
    writeAtomically(join(directory, 'agent.cordis.yml'), composition)
    writeAtomically(join(directory, 'preset.yml'), [
      `name: ${JSON.stringify(preset.name)}`,
      `description: ${JSON.stringify(`ElecKoi 预设版本 ${preset.versionId}`)}`,
      ''
    ].join('\n'))
    return mountedPresetId
  }

  private generationStatsProjector(conversationId: string, runtimeThreadId: string, sessionRoot: string): DshGenerationStatsProjector {
    const key = generationStatsKey(conversationId, runtimeThreadId)
    const existing = this.generationStatsProjectors.get(key)
    if (existing) return existing
    const projector = new DshGenerationStatsProjector(readStoredGenerationStats(sessionRoot, runtimeThreadId))
    this.generationStatsProjectors.set(key, projector)
    return projector
  }

  private discardGenerationStats(conversationId: string, sessionRoot: string, threadIds: string[], selectedThreadId: string): void {
    for (const threadId of threadIds) {
      if (threadId === selectedThreadId) continue
      this.generationStatsProjectors.delete(generationStatsKey(conversationId, threadId))
      rmSync(generationStatsPath(sessionRoot, threadId), { force: true })
    }
  }

}

function resolvePresetPluginSpecifiers(source: string): string {
  return source.replace(
    /(^\s*name:\s*)(['"])(@deepseek-ai\/[^'"\r\n]+)\2\s*$/gm,
    (_match, prefix: string, _quote: string, specifier: string) => (
      `${prefix}${JSON.stringify(resolveRuntimeModule(specifier))}`
    )
  )
}

function defaultAgentPreset(): DshAgentPreset {
  return {
    id: 'agent-preset-standard',
    versionId: 'agent-preset-standard-v1',
    name: '默认 Agent 预设',
    roleplayPlan: {
      steps: [
        '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
        '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
      ]
    }
  }
}

function defaultWebSearchSettings(): DshWebSearchSettings {
  return { mode: 'provider_native', maxResults: 5, tavilyApiKey: '' }
}

function sessionToolPolicy(
  policy: DshToolPolicy | undefined,
  variablesEnabled: boolean,
  settingLibraryEnabled: boolean,
  roleplayWorkflowEnabled: boolean
): DshToolPolicy {
  const disabled = new Set(policy?.disabledGroupIds ?? [])
  if (!variablesEnabled) disabled.add('builtin:variables')
  if (!settingLibraryEnabled) disabled.add('builtin:setting-library')
  if (!roleplayWorkflowEnabled) disabled.add('builtin:roleplay-workflow')
  return { disabledGroupIds: [...disabled] }
}

function requestSnapshot(settings: DshModelSettings, binding: { provider: string; model: string; reasoningEffort?: string }) {
  return {
    configId: settings.configId,
    provider: binding.provider,
    model: binding.model,
    systemPrompt: settings.systemPrompt,
    ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
    ...(settings.topP === undefined ? {} : { topP: settings.topP }),
    ...(settings.maxTokens === undefined ? {} : { maxTokens: settings.maxTokens }),
    ...(binding.reasoningEffort === undefined ? {} : { reasoningEffort: binding.reasoningEffort })
  }
}

function runtimePresetId(
  preset: DshAgentPreset,
  toolPolicy: DshToolPolicy | undefined,
  subagentSettings: DshModelSettings | undefined,
  subagentProvider: string | undefined,
  webSearch: DshWebSearchSettings,
  mainSettings: DshModelSettings | undefined
): string {
  const compaction = resolveCompactionPolicy(mainSettings)
  const fingerprint = createHash('sha256').update(JSON.stringify({
    preset,
    disabledToolGroupIds: [...(toolPolicy?.disabledGroupIds ?? [])].sort(),
    subagent: subagentSettings === undefined ? null : {
      provider: subagentProvider,
      model: subagentSettings.model,
      maxTokens: subagentSettings.maxTokens
    },
    webSearchMaxResults: webSearch.maxResults,
    compaction
  })).digest('hex').slice(0, 16)
  const prefix = preset.id.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preset'
  return `${prefix}-${fingerprint}`
}

function resolveCompactionPolicy(mainSettings: DshModelSettings | undefined): {
  thresholdRatio: string
  retention: string
} {
  if (mainSettings?.autoCompactTokenLimit === undefined) {
    return { thresholdRatio: '0.8', retention: 'retainTokens: 0' }
  }
  const { autoCompactTokenLimit, contextWindow } = mainSettings
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
    throw new Error('自动压缩阈值缺少有效的模型上下文窗口。')
  }
  if (!Number.isInteger(autoCompactTokenLimit) || autoCompactTokenLimit <= 0 || autoCompactTokenLimit > contextWindow) {
    throw new Error('自动压缩阈值必须大于 0 且不能超过模型上下文窗口。')
  }
  return {
    thresholdRatio: String(autoCompactTokenLimit / contextWindow),
    // 触发阈值不推导另一套固定保留比例，交给 DSH 选择平衡切点。
    retention: 'retainTokens: 0'
  }
}

function writeSessionSnapshot(root: string, runtimeThreadId: string, value: Record<string, unknown>): void {
  mkdirSync(root, { recursive: true })
  writeAtomically(join(root, `${safeRuntimeThreadFile(runtimeThreadId)}.json`), JSON.stringify(value, null, 2))
}

function readSessionSnapshot(
  root: string,
  runtimeThreadId: string
): (DshSessionRuntimeIdentity & Record<string, unknown>) | undefined {
  const path = join(root, `${safeRuntimeThreadFile(runtimeThreadId)}.json`)
  if (!existsSync(path)) return undefined
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function discardSessionSnapshots(root: string, threadIds: readonly string[], selectedThreadId: string): void {
  const discarded = new Set(threadIds.filter((threadId) => threadId && threadId !== selectedThreadId))
  for (const threadId of discarded) {
    rmSync(join(root, `${safeRuntimeThreadFile(threadId)}.json`), { force: true })
  }
  if (discarded.size === 0 || !existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue
    const path = join(root, entry.name)
    const snapshot = readSnapshotRecord(path)
    const inheritedRoot = typeof snapshot?.rootRuntimeThreadId === 'string'
      ? snapshot.rootRuntimeThreadId
      : typeof snapshot?.runtimeThreadId === 'string'
        ? snapshot.runtimeThreadId
        : undefined
    if (inheritedRoot !== undefined && discarded.has(inheritedRoot)) rmSync(path, { force: true })
  }
}

function maintainSubagentSessionSnapshot(root: string, notification: HarnessNotification): void {
  if (notification.method !== 'subagent.started' && notification.method !== 'subagent.finished') return
  const childSessionId = typeof notification.params.childSessionId === 'string'
    ? notification.params.childSessionId
    : ''
  if (!childSessionId) return
  const childPath = join(root, `${safeRuntimeThreadFile(childSessionId)}.json`)
  if (notification.method === 'subagent.finished') {
    rmSync(childPath, { force: true })
    return
  }
  if (existsSync(childPath)) return
  const parentSessionId = typeof notification.params.parentSessionId === 'string'
    ? notification.params.parentSessionId
    : ''
  if (!parentSessionId) return
  const parentSnapshot = readSessionSnapshot(root, parentSessionId)
  if (parentSnapshot === undefined) return
  writeSessionSnapshot(root, childSessionId, {
    ...parentSnapshot,
    inheritedFromSessionId: parentSessionId,
    rootRuntimeThreadId: typeof parentSnapshot.rootRuntimeThreadId === 'string'
      ? parentSnapshot.rootRuntimeThreadId
      : typeof parentSnapshot.runtimeThreadId === 'string'
        ? parentSnapshot.runtimeThreadId
        : parentSessionId
  })
}

function discardInheritedSessionSnapshots(root: string): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) continue
    const path = join(root, entry.name)
    const snapshot = readSnapshotRecord(path)
    if (typeof snapshot?.inheritedFromSessionId === 'string') rmSync(path, { force: true })
  }
}

function readSnapshotRecord(path: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function officialDeepSeekWebSearchApiKey(settings: DshModelSettings): string {
  try {
    return new URL(settings.baseUrl).hostname.toLowerCase() === 'api.deepseek.com' ? settings.apiKey : ''
  } catch {
    return ''
  }
}

function writeAtomically(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, content, 'utf8')
  rmSync(path, { force: true })
  renameSync(temporary, path)
}

function applyPresetToolPolicy(source: string, disabled: ReadonlySet<string>): string {
  const sections: ReadonlyArray<[string, string]> = [
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

function removePresetSection(source: string, section: string): string {
  const begin = `# ELECKOI:${section}:BEGIN`
  const end = `# ELECKOI:${section}:END`
  const start = source.indexOf(begin)
  const finish = source.indexOf(end)
  if (start < 0 || finish < start) throw new Error(`DSH 预设模板缺少工具段：${section}`)
  return `${source.slice(0, start)}${source.slice(finish + end.length).replace(/^\r?\n/, '')}`
}

function decodeImage(image: DshEncodedImageAttachment): SaveImageAttachment {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) {
    throw new Error('图片数据损坏，请重新添加。')
  }
  const data = Buffer.from(image.data, 'base64')
  if (data.byteLength === 0 || data.toString('base64') !== image.data) {
    throw new Error('图片数据损坏，请重新添加。')
  }
  return { data, mediaType: image.mediaType, ...(image.name ? { name: image.name } : {}) }
}

function safeConversationDirectory(conversationId: string): string {
  return conversationId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'default'
}

function safeRuntimeThreadFile(runtimeThreadId: string): string {
  return runtimeThreadId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 160) || 'default'
}

function generationStatsKey(conversationId: string, runtimeThreadId: string): string {
  return `${conversationId}\u0000${runtimeThreadId}`
}

function generationStatsPath(sessionRoot: string, runtimeThreadId: string): string {
  return join(sessionRoot, 'eleckoi-generation-stats', `${safeRuntimeThreadFile(runtimeThreadId)}.json`)
}

function readStoredGenerationStats(sessionRoot: string, runtimeThreadId: string) {
  const path = generationStatsPath(sessionRoot, runtimeThreadId)
  if (!existsSync(path)) return emptyStoredGenerationStats()
  try {
    return parseStoredGenerationStats(JSON.parse(readFileSync(path, 'utf8'))) ?? emptyStoredGenerationStats()
  } catch {
    return emptyStoredGenerationStats()
  }
}

function persistGenerationStats(sessionRoot: string, runtimeThreadId: string, projector: DshGenerationStatsProjector): void {
  const directory = join(sessionRoot, 'eleckoi-generation-stats')
  const path = generationStatsPath(sessionRoot, runtimeThreadId)
  mkdirSync(directory, { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(projector.stored()), 'utf8')
  renameSync(temporary, path)
}

/** Removes obsolete DSH session artifacts after regeneration. */
function discardPersistedRuntimeThreads(sessionRoot: string, threadIds: string[], selectedThreadId: string): void {
  const discarded = new Set(threadIds.filter((id) => id.length > 0 && id !== selectedThreadId))
  if (discarded.size === 0) return
  const root = realpathSync(sessionRoot)
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectPath = join(root, project.name)
    for (const session of readdirSync(projectPath, { withFileTypes: true })) {
      if (!session.isDirectory() || session.isSymbolicLink()) continue
      const candidate = join(projectPath, session.name)
      const resolved = realpathSync(candidate)
      if (!isDescendant(root, resolved)) continue
      const storedId = latestStoredSessionId(resolved)
      if (storedId === undefined || !discarded.has(storedId)) continue
      rmSync(resolved, { recursive: true, force: true })
    }
  }
}

function latestStoredSessionId(sessionDirectory: string): string | undefined {
  const logs = readdirSync(sessionDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, version: sessionLogVersion(entry.name) }))
    .filter((entry): entry is { name: string; version: number } => entry.version !== undefined)
    .sort((left, right) => right.version - left.version)
  for (const log of logs) {
    const id = storedSessionId(join(sessionDirectory, log.name))
    if (id !== undefined) return id
  }
  return undefined
}

function sessionLogVersion(filename: string): number | undefined {
  if (filename === 'session.jsonl') return 0
  const match = /^session\.v([1-9]\d*)\.jsonl$/.exec(filename)
  if (match === null) return undefined
  const version = Number(match[1])
  return Number.isSafeInteger(version) ? version : undefined
}

function storedSessionId(logPath: string): string | undefined {
  const descriptor = openSync(logPath, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0)
    const lineEnd = buffer.subarray(0, bytes).indexOf(10)
    if (lineEnd < 0) return undefined
    const header = JSON.parse(buffer.subarray(0, lineEnd).toString('utf8')) as { type?: unknown; id?: unknown }
    return header.type === 'session' && typeof header.id === 'string' ? header.id : undefined
  } catch {
    return undefined
  } finally {
    closeSync(descriptor)
  }
}

function isDescendant(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path.length > 0 && !path.startsWith('..') && !isAbsolute(path)
}

function trajectoryKey(conversationId: string, runtimeThreadId: string): string {
  return `${conversationId}\u0000${runtimeThreadId}`
}

function clearConversationEntries<T>(entries: Map<string, T>, conversationId: string): void {
  const prefix = `${conversationId}\u0000`
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function turnEndFailureMessage(event: unknown): string | undefined {
  const data = isRecord(event) ? isRecord(event.data) ? event.data : undefined : undefined
  const reason = isRecord(data?.reason) ? data.reason : undefined
  if (reason?.kind !== 'error') return undefined
  const failure = isRecord(reason.error) ? reason.error : undefined
  if (typeof failure?.message === 'string' && failure.message.trim()) return failure.message
  return JSON.stringify(failure ?? reason)
}

function parsedObject(raw: string, label: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(raw || '{}')
  } catch (error) {
    throw new Error(`${label}不是合法 JSON。`, { cause: error })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON object。`)
  return value as Record<string, unknown>
}

function writeVariableBridge(path: string, context?: DshVariableRuntimeContext): void {
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
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

function readVariableBridgeState(path: string): string {
  const bridge = parsedObject(readFileSync(path, 'utf8'), '变量运行时桥接文件')
  const state = bridge.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('变量运行时返回的状态必须是 JSON object。')
  return JSON.stringify(state, null, 2)
}

function writeContextBridge(path: string, currentUserInput: string, context?: DshConversationContext): void {
  writeFileSync(path, JSON.stringify({
    ...(context ?? { characterId: '', characterName: '', persona: {}, history: [] }),
    currentUserInput
  }, null, 2), 'utf8')
}

function writeSettingBridge(
  path: string,
  context?: DshConversationContext,
  variableContext?: DshVariableRuntimeContext
): void {
  writeFileSync(path, JSON.stringify({
    enabled: context?.settingLibrary !== undefined,
    library: context?.settingLibrary ?? null,
    history: context?.history ?? [],
    variableState: variableContext === undefined
      ? {}
      : parsedObject(variableContext.stateJson, '当前变量状态')
  }, null, 2), 'utf8')
}

function readSettingBridgeState(path: string): string {
  const bridge = parsedObject(readFileSync(path, 'utf8'), '设定库运行时桥接文件')
  return JSON.stringify(bridge.library ?? {}, null, 2)
}
