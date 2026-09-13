import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ConversationRepository } from './ConversationRepository'
import { MessageRepository } from './MessageRepository'
import { ConversationCleanupRepository } from './ConversationCleanupRepository'
import { resolveConversationSeed } from './conversationSeed'
import type { ChatMessage } from '@shared/contracts/entities/chat'
import { MessageDisplayProjector } from './MessageDisplayProjector'
import { RichMessageHeightRepository } from './RichMessageHeightRepository'
import { buildVariableViewerTimeline } from '@shared/foundation/variables/viewerTimeline'
import { characterCardMacroValues } from '@shared/foundation/characterCardMacros'

function presentMessages(
  ctx: Context,
  projector: MessageDisplayProjector,
  conversationId: string,
  messages: ChatMessage[]
): ChatMessage[] {
  const metadata = ctx.conversations.getMetadata(conversationId)
  if (!metadata.characterId) return messages
  const collection = ctx.regexRules.get(metadata.characterId)
  const macroValues = characterCardMacroValues(metadata, metadata.characterPersona.user_name)
  return messages.map((message) => projector.project(message, collection, macroValues))
}

function details(ctx: Context, projector: MessageDisplayProjector, conversationId: string) {
  const page = ctx.messages.page(conversationId)
  return {
    conversation: ctx.conversations.get(conversationId),
    metadata: ctx.conversations.getMetadata(conversationId),
    ...page,
    messages: presentMessages(ctx, projector, conversationId, page.messages)
  }
}

function requireStoryConversation(ctx: Context, characterId: string, conversationId: string): void {
  const binding = ctx.conversations.getCharacterBinding(conversationId)
  if (binding.characterId !== characterId || binding.characterMode !== 'story') {
    throw new Error('这段对话不属于当前故事角色。')
  }
}

function conversationSettingLibraries(ctx: Context, characterId: string) {
  return ctx.conversations.list()
    .filter(({ metadata }) => metadata.characterId === characterId)
    .map(({ conversation, metadata }) => {
      const library = ctx.settingLibraries.conversationLibrary(characterId, conversation.id)
      return library ? {
        sessionId: conversation.id,
        title: conversation.title,
        characterName: metadata.characterName,
        characterAvatar: metadata.characterAvatar,
        summary: conversation.preview,
        updatedAt: conversation.updatedAt,
        library
      } : null
    })
    .filter((item) => item !== null)
}

export const conversationsPlugin = {
  name: 'eleckoi-conversations',
  inject: ['database', 'desktopGateway', 'conversationFiles', 'settingLibraries', 'variables', 'variableStates', 'regexRules', 'messageDisplayCompatibility'],
  provide: ['conversations', 'messages'],
  apply(ctx: Context) {
    const cleanup = new ConversationCleanupRepository(ctx.database, ctx.conversationFiles)
    cleanup.drain()
    const conversations = new ConversationRepository(
      ctx.database,
      cleanup,
      (characterId, db, context) => resolveConversationSeed(
        characterId,
        context.characterMode,
        context.metadata,
        db,
        ctx.settingLibraries,
        ctx.variables
      )
    )
    const messages = new MessageRepository(ctx.database)
    const richMessageHeights = new RichMessageHeightRepository(ctx.database)
    const projector = new MessageDisplayProjector(ctx.messageDisplayCompatibility)
    ctx.provide('conversations', conversations)
    ctx.provide('messages', messages)

    return [
      ctx.desktopGateway.register('query.conversations.messages', ({ conversationId, beforeSequence, limit }) => {
        conversations.get(conversationId)
        const page = messages.page(conversationId, beforeSequence, limit)
        return { ...page, messages: presentMessages(ctx, projector, conversationId, page.messages) }
      }),
      ctx.desktopGateway.register('query.conversations.list', () => (
        conversations.list().map(({ conversation, metadata }) => ({ ...conversation, metadata }))
      )),
      ctx.desktopGateway.register('query.setting_library.conversations', ({ characterId }) => (
        conversationSettingLibraries(ctx, characterId)
      )),
      ctx.desktopGateway.register('command.setting_library.conversation.save', ({ characterId, sessionId, library }) => {
        requireStoryConversation(ctx, characterId, sessionId)
        const saved = ctx.settingLibraries.replaceConversationLibrary(characterId, sessionId, library)
        ctx.desktopGateway.broadcast('records.changed', { module: 'settingLibraries' })
        return saved
      }),
      ctx.desktopGateway.register('command.setting_library.conversation.reset', ({ characterId, sessionId }) => {
        requireStoryConversation(ctx, characterId, sessionId)
        ctx.settingLibraries.deleteConversationChanges(characterId, sessionId)
        ctx.desktopGateway.broadcast('records.changed', { module: 'settingLibraries' })
        return { ok: true as const }
      }),
      ctx.desktopGateway.register('command.setting_library.conversation.save_version', ({ characterId, sessionId, name }) => {
        requireStoryConversation(ctx, characterId, sessionId)
        const saved = ctx.settingLibraries.saveConversationAsVersion(characterId, sessionId, name)
        ctx.desktopGateway.broadcast('records.changed', { module: 'settingLibraries' })
        return saved
      }),
      ctx.desktopGateway.register('query.conversations.details', ({ conversationId }) => (
        details(ctx, projector, conversationId)
      )),
      ctx.desktopGateway.register('query.conversations.variable_timeline', ({ conversationId }) => {
        conversations.get(conversationId)
        const state = ctx.variableStates.viewerStates(conversationId)
        return buildVariableViewerTimeline(messages.list(conversationId), state.initialStateJson, state.currentStateJson)
      }),
      ctx.desktopGateway.register('query.conversations.rich_heights', ({ conversationId }) => {
        conversations.get(conversationId)
        return richMessageHeights.list(conversationId)
      }),
      ctx.desktopGateway.register('command.conversations.rich_height.save', (input) => {
        conversations.get(input.conversationId)
        return richMessageHeights.save(input)
      }),
      ctx.desktopGateway.register('command.conversations.create', (input) => {
        const created = conversations.create(input)
        ctx.desktopGateway.broadcast('records.changed', { module: 'conversations' })
        return details(ctx, projector, created.conversation.id)
      }),
      ctx.desktopGateway.register('command.conversations.delete', async ({ conversationId }) => {
        await conversations.delete(conversationId)
        ctx.desktopGateway.broadcast('records.changed', { module: 'conversations' })
        return { ok: true as const }
      }),
      ctx.desktopGateway.register('command.conversations.opening.select', ({ conversationId, openingId }) => {
        conversations.selectOpening(conversationId, openingId)
        ctx.desktopGateway.broadcast('records.changed', { module: 'conversations' })
        return details(ctx, projector, conversationId)
      }),
      ctx.desktopGateway.register('command.conversations.opening.update', ({ conversationId, content }) => {
        conversations.updateOpening(conversationId, content)
        ctx.desktopGateway.broadcast('records.changed', { module: 'conversations' })
        return details(ctx, projector, conversationId)
      })
    ]
  }
} satisfies Plugin.Object
