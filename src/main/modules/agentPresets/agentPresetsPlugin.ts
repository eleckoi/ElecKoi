import type { Context, Plugin } from '@deepseek-ai/cordis'
import { AgentPresetRepository } from './AgentPresetRepository'

export const agentPresetsPlugin = {
  name: 'eleckoi-agent-presets',
  inject: ['database', 'desktopGateway', 'mediaAssets'],
  provide: 'agentPresets',
  apply(ctx: Context) {
    const agentPresets = new AgentPresetRepository(ctx.database, ctx.mediaAssets)
    agentPresets.ensureInitialized()
    ctx.provide('agentPresets', agentPresets)
    const changed = () => ctx.desktopGateway.broadcast('records.changed', { module: 'agentPresets' })
    return [
      ctx.desktopGateway.register('query.agent_presets.catalog', () => agentPresets.catalog()),
      ctx.desktopGateway.register('query.agent_presets.read', ({ presetId }) => agentPresets.get(presetId)),
      ctx.desktopGateway.register('command.agent_presets.save', ({ preset }) => {
        const saved = agentPresets.save(preset)
        changed()
        return saved
      }),
      ctx.desktopGateway.register('command.agent_presets.create', ({ name, libraryGroupId }) => {
        const preset = agentPresets.create(name, libraryGroupId)
        changed()
        return preset
      }),
      ctx.desktopGateway.register('command.agent_presets.import', ({ source, document }) => {
        const result = agentPresets.import(document, source)
        changed()
        return result
      }),
      ctx.desktopGateway.register('command.agent_presets.export', ({ presetId }) => agentPresets.export(presetId)),
      ctx.desktopGateway.register('command.agent_presets.set_active', ({ presetId }) => {
        const catalog = agentPresets.setActive(presetId)
        changed()
        return catalog
      }),
      ctx.desktopGateway.register('command.agent_presets.groups.create', ({ name }) => {
        const catalog = agentPresets.createGroup(name)
        changed()
        return catalog
      }),
      ctx.desktopGateway.register('command.agent_presets.groups.rename', ({ groupId, name }) => {
        const catalog = agentPresets.renameGroup(groupId, name)
        changed()
        return catalog
      }),
      ctx.desktopGateway.register('command.agent_presets.groups.delete', ({ groupId }) => {
        const catalog = agentPresets.deleteGroup(groupId)
        changed()
        return catalog
      }),
      ctx.desktopGateway.register('command.agent_presets.delete', ({ presetId }) => {
        const catalog = agentPresets.delete(presetId)
        changed()
        return catalog
      })
    ]
  }
} satisfies Plugin.Object
