import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import { createPresetToolReferenceResolver, toolPluginSources } from '../src/tool-provenance'

it('does not scan installed packages for built-in-only presets while keeping extension provenance', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.inject(['tools'], async owner => {
      const listBundles = vi.fn(async () => [])
      await owner.plugin({provide:'pluginManager',apply(managerCtx){managerCtx.provide('pluginManager',{listBundles} as unknown as Context['pluginManager'])}})
      const output={schema:{type:'string' as const},render:()=>[]}
      await owner.plugin({inject:['tools'],apply(toolCtx){for(const name of ['read','read_image','shell_command'])toolCtx.tools.register(defineTool({name,description:'',parameters:{},output,execute:async()=>''}))}})
      const preset={toolGroups:[]}
      const resolveTools=createPresetToolReferenceResolver(owner)
      const builtin=await resolveTools(preset)
      expect(listBundles).not.toHaveBeenCalled()
      expect(builtin.basicToolGroups[0]!.members.map(member=>member.name)).toEqual(['read','read_image'])
      const extensionPlugin=await owner.plugin({name:'Synthetic extension',inject:['tools'],apply(toolCtx){toolCtx.tools.register(defineTool({name:'synthetic_extension',description:'Extension',parameters:{},output,execute:async()=>''}))}})
      const extension=await resolveTools(preset)
      expect(listBundles).toHaveBeenCalledTimes(1)
      expect(extension.extraToolGroups).toEqual([expect.objectContaining({id:'plugin-tool:synthetic_extension',plugin:expect.objectContaining({name:'Synthetic extension'})})])
      expect(await resolveTools(preset)).toEqual(extension)
      expect(listBundles).toHaveBeenCalledTimes(1)
      owner.emit('plugin-manager/changed',{reason:'bundle'})
      await resolveTools(preset)
      expect(listBundles).toHaveBeenCalledTimes(2)
      owner.emit('plugin-manager/changed',{reason:'bundle'})
      listBundles.mockRejectedValueOnce(new Error('Synthetic inventory failure'))
      await expect(resolveTools(preset)).rejects.toThrow('Synthetic inventory failure')
      await expect(resolveTools(preset)).resolves.toEqual(extension)
      expect(listBundles).toHaveBeenCalledTimes(4)
      await extensionPlugin.dispose()
      expect((await resolveTools(preset)).extraToolGroups).toEqual([])
      expect(listBundles).toHaveBeenCalledTimes(4)
    })
  } finally { await ctx.fiber.dispose() }
})

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
