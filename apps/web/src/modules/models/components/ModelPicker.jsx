import { sourceText } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheckOutlineRegular, MenuSurface, useAnchoredPosition } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPortal } from "react-dom";
import { ModelIdentityIcon } from "./ModelIdentityIcon.jsx";
import { ProviderLogo } from './ProviderLogo.jsx';
import { UnsavedChangesDialog } from "../../../ui/ui/UnsavedChangesDialog.jsx";
import { configProviderMeta, modelOptionsKey } from "../model/modelProviderCatalog.js";
import { modelParameterState } from "../model/modelConfigDraft.js";
import { reasoningEffortLabel } from '../model/modelReasoningOptions.js';
import { useModelCapabilities } from "../hooks/useModelCapabilities.js";
import { ModelParametersSection } from "./ModelParametersSection.jsx";
import { MobileChatModelPicker } from '../../../mobile/MobileChatModelPicker.jsx';
import { isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';
import {
  DshChevronDownIcon,
  DshCloseIcon,
  DshRefreshIcon,
  DshSearchIcon,
} from "../../../ui/icons/dshComposerIcons.jsx";

function configName(config, tUi = sourceText) {
  return String(config?.name || config?.provider || "").trim() || tUi("未命名");
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
    byId.set(defaultModel, { id: defaultModel, name: defaultModel });
  }
  return [...byId.values()];
}

export function configDefaultModel(config, modelOptionsByKey) {
  const configured = String(config?.model || "").trim();
  if (configured) return configured;
  return modelItems(config, modelOptionsByKey)[0]?.id || "";
}

function cloneConfig(config) {
  return {
    ...config,
    model_options: (config.model_options || []).map((option) => ({ ...option })),
  };
}

