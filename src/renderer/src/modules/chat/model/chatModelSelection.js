export function resolveModelConfig(modelConfigs, modelSelection) {
  const requested = (modelConfigs || []).find((item) => item.id === modelSelection.configId) || null;
  const selected = requested || (modelConfigs || [])[0] || null;
  return selected ? { ...selected, model: requested ? modelSelection.model || selected.model || "" : selected.model || "" } : null;
}

export function selectionFromActiveSetting(stored = {}) {
  return normalizeModelSelection({
    capability: stored.capability || "chat",
    configId: stored.config_id || "",
    model: stored.model || "",
    parameters: {
      stream: stored.parameters?.stream ?? true,
      temperature: stored.parameters?.temperature ?? 1,
      topP: stored.parameters?.top_p ?? 1,
    },
  });
}

export function reconcileModelSelection(selection, modelConfigs = []) {
  const current = normalizeModelSelection(selection);
  const fallback = (modelConfigs || []).find((item) => item.id === current.configId) || (modelConfigs || [])[0] || null;
  if (!fallback) return current;
  const availableModels = Array.isArray(fallback.model_options) ? fallback.model_options : [];
  const selectedModelExists = availableModels.some((item) => item.id === current.model);
  return {
    capability: "chat",
    configId: fallback.id,
    model: current.configId === fallback.id && (selectedModelExists || availableModels.length === 0) && current.model
      ? current.model
      : fallback.model || availableModels[0]?.id || "",
    parameters: current.parameters,
  };
}

export function normalizeModelSelection(nextSelection, fallbackParameters = {}) {
  return {
    capability: nextSelection.capability || "chat",
    configId: nextSelection.configId || "",
    model: nextSelection.model || "",
    parameters: normalizeParameters(nextSelection.parameters || fallbackParameters),
  };
}

export function toActiveModelSelection(selection) {
  const parameters = normalizeParameters(selection.parameters);
  return {
    capability: "chat",
    config_id: selection.configId || "",
    model: selection.model || "",
    parameters: {
      stream: parameters.stream,
      temperature: parameters.temperature,
      top_p: parameters.topP,
    },
  };
}

function normalizeParameters(parameters = {}) {
  return {
    stream: parameters.stream ?? true,
    temperature: parameters.temperature ?? 1,
    topP: parameters.topP ?? 1,
  };
}
