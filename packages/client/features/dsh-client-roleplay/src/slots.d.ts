import type { ComponentType, ReactNode } from 'react'
import type {
  ComposerAttachmentsOwnerProps,
  ComposerBarOwnerProps,
  ComposerChainProps,
  ConvViewOwnerProps,
  InputActivityOwnerProps,
  InputControlOwnerProps,
  InputZone,
  MessageImagesOwnerProps,
  ViewTab,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeOwnerProps, ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SlotMap } from '@deepseek-ai/dsh-client-ui-slots'

type BridgeSlotRenderer = (name: string, owner: unknown, options?: unknown) => ReactNode

export interface RoleplaySessionOwner {
  matched: {
    component: ComponentType<any>
    props: Record<string, unknown>
  }
}

export interface ComposerBridgeOwner {
  renderBridgeSlot?: BridgeSlotRenderer
  auxiliaryGenerating?: boolean
  onStopAuxiliary?: () => void
}

export interface RoleplayChatOwner extends ConvViewOwnerProps {
  before?: ReactNode
  transition?: ReactNode
  renderChatNode?: (owner: ChatNodeOwnerProps & { node: ChatNode }) => ReactNode | undefined
  renderPendingInput?: (owner: SlotMap['conversation.chat.pending-input']['owner']) => ReactNode
}

export interface RoleplayMessageOwner {
  conversationId: string
  productMessageId: string
  messageId: string | null
  role: 'user' | 'assistant'
}

export interface RoleplayMessageContentOwner extends RoleplayMessageOwner {
  content: string
  streaming: boolean
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'eleckoi.roleplay.chat': {
      kind: 'single'
      scope: 'session'
      owner: RoleplayChatOwner
    }
    'eleckoi.roleplay.chat.frontend': {
      kind: 'chain'
      scope: 'session'
      owner: { characterId: string; conversationId: string; fallback: ReactNode }
    }
    'eleckoi.roleplay.chat.node': {
      kind: 'keyed'
      scope: 'session'
      owner: SlotMap['conversation.chat.node']['owner']
      keyProps: SlotMap['conversation.chat.node']['keyProps']
      hookContext: SlotMap['conversation.chat.node']['hookContext']
      inject: SlotMap['conversation.chat.node']['inject']
    }
    'eleckoi.roleplay.chat.images': {
      kind: 'single'
      scope: 'session'
      owner: MessageImagesOwnerProps
    }
    'eleckoi.roleplay.chat.before': {
      kind: 'single'
      scope: 'session'
      owner: SlotMap['conversation.chat.before']['owner']
    }
    'eleckoi.roleplay.chat.pending-input': {
      kind: 'single'
      scope: 'session'
      owner: SlotMap['conversation.chat.pending-input']['owner']
    }
    'eleckoi.roleplay.session': {
      kind: 'single'
      scope: 'session'
      owner: RoleplaySessionOwner
    }
    'eleckoi.roleplay.session.header': {
      kind: 'single'
      scope: 'session'
      owner: RoleplaySessionOwner
    }
    'eleckoi.roleplay.session.body': {
      kind: 'single'
      scope: 'session'
      owner: RoleplaySessionOwner & {
        navigation: {
          tabs: readonly ViewTab[]
          activeView: string | undefined
          selectView: (view: string) => void
        }
      }
    }
    'eleckoi.roleplay.session.view': {
      kind: 'list'
      scope: 'session'
      owner: ConvViewOwnerProps
    }
    'eleckoi.roleplay.message.content': {
      kind: 'chain'
      scope: 'session'
      owner: RoleplayMessageContentOwner
    }
    'eleckoi.roleplay.message.actions': {
      kind: 'list'
      scope: 'session'
      owner: RoleplayMessageOwner & { messageId: string }
    }
    'eleckoi.roleplay.message.after': {
      kind: 'list'
      scope: 'session'
      owner: RoleplayMessageOwner
    }
    'eleckoi.roleplay.conversation.header.corner': {
      kind: 'single'
      scope: 'session'
      owner: Record<string, never>
    }
    'eleckoi.roleplay.conversation.input.right': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, never>
    }
    'eleckoi.roleplay.conversation.input.left': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, never>
    }
    'eleckoi.roleplay.conversation.input.overlay': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, never>
    }
    'eleckoi.roleplay.conversation.input.dock': {
      kind: 'list'
      scope: 'session'
      owner: InputZone
    }
    'eleckoi.roleplay.conversation.input.attachments': {
      kind: 'single'
      scope: 'session-maybe'
      owner: ComposerAttachmentsOwnerProps
    }
    'eleckoi.roleplay.conversation.input.permission': {
      kind: 'single'
      scope: 'session'
      owner: InputControlOwnerProps
    }
    'eleckoi.roleplay.conversation.input.plan': {
      kind: 'single'
      scope: 'session'
      owner: InputControlOwnerProps
    }
    'eleckoi.roleplay.conversation.input.model': {
      kind: 'single'
      scope: 'session'
      owner: InputControlOwnerProps
    }
    'eleckoi.roleplay.conversation.input.activity': {
      kind: 'single'
      scope: 'session'
      owner: InputActivityOwnerProps
    }
    'eleckoi.roleplay.conversation.composer.dock': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, never>
    }
    'eleckoi.roleplay.conversation.composer': {
      kind: 'chain'
      scope: 'session'
      owner: ComposerChainProps & ComposerBridgeOwner
    }
    'eleckoi.roleplay.conversation.composer.bar': {
      kind: 'single'
      scope: 'session-maybe'
      owner: ComposerBarOwnerProps & ComposerBridgeOwner
    }
    'eleckoi.roleplay.conversation.approval.detail': {
      kind: 'single'
      scope: 'session'
      owner: Record<string, unknown>
    }
    'eleckoi.roleplay.conversation.plan-review.actions': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, unknown>
    }
    'eleckoi.roleplay.trajectory.images': {
      kind: 'single'
      scope: 'session'
      owner: MessageImagesOwnerProps
    }
    'eleckoi.roleplay.trajectory': {
      kind: 'single'
      scope: 'session'
      owner: ConvViewOwnerProps & { component?: ComponentType<any> }
    }
  }
}
