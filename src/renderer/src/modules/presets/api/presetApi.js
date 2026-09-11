import { desktopClient } from '../../../bridge/desktopClient.ts';

export function getPresetCatalog() {
  return desktopClient.request('query.agent_presets.catalog', {});
}

export function getPreset(presetId) {
  return desktopClient.request('query.agent_presets.read', { presetId });
}

export function savePreset(preset) {
  return desktopClient.request('command.agent_presets.save', { preset });
}

export function createPreset(name, libraryGroupId) {
  return desktopClient.request('command.agent_presets.create', { name, libraryGroupId });
}

export function importPreset(source, document) {
  return desktopClient.request('command.agent_presets.import', { source, document });
}

export function exportPreset(presetId) {
  return desktopClient.request('command.agent_presets.export', { presetId });
}

export function setActivePreset(presetId) {
  return desktopClient.request('command.agent_presets.set_active', { presetId });
}

export function createPresetGroup(name) {
  return desktopClient.request('command.agent_presets.groups.create', { name });
}

export function renamePresetGroup(groupId, name) {
  return desktopClient.request('command.agent_presets.groups.rename', { groupId, name });
}

export function deletePresetGroup(groupId) {
  return desktopClient.request('command.agent_presets.groups.delete', { groupId });
}

export function deletePreset(presetId) {
  return desktopClient.request('command.agent_presets.delete', { presetId });
}
