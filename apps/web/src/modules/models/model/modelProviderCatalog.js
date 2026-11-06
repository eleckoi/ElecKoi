import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { sourceText } from "../../../app/i18n/productCopy.js";
import customIcon from "../../../assets/eleckoi-app-icon.png";
import deepseekIcon from "../../../assets/model-icons/deepseek.svg";
import novelAiIcon from "../../../assets/model-icons/novelai.svg";
import openAiIcon from "../../../assets/model-icons/openai.svg";
import { normalizeNovelAiImageSettings } from '@shared/contracts/agent/novelAiImageSettings';

export const modelProviderSections = [
  { id: "general", label: "通用大模型" },
  { id: "image", label: "绘画模型" },
];

const providerCatalog = [
  {
    id: "custom",
    label: "自定义提供商",
    badge: "自定义",
    summary: "添加并配置自定义模型提供商。",
    initials: "API",
    icon: customIcon,
    baseUrlPlaceholder: "填写模型提供商 API 地址",
    apiKeyPlaceholder: "填写 API Key",
    modelPlaceholder: "填写模型名称",
    defaultBaseUrl: "",
    defaultApiFormat: "responses",
    section: "general",
    fixed: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    badge: "官方 API",
    summary: "官方 API",
    initials: "DS",
    icon: deepseekIcon,
    baseUrlPlaceholder: "默认：https://api.deepseek.com/anthropic",
    apiKeyPlaceholder: "填写 DeepSeek API Key",
    modelPlaceholder: "例如：deepseek-v4-flash、deepseek-v4-pro",
    defaultBaseUrl: "https://api.deepseek.com/anthropic",
    defaultApiFormat: "deepseek_messages",
    section: "general",
    fixed: true,
  },
  {
    id: "openai_image",
    label: "OpenAI Images",
    badge: "绘画 API",
    summary: "GPT Image 2",
    initials: "OA",
    icon: openAiIcon,
    monochrome: true,
    baseUrlPlaceholder: "默认：https://api.openai.com/v1",
    apiKeyPlaceholder: "填写 OpenAI API Key",
    modelPlaceholder: "默认：gpt-image-2",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-image-2",
    defaultApiFormat: "chat_completions",
    defaultImageSettings: {
      width: 1024,
      height: 1536,
      quality: "auto",
      background: "auto",
    },
    section: "image",
    fixed: false,
  },
  {
    id: "novelai_image",
    label: "NovelAI",
    badge: "绘画 API",
    summary: "NovelAI 图片生成 API",
    initials: "NAI",
    icon: novelAiIcon,
    monochrome: true,
    baseUrlPlaceholder: "默认：https://image.novelai.net",
    apiKeyPlaceholder: "填写 NovelAI Persistent API Token",
    modelPlaceholder: "默认：nai-diffusion-4-5-full",
    defaultBaseUrl: "https://image.novelai.net",
    defaultModel: "nai-diffusion-4-5-full",
    defaultApiFormat: "chat_completions",
    defaultImageSettings: normalizeNovelAiImageSettings(),
    section: "image",
    fixed: false,
  },
];

export function normalizeProviderId(providerId) {
  const normalized = (providerId || "custom").trim().toLowerCase();
  return normalized || "custom";
}

export function catalogItem(providerId, tUi = sourceText) {
  const id = normalizeProviderId(providerId);
  return localizeUiCopy(providerCatalog.find((item) => item.id === id) || providerCatalog[0], tUi);
}

export function addableProviderItems(providers, tUi = sourceText) {
  const backendById = new Map((providers || []).map((item) => [normalizeProviderId(item.id), item]));
  return providerCatalog
    .filter((item) => item.id === 'custom' || item.section === 'image')
    .map((item) => withProviderSearchText(localizeUiCopy(item, tUi), [], backendById));
}

export function builtinProviderItems(providers = []) {
  return providers.filter(route => !['zai', 'zai-coding-cn', 'moonshotai', 'moonshotai-cn'].includes(route.provider));
}

export function filterProviderItems(items, keyword) {
  const query = String(keyword || "").trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((item) => item.searchText.includes(query));
}

export function isImageProviderId(providerId, tUi = sourceText) {
  return catalogItem(providerId, tUi).section === "image";
}

function withProviderSearchText(item, configs, backendById) {
  const merged = { ...item, ...(backendById.get(item.id) || {}), ...item };
  const configText = (configs || [])
    .filter((config) => normalizeProviderId(config.provider) === item.id)
    .flatMap((config) => [config.name, config.model])
    .join(" ");
  return {
    ...merged,
    searchText: [merged.id, merged.label, merged.badge, merged.summary, configText]
      .join(" ")
      .toLocaleLowerCase(),
  };
}

export function blankConfigForProvider(providerId, name = "", tUi = sourceText) {
  const provider = normalizeProviderId(providerId);
  const meta = catalogItem(provider, tUi);
  return {
    id: "",
    name,
    provider,
    api_key: "",
    base_url: meta.defaultBaseUrl,
    proxy_url: "",
    model: meta.defaultModel || "",
    model_options: meta.defaultModel ? [{ id: meta.defaultModel, name: meta.defaultModel }] : [],
    custom_headers: {},
    supports_tools: null,
    enabled: meta.section !== "image",
    image_settings: { ...(meta.defaultImageSettings || {}) },
    api_format: meta.defaultApiFormat,
  };
}

export function modelOptionsKey(config) {
  return String(config?.id || config?.provider || '').trim();
}

export function configProviderMeta(config, providers = [], tUi = sourceText) {
  if (isImageProviderId(config?.provider, tUi) || config?.provider === 'deepseek') return catalogItem(config.provider, tUi);
  const route = providers.find(item => item.provider === config?.id)
    ?? (config?.builtin ? { provider: config.id, displayName: config.name || config.id } : undefined);
  if (config?.builtin && route) {
    return { ...catalogItem('custom', tUi), id: route.provider, label: route.displayName || route.provider,
      badge: tUi("内置提供商"), summary: '',
      icon: route.provider === 'openai' ? openAiIcon : route.provider === 'deepseek' ? deepseekIcon : undefined,
      initials: (route.displayName || route.provider).slice(0, 2).toUpperCase() };
  }
  return catalogItem('custom', tUi);
}

export function configurationItems(configs, providers = [], tUi = sourceText) {
  return configs.map(config => {
    const meta = configProviderMeta(config, providers, tUi);
    const label = config.name?.trim() || meta.label;
    return { ...meta, id: config.id, config, label, summary: config.id, fixed: false, searchText: [label, config.id, config.model].join(' ').toLocaleLowerCase() };
  });
}
