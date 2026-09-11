import { randomUUID } from 'node:crypto'
import type { DesktopGateway } from '@main/gateway/DesktopGateway'
import type { ConversationRepository, MessageRepository } from '@main/modules/conversations'
import type { ModelRepository } from '@main/modules/models'
import type { PersonaRepository } from '@main/modules/personas'
import type { UserSettingsStore } from '@main/modules/settings'
import type { VariableStateRepository } from '@main/modules/variables'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { AgentState } from '@shared/contracts/agent/events'
import type { AgentRunInput, AgentRuntimePort } from '@shared/contracts/agent/runtime'
import type { ChatUserImageAttachment, EncodedChatImageAttachment } from '@shared/contracts/entities/chat'
import { DESKTOP_ERROR_CODES } from '@shared/contracts/gateway/DesktopError'
import { errorMessage } from '@shared/foundation/errorMessage'
import type { GenerationRepository } from './GenerationRepository'
import type { SettingLibraryRepository } from '@main/modules/settingLibraries'
import type { RegexRuleRepository } from '@main/modules/regexRules'
import { transformCollectionSurface } from '@shared/foundation/regex/RegexRuleProcessor'
import type { AgentPresetRepository } from '@main/modules/agentPresets'
import type { WebSearchSettingsRepository } from '@main/modules/agentTools'
import { mergeAgentPresetAndCharacterLibraries } from '@main/modules/agentPresets'
import {
  characterCardMacroValues,
  resolveCharacterCardMacros
} from '@shared/foundation/characterCardMacros'
import {
  resolveSettingLibraryCharacterCardMacros,
  resolveVariableContextCharacterCardMacros
} from './CharacterCardMacroResolver'

interface ActiveRun {
  conversationId: string
  runId: string
  messageId: string
  cancelled: boolean
  accumulated: string
  sequence: number
  runtimeThreadId: string
  done: Promise<void>
  checkpointAt: number
  checkpointLength: number
  discardRuntimeThreadIds: string[]
  agentPreset?: AgentRunInput['agentPreset']
  subagentSettings?: AgentRunInput['subagentSettings']
}

interface PreparingRun {
  cancelled: boolean
}

export interface AgentSessionDependencies {
  runtime: AgentRuntimePort
  database: SqliteDatabase
  gateway: DesktopGateway
  conversations: ConversationRepository
  messages: MessageRepository
  personas: Pick<PersonaRepository, 'get'>
  models: ModelRepository
  userSettings: UserSettingsStore
  generations: GenerationRepository
  variableStates?: VariableStateRepository | undefined
  settingLibraries?: SettingLibraryRepository | undefined
  agentPresets?: AgentPresetRepository | undefined
  webSearchSettings?: WebSearchSettingsRepository | undefined
  regexRules?: RegexRuleRepository | undefined
}

export class AgentSessionCoordinator {
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly preparingRuns = new Map<string, PreparingRun>()

  constructor(private readonly dependencies: AgentSessionDependencies) {}

  start(conversationId: string, text: string, images: EncodedChatImageAttachment[] = []) {
    const trimmed = text.trim()
    if (trimmed.length === 0 && images.length === 0) throw new Error('消息或图片不能同时为空。')
    if (this.activeRuns.has(conversationId) || this.preparingRuns.has(conversationId)) {
      throw new Error('这个对话仍有回复正在生成。')
    }

    const settings = this.dependencies.models.resolve(this.dependencies.userSettings.read('models.active'), '')
    if (images.length > 0 && !settings.supportsImageInput) throw new Error('当前模型未声明图片输入能力。')
    const metadata = this.dependencies.conversations.getMetadata(conversationId)
    const storedText = metadata.characterId && this.dependencies.regexRules
      ? this.dependencies.regexRules.transform(metadata.characterId, trimmed, 'UserInput', 'Stored')
      : trimmed
    if (images.length === 0) return this.startPrepared(conversationId, storedText, settings, [])
    if (!this.dependencies.runtime.prepareImages) throw new Error('图片运行时尚未就绪。')
    const preparing: PreparingRun = { cancelled: false }
    this.preparingRuns.set(conversationId, preparing)
    return this.dependencies.runtime.prepareImages(images)
      .then((prepared) => {
        if (preparing.cancelled || this.preparingRuns.get(conversationId) !== preparing) {
          throw generationCancelledError()
        }
        this.preparingRuns.delete(conversationId)
        return this.startPrepared(conversationId, storedText, settings, prepared)
      })
      .catch((error) => {
        if (preparing.cancelled) {
          this.emitState(conversationId, 'idle')
          throw generationCancelledError()
        }
        throw error
      })
      .finally(() => {
        if (this.preparingRuns.get(conversationId) === preparing) this.preparingRuns.delete(conversationId)
      })
  }

