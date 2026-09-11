import { useState } from "react";
import {
  deleteModelConfig as persistDeleteModelConfig,
  deleteModelProvider as persistDeleteModelProvider,
  fetchModelOptions,
  saveModelConfig as persistModelConfig,
  testModelConnection,
} from "../api/modelApi.js";
import { emptyConfig } from "../../../utils/constants/defaults.js";
import { modelOptionsKey } from "../model/modelProviderCatalog.js";

export function useModelRuntime({ setStatus }) {
  const [modelConfig, setModelConfig] = useState(emptyConfig);
  const [modelConfigs, setModelConfigs] = useState([]);
  const [modelOptionsByKey, setModelOptionsByKey] = useState({});

  function cachePersistedOptions(configs, replace = false) {
    setModelOptionsByKey((current) => {
      const configIds = new Set(configs.map((config) => String(config.id || "").trim()).filter(Boolean));
      const next = replace
        ? {}
        : Object.fromEntries(
            Object.entries(current).filter(([key]) => !configIds.has(key.split("|", 1)[0])),
          );
      for (const config of configs) {
        if (Array.isArray(config.model_options)) {
          next[modelOptionsKey(config)] = config.model_options;
        }
      }
      return next;
    });
  }

  function applyModelConfigPayload(data) {
    const configs = data.configs.map((item) => ({ ...emptyConfig, ...item }));
    const config = { ...emptyConfig, ...(data.config || configs[0] || {}) };
    setModelConfig(config);
    setModelConfigs(configs.length ? configs : config.id ? [config] : []);
    cachePersistedOptions(configs.length ? configs : config.id ? [config] : [], true);
    return { config, configs };
  }

  function applyModelMeta(data) {
    if (!data?.configs) return;
    applyModelConfigPayload(data);
  }

  async function saveModelConfig(nextConfig) {
    const payload = { ...emptyConfig, ...nextConfig };
    const saved = await persistModelConfig(payload);
    const { config: updated } = applyModelConfigPayload(saved);
    setStatus("模型配置已保存");
    return updated;
  }

  async function deleteModelConfig(configId) {
    const saved = await persistDeleteModelConfig(configId);
    const { config: updated } = applyModelConfigPayload(saved);
    setStatus("已删除模型配置");
    return updated;
  }

  async function loadModelOptions(config = modelConfig) {
    const data = await fetchModelOptions(config);
    const models = data.items;
    const savedConfig = { ...emptyConfig, ...data.config };
    const key = modelOptionsKey(savedConfig);
    setModelOptionsByKey((current) => ({ ...current, [key]: models }));
    setModelConfigs((current) => current.map((item) => (item.id === savedConfig.id ? savedConfig : item)));
    setModelConfig((current) => (current.id === savedConfig.id ? savedConfig : current));
    setStatus(`已读取 ${models.length} 个模型`);
    return models;
  }

  async function deleteModelProvider(providerId, selectedConfigId = "") {
    const saved = await persistDeleteModelProvider(providerId, selectedConfigId);
    const { config: updated } = applyModelConfigPayload(saved);
    setStatus("已删除模型入口");
    return updated;
  }

  async function probeModelOptions(config = modelConfig) {
    const data = await fetchModelOptions(config);
    return data.items;
  }

  async function testConnection(config = modelConfig) {
    const result = await testModelConnection(config);
    setStatus("模型连接测试成功");
    return result;
  }

  return {
    modelConfig,
    modelConfigs,
    modelOptionsByKey,
    applyModelMeta,
    saveModelConfig,
    deleteModelConfig,
    deleteModelProvider,
    loadModelOptions,
    probeModelOptions,
    testConnection,
  };
}
