import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection/types'

export interface RoleplayRequestContextItem {
  order: number
  messageId: string
  role: 'system' | 'user' | 'assistant'
  kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'
  title: string
  source: string
  anchor: string
  content: string
}

export interface RoleplayGroupResponse {
  turn: number
  groupId: string
  characterId: string
  speakerName: string
  speakerAvatar: string
  requestId: string
  operationId: string
  inputMessageId?: string
  inputEventSeq?: number
}

export interface RoleplayInputContinuation {
  mode?: 'continue'
  targetAssistantMessageId?: string
  requestId?: string
  operationId?: string
  turn: number
  inputMessageId: string
  inputEventSeq: number
}

export interface RoleplayInputContinuations {
  links: RoleplayInputContinuation[]
  inputs: Array<{ turn: number; eventSeq: number; messageId: string }>
}

export interface RoleplayInputContinuationsState extends RoleplayInputContinuations {
  currentTurn: number
}

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'eleckoi/group-response-cancelled': { requestId: string; turn: number; error: string }
    'eleckoi/group-response': RoleplayGroupResponse
    'eleckoi/illustration': {
      batchId: string
      turn: number
      step: number
      status: 'generating' | 'complete' | 'partial' | 'failed'
      frames: Array<{ id: number; width: number; height: number; status: 'generating' | 'ready' | 'failed';
        attachment?: import('@eleckoi/dsh-product-data').ChatUserImageAttachment; seed?: number; error?: string }>
      error?: string
    }
    'eleckoi/request-context': {
      requestSeq: number
      context: RoleplayRequestContextItem[]
    }
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'eleckoi/history-restored': { messageIds: string[] }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    eleckoiIllustrations: import('@deepseek-ai/dsh-session').SessionEventMap['eleckoi/illustration'][]
    eleckoiConversationPreview: string
    eleckoiHistoryStatsAdjustment: { steps: number; turns: number }
    eleckoiTurnOutcomes: { abortedTurns: number[] }
    eleckoiGroupResponses: { responses: RoleplayGroupResponse[] }
    eleckoiInputContinuations: RoleplayInputContinuations
  }
  interface SessionProjectionStateMap {
    eleckoiInputContinuations: RoleplayInputContinuationsState
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiRequestPreviews: import('./host/request-preview.mjs').RequestPreviewStore
  }
}
