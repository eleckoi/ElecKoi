import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModelIdentityIcon } from "./ModelIdentityIcon.jsx";
import { catalogItem, isImageProviderId, modelOptionsKey, normalizeProviderId } from "../model/modelProviderCatalog.js";
import {
  DshChevronDownIcon,
  DshCloseIcon,
  DshRefreshIcon,
  DshSearchIcon,
} from "../../../ui/icons/dshComposerIcons.jsx";

const REASONING_EFFORTS = [
  { id: "", label: "跟随模型" },
  { id: "off", label: "关闭" },
  { id: "minimal", label: "极低" },
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
  { id: "xhigh", label: "极高" },
  { id: "max", label: "最高" },
];

function configName(config) {
  return String(config?.name || "").trim() || "未命名";
}

function modelItems(config, modelOptionsByKey) {
  if (!config) return [];
  const cached = modelOptionsByKey?.[modelOptionsKey(config)] || [];
  const byId = new Map();
  for (const item of [...(config.model_options || []), ...cached]) {
    const id = String(item?.id || item?.name || "").trim();
    if (id) byId.set(id, { ...byId.get(id), ...item, id, name: item?.name || id });
  }
  const defaultModel = String(config.model || "").trim();
  if (defaultModel && !byId.has(defaultModel)) {
    byId.set(defaultModel, { id: defaultModel, name: defaultModel, isUserAdded: true });
  }
  return [...byId.values()];
}

function emptyModelsText(config) {
  if (!config) return "没有模型配置";
  if (!String(config.api_key || "").trim()) return "请先在模型库补全连接";
  return "刷新模型列表";
}

function parameterDraft(option) {
  return {
    supportsImageInput: option?.supportsImageInput === true,
    contextWindowTokens: option?.contextWindowTokens ?? "",
    autoCompactTokenLimit: option?.autoCompactTokenLimit ?? "",
    maxOutputTokens: option?.maxOutputTokens ?? "",
    reasoningEffort: option?.reasoningEffort || "",
    temperatureEnabled: option?.temperature !== null,
    temperature: option?.temperature ?? 1,
    topPEnabled: option?.topP !== null,
    topP: option?.topP ?? 1,
  };
}

