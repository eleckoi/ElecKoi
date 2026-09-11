import {
  AUTHOR_API_STAGE,
  AUTHOR_API_VERSION,
  AuthorApiError,
  AuthorBridgeRequestGate,
  authorApiDefinitions,
  inlineMessageInteractivePermissions,
  routeAuthorApiRequest,
  type AuthorBridgeRejectionCode
} from '@eleckoi/author-sdk'
import type { AgentSessionCoordinator } from '@main/modules/agent'
import type { ConversationRepository, MessageRepository } from '@main/modules/conversations'
import type { VariableConfigRepository } from '@main/modules/variables'
import type { ChatMessage } from '@shared/contracts/entities/chat'

const bridgeErrors: Record<AuthorBridgeRejectionCode, string> = {
  BRIDGE_REQUEST_TOO_LARGE: '作者 API 请求过大',
  BRIDGE_BUSY: '作者 API 同时请求过多',
  BRIDGE_RATE_LIMITED: '作者 API 请求过于频繁'
}

function requestId(rawRequest: string): string {
  try {
    const value: unknown = JSON.parse(rawRequest)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const id = (value as Record<string, unknown>).id
      return typeof id === 'string' ? id : ''
    }
  } catch { /* handled by the SDK router */ }
  return ''
}

function parsedJson(source: string): unknown {
  try { return JSON.parse(source || '{}') } catch { return {} }
}

function publicMessage(message: ChatMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt,
    speakerName: message.speakerName ?? '',
    sequence: message.sequence ?? null
  }
}

export class AuthorSdkService {
  private readonly gates = new Map<string, AuthorBridgeRequestGate>()

  constructor(private readonly dependencies: {
    conversations: ConversationRepository
    messages: MessageRepository
    variables: VariableConfigRepository
    agentSessions: AgentSessionCoordinator
  }) {}

  async invoke(input: { conversationId: string; messageId: string; request: string }, senderId: number): Promise<{ response: string }> {
    const message = this.dependencies.messages.get(input.conversationId, input.messageId)
    const gateKey = `${senderId}:${input.conversationId}:${input.messageId}`
    let gate = this.gates.get(gateKey)
    if (gate) {
      this.gates.delete(gateKey)
    } else {
      gate = new AuthorBridgeRequestGate()
      if (this.gates.size >= 1_024) {
        const oldest = this.gates.keys().next().value
        if (oldest !== undefined) this.gates.delete(oldest)
      }
    }
    this.gates.set(gateKey, gate)
    const rejection = gate.tryAcquire(input.request)
    if (rejection) {
      return { response: JSON.stringify({
        id: requestId(input.request),
        ok: false,
        error: { code: rejection, message: bridgeErrors[rejection] }
      }) }
    }
    try {
      const response = await routeAuthorApiRequest(
        input.request,
        inlineMessageInteractivePermissions,
        (method, params) => this.invokeMethod(input.conversationId, message, method, params)
      )
      return { response }
    } finally {
      gate.release()
    }
  }

  private invokeMethod(conversationId: string, message: ChatMessage, method: string, params: Record<string, unknown>): unknown {
    const conversation = this.dependencies.conversations.get(conversationId)
    const metadata = this.dependencies.conversations.getMetadata(conversationId)
    const messages = () => this.dependencies.messages.list(conversationId)
    const opening = () => {
      try { return this.dependencies.messages.get(conversationId, 'opening') } catch { return undefined }
    }
    switch (method) {
      case 'app.getInfo':
        return { name: 'ElecKoi', apiVersion: AUTHOR_API_VERSION, stage: AUTHOR_API_STAGE }
      case 'app.getCapabilities':
        return authorApiDefinitions.filter((item) => inlineMessageInteractivePermissions.has(item.permission))
      case 'context.current':
        return {
          surface: 'inline-message',
          conversationId,
          conversationTitle: conversation.title,
          messageId: message.id,
          characterId: metadata.characterId
        }
      case 'variables.getState':
        return parsedJson(message.variableStateJson)
      case 'variables.getConfig':
        return metadata.characterId ? this.dependencies.variables.get(metadata.characterId) : null
      case 'openings.list':
        return { items: opening()?.openingOptions ?? [] }
      case 'openings.current': {
        const current = opening()
        return current?.openingOptions?.find((item) => item.id === current.selectedOpeningId) ?? null
      }
      case 'openings.select': {
        const id = typeof params.id === 'string' ? params.id.trim() : ''
        if (!id) throw new AuthorApiError('INVALID_PARAMS', '开场白 id 不能为空')
        this.dependencies.conversations.selectOpening(conversationId, id)
        return { selectedId: id }
      }
      case 'messages.list':
        return messages().map(publicMessage)
      case 'messages.get': {
        const id = typeof params.id === 'string' ? params.id.trim() : ''
        if (!id) throw new AuthorApiError('INVALID_PARAMS', '消息 id 不能为空')
        return publicMessage(this.dependencies.messages.get(conversationId, id))
      }
      case 'messages.current':
        return publicMessage(messages().at(-1) ?? message)
      case 'chat.send': {
        const text = typeof params.text === 'string' ? params.text.trim() : ''
        if (!text) throw new AuthorApiError('INVALID_PARAMS', '发送内容不能为空')
        if (text.length > 100_000) throw new AuthorApiError('INVALID_PARAMS', '发送内容过长')
        return this.dependencies.agentSessions.start(conversationId, text)
      }
      default:
        throw new AuthorApiError('METHOD_NOT_FOUND', `当前页面不支持 ${method}`)
    }
  }
}