export function ModelPicker({
  configs = [],
  selectedConfigId,
  selectedModel,
  modelOptionsByKey,
  title: titleSource,
  allowFollowMain = false,
  elevated = false,
  renderTrigger,
  renderModelLabel,
  onLoadModels,
  onSelect,
  onSaveModelConfig,
  onNotify,
}) {
  const tUi = useProductTranslation();
  const title = titleSource === undefined ? tUi("选择模型") : titleSource;
  const mobile = isMobilePresentation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("models");
  const anchorRef = useRef(null), modelsPanelRef = useRef(null), parametersPanelRef = useRef(null), generationRef = useRef(0);
  // Re-measure each pane before paint when its content height changes.
  const panelRef = tab === 'parameters' ? parametersPanelRef : modelsPanelRef;
  const position = useAnchoredPosition({ open: open && !mobile, anchorRef, panelRef, side: 'top', align: 'end', gap: 12, margin: 12 });
  const [changedConfigIds, setChangedConfigIds] = useState([]);
  const [focusedConfigId, setFocusedConfigId] = useState("");
  const [query, setQuery] = useState("");
  const [loadingConfigId, setLoadingConfigId] = useState("");
  const [saving, setSaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [draftConfigs, setDraftConfigs] = useState([]);
  const [draftSelection, setDraftSelection] = useState({ capability: "chat", configId: "", model: "" });
  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) || null,
    [configs, selectedConfigId],
  );
  const committedConfig = selectedConfig;
  const committedSelection = useMemo(() => {
    if (allowFollowMain && !selectedConfig) {
      return { capability: "chat", configId: "", model: "" };
    }
    return {
      capability: "chat",
      configId: committedConfig?.id || "",
      model: String((selectedConfig ? selectedModel : "") || configDefaultModel(committedConfig, modelOptionsByKey)).trim(),
    };
  }, [allowFollowMain, committedConfig, modelOptionsByKey, selectedConfig, selectedModel]);
  const activeConfigs = open ? draftConfigs : configs;
  const draftSelectedConfig = activeConfigs.find((config) => config.id === draftSelection.configId) || null;
  const followingMain = allowFollowMain && !draftSelectedConfig;
  const focusedConfig = activeConfigs.find((config) => config.id === focusedConfigId)
    || draftSelectedConfig
    || activeConfigs[0]
    || null;
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
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return activeConfigs.map(config => ({ config, models: modelItems(config, open ? {} : modelOptionsByKey).filter(model =>
      !needle || `${configName(config, tUi)} ${config.provider || ''} ${model.name} ${model.id}`.toLocaleLowerCase().includes(needle))
    })).filter(group => group.models.length);
  }, [activeConfigs, modelOptionsByKey, open, query, tUi]);
  const selectedModelId = followingMain
    ? ""
    : String(draftSelection.model || configDefaultModel(draftSelectedConfig, modelOptionsByKey)).trim();
  const parameterForm = { ...draftSelectedConfig, model: selectedModelId };
  const parameterState = modelParameterState(parameterForm);
  const modelCapabilities = useModelCapabilities(parameterForm, selectedModelId);
  const hasChanges = changedConfigIds.length > 0 || draftSelection.configId !== committedSelection.configId
    || draftSelection.model !== committedSelection.model;

  useEffect(() => {
    if (!open || mobile) return;
    const previous = document.activeElement;
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => { window.cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, mobile]);

  useEffect(() => {
    if (!open || mobile) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || leaveDialogOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestClosePicker();
    };
    const closeOutside = event => {
      if (leaveDialogOpen || anchorRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      requestClosePicker();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    document.addEventListener('pointerdown', closeOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape, true); document.removeEventListener('pointerdown', closeOutside); };
  }, [hasChanges, leaveDialogOpen, open, saving, mobile, panelRef]);

  function openPicker() {
    if (open) { requestClosePicker(); return; }
    generationRef.current += 1;
    const nextConfigs = configs.map(config => cloneConfig({ ...config, model_options: modelItems(config, modelOptionsByKey) }));
    setDraftConfigs(nextConfigs);
    setChangedConfigIds([]);
    setTab("models");
    setDraftSelection(committedSelection);
    setFocusedConfigId(committedSelection.configId || nextConfigs[0]?.id || "");
    setQuery("");
    setLeaveDialogOpen(false);
    setLeaveError("");
    setOpen(true);
  }

  function requestClosePicker() {
    if (saving) return;
    if (hasChanges) {
      setLeaveError("");
      setLeaveDialogOpen(true);
      return;
    }
    generationRef.current += 1;
    setOpen(false);
  }

  function discardAndClosePicker() {
    if (saving) return;
    setLeaveDialogOpen(false);
    setLeaveError("");
    generationRef.current += 1;
    setOpen(false);
  }

  function chooseModel(config, modelId) {
    setDraftSelection({ capability: "chat", configId: config.id, model: modelId });
    setFocusedConfigId(config.id);
  }

  function updateParameters(patch) {
    if (!draftSelectedConfig || !selectedModelId) return;
    const id = draftSelectedConfig.id;
    setDraftConfigs(current => current.map(config => {
      if (config.id !== id) return config;
      const options = modelItems(config, {});
      return { ...config, model_options: options.map(option => option.id === selectedModelId ? { ...option, ...patch } : option) };
    }));
    setChangedConfigIds(current => current.includes(id) ? current : [...current, id]);
  }

  function chooseConfig(config) {
    const modelId = configDefaultModel(config, modelOptionsByKey);
    setFocusedConfigId(config.id);
    setQuery("");
    if (!modelId) {
      onNotify?.("error", tUi("这个提供商当前没有可用模型"));
      return;
    }
    chooseModel(config, modelId);
  }

  function followMainModel() {
    setDraftSelection({ capability: "chat", configId: "", model: "" });
  }

  async function refreshModels() {
    if (!activeConfigs.length || loadingConfigId) return;
    const targets = mobile ? [focusedConfig].filter(Boolean) : activeConfigs;
    const generation = generationRef.current;
    setLoadingConfigId(mobile ? focusedConfig.id : '*');
    try {
      const results = await Promise.allSettled(targets.map(async config => ({ config, models: await onLoadModels?.(config) })));
      if (generation !== generationRef.current) return;
      const failures = [];
      for (const result of results) {
        if (result.status === 'rejected') { failures.push(result.reason); continue; }
        const { config, models } = result.value;
        if (!Array.isArray(models)) continue;
        const changed = JSON.stringify(config.model_options) !== JSON.stringify(models);
        setDraftConfigs(current => current.map(item => item.id === config.id ? { ...item, model_options: models.map(model => ({ ...model })) } : item));
        if (changed) setChangedConfigIds(current => current.includes(config.id) ? current : [...current, config.id]);
      }
      if (failures.length) throw new AggregateError(failures, failures.map(error => error.message || '读取模型失败').join('；'));
    } catch (error) {
      onNotify?.("error", error.message || tUi("刷新模型目录失败"));
    } finally {
      setLoadingConfigId("");
    }
  }

  async function saveChanges() {
    if (!hasChanges || saving) return false;
    setSaving(true);
    setLeaveError("");
    try {
      for (const id of changedConfigIds) {
        const config = draftConfigs.find(config => config.id === id);
        if (config.model_options.some(option => modelParameterState({ ...config, model: option.id }).parameterError)) {
          throw new DesktopError(ELECKOI_FAILURE_CODES.modelConfigInvalid, "模型参数超出有效范围。", { field: "模型参数", what: "模型参数" });
        }
      }
      if (changedConfigIds.length && !onSaveModelConfig) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, "模型参数保存功能不可用。", { what: "模型参数保存入口" });
      for (const id of changedConfigIds) await onSaveModelConfig(draftConfigs.find(config => config.id === id));
      setChangedConfigIds([]);
      await onSelect?.(draftSelection);
      setLeaveDialogOpen(false);
      generationRef.current += 1;
      setOpen(false);
      onNotify?.("success", tUi("模型选择已保存，将从下一次请求生效。"));
      return true;
    } catch (error) {
      const message = error.message || tUi("保存模型选择失败");
      setLeaveError(message);
      onNotify?.("error", message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const triggerModelId = (selectedConfig ? selectedModel : '') || committedConfig?.model || '';
  const triggerModel = modelItems(committedConfig, modelOptionsByKey).find(model => model.id === triggerModelId);
  const triggerLabel = triggerModel?.name || triggerModelId || tUi("选择模型");
  const label = (config, model, placement, selected = false) => renderModelLabel?.({
    provider: { id: config.id, name: configName(config, tUi) }, model: { ...model, name: model.name || model.id }, placement, selected,
  }) ?? model.name ?? model.id;
  const selectedOption = parameterState.activeModelOption;
  const triggerEfforts = triggerModel?.reasoningEfforts;
  const triggerEffort = triggerModel?.reasoningEffort;
  const trigger = renderTrigger ? renderTrigger({
    open,
    openPicker,
    selectedConfig,
    selectedModel: selectedConfig ? selectedModel : "",
  }) : (
    <button
      className={`chat-model-trigger ${open ? "active" : ""}`}
      type="button"
      title={tUi("选择模型")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={openPicker}
    >
      <ModelIdentityIcon
        modelName={triggerModelId ? triggerLabel : ""}
        providerId={committedConfig?.provider}
        className="chat-model-trigger-icon"
      />
      <span className="chat-model-trigger-label">{committedConfig && triggerModel ? label(committedConfig, triggerModel, 'trigger', true) : triggerLabel}</span>
      {triggerEffort && triggerEfforts && Object.hasOwn(triggerEfforts, triggerEffort) ? <span className="chat-model-trigger-effort">{reasoningEffortLabel(triggerEffort, tUi)}</span> : null}
      <DshChevronDownIcon />
    </button>
  );

  return (
    <div className={`chat-model-picker${mobile ? ' is-mobile' : ''}`} ref={anchorRef}>
      {trigger}
      {open && mobile ? <MobileChatModelPicker title={title} elevated={elevated} configs={activeConfigs} focusedConfig={focusedConfig}
        selectedConfig={draftSelectedConfig} selectedModelId={selectedModelId} followingMain={followingMain} allowFollowMain={allowFollowMain}
        tab={tab} setTab={setTab} query={query} setQuery={setQuery} visibleModels={visibleModels} loading={Boolean(loadingConfigId)} saving={saving}
        hasChanges={hasChanges} canEditParameters={Boolean(onSaveModelConfig)} parameterForm={parameterForm} parameterState={parameterState}
        modelCapabilities={modelCapabilities} onParameters={updateParameters} onChooseConfig={chooseConfig} onChooseModel={chooseModel}
        onOpenConfig={config => { setFocusedConfigId(config.id); setQuery(''); }} onFollowMain={followMainModel} onRefresh={refreshModels}
        onSave={saveChanges} onClose={discardAndClosePicker} beforeClose={() => { if (hasChanges) { requestClosePicker(); return false; } return true; }} selectionIndicator={ModelSelectionIndicator}
      /> : open ? createPortal(
          <MenuSurface ref={panelRef} tabIndex={-1} className={`chat-model-panel is-compact${tab === 'parameters' ? ' is-parameters' : ''}${elevated ? ' is-elevated' : ''}`} role="dialog" aria-modal="false" aria-label={titleSource === undefined ? tUi("模型配置") : title} aria-busy={saving}
            style={position || { visibility: 'hidden', left: 0, top: 0 }}>
            <header>
              <h2>{titleSource === undefined ? tUi("模型配置") : title}</h2>
              <button type="button" className="chat-model-close" aria-label={tUi("关闭")} disabled={saving} onClick={requestClosePicker}>
                <DshCloseIcon size={16} />
              </button>
            </header>

            <div className="chat-model-content">
            {onSaveModelConfig ? <div className="chat-model-tabs" role="tablist" aria-label={tUi("模型设置")}>
              <button type="button" role="tab" aria-selected={tab === "models"} onClick={() => setTab("models")}>{tUi("模型")}</button>
              <button type="button" role="tab" aria-selected={tab === "parameters"} onClick={() => setTab("parameters")}>{tUi("参数")}</button>
            </div> : null}
            {tab === "parameters" ? <div className="chat-model-parameters">
              <div className="chat-model-current">{draftSelectedConfig && selectedModelId ? label(draftSelectedConfig, selectedOption || { id: selectedModelId, name: selectedModelId }, 'menu', true) : tUi("请先选择模型")}</div>
              <ModelParametersSection form={parameterForm} {...parameterState} modelCapabilities={modelCapabilities} onChange={updateParameters} picker />
            </div> : <div className="chat-model-browser">
              <div className="chat-model-list-tools">
                <label><DshSearchIcon size={16} /><input type="search" aria-label={tUi("搜索模型或提供商")} value={query} onChange={event => setQuery(event.target.value)} placeholder={tUi("搜索模型或提供商")} /></label>
                <button type="button" aria-label={tUi("刷新模型")} title={tUi("刷新模型")} disabled={!activeConfigs.length || Boolean(loadingConfigId) || saving} onClick={refreshModels}><DshRefreshIcon size={16} /></button>
              </div>
              <div className="chat-model-list">
                {allowFollowMain ? <section className="chat-model-provider-group chat-model-follow-group">
                  <button type="button" className={`chat-model-row${followingMain ? ' active' : ''}`} aria-pressed={followingMain} disabled={saving} onClick={followMainModel}><span className="chat-model-name">{tUi("跟随主模型")}</span>{followingMain ? <IconCheckOutlineRegular size={16} /> : null}</button>
                </section> : null}
                {visibleGroups.map(({ config, models }) => (
                  <section className="chat-model-provider-group" key={config.id}>
                    <h3>
                      <ProviderLogo provider={configProviderMeta(config, undefined, tUi)} className="chat-model-provider-icon" />
                      {configName(config, tUi)}
                    </h3>
                    {models.map(model => {
                      const selected = draftSelectedConfig?.id === config.id && selectedModelId === model.id;
                      return <button type="button" className={`chat-model-row${selected ? ' active' : ''}`} aria-pressed={selected} disabled={saving} key={model.id} onClick={() => chooseModel(config, model.id)}>
                        <span className="chat-model-name">{label(config, model, 'option', selected)}</span>
                        {selected ? <IconCheckOutlineRegular size={16} /> : null}
                      </button>;
                    })}
                  </section>
                ))}
                {!visibleGroups.length ? <p className="chat-model-empty">{query ? tUi("没有匹配模型") : activeConfigs.length ? tUi("当前提供商没有可用模型") : tUi("请先在 DSH 模型设置中配置模型")}</p> : null}
              </div>
            </div>}
            </div>

            <footer className="chat-model-actions">
              <button type="button" className="chat-model-cancel" disabled={saving} onClick={requestClosePicker}>{tUi("取消")}</button>
              <button type="button" className="chat-model-save" disabled={!hasChanges || saving} onClick={saveChanges}>
                {saving ? tUi("保存中…") : tUi("保存")}
              </button>
            </footer>
          </MenuSurface>,
        document.body,
      ) : null}
      <UnsavedChangesDialog
        open={leaveDialogOpen}
        title={tUi("保存修改？")}
        description={tUi("离开前是否保存模型选择和参数修改？")}
        error={leaveError}
        saving={saving}
        onCancel={() => {
          setLeaveDialogOpen(false);
          setLeaveError("");
        }}
        onDiscard={discardAndClosePicker}
        onSave={saveChanges}
      />
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
