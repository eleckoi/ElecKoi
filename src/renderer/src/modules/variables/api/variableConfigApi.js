import { desktopClient } from "../../../bridge/desktopClient.ts";

export function getVariableConfig(characterId) {
  return desktopClient.request("query.variable_config.read", { characterId });
}

export function saveVariableConfig(characterId, config) {
  return desktopClient.request("command.variable_config.save", { characterId, config });
}

export function saveVariableConfigViewState(characterId, expandedObjectIds) {
  return desktopClient.request("command.variable_config.view_state.save", { characterId, expandedObjectIds });
}
