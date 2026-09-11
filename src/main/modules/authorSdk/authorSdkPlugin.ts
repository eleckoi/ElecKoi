import type { Context, Plugin } from '@deepseek-ai/cordis'
import { AuthorSdkService } from './AuthorSdkService'

export const authorSdkPlugin = {
  name: 'eleckoi-author-sdk',
  inject: ['desktopGateway', 'conversations', 'messages', 'variables', 'agentSessions'],
  provide: 'authorSdk',
  apply(ctx: Context) {
    const service = new AuthorSdkService({
      conversations: ctx.conversations,
      messages: ctx.messages,
      variables: ctx.variables,
      agentSessions: ctx.agentSessions
    })
    ctx.provide('authorSdk', service)
    return ctx.desktopGateway.register('command.author_sdk.invoke', (input, requestContext) => (
      service.invoke(input, requestContext.senderId)
    ))
  }
} satisfies Plugin.Object
