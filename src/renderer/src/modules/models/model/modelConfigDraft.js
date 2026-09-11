import { blankConfigForProvider, normalizeProviderId } from "./modelProviderCatalog.js";

export function initialConfigForProvider(providerId) {
  const randomId = window.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12)
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { ...blankConfigForProvider(providerId), id: `config-${randomId}` };
}

export function normalizedConfigs(configs) {
  return (configs || []).map((item) => ({ ...item, provider: normalizeProviderId(item.provider) }));
}

export function providerVersions(form, configs, activeProviderId) {
  const matching = configs.filter((item) => normalizeProviderId(item.provider) === activeProviderId);
  if (matching.length) {
    if (form.id && !matching.some((item) => item.id === form.id)) return [...matching, form];
    return matching;
  }
  return [form.id ? form : { ...form, id: "__draft" }];
}

export function mergeModelOptions(form, scopedOptions) {
  const byId = new Map([...(form.model_options || []), ...scopedOptions]
    .map((item) => ({ id: item.id || item.name, name: item.name || item.id }))
    .filter((item) => item.id)
    .map((item) => [item.id, item]));
  const items = [...byId.values()];
  const currentModel = (form.model || "").trim();
  return currentModel && !items.some((item) => item.id === currentModel)
    ? [{ id: currentModel, name: currentModel }, ...items]
    : items;
}

export function modelParameterState(form, activeProviderId) {
  const activeModelOption = (form.model_options || []).find((item) => item.id === form.model) || null;
  const automaticContextWindow = activeProviderId === "deepseek" && (!form.base_url || form.base_url.includes("api.deepseek.com"))
    ? 1_000_000
    : 272_000;
  const effectiveContextWindow = activeModelOption?.contextWindowTokens || automaticContextWindow;
  const parameterError = activeModelOption && (
    (activeModelOption.contextWindowTokens != null && (activeModelOption.contextWindowTokens < 4096 || activeModelOption.contextWindowTokens > 4_000_000))
    || (activeModelOption.autoCompactTokenLimit != null && (activeModelOption.autoCompactTokenLimit < 1024 || activeModelOption.autoCompactTokenLimit > effectiveContextWindow))
    || (activeModelOption.maxOutputTokens != null && (activeModelOption.maxOutputTokens < 1 || activeModelOption.maxOutputTokens > effectiveContextWindow))
    || (activeModelOption.temperature != null && (activeModelOption.temperature < 0 || activeModelOption.temperature > 2))
    || (activeModelOption.topP != null && (activeModelOption.topP < 0 || activeModelOption.topP > 1))
  );
  return { activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError };
}

export function imageSettingsError(form) {
  const provider = normalizeProviderId(form.provider);
  const settings = form.image_settings || {};
  const width = Number(settings.width);
  const height = Number(settings.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) return "请填写有效的图片宽高。";
  if (provider === "openai_image") {
    if (width < 16 || width > 3840 || height < 16 || height > 3840) return "宽高需要在 16 到 3840 之间。";
    if (width % 16 !== 0 || height % 16 !== 0) return "宽高都需要是 16 的倍数。";
    if (Math.max(width, height) > Math.min(width, height) * 3) return "图片长边不能超过短边的 3 倍。";
    const pixels = width * height;
    if (pixels < 655_360 || pixels > 8_294_400) return "总像素需要在 655360 到 8294400 之间。";
    return "";
  }
  if (provider === "novelai_image") {
    const steps = Number(settings.steps);
    const scale = Number(settings.scale);
    if (width < 512 || width > 2048 || height < 512 || height > 2048) return "宽高需要在 512 到 2048 之间。";
    if (!Number.isInteger(steps) || steps < 1 || steps > 50) return "步数需要在 1 到 50 之间。";
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 10) return "提示词相关性需要在 0.1 到 10 之间。";
  }
  return "";
}