function optionalNumber(value) {
  if (String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizedParameters(draft, automaticContextWindow) {
  const contextWindowTokens = optionalNumber(draft.contextWindowTokens);
  const autoCompactTokenLimit = optionalNumber(draft.autoCompactTokenLimit);
  const maxOutputTokens = optionalNumber(draft.maxOutputTokens);
  const temperature = draft.temperatureEnabled ? optionalNumber(draft.temperature) : null;
  const topP = draft.topPEnabled ? optionalNumber(draft.topP) : null;
  const context = contextWindowTokens ?? automaticContextWindow;
  const invalid = [contextWindowTokens, autoCompactTokenLimit, maxOutputTokens, temperature, topP].some(Number.isNaN)
    || (contextWindowTokens !== null && (contextWindowTokens < 4096 || contextWindowTokens > 4_000_000))
    || (autoCompactTokenLimit !== null && (autoCompactTokenLimit < 1024 || autoCompactTokenLimit > context))
    || (maxOutputTokens !== null && (maxOutputTokens < 1 || maxOutputTokens > context))
    || (temperature !== null && (temperature < 0 || temperature > 2))
    || (topP !== null && (topP < 0 || topP > 1));
  if (invalid) return null;
  return {
    supportsImageInput: draft.supportsImageInput,
    contextWindowTokens,
    autoCompactTokenLimit,
    maxOutputTokens,
    reasoningEffort: draft.reasoningEffort || null,
    temperature,
    topP,
  };
}

export function ModelPicker({
  configs = [],
  selectedConfigId,
  selectedModel,
  modelParameters,
  modelOptionsByKey,
  title = "选择模型",
  allowFollowMain = false,
  showStream = true,
  elevated = false,
  renderTrigger,
  onLoadModels,
  onSelect,
  onSaveModelConfig,
  onNotify,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("models");
  const [focusedConfigId, setFocusedConfigId] = useState("");
  const [query, setQuery] = useState("");
  const [loadingConfigId, setLoadingConfigId] = useState("");
  const [savingParameters, setSavingParameters] = useState(false);
  const saveSequence = useRef(Promise.resolve());
  const chatConfigs = useMemo(
    () => configs.filter((config) => !isImageProviderId(config.provider)),
    [configs],
  );
  const selectedChatConfig = useMemo(
    () => chatConfigs.find((config) => config.id === selectedConfigId) || null,
    [chatConfigs, selectedConfigId],
  );
  const followingMain = allowFollowMain && !selectedChatConfig;

  const selectedConfig = useMemo(
    () => selectedChatConfig || chatConfigs[0] || null,
    [chatConfigs, selectedChatConfig],
  );
  const focusedConfig = chatConfigs.find((config) => config.id === focusedConfigId) || selectedConfig;
  const focusedModels = useMemo(
    () => modelItems(focusedConfig, modelOptionsByKey),
    [focusedConfig, modelOptionsByKey],
  );
  const visibleModels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? focusedModels.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase().includes(needle))
      : focusedModels;
  }, [focusedModels, query]);
  const groupedConfigs = useMemo(() => {
    const groups = new Map();
    for (const config of chatConfigs) {
      const providerId = normalizeProviderId(config.provider);
      if (!groups.has(providerId)) groups.set(providerId, []);
      groups.get(providerId).push(config);
    }
    return [...groups].map(([providerId, items]) => ({ provider: catalogItem(providerId), items }));
  }, [chatConfigs]);

  const parameterModelId = followingMain
    ? ""
    : String((selectedChatConfig ? selectedModel : "") || selectedConfig?.model || "").trim();
  const selectedOptions = useMemo(
    () => modelItems(selectedConfig, modelOptionsByKey),
    [modelOptionsByKey, selectedConfig],
  );
  const selectedOption = selectedOptions.find((item) => item.id === parameterModelId) || null;
  const [draft, setDraft] = useState(() => parameterDraft(selectedOption));
  const automaticContextWindow = normalizeProviderId(selectedConfig?.provider) === "deepseek"
    && (!selectedConfig?.base_url || selectedConfig.base_url.includes("api.deepseek.com"))
    ? 1_000_000
    : 272_000;

  useEffect(() => {
    setDraft(parameterDraft(selectedOption));
  }, [parameterModelId, selectedConfig?.id, selectedOption]);

  useEffect(() => {
    if (!open) return undefined;
    setFocusedConfigId(selectedConfig?.id || chatConfigs[0]?.id || "");
    setQuery("");
    setTab("models");
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [open, selectedConfig?.id]);

  function chooseModel(config, modelId) {
    onSelect?.({
      capability: "chat",
      configId: config.id,
      model: modelId,
      parameters: modelParameters || {},
    });
    setFocusedConfigId(config.id);
  }

  function followMainModel() {
    onSelect?.({ capability: "chat", configId: "", model: "", parameters: {} });
    setTab("models");
  }

  async function refreshModels() {
    if (!focusedConfig || loadingConfigId) return;
    setLoadingConfigId(focusedConfig.id);
    try {
      await onLoadModels?.(focusedConfig);
    } catch (error) {
      onNotify?.("error", error.message || "刷新模型列表失败");
    } finally {
      setLoadingConfigId("");
    }
  }

  function updateDraft(patch, persist = false) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (persist) saveParameters(next);
  }

  function saveParameters(nextDraft = draft) {
    if (!selectedConfig || !parameterModelId || !onSaveModelConfig) return;
    const normalized = normalizedParameters(nextDraft, automaticContextWindow);
    if (!normalized) {
      onNotify?.("error", "参数超出有效范围");
      return;
    }
    const base = selectedOption || { id: parameterModelId, name: parameterModelId, isUserAdded: true };
    const nextOption = { ...base, ...normalized, id: parameterModelId, name: base.name || parameterModelId };
    const options = [...(selectedConfig.model_options || [])];
    const index = options.findIndex((item) => (item.id || item.name) === parameterModelId);
    if (index >= 0) options[index] = nextOption;
    else options.push(nextOption);
    setSavingParameters(true);
    saveSequence.current = saveSequence.current
      .then(() => onSaveModelConfig({ ...selectedConfig, model_options: options }))
      .catch((error) => onNotify?.("error", error.message || "保存模型参数失败"))
      .finally(() => setSavingParameters(false));
  }

  function toggleStream() {
    if (!selectedConfig || !parameterModelId) return;
    onSelect?.({
      capability: "chat",
      configId: selectedConfig.id,
      model: parameterModelId,
      parameters: { ...(modelParameters || {}), stream: !modelParameters?.stream },
    });
  }

  const triggerLabel = (selectedChatConfig ? selectedModel : "") || selectedConfig?.model || "选择模型";
  const trigger = renderTrigger ? renderTrigger({
    open,
    openPicker: () => setOpen(true),
    selectedConfig: selectedChatConfig,
    selectedModel: selectedChatConfig ? selectedModel : "",
  }) : (
    <button
      className={`chat-model-trigger ${open ? "active" : ""}`}
      type="button"
      title="选择模型"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <ModelIdentityIcon
        modelName={triggerLabel === "选择模型" ? "" : triggerLabel}
        providerId={selectedConfig?.provider}
        className="chat-model-trigger-icon"
      />
      <span className="chat-model-trigger-label">{triggerLabel}</span>
      <DshChevronDownIcon />
    </button>
  );
  return (
    <div className="chat-model-picker">
      {trigger}

      {open ? createPortal(
        <div className={`chat-model-backdrop${elevated ? " is-elevated" : ""}`} role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="chat-model-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className="chat-model-title">
                <strong>{title}</strong>
                {parameterModelId ? (
                  <span>
                    <ModelIdentityIcon
                      modelName={parameterModelId}
                      providerId={selectedConfig?.provider}
                      className="chat-model-title-icon"
                    />
                    {parameterModelId}
                  </span>
                ) : null}
              </div>
              <button type="button" className="chat-model-close" aria-label="关闭" onClick={() => setOpen(false)}>
                <DshCloseIcon size={20} />
              </button>
            </header>

            <nav className="chat-model-tabs" aria-label="模型选择页面">
              <button type="button" className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>模型</button>
              <button type="button" className={tab === "parameters" ? "active" : ""} disabled={!parameterModelId} onClick={() => setTab("parameters")}>参数</button>
            </nav>

            {tab === "models" ? (
              <div className="chat-model-browser">
                <div className="chat-model-configs">
                  {allowFollowMain ? <section className="chat-model-provider-group chat-model-follow-group">
                    <button type="button" className={followingMain ? "active" : ""} aria-pressed={followingMain} onClick={followMainModel}>
                      <ModelSelectionIndicator selected={followingMain} />
                      <span className="chat-model-config-copy"><strong>跟随主模型</strong><small>使用当前对话选择的模型与参数</small></span>
                    </button>
                  </section> : null}
                  {groupedConfigs.length ? groupedConfigs.map((group) => (
                    <section className="chat-model-provider-group" key={group.provider.id}>
                      <h3>
                        <ModelIdentityIcon modelName="" providerId={group.provider.id} className="chat-model-provider-icon" />
                        {group.provider.label}
                      </h3>
                      {group.items.map((config) => (
                        <button
                          type="button"
                          key={config.id}
                          className={focusedConfig?.id === config.id ? "active" : ""}
                          aria-pressed={selectedConfig?.id === config.id}
                          onClick={() => { setFocusedConfigId(config.id); setQuery(""); }}
                        >
                          <ModelSelectionIndicator selected={selectedConfig?.id === config.id} />
                          <span className="chat-model-config-copy"><strong>{configName(config)}</strong><small>{config.model || "未选择模型"}</small></span>
                        </button>
                      ))}
                    </section>
                  )) : <p className="chat-model-empty">没有聊天模型配置</p>}
                </div>

                <div className="chat-model-list-pane">
                  <div className="chat-model-list-tools">
                    <label>
                      <DshSearchIcon size={16} />
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" />
                    </label>
                    <button type="button" aria-label="刷新模型" title="刷新模型" disabled={!focusedConfig || Boolean(loadingConfigId)} onClick={refreshModels}>
                      <DshRefreshIcon size={17} />
                    </button>
                  </div>
                  <div className="chat-model-list">
                    {visibleModels.length ? visibleModels.map((model) => {
                      const selected = selectedConfig?.id === focusedConfig?.id && parameterModelId === model.id;
                      return <button type="button" className={selected ? "active" : ""} aria-pressed={selected} key={model.id} onClick={() => chooseModel(focusedConfig, model.id)}>
                        <ModelSelectionIndicator selected={selected} />
                        <span className="chat-model-name">{model.name}</span>
                      </button>;
                    }) : <p className="chat-model-empty">{query ? "没有匹配模型" : emptyModelsText(focusedConfig)}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-model-parameters" aria-busy={savingParameters}>
                <ParameterGroup title="连接与能力">
                  <ParameterSwitch label="此模型支持图片" checked={draft.supportsImageInput} onChange={(checked) => updateDraft({ supportsImageInput: checked }, true)} />
                  {showStream ? <ParameterSwitch label="流式输出" checked={Boolean(modelParameters?.stream)} onChange={toggleStream} /> : null}
                </ParameterGroup>
                <ParameterGroup title="推理">
                  <ParameterSelect label="推理强度" value={draft.reasoningEffort} options={REASONING_EFFORTS} onChange={(value) => updateDraft({ reasoningEffort: value }, true)} />
                </ParameterGroup>
                <ParameterGroup title="上限">
                  <ParameterNumber label="上下文窗口" value={draft.contextWindowTokens} placeholder={automaticContextWindow} min={4096} max={4_000_000} onChange={(value) => updateDraft({ contextWindowTokens: value })} onCommit={saveParameters} />
                  <ParameterNumber label="自动压缩阈值" value={draft.autoCompactTokenLimit} placeholder={Math.floor((optionalNumber(draft.contextWindowTokens) || automaticContextWindow) * 0.8)} min={1024} onChange={(value) => updateDraft({ autoCompactTokenLimit: value })} onCommit={saveParameters} />
                  <ParameterNumber label="最大输出" value={draft.maxOutputTokens} placeholder="自动" min={1} onChange={(value) => updateDraft({ maxOutputTokens: value })} onCommit={saveParameters} />
                </ParameterGroup>
                <ParameterGroup title="采样">
                  <ParameterNumber label="温度" value={draft.temperature} min={0} max={2} step={0.01} disabled={!draft.temperatureEnabled} toggle={draft.temperatureEnabled} onToggle={(checked) => updateDraft({ temperatureEnabled: checked }, true)} onChange={(value) => updateDraft({ temperature: value })} onCommit={saveParameters} />
                  <ParameterNumber label="Top P" value={draft.topP} min={0} max={1} step={0.01} disabled={!draft.topPEnabled} toggle={draft.topPEnabled} onToggle={(checked) => updateDraft({ topPEnabled: checked }, true)} onChange={(value) => updateDraft({ topP: value })} onCommit={saveParameters} />
                </ParameterGroup>
              </div>
            )}
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function ModelSelectionIndicator({ selected }) {
  return <span className={`chat-model-selection${selected ? " selected" : ""}`} aria-hidden="true">
    {selected ? <svg viewBox="0 0 14 14" fill="none">
      <path d="M2.5 7.2 5.65 10.25 11.55 3.85" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg> : null}
  </span>;
}

function ParameterGroup({ title, children }) {
  return <section className="chat-model-parameter-group"><h3>{title}</h3><div>{children}</div></section>;
}

function ParameterSelect({ label, value, options, onChange }) {
  return <label className="chat-model-parameter-row"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>;
}

function ParameterSwitch({ label, checked, onChange }) {
  return <label className="chat-model-parameter-row"><span>{label}</span><input className="chat-model-switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ParameterNumber({ label, value, placeholder, min, max, step = 1, disabled, toggle, onToggle, onChange, onCommit }) {
  return <label className="chat-model-parameter-row"><span>{label}</span><span className="chat-model-number-control"><input type="number" value={value} placeholder={String(placeholder ?? "")} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.value)} onBlur={() => onCommit()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{onToggle ? <input className="chat-model-switch" type="checkbox" checked={toggle} onChange={(event) => onToggle(event.target.checked)} /> : null}</span></label>;
}
