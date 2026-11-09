import { sourceText } from "../../../app/i18n/productCopy.js";
import { blankConfigForProvider, normalizeProviderId } from "./modelProviderCatalog.js";
import { novelAiImageSettingsError } from '@shared/contracts/agent/novelAiImageSettings';

export function initialConfigForProvider(providerId, providers = [], tUi = sourceText) {
  const route = providers.find(item => item.provider === providerId);
  if (route) {
    return { ...initialConfigForProvider(route.provider === 'deepseek-official' ? 'deepseek' : 'custom', undefined, tUi),
      id: route.provider, name: route.displayName || route.provider, builtin: true,
      useBuiltinModels: route.provider !== 'deepseek-official', settingsNs: route.settingsNs,
      settingsPath: route.settingsPath, api_format: route.provider === 'deepseek-official' ? 'deepseek_messages' : 'catalog' };
  }
  const provider = normalizeProviderId(providerId);
  if (provider === "deepseek") {
    return { ...blankConfigForProvider(provider, undefined, tUi), id: "deepseek-official" };
  }
  const randomId = window.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12)
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { ...blankConfigForProvider(provider, undefined, tUi), id: `config-${randomId}` };
}

export function normalizedConfigs(configs) {
  return (configs || []).map((item) => ({ ...item, provider: normalizeProviderId(item.provider) }));
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

export function removeUserAddedModel(form, modelId, visibleOptions = []) {
  const id = String(modelId || "").trim();
  const storedOption = (form.model_options || []).find((item) => item.id === id);
  if (!id || storedOption?.isUserAdded !== true) return form;

  const remainingOptions = (form.model_options || []).filter((item) => item.id !== id);
  if (String(form.model || "").trim() !== id) {
    return { ...form, model_options: remainingOptions };
  }

  const fallback = visibleOptions.find((item) => String(item?.id || item?.name || "").trim() !== id);
  const fallbackId = String(fallback?.id || fallback?.name || "").trim();
  const modelOptions = fallbackId && !remainingOptions.some((item) => item.id === fallbackId)
    ? [...remainingOptions, { ...fallback, id: fallbackId, name: fallback.name || fallbackId }]
    : remainingOptions;
  return { ...form, model: fallbackId, model_options: modelOptions };
}

export function modelParameterState(form, activeProviderId) {
  const activeModelOption = (form.model_options || []).find((item) => item.id === form.model) || null;
  const automaticContextWindow = activeModelOption?.catalogDefaults?.contextWindowTokens || activeModelOption?.contextWindowTokens || 1_000_000;
  const effectiveContextWindow = activeModelOption?.contextWindowTokens || automaticContextWindow;
  const declaresReasoning = activeProviderId === 'custom' && (!form.builtin || activeModelOption?.capabilitiesOverride === true);
  const reasoningProfileError = declaresReasoning && activeModelOption?.reasoningEfforts
    && typeof activeModelOption.reasoningEfforts === "object"
    && (
      Object.values(activeModelOption.reasoningEfforts).some((value) => value !== null && !String(value).trim())
      || !Object.keys(activeModelOption.reasoningEfforts).some((effort) => effort !== "off")
    );
  const parameterError = activeModelOption && (
    (activeModelOption.contextWindowTokens != null && (!Number.isSafeInteger(activeModelOption.contextWindowTokens) || activeModelOption.contextWindowTokens < 1))
    || (activeModelOption.autoCompactTokenLimit != null && (!Number.isSafeInteger(activeModelOption.autoCompactTokenLimit) || activeModelOption.autoCompactTokenLimit < 1 || activeModelOption.autoCompactTokenLimit > effectiveContextWindow))
    || (activeModelOption.maxOutputTokens != null && (!Number.isSafeInteger(activeModelOption.maxOutputTokens) || activeModelOption.maxOutputTokens < 1))
    || (activeModelOption.temperature != null && (!Number.isFinite(activeModelOption.temperature) || activeModelOption.temperature < 0))
    || (activeModelOption.topP != null && (activeModelOption.topP < 0 || activeModelOption.topP > 1))
    || reasoningProfileError
    || (Array.isArray(activeModelOption.inputModalities) && activeModelOption.inputModalities.length === 0)
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
    return novelAiImageSettingsError(settings);
  }
  return "";
}
