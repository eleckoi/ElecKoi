import { DshRuntime } from '@eleckoi/dsh-runtime'
import type { AppPaths } from '@main/platform/filesystem/AppPaths'
import type {
  AgentRunCallbacks,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimePort
} from '@shared/contracts/agent/runtime'
import type { ChatImageMediaType, ChatUserImageAttachment, EncodedChatImageAttachment } from '@shared/contracts/entities/chat'

export class DshAgentRuntime implements AgentRuntimePort {
  private readonly runtime: DshRuntime

  constructor(paths: AppPaths) {
    this.runtime = new DshRuntime({
      configPath: paths.resolveResource('dsh', 'cordis.yml'),
      workspaceRoot: paths.workspace,
      runtimeDataRoot: paths.dshRuntime,
      executablePath: process.execPath,
      presetTemplatePath: paths.resolveResource('dsh', 'agent-preset-template', 'agent.cordis.yml')
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
      input.subagentSettings
    )
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

  cancel(conversationId: string): Promise<boolean> {
    return this.runtime.stop(conversationId)
  }

  close(): Promise<void> {
    return this.runtime.close()
  }
}
