import type {} from '@deepseek-ai/dsh-session/types'
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

export interface RoleplayInputContinuation {
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

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'eleckoi/roleplay-output': { turn: number; replySeq?: number; fallback?: true; toolBacked?: true; nativeText?: true; editedText?: string; editedBlocks?: Array<{ id: string; text: string }> }
    'eleckoi/illustration': {
      batchId: string
      turn: number
      step: number
      replyCallId?: string
      status: 'generating' | 'complete' | 'partial' | 'failed'
      frames: Array<{ id: number; width: number; height: number; status: 'generating' | 'ready' | 'failed';
        attachment?: import('@eleckoi/dsh-product-data').ChatUserImageAttachment; seed?: number; error?: string }>
      error?: string
    }
    'eleckoi/request-context': {
      requestSeq: number
      context: RoleplayRequestContextItem[]
    }
    'eleckoi/history-restored': { messageIds: string[] }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    eleckoiIllustrations: import('@deepseek-ai/dsh-session').SessionEventMap['eleckoi/illustration'][]
    eleckoiConversationPreview: string
    eleckoiConversationActivity: number
    eleckoiHistoryStatsAdjustment: { steps: number; turns: number }
    eleckoiTurnOutcomes: { abortedTurns: number[] }
    eleckoiInputContinuations: RoleplayInputContinuations
  }
  interface SessionProjectionStateMap {
    eleckoiInputContinuations: RoleplayInputContinuationsState
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiRequestPreviews: import('./host/request-preview.mjs').RequestPreviewStore
    eleckoiRuntimeContexts: import('./host/runtime-contexts.mjs').RuntimeContexts
  }
}
