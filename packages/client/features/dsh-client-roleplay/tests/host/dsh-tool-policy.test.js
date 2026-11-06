import { executeToolCall } from '../../../../../../tests/helpers/tool-call.js'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { applyDisabledPolicy, withPluginTools } from '../../src/host/tool-policy.mjs'
import { classify, filterDeclarations } from '../../../../../../apps/desktop/resources/dsh/tool-policy.mjs'

describe('DSH character tool policy', () => {
  it('exposes exact registration owners across scope shadows, restrictions, disposal and re-registration', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(NativeToolExecutor);
      await ctx.inject(['tools'], async owner => {
        const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }
        const register = pluginCtx => pluginCtx.tools.register(defineTool({ name: 'synthetic_owned', description: 'owned', parameters: {}, output, execute: async () => 'ok' }))
        const plugin = await owner.plugin({ name: 'Synthetic owner', inject: ['tools'], apply(pluginCtx) { register(pluginCtx) } })
        expect(owner.tools.registrant('synthetic_owned').fiber).toBe(plugin)
        const agent = { id: 'synthetic-provenance' }, scope = createScope(owner, agent)
        const child = { id: 'synthetic-provenance-child' }, childScope = createScope(scope.ctx, child)
        try {
          const undo = register(scope.ctx)
          expect(owner.tools.registrant('synthetic_owned', agent)).toBe(scope.ctx)
          const unrestrict = childScope.ctx.tools.restrict({ deny: ['synthetic_owned'] })
          expect(owner.tools.registrant('synthetic_owned', child)).toBeUndefined()
          unrestrict(); undo()
          expect(owner.tools.registrant('synthetic_owned', agent).fiber).toBe(plugin)
          await plugin.dispose()
          expect(owner.tools.registrant('synthetic_owned')).toBeUndefined()
          const next = await owner.plugin({ name: 'Synthetic replacement', inject: ['tools'], apply(pluginCtx) { register(pluginCtx) } })
          expect(owner.tools.registrant('synthetic_owned').fiber).toBe(next)
        } finally { await childScope.dispose(); await scope.dispose() }
      })
    } finally { await ctx.fiber.dispose() }
  })
  it('classifies the current desktop tool groups and keeps internal probes', () => {
    expect(classify({ type: 'function', function: { name: 'eleckoi_read_variables' } })).toBe('builtin:variables')
    expect(classify({ type: 'function', function: { name: 'pwsh' } })).toBe('builtin:workspace')
    expect(classify({ type: 'function', name: 'working_directory' })).toBe('builtin:workspace')
    expect(filterDeclarations([{ name: 'working_directory' }], ['builtin:workspace'])).toEqual([])
    expect(classify({ type: 'function', function: { name: 'skill' } })).toBe('builtin:workflow')
    expect(classify({ type: 'function', function: { name: 'workflow' } })).toBe('builtin:workflow')
    const scheduled = ['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit'].map(name => ({ type: 'function', name }))
    expect(scheduled.map(classify)).toEqual(Array(4).fill('builtin:workflow'))
    expect(filterDeclarations(scheduled, ['builtin:workflow'])).toEqual([])
    expect(classify({ type: 'function', function: { name: 'subagent_fork' } })).toBe('builtin:collaboration')
    expect(classify({ type: 'function', function: { name: 'send_message' } })).toBe('builtin:collaboration')
    expect(classify({ type: 'namespace', name: 'collaboration', tools: [] })).toBe('builtin:collaboration')
    expect(classify({ type: 'web_search' })).toBe('builtin:web')
    expect(classify({ type: 'function', name: 'web_search' })).toBe('builtin:web')
    expect(classify({ type: 'function', name: 'web_fetch' })).toBe('builtin:web')
    expect(filterDeclarations([{ type: 'function', name: 'web_search' }, { type: 'function', name: 'web_fetch' }], ['builtin:web'])).toEqual([])
    expect(classify({ type: 'function', function: { name: 'spawn_agent' } })).toBe('plugin-tool:spawn_agent')
    expect(classify({ type: 'function', function: { name: 'update_plan' } })).toBe('plugin-tool:update_plan')
    expect(classify({ type: 'function', function: { name: 'future_tool' } })).toBe('plugin-tool:future_tool')

    expect(filterDeclarations([
      { type: 'function', function: { name: 'eleckoi_read_variables' } },
      { type: 'function', function: { name: 'eleckoi_read_setting_files' } },
      { type: 'function', function: { name: 'future_tool' } },
      { type: 'function', function: { name: 'eleckoi_read_uploaded_file' } },
      { type: 'function', function: { name: 'eleckoi_internal_probe' } }
    ], new Set(['builtin:variables', 'builtin:other']))).toEqual([
      { type: 'function', function: { name: 'eleckoi_read_setting_files' } },
      { type: 'function', function: { name: 'future_tool' } },
      { type: 'function', function: { name: 'eleckoi_read_uploaded_file' } },
      { type: 'function', function: { name: 'eleckoi_internal_probe' } }
    ])
  })

  it('preserves author references when a plugin is absent and resolves exact identities on registration', () => {
    const reference = { id: 'plugin-tool:synthetic_roll', name: '作者定义的骰子', description: '作者提示安装插件', source: 'extension',
      members: [{ name: 'synthetic_roll', description: '掷骰子' }], enabled: true, included: true }
    const preset = { toolGroups: [reference] }
    const missing = withPluginTools(preset, [])
    expect(missing.toolGroups).toEqual([{ ...reference, available: false }])
    const loaded = withPluginTools(missing, [{ name: 'synthetic_roll', description: 'runtime description' },
      { name: 'synthetic_second', description: 'second' }, { name: 'eleckoi_read_uploaded_file' }])
    expect(loaded.toolGroups[0]).toEqual({ ...reference, available: true })
    expect(loaded.toolGroups.map(group => group.id)).toEqual(['plugin-tool:synthetic_roll'])
    expect(loaded.extraToolGroups).toEqual([expect.objectContaining({ id: 'plugin-tool:synthetic_second', included: false, enabled: true })])
    expect(withPluginTools({ toolGroups: [{ ...reference, id: 'builtin:synthetic', source: 'built_in' }] }, [{ name: 'synthetic_roll' }]).extraToolGroups).toEqual([])
    expect(preset.toolGroups[0]).toBe(reference)
  })

  it('keeps other tools callable with missing plugins and preserves a disabled choice across plugin reload', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(NativeToolExecutor);
      await ctx.inject(['tools'], async owner => {
        const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }
        owner.tools.register(defineTool({ name: 'synthetic_available', description: 'Available tool', parameters: {}, output, execute: () => 'still works' }))
        const agent = { id: 'synthetic-missing-plugin' }, scope = createScope(owner, agent)
        agent.ctx = scope.ctx
        try {
          applyDisabledPolicy(agent.ctx, ['plugin-tool:synthetic_missing', 'plugin-tool:synthetic_disabled'], owner.tools)
          expect(owner.tools.schemas(agent).map(tool => tool.name)).toEqual(['synthetic_available'])
          const result = await executeToolCall(owner.tools, { agent, callId: 'synthetic-available-call', name: 'synthetic_available', arguments: {}, signal: new AbortController().signal })
          expect(result.isError).toBe(false)
          expect(result.content[0].text).toBe('still works')
          for (let index = 0; index < 2; index++) {
            const plugin = await owner.plugin({ inject: ['tools'], apply(pluginCtx) {
              pluginCtx.tools.register(defineTool({ name: 'synthetic_disabled', description: 'Disabled plugin', parameters: {}, output, execute: () => 'disabled' }))
            } })
            expect(owner.tools.schemas(agent).map(tool => tool.name)).toEqual(['synthetic_available'])
            await plugin.dispose()
          }
          applyDisabledPolicy(agent.ctx, [], owner.tools)
        } finally { await scope.dispose() }
      })
    } finally { await ctx.fiber.dispose() }
  })

  it('keeps plugin tools callable with saved preset policies and follows plugin unload', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(NativeToolExecutor);
      await ctx.inject(['tools'], async owner => {
        const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }
        const plugin = await owner.plugin({ inject: ['tools'], apply(pluginCtx) {
          for (const name of ['generate_image', 'generate_images', 'edit_image', 'synthetic_extension_tool']) {
            pluginCtx.tools.register(defineTool({ name, description: 'Synthetic plugin tool', parameters: {}, output,
              execute: () => 'synthetic plugin result' }))
          }
        } })
        owner.tools.register(defineTool({ name: 'read', description: 'Synthetic workspace tool', parameters: {}, output,
          execute: () => 'synthetic workspace result' }))
        const agent = { id: 'synthetic-plugin-policy-session' }
        const scope = createScope(owner, agent)
        agent.ctx = scope.ctx
        try {
          applyDisabledPolicy(agent.ctx, ['builtin:other', 'builtin:remote-dsh', 'builtin:workspace'])
          expect(owner.tools.schemas(agent).map(tool => tool.name)).toEqual([
            'generate_image', 'generate_images', 'edit_image', 'synthetic_extension_tool'
          ])
          const result = await executeToolCall(owner.tools, { agent, callId: 'synthetic-plugin-call', name: 'generate_image',
            arguments: {}, signal: new AbortController().signal })
          expect(result.isError).toBe(false)
          expect(result.content).toEqual([{ type: 'text', text: 'synthetic plugin result' }])
          const blocked = await executeToolCall(owner.tools, { agent, callId: 'synthetic-workspace-call', name: 'read',
            arguments: {}, signal: new AbortController().signal })
          expect(blocked.isError).toBe(true)
          await plugin.dispose()
          expect(owner.tools.schemas(agent)).toEqual([])
          applyDisabledPolicy(agent.ctx, [])
          expect(owner.tools.schemas(agent).map(tool => tool.name)).toEqual(['read'])
        } finally { await scope.dispose() }
      })
    } finally { await ctx.fiber.dispose() }
  })
})
