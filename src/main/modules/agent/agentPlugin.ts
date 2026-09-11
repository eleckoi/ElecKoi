import type { Context, Plugin } from '@deepseek-ai/cordis'
import { AgentSessionCoordinator } from './AgentSessionCoordinator'
import { DshAgentRuntime } from './DshAgentRuntime'
import { GenerationRepository } from './GenerationRepository'
import { AgentAttachmentCleanupRepository } from './AgentAttachmentCleanupRepository'

export const agentPlugin = {
  name: 'eleckoi-agent',
  inject: [
    'appPaths',
    'database',
    'desktopGateway',
    'conversations',
    'messages',
    'models',
    'personas',
    'variableStates',
    'settingLibraries',
    'agentPresets',
    'webSearchSettings',
    'regexRules',
    'userSettings'
  ],
  provide: 'agentSessions',
  apply(ctx: Context) {
    const runtime = new DshAgentRuntime(ctx.appPaths)
    const generations = new GenerationRepository(ctx.database, ctx.messages)
    const attachmentCleanup = new AgentAttachmentCleanupRepository(ctx.database, runtime, ctx.messages)
    attachmentCleanup.drain()
    const sessions = new AgentSessionCoordinator({
      runtime,
      database: ctx.database,
      gateway: ctx.desktopGateway,
      conversations: ctx.conversations,
      messages: ctx.messages,
      personas: ctx.personas,
      models: ctx.models,
      userSettings: ctx.userSettings,
      generations,
      variableStates: ctx.variableStates,
      settingLibraries: ctx.settingLibraries,
      agentPresets: ctx.agentPresets,
      webSearchSettings: ctx.webSearchSettings,
      regexRules: ctx.regexRules
    })
    ctx.provide('agentSessions', sessions)
    const unregisterDeleteCleanup = ctx.conversations.registerDeleteCleanup(attachmentCleanup)
    const unregisterDeleteGuard = ctx.conversations.registerDeleteGuard(generations)

    const unregister = [
      ctx.desktopGateway.register('command.agent.start', ({ conversationId, text, images }) => (
        sessions.start(conversationId, text, images)
      )),
      ctx.desktopGateway.register('command.agent.cancel', ({ conversationId }) => (
        sessions.cancel(conversationId)
      )),
      ctx.desktopGateway.register('command.agent.regenerate', ({ conversationId, targetMessageId, replacementMessage }) => (
        sessions.regenerate(conversationId, targetMessageId, replacementMessage === null ? undefined : replacementMessage)
      )),
      ctx.desktopGateway.register('query.agent.inspect', ({ conversationId }) => (
        sessions.inspect(conversationId)
      )),
      ctx.desktopGateway.register('query.agent.generation_stats', ({ conversationId }) => (
        sessions.generationStats(conversationId)
      )),
      ctx.desktopGateway.register('query.agent.image', async ({ conversationId, attachmentId }) => {
        return runtime.readImage(ctx.messages.findInputImage(conversationId, attachmentId))
      })
    ]

    return async () => {
      for (const dispose of unregister.reverse()) dispose()
      unregisterDeleteGuard()
      unregisterDeleteCleanup()
      await sessions.close()
      await runtime.close()
    }
  }
} satisfies Plugin.Object
