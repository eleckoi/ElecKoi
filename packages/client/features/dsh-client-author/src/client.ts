import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@eleckoi/dsh-client-characters/client'
import type {} from '@eleckoi/dsh-client-persona/client'
import type {} from '@eleckoi/dsh-client-presets/client'
import { NativeAuthorClient } from './runtime.js'
import { NativeFrontendClient } from './frontends.js'
export type { NativeFrontendClient } from './frontends.js'
export type { ElecKoiAuthorRuntime, NativeAuthorRuntimeSnapshot, NativeAuthorChatHandlers, NativeAuthorProjectContext, NativeAuthorDocumentRelease } from './client/types.js'

export const inject = ['remote', 'remote.eleckoiAuthorScripts', 'remote.eleckoiAuthorVariables', 'remote.eleckoiAuthorFrontends', 'remote.eleckoiConversations', 'remote.eleckoiCharacters', 'remote.eleckoiCharacterConfiguration', 'remote.eleckoiAgentPresets', 'remote.eleckoiTavernCompatibility', 'eleckoiConversations', 'eleckoiScriptLibraries', 'eleckoiModels', 'eleckoiCharacters', 'eleckoiPersona', 'eleckoiPresets']

export async function apply(ctx: Context): Promise<void> {
  const frontends = new NativeFrontendClient(ctx.remote.eleckoiAuthorFrontends)
  ctx.provide('eleckoiFrontendProjects', frontends)
  ctx.effect(() => {
    const stop = ctx.on('connection/reset', () => frontends.reset())
    return () => { stop(); frontends.dispose() }
  }, 'eleckoi: native frontend projects')
  const runtime = new NativeAuthorClient({ window, remote: ctx.remote, conversations: ctx.eleckoiConversations, libraries: ctx.eleckoiScriptLibraries, models: ctx.eleckoiModels,
    catalogSources: [ctx.eleckoiCharacters, ctx.eleckoiPersona, ctx.eleckoiPresets],
    report(error) { console.error('ElecKoi native author runtime failed', error); window.dispatchEvent(new CustomEvent('eleckoi:plugin-error', { detail: { error } })) } })
  ctx.provide('eleckoiAuthorRuntime', runtime)
  await ctx.effect(async () => {
    try { await runtime.start() } catch (error) { await runtime.dispose(); throw error }
    const stop = ctx.on('connection/reset', () => { void runtime.refresh(true).catch(error => console.error(error)) })
    return async () => { stop(); await runtime.dispose() }
  }, 'eleckoi: native author runtime')
}
