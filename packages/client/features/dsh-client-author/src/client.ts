import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import { NativeAuthorClient } from './runtime.js'
import { NativeFrontendClient } from './frontends.js'
export type { NativeFrontendClient } from './frontends.js'
export type { ElecKoiAuthorRuntime, NativeAuthorRuntimeSnapshot, NativeAuthorChatHandlers, NativeAuthorProjectContext } from './client/types.js'

export const inject = ['remote', 'remote.eleckoiAuthorScripts', 'remote.eleckoiAuthorVariables', 'remote.eleckoiAuthorFrontends', 'remote.eleckoiCharacterAssets', 'remote.eleckoiConversations', 'remote.eleckoiCharacters', 'remote.eleckoiCharacterConfiguration', 'remote.eleckoiAgentPresets', 'eleckoiConversations', 'eleckoiScriptLibraries', 'eleckoiModels']

export async function apply(ctx: Context): Promise<void> {
  const frontends = new NativeFrontendClient(ctx.remote.eleckoiAuthorFrontends, ctx.remote.eleckoiCharacterAssets)
  ctx.provide('eleckoiFrontendProjects', frontends)
  ctx.effect(() => {
    const stop = ctx.on('connection/reset', () => frontends.reset())
    return () => { stop(); frontends.dispose() }
  }, 'eleckoi: native frontend projects')
  const runtime = new NativeAuthorClient({ window, remote: ctx.remote, conversations: ctx.eleckoiConversations, libraries: ctx.eleckoiScriptLibraries, models: ctx.eleckoiModels,
    report(error) { console.error('ElecKoi native author runtime failed', error); window.dispatchEvent(new CustomEvent('eleckoi:plugin-error', { detail: { error } })) } })
  ctx.provide('eleckoiAuthorRuntime', runtime)
  await ctx.effect(async () => {
    try { await runtime.start() } catch (error) { await runtime.dispose(); throw error }
    const stop = ctx.on('connection/reset', () => { void runtime.refresh(true).catch(error => console.error(error)) })
    return async () => { stop(); await runtime.dispose() }
  }, 'eleckoi: native author runtime')
}
