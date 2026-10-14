import type { Session } from '@deepseek-ai/dsh-session'
import type { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import type { AssistantMessage } from '@deepseek-ai/dsh-llm'

type FormatArtifact = ReturnType<ReturnType<typeof sessionFormatCatalog.createRestore>['finish']>
export function restoreFormatSession(artifact: FormatArtifact): Session
export function runtimeEventToFormat(event: { readonly type: string; readonly seq: number; readonly time: number; readonly data: unknown }): FormatArtifact['events'][number]
export function interruptedFormatClosers(artifact: FormatArtifact): FormatArtifact['events']
export function storedAssistantBlocks(stream: unknown): AssistantMessage['content']
