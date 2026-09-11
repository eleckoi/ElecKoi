import type { AgentProcessItem, ChatMessage } from '../entities/chat'
import type { AgentGenerationStats } from './generationStats'

export type AgentState = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error'

export type AgentEvent =
  | {
      name: 'agent.output.delta'
      payload: { conversationId: string; runId: string; messageId: string; sequence: number; delta: string }
    }
  | {
      name: 'agent.run.finished'
      payload: { conversationId: string; runId: string; message: ChatMessage }
    }
  | {
      name: 'agent.run.failed'
      payload: { conversationId: string; runId: string; messageId: string; code: string; message: string }
    }
  | {
      name: 'agent.state.changed'
      payload: { conversationId: string; state: AgentState; detail?: string }
    }
  | {
      name: 'agent.process.updated'
      payload: { conversationId: string; runId: string; messageId: string; item: AgentProcessItem }
    }
  | {
      name: 'agent.generation.stats'
      payload: { conversationId: string; runId: string; stats: AgentGenerationStats }
    }
