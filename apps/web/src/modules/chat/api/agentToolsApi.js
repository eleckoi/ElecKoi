async function loadActivePreset(presetCatalog, purpose = 'roleplay') {
  const catalog = await presetCatalog.refresh();
  const preset = await presetCatalog.read(catalog.activePresetIds[purpose]);
  return { catalog, preset };
}

function asToolCatalog(preset) {
  return {
    presetId: preset.id,
    characterId: '',
    scopeId: `agent-preset:${preset.id}`,
    groups: preset.toolGroups.filter((group) => group.included),
    extraGroups: preset.extraToolGroups || [],
    roleplayPlan: preset.roleplayPlan,
    toolModelConfigIds: preset.toolModelConfigIds || {},
  };
}

export async function loadAgentTools(presetCatalog, purpose = 'roleplay') {
  const { preset } = await loadActivePreset(presetCatalog, purpose);
  return asToolCatalog(preset);
}

export async function setAgentToolGroupEnabled(presetCatalog, groupId, enabled, purpose = 'roleplay') {
  const { preset } = await loadActivePreset(presetCatalog, purpose);
  const saved = await presetCatalog.save({
      ...preset,
      toolGroups: preset.toolGroups.map((group) => group.id === groupId ? { ...group, included: true, enabled } : group),
  }, preset.regexRules);
  return asToolCatalog(saved);
}

export async function setRoleplayPlanSettings(presetCatalog, roleplayPlan) {
  const { preset } = await loadActivePreset(presetCatalog);
  const saved = await presetCatalog.save({ ...preset, roleplayPlan }, preset.regexRules);
  return asToolCatalog(saved);
}