  private startPrepared(
    conversationId: string,
    storedText: string,
    settings: ReturnType<ModelRepository['resolve']>,
    inputImages: ChatUserImageAttachment[]
  ) {
    if (this.activeRuns.has(conversationId)) throw new Error('这个对话仍有回复正在生成。')
    const runId = randomUUID()
    const agentPreset = this.dependencies.agentPresets?.runtimeSelection()
    const subagentSelection = this.dependencies.agentPresets?.subagentModelSelection()
    const subagentSettings = subagentSelection
      ? this.dependencies.models.resolveExact(subagentSelection.configId, subagentSelection.model, '')
      : undefined
    const runtimeThreadId = runtimeThreadForPreset(
      this.dependencies.messages.latestRuntimeThreadId(conversationId),
      agentPreset
    )
    const assistantMessage = this.dependencies.database.withWriteTx((database) => {
      this.dependencies.messages.create(conversationId, 'user', storedText, 'complete', database, '', inputImages)
      const assistant = this.dependencies.messages.create(conversationId, 'assistant', '', 'streaming', database, runtimeThreadId)
      this.dependencies.generations.start(runId, conversationId, assistant.id, settings.model)
      const preview = storedText || '图片'
      this.dependencies.conversations.titleFromFirstMessage(conversationId, preview, database)
      this.dependencies.conversations.touch(conversationId, preview, database)
      return assistant
    })

    const active: ActiveRun = {
      conversationId,
      runId,
      messageId: assistantMessage.id,
      cancelled: false,
      accumulated: '',
      sequence: 0,
      done: Promise.resolve(),
      checkpointAt: 0,
      checkpointLength: 0,
      runtimeThreadId,
      discardRuntimeThreadIds: [],
      agentPreset,
      subagentSettings
    }
    this.activeRuns.set(conversationId, active)
    active.done = this.execute(active, storedText, settings, inputImages)
    void active.done
    return { accepted: true as const, conversationId, runId, messageId: assistantMessage.id }
  }

  regenerate(conversationId: string, targetMessageId: string, replacementMessage?: string) {
    if (this.activeRuns.has(conversationId) || this.preparingRuns.has(conversationId)) throw new Error('这个对话仍有回复正在生成。')
    const settings = this.dependencies.models.resolve(this.dependencies.userSettings.read('models.active'), '')
    const metadata = this.dependencies.conversations.getMetadata(conversationId)
    const storedReplacement = replacementMessage && metadata.characterId && this.dependencies.regexRules
      ? this.dependencies.regexRules.transform(metadata.characterId, replacementMessage, 'UserInput', 'Stored')
      : replacementMessage
    const prepared = this.dependencies.messages.prepareRegeneration(conversationId, targetMessageId, storedReplacement)
    if (prepared.inputImages.length > 0 && !settings.supportsImageInput) throw new Error('当前模型未声明图片输入能力。')
    const runId = randomUUID()
    const agentPreset = this.dependencies.agentPresets?.runtimeSelection()
    const subagentSelection = this.dependencies.agentPresets?.subagentModelSelection()
    const subagentSettings = subagentSelection
      ? this.dependencies.models.resolveExact(subagentSelection.configId, subagentSelection.model, '')
      : undefined
    const runtimeThreadId = runtimeThreadForPreset(prepared.runtimeThreadId, agentPreset)
    const assistantMessage = this.dependencies.messages.create(conversationId, 'assistant', '', 'streaming', undefined, runtimeThreadId)
    this.dependencies.generations.start(runId, conversationId, assistantMessage.id, settings.model)
    const active: ActiveRun = {
      conversationId, runId, messageId: assistantMessage.id, cancelled: false, accumulated: '', sequence: 0,
      done: Promise.resolve(), checkpointAt: 0, checkpointLength: 0, runtimeThreadId,
      discardRuntimeThreadIds: prepared.obsoleteRuntimeThreadIds,
      agentPreset,
      subagentSettings
    }
    this.activeRuns.set(conversationId, active)
    active.done = this.execute(active, prepared.text, settings, prepared.inputImages)
    void active.done
    return { accepted: true as const, conversationId, runId, messageId: assistantMessage.id }
  }

