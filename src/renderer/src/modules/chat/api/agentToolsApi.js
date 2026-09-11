import { desktopClient } from '../../../bridge/desktopClient.ts';

async function loadActivePreset() {
  const catalog = await desktopClient.request('query.agent_presets.catalog', {});
  const preset = await desktopClient.request('query.agent_presets.read', { presetId: catalog.activePresetId });
  return { catalog, preset };
}

function chatModelConfigs(configs) {
  return configs.filter((config) => config.enabled !== false && config.provider !== 'openai_image' && config.provider !== 'novelai_image');
}

function asToolCatalog(preset, configs) {
  return {
    characterId: '',
    scopeId: `agent-preset:${preset.id}`,
    groups: preset.toolGroups.filter((group) => group.included ?? group.enabled),
    modelConfigs: chatModelConfigs(configs),
    subagentModelSelection: preset.subagentModelSelection,
    roleplayPlan: preset.roleplayPlan,
  };
}

export async function loadAgentTools() {
  const [{ preset }, configs] = await Promise.all([
    loadActivePreset(),
    desktopClient.request('query.models.list', {}),
  ]);
  return asToolCatalog(preset, configs);
}

export async function setAgentToolGroupEnabled(groupId, enabled) {
  const { preset } = await loadActivePreset();
  const saved = await desktopClient.request('command.agent_presets.save', {
    preset: {
      ...preset,
      toolGroups: preset.toolGroups.map((group) => group.id === groupId ? { ...group, included: true, enabled } : group),
    },
  });
  const configs = await desktopClient.request('query.models.list', {});
  return asToolCatalog(saved, configs);
}

export async function setSubagentModelSelection(selection) {
  const [{ preset }, configs] = await Promise.all([
    loadActivePreset(),
    desktopClient.request('query.models.list', {}),
  ]);
  const saved = await desktopClient.request('command.agent_presets.save', {
    preset: { ...preset, subagentModelSelection: selection },
  });
  return asToolCatalog(saved, configs);
}

export async function setRoleplayPlanSettings(roleplayPlan) {
  const [{ preset }, configs] = await Promise.all([
    loadActivePreset(),
    desktopClient.request('query.models.list', {}),
  ]);
  const saved = await desktopClient.request('command.agent_presets.save', {
    preset: { ...preset, roleplayPlan },
  });
  return asToolCatalog(saved, configs);
}
