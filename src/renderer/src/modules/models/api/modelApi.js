import { desktopClient } from "../../../bridge/desktopClient.ts";
import { listenSetting, readSetting, writeSetting } from "../../../bridge/settingsClient.js";

const MODEL_SELECTION_KEY = "models.active";
const PROVIDERS = [
  { id: "custom", label: "自定义模型提供商" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "zhipu", label: "智谱开放平台" },
  { id: "zai", label: "Z.ai" },
  { id: "moonshot", label: "月之暗面" },
  { id: "openai_image", label: "OpenAI Images" },
  { id: "novelai_image", label: "NovelAI" },
];

const PROVIDER_DEFAULTS = {
  custom: { baseUrl: "", apiFormat: "responses" },
  deepseek: { baseUrl: "https://api.deepseek.com", apiFormat: "responses" },
  zhipu: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiFormat: "chat_completions" },
  zai: { baseUrl: "https://api.z.ai/api/paas/v4", apiFormat: "chat_completions" },
  moonshot: { baseUrl: "https://api.moonshot.cn/v1", apiFormat: "chat_completions" },
  openai_image: {
    baseUrl: "https://api.openai.com/v1",
    apiFormat: "chat_completions",
    model: "gpt-image-2",
    enabled: false,
    imageSettings: { width: 1024, height: 1536, quality: "auto", background: "auto" },
  },
  novelai_image: {
    baseUrl: "https://image.novelai.net",
    apiFormat: "chat_completions",
    model: "nai-diffusion-4-5-full",
    enabled: false,
    imageSettings: { width: 832, height: 1216, steps: 28, scale: 5, sampler: "k_euler_ancestral" },
  },
};

function createId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function normalizeModelConfig(config = {}) {
  const provider = (config.provider || "custom").trim().toLowerCase() || "custom";
  const providerDefaults = PROVIDER_DEFAULTS[provider];
  if (!providerDefaults) throw new Error(`未知模型提供商：${provider}`);
  const isDeepSeek = provider === "deepseek";
  return {
    id: config.id || createId("model"),
    name: config.name ?? (isDeepSeek ? "DeepSeek" : ""),
    provider,
    api_key: config.api_key ?? "",
    base_url: config.base_url ?? providerDefaults.baseUrl,
    proxy_url: config.proxy_url ?? "",
    model: config.model ?? (isDeepSeek ? "deepseek-chat" : providerDefaults.model || ""),
    model_options: Array.isArray(config.model_options) ? config.model_options : [],
    custom_headers: config.custom_headers && typeof config.custom_headers === "object" ? config.custom_headers : {},
    supports_tools: typeof config.supports_tools === "boolean" ? config.supports_tools : null,
    enabled: config.enabled ?? providerDefaults.enabled ?? true,
    image_settings: config.image_settings && typeof config.image_settings === "object"
      ? config.image_settings
      : { ...(providerDefaults.imageSettings || {}) },
    api_format: config.api_format ?? providerDefaults.apiFormat,
  };
}

function modelPayload(configs, selectedId = "") {
  const config = configs.find((item) => item.id === selectedId) || configs[0] || null;
  return { config, configs };
}

export function getModelMeta() {
  return Promise.resolve({ defaults: { language: "zh-CN" }, providers: PROVIDERS });
}

export function getModelConfig() {
  return desktopClient.request("query.models.list", {}).then((configs) => modelPayload(configs, configs[0]?.id));
}

export function saveModelConfig(config) {
  const next = normalizeModelConfig(config);
  return desktopClient.request("command.models.save", next).then((configs) => modelPayload(configs, next.id));
}

export function deleteModelConfig(configId) {
  return desktopClient.request("command.models.delete", { configId }).then((configs) => modelPayload(configs));
}

export function deleteModelProvider(provider, selectedConfigId = "") {
  return desktopClient.request("command.models.delete_provider", { provider })
    .then((configs) => modelPayload(configs, selectedConfigId));
}

export function fetchModelOptions(config) {
  return desktopClient.request("query.models.options", normalizeModelConfig(config));
}

export function testModelConnection(config) {
  return desktopClient.request("command.models.test_connection", normalizeModelConfig(config));
}

export function getActiveModelSelection() {
  return readSetting(MODEL_SELECTION_KEY);
}

export function saveActiveModelSelection(selection) {
  return writeSetting(MODEL_SELECTION_KEY, selection);
}

export async function listenActiveModelSelectionChanged(handler) {
  return listenSetting(MODEL_SELECTION_KEY, handler);
}