  async cancel(conversationId: string): Promise<{ cancelled: boolean }> {
    const preparing = this.preparingRuns.get(conversationId)
    if (preparing !== undefined) {
      preparing.cancelled = true
      this.emitState(conversationId, 'stopping')
      return { cancelled: true }
    }
    const active = this.activeRuns.get(conversationId)
    if (active === undefined) return { cancelled: false }
    active.cancelled = true
    this.emitState(conversationId, 'stopping')
    await this.dependencies.runtime.cancel(conversationId)
    await active.done
    return { cancelled: true }
  }

  inspect(conversationId: string) {
    const active = this.activeRuns.get(conversationId)
    if (active === undefined) return { active: false as const, conversationId }
    return {
      active: true as const,
      conversationId,
      runId: active.runId,
      messageId: active.messageId,
      accumulated: active.accumulated,
      sequence: active.sequence
    }
  }

  hasActiveRun(): boolean {
    return this.activeRuns.size > 0 || this.preparingRuns.size > 0
  }

  generationStats(conversationId: string) {
    const runtimeThreadId = this.dependencies.messages.latestRuntimeThreadId(conversationId)
    return {
      conversationId,
      stats: runtimeThreadId && this.dependencies.runtime.generationStats
        ? this.dependencies.runtime.generationStats(conversationId, runtimeThreadId) ?? null
        : null
    }
  }

  async close(): Promise<void> {
    for (const preparing of this.preparingRuns.values()) preparing.cancelled = true
    for (const active of this.activeRuns.values()) active.cancelled = true
    const conversationIds = [...this.activeRuns.keys()]
    await Promise.all(conversationIds.map((id) => this.dependencies.runtime.cancel(id)))
    await Promise.all([...this.activeRuns.values()].map((active) => active.done))
  }

