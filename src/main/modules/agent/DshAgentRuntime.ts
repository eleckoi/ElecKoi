import { DshRuntime, describeDshModelCapabilities } from '@eleckoi/dsh-runtime'
import type { AppPaths } from '@main/platform/filesystem/AppPaths'
import type { ModelRepository } from '@main/modules/models'
import type {
  AgentRunCallbacks,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimePort
} from '@shared/contracts/agent/runtime'
import type { ChatImageMediaType, ChatUserImageAttachment, EncodedChatImageAttachment } from '@shared/contracts/entities/chat'

export class DshAgentRuntime implements AgentRuntimePort {
  private readonly runtime: DshRuntime

  constructor(paths: AppPaths, models: Pick<ModelRepository, 'runtimeCatalog'>) {
    this.runtime = new DshRuntime({
      configPath: paths.resolveResource('dsh', 'cordis.yml'),
      workspaceRoot: paths.workspace,
      runtimeDataRoot: paths.dshRuntime,
      executablePath: process.execPath,
      presetTemplatePath: paths.resolveResource('dsh', 'agent-preset-template', 'agent.cordis.yml'),
      modelCatalog: () => models.runtimeCatalog()
    })
  }

  run(input: AgentRunInput, callbacks: AgentRunCallbacks): Promise<AgentRunResult> {
    return this.runtime.stream(
      input.conversationId,
      input.text,
      input.settings,
      callbacks,
      input.variableContext,
      input.conversationContext,
      input.runtimeThreadId,
      input.toolPolicy,
      input.discardRuntimeThreadIds,
      input.inputImages,
      input.agentPreset,
      input.webSearch,
      input.subagentSettings,
      input.generationStatsSeed
    )
  }

  describeModelCapabilities(input: {
    provider: import('@shared/contracts/entities/model').ModelProviderId
    baseUrl: string
    model: string
    apiFormat: 'chat_completions' | 'responses' | 'anthropic_messages' | 'google_gemini'
    reasoningEfforts?: import('@shared/contracts/entities/model').ModelReasoningEfforts | false | undefined
  }) {
    return describeDshModelCapabilities({
      provider: input.provider,
      baseUrl: input.baseUrl,
      model: input.model,
      apiFormat: runtimeApiFormat(input.apiFormat),
      reasoningEfforts: input.reasoningEfforts
    })
  }

  prepareImages(images: EncodedChatImageAttachment[]): Promise<ChatUserImageAttachment[]> {
    return this.runtime.prepareImages(images)
  }

  readImage(image: ChatUserImageAttachment): Promise<{ mediaType: ChatImageMediaType; data: string }> {
    return this.runtime.readImage(image)
  }

  removeImage(attachmentId: string): void {
    this.runtime.removeImage(attachmentId)
  }

  generationStats(conversationId: string, runtimeThreadId: string) {
    return this.runtime.generationStats(conversationId, runtimeThreadId)
  }

  trajectory(
    conversationId: string,
    runtimeThreadId: string,
    options?: { beforeIndex?: number | undefined; limit?: number | undefined }
  ) {
    return { conversationId, ...this.runtime.trajectory(conversationId, runtimeThreadId, options) }
  }

  cancel(conversationId: string): Promise<boolean> {
    return this.runtime.stop(conversationId)
  }

  disposeConversation(conversationId: string, runtimeThreadIds?: readonly string[]): Promise<void> {
    return this.runtime.disposeConversation(conversationId, runtimeThreadIds)
  }

  close(): Promise<void> {
    return this.runtime.close()
  }
}

function runtimeApiFormat(value: 'chat_completions' | 'responses' | 'anthropic_messages' | 'google_gemini') {
  switch (value) {
    case 'chat_completions': return 'openai-completions' as const
    case 'responses': return 'openai-responses' as const
    case 'anthropic_messages': return 'anthropic-messages' as const
    case 'google_gemini': return 'google-generative-ai' as const
  }
}
