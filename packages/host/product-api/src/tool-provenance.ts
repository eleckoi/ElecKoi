import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager'
import type {} from '@deepseek-ai/dsh-tools'

export interface ToolPluginSource { id: string; name: string }

/** Resolve a tool's registration context against exact Loader entries and bundle declarations. */
export async function toolPluginSources(ctx: Context, names: string[]): Promise<Map<string, ToolPluginSource>> {
  const tools = ctx.get('tools')
  const manager = ctx.get('pluginManager')
  const bundles = manager ? await manager.listBundles() : []
  const sources = new Map<string, ToolPluginSource>()
  if (!tools) return sources
  for (const name of names) {
    const owner = tools.registrant(name)
    if (!owner) continue
    let fiber: Fiber | undefined = owner.fiber
    let entrySource: ToolPluginSource | undefined
    const visited = new Set<Fiber>()
    while (fiber && !visited.has(fiber)) {
      visited.add(fiber)
      const entry = fiber.entry
      if (entry) {
        const entryId = entry.loader.locate(fiber)
        const matches = entryId === undefined ? [] : bundles.filter(bundle => bundle.rows.some(row => row.entryId === entryId))
        const unique = new Map(matches.map(bundle => [bundle.name, bundle]))
        if (unique.size === 1) {
          const bundle = [...unique.values()][0]!
          sources.set(name, bundleSource(bundle))
          break
        }
        entrySource ??= { id: `entry:${entryId ?? entry.id}`, name: fiber.name === 'root' ? entry.options.name : fiber.name }
      }
      fiber = fiber.parent?.fiber
    }
    if (!sources.has(name)) sources.set(name, entrySource ?? {
      id: `runtime:${owner.fiber.uid}`, name: owner.fiber.name === 'root' ? '来源未声明' : owner.fiber.name,
    })
  }
  return sources
}

function bundleSource(bundle: BundleInfo): ToolPluginSource {
  const title = bundle.meta?.title
  const name = typeof title === 'string' ? title : title?.zh ?? title?.en ?? bundle.name
  return { id: `bundle:${bundle.name}`, name }
}
