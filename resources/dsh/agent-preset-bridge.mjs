/** Mounts the selected ElecKoi preset in the Agent factory's unpublished setup window. */

import { applyDisabledPolicy } from './tool-policy.mjs'

export const name = 'eleckoi-agent-preset-bridge'
export const inject = ['agents', 'agentPresets']

export function apply(ctx) {
  const originalCreate = ctx.agents.create
  const wrappedCreate = function (options) {
    const presetId = process.env.ELECKOI_AGENT_PRESET?.trim()
    if (!presetId) throw new Error('ELECKOI_AGENT_PRESET is required')
    const originalSetup = options.setup

    if (options.meta?.origin === 'subagent') {
      return originalCreate.call(ctx.agents, {
        ...options,
        setup: async (agentCtx) => {
          const transaction = await originalSetup?.(agentCtx)
          applyDisabledPolicy(agentCtx)
          return transaction
        }
      })
    }

    return originalCreate.call(ctx.agents, {
      ...options,
      meta: { ...(options.meta ?? {}), agentPreset: presetId },
      setup: async (agentCtx) => {
        await ctx.agentPresets.mount(agentCtx, presetId)
        applyDisabledPolicy(agentCtx)
        return originalSetup?.(agentCtx)
      }
    })
  }

  ctx.agents.create = wrappedCreate
  return () => {
    if (ctx.agents.create === wrappedCreate) ctx.agents.create = originalCreate
  }
}
