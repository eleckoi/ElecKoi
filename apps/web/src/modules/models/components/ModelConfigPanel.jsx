import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  addableProviderItems,
  configurationItems,
  configProviderMeta,
  modelProviderSections,
  modelOptionsKey,
  normalizeProviderId,
} from "../model/modelProviderCatalog.js";
import {
  initialConfigForProvider,
  imageSettingsError,
  mergeModelOptions,
  modelParameterState,
  normalizedConfigs,
  removeUserAddedModel,
} from "../model/modelConfigDraft.js";
import { useModelCapabilities } from "../hooks/useModelCapabilities.js";
import { ModelConfigDetail } from "./ModelConfigDetail.jsx";
import { ModelProviderDeleteDialog } from "./ModelProviderDeleteDialog.jsx";
import { ModelProviderSidebar } from "./ModelProviderSidebar.jsx";
import { UnsavedChangesDialog } from "../../../ui/ui/UnsavedChangesDialog.jsx";
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from "../../settings/index.js";

export const ModelConfigPanel = forwardRef(function ModelConfigPanel({
  config,
  configs = [],
  providers = [],
  modelOptionsByKey = {},
  onSave,
  onRevealApiKey,
  onDeleteConfig,
  onFetchModels,
  onNotify,
  onDirtyChange,
  renderEditor,
  renderDetail,
  renderLayout,
  showHeader = true,
  navigationGuardRef,
}, ref) {
  const tUi = useProductTranslation();
  const [form, setForm] = useState(config);
  const [draftConfigs, setDraftConfigs] = useState([]);
  const draftBaselines = useRef(new Map());
  const [deleteError, setDeleteError] = useState(null);
  const [collapsedGroups, setCollapsedGroups, collapseStateReady] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.models,
    { general: false },
    localizeUiCopy(modelProviderSections, tUi).map((section) => section.id),
  );
  const [deleting, setDeleting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(Boolean(config.draftKey));
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [confirmDeleteConfig, setConfirmDeleteConfig] = useState(false);
  const [deleteTargetConfig, setDeleteTargetConfig] = useState(null);
  const [localModelOptions, setLocalModelOptions] = useState({ key: "", items: [] });
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [manualModelName, setManualModelName] = useState("");
  const [draftHeader, setDraftHeader] = useState({ name: "", value: "" });
  const loadingModelsRef = useRef(false);
  const formRef = useRef(config);
  const isDirtyRef = useRef(Boolean(config.draftKey));
  const modelPickerRef = useRef(null);
  const manualModelRef = useRef(null);
  const pendingDraftActionRef = useRef(null);

  function showNotice(type, text) {
    onNotify?.(type, text);
  }

  useImperativeHandle(ref, () => ({
    save: saveCurrentConfig,
  }));

  useEffect(() => {
    if (!navigationGuardRef) return;
    navigationGuardRef.current = requestDraftReplacement;
    return () => { navigationGuardRef.current = null; };
  }, [navigationGuardRef]);

  useEffect(() => {
    const current = formRef.current || {};
    if (current === config) return;

    const sameSavedConfig = Boolean(current.id && config.id && current.id === config.id);
    const sameDraftConfig =
      Boolean(!current.id && config.id) &&
      normalizeProviderId(current.provider) === normalizeProviderId(config.provider) &&
      String(current.base_url || "").trim() === String(config.base_url || "").trim() &&
      String(current.api_key || "").trim() === String(config.api_key || "").trim();

    if (isDirtyRef.current && (sameSavedConfig || sameDraftConfig)) {
      const merged = { ...current, id: current.id || config.id };
      formRef.current = merged;
      setForm(merged);
      return;
    }

    formRef.current = config;
    setForm(config);
    isDirtyRef.current = Boolean(config.draftKey);
    setIsDirty(Boolean(config.draftKey));
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    setManualModelOpen(false);
    setManualModelName("");
    setDraftHeader({ name: "", value: "" });
  }, [config]);

  useEffect(() => {
    if (config.draftKey && config.builtin) void fetchModels();
  }, [config.draftKey]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const activeProvider = configProviderMeta(form, providers, tUi);
  const activeProviderId = normalizeProviderId(form.provider);
  const isImageProvider = activeProvider.section === "image";
  const createProviderItems = useMemo(() => addableProviderItems(providers, tUi), [providers, tUi]);
  const configItems = useMemo(() => normalizedConfigs(configs), [configs]);
  const allConfigs = useMemo(() => {
    const items = [...configItems, ...draftConfigs.filter(draft => !configItems.some(item => item.id === draft.id))];
    const key = form.draftKey;
    const index = items.findIndex(item => key ? item.draftKey === key : item.id === form.id);
    if (index >= 0) items[index] = form;
    else if (form.id) items.push(form);
    return items;
  }, [configItems, draftConfigs, form]);
  const providerItems = useMemo(() => configurationItems(allConfigs, providers, tUi), [allConfigs, providers, tUi]);

  useEffect(() => {
    const current = formRef.current || {};
    if (isDirtyRef.current || !current.id) return;
    const latest = configItems.find((item) => item.id === current.id);
    if (!latest) return;
    formRef.current = latest;
    setForm(latest);
  }, [configItems]);

  const hasUnsavedChanges = isDirty;
  const currentModelOptionsKey = modelOptionsKey(form);
  const scopedModelOptions = localModelOptions.key === currentModelOptionsKey
    ? localModelOptions.items
    : modelOptionsByKey[currentModelOptionsKey] || form.model_options || [];
  const modelItems = useMemo(() => mergeModelOptions(form, scopedModelOptions), [form, scopedModelOptions]);
  const removableModelIds = useMemo(
    () => new Set((form.model_options || []).filter((item) => item.isUserAdded === true).map((item) => item.id)),
    [form.model_options],
  );
  const { activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError } = useMemo(
    () => modelParameterState(form, activeProviderId),
    [activeProviderId, form],
  );
  const imageParameterError = useMemo(() => isImageProvider ? tUi(imageSettingsError(form)) : "", [form, isImageProvider, tUi]);
  const modelCapabilities = useModelCapabilities(form, form.model);
  const providerIdError = !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(form.id || '')
    || Boolean(form.draftKey && configItems.some(item => item.id === form.id));
  const saveBlockedByParameters = providerIdError || (isImageProvider ? Boolean(imageParameterError) : Boolean(parameterError));

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    function closeMenus(event) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target)) {
        setModelMenuOpen(false);
      }
      if (manualModelRef.current && !manualModelRef.current.contains(event.target)) {
        setManualModelOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  function updateField(key, value) {
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    if (["provider", "base_url", "api_key", "api_format", "custom_headers"].includes(key)) {
      setLocalModelOptions({ key: "", items: [] });
    }
    isDirtyRef.current = true;
    setIsDirty(true);
    setForm((current) => {
      const next = {
        ...current,
        [key]: value,
      };
      formRef.current = next;
      return next;
    });
  }

  function updateActiveModelOption(patch) {
    if (!(formRef.current?.model || "").trim()) return;
    isDirtyRef.current = true;
    setIsDirty(true);
    setForm((current) => {
      const modelId = current.model.trim();
      const items = [...(current.model_options || [])];
      const index = items.findIndex((item) => item.id === modelId);
      const base = index >= 0
        ? items[index]
        : { id: modelId, name: modelId, isUserAdded: true, temperature: null, topP: null, inputModalities: ["text"], supportsImageInput: false };
      const fields = new Set(base.overrideFields || []);
      for (const [field, native] of [['contextWindowTokens', 'contextWindow'], ['maxOutputTokens', 'maxTokens']]) {
        if (Object.hasOwn(patch, field)) { if (patch[field] == null) fields.delete(native); else fields.add(native); }
      }
      const nextOption = { ...base, ...patch, overrideFields: [...fields], id: modelId, name: base.name || modelId };
      if (patch.capabilitiesOverride === false && base.catalogDefaults) {
        Object.assign(nextOption, { inputModalities: base.catalogDefaults.inputModalities, supportsImageInput: base.catalogDefaults.supportsImageInput, reasoningEfforts: base.catalogDefaults.reasoningEfforts });
        if (!Object.hasOwn(nextOption.reasoningEfforts || {}, nextOption.reasoningEffort || '')) nextOption.reasoningEffort = null;
      }
      if (index >= 0) items[index] = nextOption;
      else items.push(nextOption);
      const next = { ...current, model_options: items };
      formRef.current = next;
      return next;
    });
  }

  function selectModel(modelId) {
    const id = String(modelId || "").trim();
    if (!id) return;
    const current = formRef.current;
    const exists = (current.model_options || []).some((item) => item.id === id);
    isDirtyRef.current = true;
    setIsDirty(true);
    const next = {
      ...current,
      model: id,
      useBuiltinModels: exists ? current.useBuiltinModels : false,
      model_options: exists
        ? current.model_options
        : [...(current.model_options || []), {
            id,
            name: id,
            isUserAdded: true,
            temperature: null,
            topP: null,
            inputModalities: ["text"],
            supportsImageInput: false,
          }],
    };
    formRef.current = next;
    setForm(next);
    setModelMenuOpen(false);
    setManualModelOpen(false);
    setManualModelName("");
  }

  function deleteModel(modelId) {
    const id = String(modelId || "").trim();
    const current = formRef.current;
    const next = removeUserAddedModel(current, id, modelItems);
    if (next === current) return;

    const visibleItems = modelItems.filter((item) => item.id !== id);
    setLocalModelOptions({ key: modelOptionsKey(next), items: visibleItems });
    isDirtyRef.current = true;
    setIsDirty(true);
    formRef.current = next;
    setForm(next);
    showNotice("success", tUi("已删除模型 {value0}", {value0: id}));
  }

  function addManualModel() {
    const id = manualModelName.trim();
    if (!id) {
      showNotice("error", tUi("请填写完整模型名"));
      return;
    }
    if ((form.model_options || []).some((item) => item.id === id)) {
      selectModel(id);
      return;
    }
    selectModel(id);
    showNotice("success", tUi("已添加并选中 {value0}", {value0: id}));
  }

  function updateHeader(previousName, nextName, value) {
    const normalizedName = nextName.trim();
    const headers = { ...(formRef.current.custom_headers || {}) };
    delete headers[previousName];
    if (normalizedName) headers[normalizedName] = value;
    updateField("custom_headers", headers);
  }

  function addHeader() {
    const name = draftHeader.name.trim();
    if (!name) {
      showNotice("error", tUi("请填写请求头名称"));
      return;
    }
    if (!/^[A-Za-z0-9!#$%&'*+._`|~^-]+$/.test(name)) {
      showNotice("error", tUi("请求头名称包含无效字符"));
      return;
    }
    updateField("custom_headers", { ...(formRef.current.custom_headers || {}), [name]: draftHeader.value });
    setDraftHeader({ name: "", value: "" });
  }

  function requestDraftReplacement(action) {
    if (!isDirtyRef.current) {
      action();
      return;
    }
    pendingDraftActionRef.current = action;
    setUnsavedDialogOpen(true);
  }

  function discardDraftAndContinue() {
    const action = pendingDraftActionRef.current;
    pendingDraftActionRef.current = null;
    setUnsavedDialogOpen(false);
    isDirtyRef.current = false;
    setIsDirty(false);
    action?.();
  }

  function cancelCurrentChanges() {
    const current = formRef.current || form;
    const providerId = normalizeProviderId(current.provider);
    const persisted = configItems.find((item) => item.id === current.id)
      || draftBaselines.current.get(current.draftKey)
      || initialConfigForProvider(providerId, undefined, tUi);
    formRef.current = persisted;
    isDirtyRef.current = false;
    setForm(persisted);
    setIsDirty(false);
    setLocalModelOptions({ key: "", items: [] });
    setModelMenuOpen(false);
    setManualModelOpen(false);
    setManualModelName("");
    setDraftHeader({ name: "", value: "" });
  }


  function toggleGroup(groupId) {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  async function saveCurrentConfig() {
    if (!onSave || saving) return false;
    if (saveBlockedByParameters) {
      showNotice("error", providerIdError ? tUi("Provider ID 需唯一，并以小写字母开头，使用小写字母、数字和连字符。") : tUi("请修正模型参数或输入能力后再保存。"));
      return false;
    }
    const snapshot = formRef.current;
    setSaving(true);
    try {
      const saved = await onSave(snapshot);
      if (!saved) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, "模型配置保存后未返回有效配置。", { what: "保存后的模型配置" });
      if (snapshot.draftKey) {
        setDraftConfigs(items => items.filter(item => item.draftKey !== snapshot.draftKey));
        draftBaselines.current.delete(snapshot.draftKey);
      }
      formRef.current = saved;
      isDirtyRef.current = false;
      setForm(saved);
      setIsDirty(false);
      showNotice("success", tUi("模型配置已保存"));
      return true;
    } catch (error) {
      showNotice("error", error.message || tUi("模型配置保存失败"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftAndContinue() {
    const action = pendingDraftActionRef.current;
    const saved = await saveCurrentConfig();
    if (!saved) return;
    pendingDraftActionRef.current = null;
    setUnsavedDialogOpen(false);
    action?.();
  }

  function cancelDraftReplacement() {
    pendingDraftActionRef.current = null;
    setUnsavedDialogOpen(false);
  }

  function selectConfigId(configId) {
    if (!configId) return;
    const item = allConfigs.find((candidate) => candidate.id === configId);
    if (!item) return;
    setModelMenuOpen(false);
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    requestDraftReplacement(() => {
      formRef.current = item;
      setForm(item);
      setIsDirty(false);
      isDirtyRef.current = false;
    });
  }

  function createConfigPlaceholder(providerId = 'custom') {
    const route = providers.find(item => item.provider === providerId);
    const existing = route && allConfigs.find(item => item.id === route.provider);
    if (existing) { selectConfigId(existing.id); return; }
    requestDraftReplacement(() => {
      const draft = initialConfigForProvider(providerId, providers, tUi);
      draft.draftKey = draft.id;
      draftBaselines.current.set(draft.draftKey, draft);
      setDraftConfigs(items => [...items, draft]);
      formRef.current = draft;
      isDirtyRef.current = true;
      setForm(draft);
      setIsDirty(true);
      if (route) void fetchModels();
    });
  }

  function requestDelete(config = formRef.current, returnFocus = document.activeElement) {
    setDeleteTargetConfig({ ...config, label: config.name || config.id, hasUnsavedChanges: config.id === formRef.current.id && isDirtyRef.current, returnFocus });
    setDeleteError(null);
    setConfirmDeleteConfig(true);
  }

  async function deleteCurrentConfig() {
    const target = deleteTargetConfig;
    if (!target?.id || deleting) return;
    setDeleting(true);
    try {
      const persisted = configItems.some(item => item.id === target.id);
      const nextSaved = persisted ? await onDeleteConfig(target.id) : null;
      setDraftConfigs(items => items.filter(item => item.draftKey !== target.draftKey));
      draftBaselines.current.delete(target.draftKey);
      if (formRef.current.id === target.id) {
        const next = nextSaved || allConfigs.find(item => item.id !== target.id) || initialConfigForProvider('custom', undefined, tUi);
        formRef.current = next;
        isDirtyRef.current = false;
        setForm(next);
        setIsDirty(false);
      }
      setConfirmDeleteConfig(false);
      setDeleteTargetConfig(null);
      showNotice('success', target.id === 'deepseek-official' ? tUi("内置 DeepSeek 配置已清空") : tUi("当前配置已删除"));
    } catch (error) {
      setDeleteError(error);
    } finally { setDeleting(false); }
  }

  async function fetchModels() {
    if (loadingModelsRef.current) return;
    loadingModelsRef.current = true;
    setLoadingModels(true);
    setModelMenuOpen(false);
    try {
      const fetchConfig = formRef.current;
      const fetchKey = modelOptionsKey(fetchConfig);
      const discovered = await onFetchModels(fetchConfig);
      if (formRef.current !== fetchConfig) return;
      if (!discovered.length) {
        showNotice("error", tUi("未读取到模型，当前配置已保留。"));
        return;
      }
      const ids = new Set(discovered.map((item) => item.id));
      const models = [...discovered.map(item => ({ ...item, ...(fetchConfig.builtin ? { catalogDefaults: item.catalogDefaults || { ...item } } : {}) })), ...(fetchConfig.model_options || [])
        .filter((item) => item.isUserAdded && !ids.has(item.id))];
      setLocalModelOptions({ key: fetchKey, items: models });
      const modelIds = models.map((item) => item.id || item.name).filter(Boolean);
      const previousModel = String(fetchConfig.model || "").trim();
      const nextModel = modelIds.includes(previousModel) ? previousModel : modelIds[0] || "";
      isDirtyRef.current = true;
      setIsDirty(true);
      setForm((current) => {
        const next = { ...current, model: nextModel, model_options: models };
        formRef.current = next;
        return next;
      });
      if (nextModel) {
        showNotice(
          "success",
          previousModel === nextModel
            ? tUi("已读取 {value0} 个模型，保留当前模型 {value1}", {value0: models.length, value1: nextModel})
            : tUi("已读取 {value0} 个模型，已选择 {value1}", {value0: models.length, value1: nextModel}),
        );
      } else {
        showNotice("success", tUi("已读取 {value0} 个模型", {value0: models.length}));
      }
    } catch (error) {
      showNotice("error", error.message || tUi("读取模型失败"));
    } finally {
      loadingModelsRef.current = false;
      setLoadingModels(false);
    }
  }

  const sidePanel = (
    <ModelProviderSidebar
      providerItems={providerItems}
      createProviderItems={createProviderItems}
      activeProviderId={form.id}
      collapsedGroups={collapsedGroups}
      collapseStateReady={collapseStateReady}
      onToggle={toggleGroup}
      onSelect={selectConfigId}
      onCreate={createConfigPlaceholder}
      onRequestDelete={(item, trigger) => requestDelete(item.config, trigger)}
      builtinProviders={providers}
    />
  );

  const detailProps = {
    showHeader, activeProvider, isImageProvider, hasUnsavedChanges, saving, saveBlockedByParameters,
    onCancel: cancelCurrentChanges,
    onSave: saveCurrentConfig,
    onDelete: () => requestDelete(),
    deleting,
    basicEditor: {
      form, activeProvider, isImageProvider, providerIdError, isPersisted: !form.draftKey && configItems.some(item => item.id === form.id), onDelete: () => requestDelete(), modelPickerRef, manualModelRef, modelMenuOpen,
      setModelMenuOpen, modelItems, removableModelIds, selectModel, deleteModel, loadingModels, fetchModels, manualModelOpen, setManualModelOpen,
      manualModelName, setManualModelName, addManualModel, updateField,
      onRevealApiKey, onCredentialError: message => showNotice("error", message),
    },
    parameterEditor: {
      form, imageParameterError, activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError, modelCapabilities,
      onUpdateImageSettings: (settings) => updateField("image_settings", settings),
      onUpdateModelOption: updateActiveModelOption,
    },
    networkEditor: {
      form, draftHeader, setDraftHeader, onUpdateField: updateField, onUpdateHeader: updateHeader, onAddHeader: addHeader,
    },
  };
  const builtInMainPanel = renderDetail?.(detailProps) ?? <ModelConfigDetail {...detailProps} />;
  const mainPanel = renderEditor?.({
    configId: form.id || '',
    providerId: activeProviderId,
    form,
    provider: activeProvider,
    isImageProvider,
    dirty: hasUnsavedChanges,
    saving,
    canSave: hasUnsavedChanges && !saving && !saveBlockedByParameters,
    error: imageParameterError || parameterError || '',
    onChange: (patch) => {
      const next = { ...formRef.current, ...patch };
      formRef.current = next;
      isDirtyRef.current = true;
      setForm(next);
      setIsDirty(true);
    },
    onCancel: cancelCurrentChanges,
    onSave: saveCurrentConfig,
    onFetchModels: fetchModels,
  }, builtInMainPanel) ?? builtInMainPanel;

  const overlays = (
    <>
      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        title={tUi("保存修改？")}
        description={tUi("离开前是否保存当前模型配置的修改？")}
        saving={saving}
        onCancel={cancelDraftReplacement}
        onSave={saveDraftAndContinue}
        onDiscard={discardDraftAndContinue}
      />
      <ModelProviderDeleteDialog
        target={confirmDeleteConfig ? deleteTargetConfig : null}
        deleting={deleting}
        error={deleteError}
        onCancel={() => { setConfirmDeleteConfig(false); setDeleteTargetConfig(null); }}
        onConfirm={deleteCurrentConfig}
      />
    </>
  );

  return renderLayout({ sidePanel, mainPanel, overlays });
});