  private async execute(
    active: ActiveRun,
    text: string,
    settings: ReturnType<ModelRepository['resolve']>,
    inputImages: ChatUserImageAttachment[] = []
  ): Promise<void> {
    this.emitState(active.conversationId, 'starting', '正在启动 DSH')
    const metadata = this.dependencies.conversations.getMetadata(active.conversationId)
    const characterBinding = this.dependencies.conversations.getCharacterBinding(active.conversationId)
    const macroValues = characterCardMacroValues(metadata, this.dependencies.personas.get().user_name)
    const variableContext = resolveVariableContextCharacterCardMacros(
      this.dependencies.variableStates?.runtimeContext(active.conversationId, characterBinding),
      macroValues
    )
    const regexRules = metadata.characterId && this.dependencies.regexRules
      ? this.dependencies.regexRules.get(metadata.characterId)
      : undefined
    const disabledGroupIds = this.dependencies.agentPresets?.disabledToolGroupIds() ?? []
    const rawSettingLibrary = mergeAgentPresetAndCharacterLibraries(
      this.dependencies.agentPresets?.runtimeContext(),
      this.dependencies.settingLibraries?.runtimeContext(active.conversationId, characterBinding)
    )
    const settingLibrarySource = resolveSettingLibraryCharacterCardMacros(
      rawSettingLibrary,
      macroValues
    )
    const settingLibrary = settingLibrarySource && regexRules
      ? {
        ...settingLibrarySource,
        entries: settingLibrarySource.entries.map((entry) => ({
          ...entry,
          content: transformCollectionSurface(entry.content, regexRules, 'SettingContent', 'Prompt')
        }))
      }
      : settingLibrarySource
    const history = this.dependencies.messages.runtimeHistory(active.conversationId).map((item) => {
      const macroContent = macroValues
        ? resolveCharacterCardMacros(item.content, macroValues)
        : item.content
      return {
        ...item,
        content: regexRules
        ? transformCollectionSurface(
          macroContent,
          regexRules,
          item.role === 'user' ? 'UserInput' : 'AiOutput',
          'Prompt'
        )
        : macroContent
      }
    })
    const macroPromptText = macroValues ? resolveCharacterCardMacros(text, macroValues) : text
    const promptText = regexRules
      ? transformCollectionSurface(macroPromptText, regexRules, 'UserInput', 'Prompt')
      : macroPromptText
    const conversationContext = {
      characterId: metadata.characterId,
      characterName: metadata.characterName,
      persona: {},
      history,
      ...(settingLibrary ? { settingLibrary } : {})
    }
    let finalContent = ''
    let finalVariableState = ''
    let finalSettingLibraryState = ''
    try {
      const result = await this.dependencies.runtime.run({
        conversationId: active.conversationId,
        runId: active.runId,
        text: promptText,
        inputImages,
        settings,
        subagentSettings: active.subagentSettings,
        variableContext,
        conversationContext,
        runtimeThreadId: active.runtimeThreadId,
        discardRuntimeThreadIds: active.discardRuntimeThreadIds,
        toolPolicy: { disabledGroupIds },
        webSearch: this.dependencies.webSearchSettings?.runtimeSettings(),
        agentPreset: active.agentPreset
      }, {
        onDelta: (delta) => {
          if (!this.isCurrent(active)) return
          active.accumulated += delta
          active.sequence += 1
          if (Date.now() - active.checkpointAt >= 250 || active.accumulated.length - active.checkpointLength >= 64 * 1024) {
            const checkpointEnd = trailingCompleteCharacterIndex(active.accumulated)
            const checkpointDelta = active.accumulated.slice(active.checkpointLength, checkpointEnd)
            if (checkpointDelta.length > 0) {
              this.dependencies.messages.appendCheckpoint(active.messageId, checkpointDelta)
              active.checkpointAt = Date.now()
              active.checkpointLength = checkpointEnd
            }
          }
          if (active.sequence === 1) this.emitState(active.conversationId, 'streaming', settings.model)
          this.dependencies.gateway.broadcast('agent.output.delta', {
            conversationId: active.conversationId,
            runId: active.runId,
            messageId: active.messageId,
            sequence: active.sequence,
            delta
          })
        },
        onFinal: (content) => {
          if (this.isCurrent(active)) finalContent = content
        },
        onGenerationStats: (stats) => {
          if (!this.isCurrent(active)) return
          this.dependencies.gateway.broadcast('agent.generation.stats', {
            conversationId: active.conversationId,
            runId: active.runId,
            stats
          })
        },
        onVariableState: (stateJson) => {
          if (this.isCurrent(active)) finalVariableState = stateJson
        },
        onSettingLibraryState: (stateJson) => {
          if (this.isCurrent(active)) finalSettingLibraryState = stateJson
        },
        onProcessItem: (item) => {
          if (!this.isCurrent(active)) return
          this.dependencies.messages.upsertProcessItem(active.messageId, item)
          this.dependencies.gateway.broadcast('agent.process.updated', {
            conversationId: active.conversationId,
            runId: active.runId,
            messageId: active.messageId,
            item
          })
        }
      })

      const status = active.cancelled || result === 'cancelled' ? 'cancelled' : 'complete'
      const rawContent = finalContent || active.accumulated
      if (status === 'complete' && rawContent.trim().length === 0) {
        throw new Error('模型本轮没有返回可展示的正文，请重试。')
      }
      const content = regexRules
        ? transformCollectionSurface(rawContent, regexRules, 'AiOutput', 'Stored')
        : rawContent
      const message = this.dependencies.database.withWriteTx((database) => {
        const committedVariableState = status === 'complete' && finalVariableState && this.dependencies.variableStates
          ? this.dependencies.variableStates.replaceCurrent(active.conversationId, finalVariableState, database)
          : undefined
        if (
          status === 'complete'
          && finalSettingLibraryState
          && this.dependencies.settingLibraries
          && rawSettingLibrary
          && settingLibrary
        ) {
          this.dependencies.settingLibraries.replaceConversationRuntimeState(
            active.conversationId,
            finalSettingLibraryState,
            this.dependencies.conversations.getCharacterBinding(active.conversationId, database),
            { source: rawSettingLibrary, projected: settingLibrary },
            database
          )
        }
        const finished = this.dependencies.messages.finish(active.messageId, content, status, database, committedVariableState)
        this.dependencies.generations.finish(active.runId, status)
        this.dependencies.conversations.touch(active.conversationId, content, database)
        return finished
      })
      this.dependencies.gateway.broadcast('agent.run.finished', {
        conversationId: active.conversationId,
        runId: active.runId,
        message
      })
      this.emitState(active.conversationId, 'idle')
    } catch (error) {
      if (active.cancelled) {
        const cancelledContent = regexRules
          ? transformCollectionSurface(active.accumulated, regexRules, 'AiOutput', 'Stored')
          : active.accumulated
        const message = this.dependencies.database.withWriteTx((database) => {
          const finished = this.dependencies.messages.finish(active.messageId, cancelledContent, 'cancelled', database)
          this.dependencies.generations.finish(active.runId, 'cancelled')
          this.dependencies.conversations.touch(active.conversationId, cancelledContent, database)
          return finished
        })
        this.dependencies.gateway.broadcast('agent.run.finished', {
          conversationId: active.conversationId,
          runId: active.runId,
          message
        })
        this.emitState(active.conversationId, 'idle')
        return
      }
      const diagnosticMessage = errorMessage(error)
      const messageText = publicRuntimeErrorMessage(diagnosticMessage)
      const message = this.dependencies.database.withWriteTx((database) => {
        const errorContent = regexRules
          ? transformCollectionSurface(active.accumulated, regexRules, 'AiOutput', 'Stored')
          : active.accumulated
        const finished = this.dependencies.messages.finish(
          active.messageId,
          errorContent,
          'error',
          database
        )
        this.dependencies.conversations.touch(active.conversationId, errorContent, database)
        this.dependencies.generations.finish(active.runId, 'error', diagnosticMessage)
        return finished
      })
      this.dependencies.gateway.broadcast('agent.run.failed', {
        conversationId: active.conversationId,
        runId: active.runId,
        messageId: message.id,
        code: DESKTOP_ERROR_CODES.RUNTIME_UNAVAILABLE,
        message: messageText
      })
      this.emitState(active.conversationId, 'error', messageText)
    } finally {
      if (this.activeRuns.get(active.conversationId) === active) {
        this.activeRuns.delete(active.conversationId)
      }
    }
  }

