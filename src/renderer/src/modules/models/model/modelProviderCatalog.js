import customIcon from "../../../assets/model-icons/whale-maid-thinking.png";
import deepseekIcon from "../../../assets/model-icons/deepseek.svg";
import moonshotIcon from "../../../assets/model-icons/moonshot.svg";
import novelAiIcon from "../../../assets/model-icons/novelai.svg";
import openAiIcon from "../../../assets/model-icons/openai.svg";
import zaiIcon from "../../../assets/model-icons/zai.svg";
import zhipuIcon from "../../../assets/model-icons/zhipu.svg";

export const modelProviderSections = [
  { id: "general", label: "通用大模型" },
  { id: "image", label: "绘画模型" },
];

const providerCatalog = [
  {
    id: "custom",
    label: "自定义模型提供商",
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
    baseUrlPlaceholder: "默认：https://api.deepseek.com",
    apiKeyPlaceholder: "填写 DeepSeek API Key",
    modelPlaceholder: "例如：deepseek-v4-flash、deepseek-v4-pro",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultApiFormat: "responses",
    section: "general",
    fixed: true,
  },
  {
    id: "zhipu",
    label: "智谱开放平台",
    badge: "官方 API",
    summary: "智谱 AI 国内开放平台。",
    initials: "GLM",
    icon: zhipuIcon,
    baseUrlPlaceholder: "默认：https://open.bigmodel.cn/api/paas/v4",
    apiKeyPlaceholder: "填写智谱 API Key",
    modelPlaceholder: "填写模型名称，例如 glm-4.5",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultApiFormat: "chat_completions",
    section: "general",
    fixed: false,
  },
  {
    id: "zai",
    label: "Z.ai",
    badge: "官方 API",
    summary: "智谱 AI 国际平台。",
    initials: "Z",
    icon: zaiIcon,
    monochrome: true,
    baseUrlPlaceholder: "默认：https://api.z.ai/api/paas/v4",
    apiKeyPlaceholder: "填写 Z.ai API Key",
    modelPlaceholder: "填写模型名称，例如 glm-4.5",
    defaultBaseUrl: "https://api.z.ai/api/paas/v4",
    defaultApiFormat: "chat_completions",
    section: "general",
    fixed: false,
  },
  {
    id: "moonshot",
    label: "月之暗面",
    badge: "官方 API",
    summary: "月之暗面 Kimi 开放平台。",
    initials: "K",
    icon: moonshotIcon,
    monochrome: true,
    baseUrlPlaceholder: "默认：https://api.moonshot.cn/v1",
    apiKeyPlaceholder: "填写月之暗面 API Key",
    modelPlaceholder: "填写模型名称，例如 kimi-k2.5",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultApiFormat: "chat_completions",
    section: "general",
    fixed: false,
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
    defaultImageSettings: {
      width: 832,
      height: 1216,
      steps: 28,
      scale: 5,
      sampler: "k_euler_ancestral",
    },
    section: "image",
    fixed: false,
  },
];

export function normalizeProviderId(providerId) {
  const normalized = (providerId || "custom").trim().toLowerCase();
  return normalized || "custom";
}

export function catalogItem(providerId) {
  const id = normalizeProviderId(providerId);
  return providerCatalog.find((item) => item.id === id) || providerCatalog[0];
}

export function mergeProviderMeta(providers, configs = [], activeProviderId = "") {
  const backendById = new Map((providers || []).map((item) => [normalizeProviderId(item.id), item]));
  const configuredProviderIds = new Set((configs || []).map((item) => normalizeProviderId(item.provider)));
  const activeId = normalizeProviderId(activeProviderId);
  return providerCatalog
    .filter((item) => item.fixed || configuredProviderIds.has(item.id) || item.id === activeId)
    .map((item) => withProviderSearchText(item, configs, backendById));
}

export function addableProviderItems(providers) {
  const backendById = new Map((providers || []).map((item) => [normalizeProviderId(item.id), item]));
  return providerCatalog
    .filter((item) => !item.fixed)
    .map((item) => withProviderSearchText(item, [], backendById));
}

export function filterProviderItems(items, keyword) {
  const query = String(keyword || "").trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((item) => item.searchText.includes(query));
}

export function isImageProviderId(providerId) {
  return catalogItem(providerId).section === "image";
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

export function blankConfigForProvider(providerId, name = "") {
  const provider = normalizeProviderId(providerId);
  const meta = catalogItem(provider);
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

export function configVersionName(config) {
  return (config?.name || "").trim() || "未命名";
}

export function modelOptionsKey(config) {
  const provider = normalizeProviderId(config.provider);
  return [config.id || "", provider, config.api_format || "", config.base_url || "", config.api_key || ""]
    .map((item) => String(item).trim())
    .join("|");
}
