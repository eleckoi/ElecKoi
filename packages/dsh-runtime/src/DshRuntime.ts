import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { DeepSeekHarness, type ContentBlock } from '@deepseek-ai/dsh-sdk-client'
import type { ImageAttachmentLimits, ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { commitPreparedImageFile, prepareImageFile, readImageFile } from '@deepseek-ai/dsh-attachment-local'
import { DshProcessProjector, DshReplyProjector, finalReplyText } from './notifications'
import {
  DshGenerationStatsProjector,
  emptyStoredGenerationStats,
  parseStoredGenerationStats,
  type DshGenerationStats
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

const imageLimits: ImageAttachmentLimits = {
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 20 * 1024 * 1024,
  maxImagePixels: 64_000_000,
  maxImageDimension: 8192,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
}
const imageNormalizationPolicy = { maxDimension: 2048, maxBytes: 4 * 1024 * 1024 }

interface Session {
  harness: DeepSeekHarness
  settingsKey: string
}

interface ActiveRun {
  cancelled: boolean
}

export class DshRuntime {
  private readonly sessions = new Map<string, Session>()
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly generationStatsProjectors = new Map<string, DshGenerationStatsProjector>()
  private readonly runtimeBin: string

  constructor(private readonly options: DshRuntimeOptions) {
    mkdirSync(options.workspaceRoot, { recursive: true })
    mkdirSync(join(options.runtimeDataRoot, 'home'), { recursive: true })
    mkdirSync(join(options.runtimeDataRoot, 'sessions'), { recursive: true })
    this.runtimeBin = createRequire(import.meta.url)
      .resolve('@deepseek-ai/dsh-sdk-jsonrpc-demo/packaged-bin')
  }

  async prepareImages(images: DshEncodedImageAttachment[]): Promise<DshImageAttachmentRef[]> {
    if (images.length > imageLimits.maxImagesPerMessage) throw new Error('每条消息最多添加 4 张图片。')
    const decoded = images.map(decodeImage)
    const totalBytes = decoded.reduce((total, image) => total + image.data.byteLength, 0)
    if (totalBytes > imageLimits.maxMessageImageBytes) throw new Error('每条消息的图片总计不能超过 20 MB。')
    try {
      const prepared = await Promise.all(decoded.map((image) => (
        prepareImageFile(image, imageLimits, imageNormalizationPolicy)
      )))
      const root = join(this.options.runtimeDataRoot, 'home', 'attachments', 'v1')
      const committed: DshImageAttachmentRef[] = []
      for (const image of prepared) {
        committed.push(await commitPreparedImageFile(root, image) as unknown as DshImageAttachmentRef)
      }
      return committed
    } catch (error) {
      throw new Error(publicImageError(error), { cause: error })
    }
  }

  async readImage(image: DshImageAttachmentRef): Promise<{ mediaType: DshImageAttachmentRef['mediaType']; data: string }> {
    try {
      const stored = await readImageFile(
        join(this.options.runtimeDataRoot, 'home', 'attachments', 'v1'),
        image as unknown as ImageAttachmentRef
      )
      return { mediaType: image.mediaType, data: Buffer.from(stored.data).toString('base64') }
    } catch (error) {
      throw new Error('图片读取失败。', { cause: error })
    }
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
    subagentSettings?: DshModelSettings
  ): Promise<'complete' | 'cancelled'> {
    if (this.activeRuns.has(conversationId)) throw new Error('这个对话仍有回复正在生成。')
    const run: ActiveRun = { cancelled: false }
    this.activeRuns.set(conversationId, run)
    try {
      const sessionRoot = join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId))
      mkdirSync(sessionRoot, { recursive: true })
      if (discardRuntimeThreadIds.length > 0) {
        await this.disposeSession(conversationId)
        discardPersistedRuntimeThreads(sessionRoot, discardRuntimeThreadIds, runtimeThreadId)
        this.discardGenerationStats(conversationId, sessionRoot, discardRuntimeThreadIds, runtimeThreadId)
      }
      const variableStateFile = join(sessionRoot, 'eleckoi-variable-state.json')
      writeVariableBridge(variableStateFile, variableContext)
      const settingStateFile = join(sessionRoot, 'eleckoi-setting-library-state.json')
      writeSettingBridge(settingStateFile, conversationContext, variableContext)
      const contextFile = join(sessionRoot, 'eleckoi-conversation-context.json')
      writeContextBridge(contextFile, text, conversationContext)
      const selectedAgentPreset = agentPreset ?? defaultAgentPreset()
      this.materializeAgentPreset(selectedAgentPreset, toolPolicy, subagentSettings)
      const session = await this.getSession(
        conversationId,
        settings,
        variableContext !== undefined,
        conversationContext?.settingLibrary !== undefined,
        toolPolicy,
        selectedAgentPreset,
        webSearch,
        subagentSettings
      )
      if (run.cancelled) {
        await this.disposeSession(conversationId)
        return 'cancelled'
      }
      const processProjector = new DshProcessProjector(runtimeThreadId, subagentSettings?.model ?? settings.model)
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
      const result = await session.harness.run(content, {
        sessionId: runtimeThreadId,
        onNotification: (notification) => {
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
      })
      if (run.cancelled) return 'cancelled'
      if (!result.events.some((event) => event.type === 'turn/end')) {
        await this.disposeSession(conversationId)
        throw new Error('Agent 会话提前结束，本轮消息未实际执行，请重试。')
      }
      if (variableContext !== undefined) callbacks.onVariableState?.(readVariableBridgeState(variableStateFile))
      if (conversationContext?.settingLibrary !== undefined) callbacks.onSettingLibraryState?.(readSettingBridgeState(settingStateFile))
      callbacks.onFinal(finalReplyText(result.finalResponse))
      return 'complete'
    } catch (error) {
      if (run.cancelled) return 'cancelled'
      throw error
    } finally {
      if (this.activeRuns.get(conversationId) === run) this.activeRuns.delete(conversationId)
    }
  }

  async stop(conversationId: string): Promise<boolean> {
    const run = this.activeRuns.get(conversationId)
    if (run === undefined) return false
    run.cancelled = true
    await this.disposeSession(conversationId)
    return true
  }

  generationStats(conversationId: string, runtimeThreadId: string): DshGenerationStats | undefined {
    if (!runtimeThreadId) return undefined
    const sessionRoot = join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId))
    return this.generationStatsProjector(conversationId, runtimeThreadId, sessionRoot).snapshot()
  }

  async close(): Promise<void> {
    for (const run of this.activeRuns.values()) run.cancelled = true
    await Promise.all([...this.sessions.keys()].map((conversationId) => this.disposeSession(conversationId)))
    this.activeRuns.clear()
  }

  async verify(): Promise<void> {
    const agentPreset = defaultAgentPreset()
    this.materializeAgentPreset(agentPreset)
    const harness = this.createHarness(this.options.workspaceRoot, {
      apiKey: 'eleckoi-runtime-health-check',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      systemPrompt: 'ElecKoi DSH runtime health check.',
      apiFormat: 'openai-completions',
      customHeaders: {},
      contextWindow: 128000,
      supportsImageInput: false
    }, undefined, false, false, undefined, agentPreset)
    try {
      await harness.start()
    } finally {
      await harness.close()
    }
  }

  private async getSession(
    conversationId: string,
    settings: DshModelSettings,
    variablesEnabled: boolean,
    settingLibraryEnabled: boolean,
    toolPolicy: DshToolPolicy | undefined,
    agentPreset: DshAgentPreset,
    webSearch?: DshWebSearchSettings,
    subagentSettings?: DshModelSettings
  ): Promise<Session> {
    const settingsKey = JSON.stringify({ settings, subagentSettings, variablesEnabled, settingLibraryEnabled, toolPolicy, agentPreset, webSearch })
    const existing = this.sessions.get(conversationId)
    if (existing !== undefined && existing.settingsKey === settingsKey) return existing
    if (existing !== undefined) await this.disposeSession(conversationId)

    const workspace = join(this.options.workspaceRoot, safeConversationDirectory(conversationId))
    mkdirSync(workspace, { recursive: true })
    const sessionRoot = join(this.options.runtimeDataRoot, 'sessions', safeConversationDirectory(conversationId))
    mkdirSync(sessionRoot, { recursive: true })
    const harness = this.createHarness(workspace, settings, sessionRoot, variablesEnabled, settingLibraryEnabled, toolPolicy, agentPreset, webSearch, subagentSettings)
    const session: Session = { harness, settingsKey }
    this.sessions.set(conversationId, session)
    return session
  }

  private createHarness(
    workspace: string,
    settings: DshModelSettings,
    sessionRoot = join(this.options.runtimeDataRoot, 'sessions'),
    variablesEnabled = false,
    settingLibraryEnabled = false,
    toolPolicy?: DshToolPolicy,
    agentPreset: DshAgentPreset = defaultAgentPreset(),
    webSearch: DshWebSearchSettings = defaultWebSearchSettings(),
    subagentSettings?: DshModelSettings
  ): DeepSeekHarness {
    const effectiveSubagentSettings = subagentSettings ?? settings
    const harness = new DeepSeekHarness({
      launch: {
        command: this.options.executablePath,
        args: [this.runtimeBin, this.options.configPath],
        cwd: workspace,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ELECKOI_API_KEY: settings.apiKey,
          ELECKOI_BASE_URL: settings.baseUrl,
          ELECKOI_API_FORMAT: settings.apiFormat,
          ELECKOI_CUSTOM_HEADERS: JSON.stringify(settings.customHeaders),
          ELECKOI_CONTEXT_WINDOW: String(settings.contextWindow),
          ELECKOI_COMPACTION_THRESHOLD_RATIO: String(
            settings.autoCompactTokenLimit === undefined
              ? 0.8
              : settings.autoCompactTokenLimit / settings.contextWindow
          ),
          ELECKOI_TEMPERATURE: settings.temperature === undefined ? '' : String(settings.temperature),
          ELECKOI_MAX_TOKENS: String(effectiveMaxTokens(settings)),
          ELECKOI_REASONING_EFFORT: settings.reasoningEffort || '',
          ELECKOI_MODEL_INPUT_MODALITIES: JSON.stringify(settings.supportsImageInput ? ['text', 'image'] : ['text']),
          ...(settings.proxyUrl ? {
            HTTP_PROXY: settings.proxyUrl,
            HTTPS_PROXY: settings.proxyUrl,
            NODE_USE_ENV_PROXY: '1'
          } : {}),
          DSH_MODEL: settings.model,
          DSH_SYSTEM_PROMPT: settings.systemPrompt,
          DSH_CWD: workspace,
          DSH_HOME: join(this.options.runtimeDataRoot, 'home'),
          DSH_SESSION_ROOT: sessionRoot,
          ELECKOI_VARIABLE_STATE_FILE: join(sessionRoot, 'eleckoi-variable-state.json'),
          ELECKOI_VARIABLES_ENABLED: variablesEnabled ? '1' : '0',
          ELECKOI_CONVERSATION_CONTEXT_FILE: join(sessionRoot, 'eleckoi-conversation-context.json'),
          ELECKOI_SETTING_LIBRARY_STATE_FILE: join(sessionRoot, 'eleckoi-setting-library-state.json'),
          ELECKOI_SETTING_LIBRARY_ENABLED: settingLibraryEnabled ? '1' : '0',
          ELECKOI_DISABLED_TOOL_GROUPS: JSON.stringify(toolPolicy?.disabledGroupIds ?? []),
          DSH_WEB_SEARCH_PROVIDER: webSearch.mode === 'tavily' ? 'tavily' : 'deepseek-official',
          ELECKOI_NATIVE_WEB_SEARCH_API_KEY: officialDeepSeekWebSearchApiKey(settings),
          ELECKOI_WEB_SEARCH_MAX_RESULTS: String(webSearch.maxResults),
          ELECKOI_TAVILY_API_KEY: webSearch.tavilyApiKey,
          ELECKOI_AGENT_PRESET: agentPreset.id,
          ELECKOI_AGENT_PRESET_VERSION: agentPreset.versionId,
          ELECKOI_ROLEPLAY_PLAN_STEPS: JSON.stringify(agentPreset.roleplayPlan.steps),
          ELECKOI_HISTORY_COMPACTION_INSTRUCTIONS: agentPreset.historyCompactionInstructions ?? '',
          ELECKOI_SUBAGENT_API_KEY: effectiveSubagentSettings.apiKey,
          ELECKOI_SUBAGENT_BASE_URL: effectiveSubagentSettings.baseUrl,
          ELECKOI_SUBAGENT_API_FORMAT: effectiveSubagentSettings.apiFormat,
          ELECKOI_SUBAGENT_CUSTOM_HEADERS: JSON.stringify(effectiveSubagentSettings.customHeaders),
          ELECKOI_SUBAGENT_CONTEXT_WINDOW: String(effectiveSubagentSettings.contextWindow),
          ELECKOI_SUBAGENT_MAX_TOKENS: String(effectiveMaxTokens(effectiveSubagentSettings)),
          ELECKOI_SUBAGENT_TEMPERATURE: effectiveSubagentSettings.temperature === undefined ? '' : String(effectiveSubagentSettings.temperature),
          ELECKOI_SUBAGENT_REASONING_EFFORT: effectiveSubagentSettings.reasoningEffort || '',
          ELECKOI_SUBAGENT_MODEL_INPUT_MODALITIES: JSON.stringify(effectiveSubagentSettings.supportsImageInput ? ['text', 'image'] : ['text']),
          ELECKOI_SUBAGENT_MODEL: effectiveSubagentSettings.model,
          DSH_TELEMETRY_DISABLED: '1'
        },
        shutdownTimeoutMs: 1500,
        disposeEofGraceMs: 2500,
        disposeGraceMs: 1500
      },
      cwd: workspace,
      provider: 'eleckoi-runtime',
      model: settings.model,
      ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {})
    })
    return harness
  }

  private materializeAgentPreset(
    preset: DshAgentPreset,
    toolPolicy?: DshToolPolicy,
    subagentSettings?: DshModelSettings
  ): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(preset.id)) throw new Error('预设编号不能用于 DSH Agent Preset。')
    const root = join(this.options.runtimeDataRoot, 'home', '.agent-presets')
    const directory = join(root, preset.id)
    mkdirSync(directory, { recursive: true })
    const pluginRoot = join(dirname(this.options.presetTemplatePath), '..')
    let composition = readFileSync(this.options.presetTemplatePath, 'utf8')
      .replace('__ELECKOI_SETTING_LIBRARY_TOOLS_PLUGIN__', JSON.stringify(join(pluginRoot, 'setting-library-tools.mjs')))
      .replace('__ELECKOI_VARIABLE_TOOLS_PLUGIN__', JSON.stringify(join(pluginRoot, 'variable-tools.mjs')))
      .replace('__ELECKOI_ROLEPLAY_PLAN_TOOL_PLUGIN__', JSON.stringify(join(pluginRoot, 'roleplay-plan-tool.mjs')))
      .replaceAll('__ELECKOI_SUBAGENT_OPTIONS__', subagentSettings ? [
        '    agentOptions:',
        "      provider: 'eleckoi-subagent'",
        `      model: ${JSON.stringify(subagentSettings.model)}`,
        `      maxTokens: ${effectiveMaxTokens(subagentSettings)}`
      ].join('\n') : '')
    const disabled = new Set(toolPolicy?.disabledGroupIds ?? [])
    composition = applyPresetToolPolicy(composition, disabled)
    writeAtomically(join(directory, 'agent.cordis.yml'), composition)
    writeAtomically(join(directory, 'preset.yml'), [
      `name: ${JSON.stringify(preset.name)}`,
      `description: ${JSON.stringify(`ElecKoi 预设版本 ${preset.versionId}`)}`,
      ''
    ].join('\n'))
  }

  private async disposeSession(conversationId: string): Promise<void> {
    const session = this.sessions.get(conversationId)
    this.sessions.delete(conversationId)
    if (session !== undefined) await session.harness.close()
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

function officialDeepSeekWebSearchApiKey(settings: DshModelSettings): string {
  try {
    return new URL(settings.baseUrl).hostname.toLowerCase() === 'api.deepseek.com' ? settings.apiKey : ''
  } catch {
    return ''
  }
}

function effectiveMaxTokens(settings: DshModelSettings): number {
  return settings.maxTokens ?? Math.min(32_768, settings.contextWindow)
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

function publicImageError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'IMAGE_TOO_LARGE') return '图片大小超过限制。'
  if (code === 'IMAGE_TYPE_MISMATCH' || code === 'INVALID_IMAGE') return '无法识别这张图片，请重新选择 PNG、JPEG、WebP 或 GIF。'
  return '图片处理失败，请重新添加。'
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

/** Mirrors Android's discardSessions for obsolete branches after regeneration. */
function discardPersistedRuntimeThreads(sessionRoot: string, threadIds: string[], selectedThreadId: string): void {
  const discarded = new Set(threadIds.filter((id) => id !== selectedThreadId && /^[A-Za-z0-9._-]{1,160}$/.test(id)))
  if (discarded.size === 0) return
  const root = realpathSync(sessionRoot)
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectPath = join(root, project.name)
    for (const threadId of discarded) {
      const candidate = join(projectPath, threadId)
      if (!existsSync(candidate) || lstatSync(candidate).isSymbolicLink() || !lstatSync(candidate).isDirectory()) continue
      const resolved = realpathSync(candidate)
      if (!isDescendant(root, resolved)) continue
      const log = join(resolved, 'session.jsonl')
      if (!existsSync(log) || storedSessionId(log) !== threadId) continue
      rmSync(resolved, { recursive: true, force: true })
    }
  }
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