  private emitState(conversationId: string, state: AgentState, detail?: string): void {
    const payload = detail === undefined ? { conversationId, state } : { conversationId, state, detail }
    this.dependencies.gateway.broadcast('agent.state.changed', payload)
  }

  private isCurrent(active: ActiveRun): boolean {
    return !active.cancelled && this.activeRuns.get(active.conversationId) === active
  }
}

function runtimeThreadForPreset(
  currentRuntimeThreadId: string | undefined,
  preset: AgentRunInput['agentPreset']
): string {
  if (!preset) return currentRuntimeThreadId ?? randomUUID()
  const prefix = `preset_${safeRuntimeSegmentPart(preset.id)}_${safeRuntimeSegmentPart(preset.versionId)}_`
  return currentRuntimeThreadId?.startsWith(prefix) ? currentRuntimeThreadId : `${prefix}${randomUUID()}`
}

function safeRuntimeSegmentPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 72) || 'default'
}

function trailingCompleteCharacterIndex(content: string): number {
  return /[\uD800-\uDBFF]/.test(content.at(-1) ?? '') ? content.length - 1 : content.length
}

function generationCancelledError(): Error {
  const error = new Error('生成已停止')
  error.name = 'AbortError'
  return error
}

function publicRuntimeErrorMessage(raw: string): string {
  if (/json-rpc|plugin tree|node_modules|file:\/\/\/|at\s+\S+\s*\(/i.test(raw)) {
    return 'Agent 启动失败，请重试。'
  }
  const firstLine = raw.split(/\r?\n/, 1)[0]?.trim()
  return firstLine ? firstLine.slice(0, 200) : 'Agent 运行失败，请重试。'
}
