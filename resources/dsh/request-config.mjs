/** Applies ElecKoi's current per-model request settings at the DSH request seam. */

export const name = 'eleckoi-request-config'

export function apply(ctx) {
  const mainTemperature = optionalNumber(process.env.ELECKOI_TEMPERATURE)
  const subagentTemperature = optionalNumber(process.env.ELECKOI_SUBAGENT_TEMPERATURE)

  if (mainTemperature === undefined && subagentTemperature === undefined) return

  return ctx.on('agent/request', async ({ agent }, next) => {
    const temperature = agent.options.provider === 'eleckoi-subagent'
      ? subagentTemperature
      : mainTemperature
    return {
      ...(await next()),
      ...(temperature === undefined ? {} : { temperature }),
    }
  })
}

function optionalNumber(value) {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new Error(`ELECKOI_TEMPERATURE must be between 0 and 2; received ${value}`)
  }
  return parsed
}
