import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { expect, it } from 'vitest'
import { toolPluginSources } from '../src/tool-provenance'

it('groups unrelated tool names by their actual registration owner and resolves an exact bundle row', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.inject(['tools'], async owner => {
      const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: String(value) }] }
      const plugin = await owner.plugin({ name: '注册组件', inject: ['tools'], apply(pluginCtx) {
        for (const name of ['synthetic_canvas', 'synthetic_dice']) pluginCtx.tools.register(defineTool({ name, description: '', parameters: {}, output, execute: async () => 'ok' }))
      } })
      const other = await owner.plugin({ name: '另一个插件', inject: ['tools'], apply(pluginCtx) {
        pluginCtx.tools.register(defineTool({ name: 'synthetic_canvas_other', description: '', parameters: {}, output, execute: async () => 'ok' }))
      } })
      const sources = await toolPluginSources(owner, ['synthetic_canvas', 'synthetic_dice', 'synthetic_canvas_other'])
      expect(sources.get('synthetic_canvas')).toEqual(sources.get('synthetic_dice'))
      expect(sources.get('synthetic_canvas_other')?.id).not.toBe(sources.get('synthetic_canvas')?.id)
      plugin.entry = { loader: { locate: () => 'synthetic-entry' }, id: 'synthetic-entry', options: { name: 'synthetic-module' } } as unknown as NonNullable<typeof plugin.entry>
      await owner.plugin({ provide: 'pluginManager', apply(managerCtx) { managerCtx.provide('pluginManager', { listBundles: async () => [{ name: 'synthetic-bundle', meta: { title: { en: 'Synthetic', zh: '合成插件' } }, rows: [{ entryId: 'synthetic-entry' }] }] } as unknown as Context['pluginManager']) } })
      expect(owner.get('pluginManager')).toBeDefined()
      expect(owner.tools.registrant('synthetic_canvas')?.fiber.entry?.loader.locate(plugin)).toBe('synthetic-entry')
      const bundled = await toolPluginSources(owner, ['synthetic_canvas', 'synthetic_dice'])
      expect([...bundled.values()]).toEqual([{ id: 'bundle:synthetic-bundle', name: '合成插件' }, { id: 'bundle:synthetic-bundle', name: '合成插件' }])
      await other.dispose(); await plugin.dispose()
      expect((await toolPluginSources(owner, ['synthetic_canvas'])).size).toBe(0)
    })
  } finally { await ctx.fiber.dispose() }
})
