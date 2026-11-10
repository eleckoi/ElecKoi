export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled'
export type ChatImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Durable, provider-neutral image metadata stored beside one user turn. */
export interface ChatUserImageAttachment {
  attachmentId: string
  mediaType: ChatImageMediaType
  bytes: number
  width: number
  height: number
  name?: string | undefined
  originalDimensions?: { width: number; height: number } | undefined
}

/** Scene input parsed from the original reply and the outcome of one frame. */
export interface GeneratedImageFrame {
  id: number
  prompt: string
  negative_prompt?: string
  after_paragraph?: number
  width: number
  height: number
  status: 'ready' | 'failed'
  attachment?: ChatUserImageAttachment
  seed?: number
  error?: string
}

export interface ChatGeneratedImageAttachment extends Partial<ChatUserImageAttachment> {
  id: string
  batchId: string
  frameId: number
  status: 'ready' | 'failed' | 'generating'
  error?: string
}

export interface ChatUserFileAttachment {
  attachmentId: string
  name: string
  bytes: number
}

export interface ChatTurnTokenUsage {
  uncachedInputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  routes?: readonly { provider: string; model: string }[]
}

/** Base64-encoded image payload submitted by the Client to the DSH Host. */
export interface EncodedChatImageAttachment {
  mediaType: ChatImageMediaType
  data: string
  name?: string | undefined
}

export type AgentProcessItemKind = 'tool' | 'command' | 'file_change' | 'compaction' | 'subagent' | 'action' | 'narrative' | 'reasoning'
export type AgentProcessItemStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface AgentProcessItem {
  id: string
  kind: AgentProcessItemKind
  status: AgentProcessItemStatus
  toolName: string
  arguments: string
  summary: string
  detail: string
  /** Display projection only; detail remains the original Session text. */
  displayDetail?: string
  startedAtMillis: number
  completedAtMillis?: number
  parentId?: string
  delegatedModel?: string
}

export interface OpeningMessageOption {
  id: string
  title: string
  content: string
  variableVersionId?: string
  displayContent?: string
  initialVariableStateJson: string
  initialVariableIdentityJson?: string
}

export interface Conversation {
  id: string
  title: string
  preview: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMetadata {
  characterId: string
  characterName: string
  characterAvatar: string
  characterPersona: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  displayContent?: string
  variableStateJson: string
  /** False when this message has no saved historical variable value. */
  variableSnapshotAvailable?: boolean
  status: MessageStatus
  createdAt: string
  turnId?: string
  speakerId?: string
  speakerName?: string
  speakerAvatar?: string
  sequence?: number
  messageIndex?: number
  responseIndex?: number
  runtimeSessionId?: string
  dshMessageId?: string
  process?: AgentProcessItem[]
  turnUsage?: ChatTurnTokenUsage
  inputImageAttachments?: ChatUserImageAttachment[]
  generatedImageAttachments?: ChatGeneratedImageAttachment[]
  inputFileAttachments?: ChatUserFileAttachment[]
  openingOptions?: OpeningMessageOption[]
  selectedOpeningId?: string
}

export interface ChatDetails {
  conversation: Conversation
  metadata: ConversationMetadata
  runtimeSessionId: string
  messages: ChatMessage[]
}

export interface AppSnapshot {
  conversations: Array<Conversation & { metadata: ConversationMetadata }>
  activeConversationId: string
  messages: ChatMessage[]
}
