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

/** Renderer-to-Main upload shape. Base64 exists only at this Gateway boundary. */
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
  startedAtMillis: number
  completedAtMillis?: number
  parentId?: string
  delegatedModel?: string
}

export interface OpeningMessageOption {
  id: string
  title: string
  content: string
  displayContent?: string
  initialVariableStateJson: string
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
  modelSettings: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  displayContent?: string
  variableStateJson: string
  status: MessageStatus
  createdAt: string
  turnId?: string
  speakerId?: string
  speakerName?: string
  speakerAvatar?: string
  sequence?: number
  responseIndex?: number
  process?: AgentProcessItem[]
  inputImageAttachments?: ChatUserImageAttachment[]
  openingOptions?: OpeningMessageOption[]
  selectedOpeningId?: string
}

export interface ChatDetails {
  conversation: Conversation
  metadata: ConversationMetadata
  messages: ChatMessage[]
}

export interface AppSnapshot {
  conversations: Array<Conversation & { metadata: ConversationMetadata }>
  activeConversationId: string
  messages: ChatMessage[]
}
