import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import authorRemote from '@eleckoi/dsh-compatibility-host/remote'
export type {} from '@eleckoi/dsh-compatibility-host/remote'
export const inject = ['remote']
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(authorRemote)
  return disposeRemote
}
