import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  addableProviderItems,
  blankConfigForProvider,
  catalogItem,
  configVersionName,
  mergeProviderMeta,
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
  providerVersions,
} from "../model/modelConfigDraft.js";
import { useModelConnectionTest } from "../hooks/useModelConnectionTest.js";
import { useModelProviderDeletion } from "../hooks/useModelProviderDeletion.js";
import { ModelConfigDetail } from "./ModelConfigDetail.jsx";
import { ModelConnectionTestDialog } from "./ModelConnectionTestDialog.jsx";
import { ModelProviderDeleteDialog } from "./ModelProviderDeleteDialog.jsx";
import { ModelProviderSidebar } from "./ModelProviderSidebar.jsx";
import { UnsavedChangesDialog } from "../../../ui/ui/UnsavedChangesDialog.jsx";
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from "../../settings/index.js";

export const ModelConfigPanel = forwardRef(function ModelConfigPanel({
  config,
  configs = [],
  providers,
  modelOptionsByKey = {},
  onSave,
  onDeleteConfig,
  onDeleteProvider,
  onFetchModels,
  onProbeModels,
  onTestConnection,
  onNotify,
  onDirtyChange,
  renderLayout,
}, ref) {
  const [form, setForm] = useState(config);
  const [collapsedGroups, setCollapsedGroups] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.models,
    { general: false },
    modelProviderSections.map((section) => section.id),
  );
  const [deleting, setDeleting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [confirmDeleteConfig, setConfirmDeleteConfig] = useState(false);
  const [deleteTargetConfig, setDeleteTargetConfig] = useState(null);
  const [localModelOptions, setLocalModelOptions] = useState({ key: "", items: [] });
  const [manualModelOpen, setManualModelOpen] = useState(false);
  const [manualModelName, setManualModelName] = useState("");
  const [draftHeader, setDraftHeader] = useState({ name: "", value: "" });
  const loadingModelsRef = useRef(false);
  const formRef = useRef(config);
  const isDirtyRef = useRef(false);
  const holdProviderAfterDeleteRef = useRef("");
  const modelPickerRef = useRef(null);
  const manualModelRef = useRef(null);
  const versionPickerRef = useRef(null);
  const pendingDraftActionRef = useRef(null);
  const {
    connectionTest,
    setConnectionTest,
    connectionTestDialog,
    dismissConnectionTest,
    testingConnection,
    testConnection,
  } = useModelConnectionTest({
    formRef,
    onProbeModels,
    onTestConnection,
    onNotify,
    onBeforeTest: () => {
      setModelMenuOpen(false);
      setManualModelOpen(false);
    },
  });

  function showNotice(type, text) {
    onNotify?.(type, text);
  }

  useImperativeHandle(ref, () => ({
    save: saveCurrentConfig,
  }));

  useEffect(() => {
    const current = formRef.current || {};
    const heldProvider = holdProviderAfterDeleteRef.current;
    if (heldProvider && normalizeProviderId(config.provider) !== heldProvider) {
      holdProviderAfterDeleteRef.current = "";
      return;
    }
    holdProviderAfterDeleteRef.current = "";

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
    setIsDirty(false);
    setConnectionTest({ status: "idle", message: "" });
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    setManualModelOpen(false);
    setManualModelName("");
    setDraftHeader({ name: "", value: "" });
  }, [config]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const activeProvider = catalogItem(form.provider);
  const activeProviderId = normalizeProviderId(form.provider);
  const isImageProvider = activeProvider.section === "image";
  const providerItems = useMemo(
    () => mergeProviderMeta(providers, configs, activeProviderId),
    [activeProviderId, configs, providers],
  );
  const createProviderItems = useMemo(() => addableProviderItems(providers), [providers]);
  const configItems = useMemo(() => normalizedConfigs(configs), [configs]);
  const providerConfigItems = useMemo(
    () => configItems.filter((item) => normalizeProviderId(item.provider) === activeProviderId),
    [activeProviderId, configItems],
  );
  const hasUnsavedChanges = isDirty;
  const providerVersionItems = useMemo(
    () => providerVersions(form, providerConfigItems, activeProviderId),
    [activeProviderId, form, providerConfigItems],
  );
  const currentModelOptionsKey = modelOptionsKey(form);
  const scopedModelOptions = localModelOptions.key === currentModelOptionsKey
    ? localModelOptions.items
    : modelOptionsByKey[currentModelOptionsKey] || form.model_options || [];
  const modelItems = useMemo(() => mergeModelOptions(form, scopedModelOptions), [form, scopedModelOptions]);
  const { activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError } = useMemo(
    () => modelParameterState(form, activeProviderId),
    [activeProviderId, form],
  );
  const imageParameterError = useMemo(() => isImageProvider ? imageSettingsError(form) : "", [form, isImageProvider]);
  const saveBlockedByParameters = isImageProvider ? Boolean(imageParameterError) : Boolean(parameterError);
  const providerDeletion = useModelProviderDeletion({
    activeProviderId,
    configItems,
    formRef,
    isDirtyRef,
    onDeleteProvider,
    onRequestDraftReplacement: requestDraftReplacement,
    onApplyActiveConfig: (nextForm) => {
      setConnectionTest({ status: "idle", message: "" });
      formRef.current = nextForm;
      isDirtyRef.current = false;
      setForm(nextForm);
      setIsDirty(false);
    },
    onNotify: showNotice,
  });

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    function closeMenus(event) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target)) {
        setModelMenuOpen(false);
      }
      if (versionPickerRef.current && !versionPickerRef.current.contains(event.target)) {
        setVersionMenuOpen(false);
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
    setConnectionTest({ status: "idle", message: "" });
    if (["provider", "base_url", "api_key"].includes(key)) {
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
    setConnectionTest({ status: "idle", message: "" });
    isDirtyRef.current = true;
    setIsDirty(true);
    setForm((current) => {
      const modelId = current.model.trim();
      const items = [...(current.model_options || [])];
      const index = items.findIndex((item) => item.id === modelId);
      const base = index >= 0
        ? items[index]
        : { id: modelId, name: modelId, isUserAdded: true, temperature: 1, topP: 1, supportsImageInput: false };
      const nextOption = { ...base, ...patch, id: modelId, name: base.name || modelId };
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
    setConnectionTest({ status: "idle", message: "" });
    const current = formRef.current;
    const exists = (current.model_options || []).some((item) => item.id === id);
    isDirtyRef.current = true;
    setIsDirty(true);
    const next = {
      ...current,
      model: id,
      model_options: exists
        ? current.model_options
        : [...(current.model_options || []), {
            id,
            name: id,
            isUserAdded: true,
            temperature: 1,
            topP: 1,
            supportsImageInput: false,
          }],
    };
    formRef.current = next;
    setForm(next);
    setModelMenuOpen(false);
    setManualModelOpen(false);
    setManualModelName("");
  }

  function addManualModel() {
    const id = manualModelName.trim();
    if (!id) {
      showNotice("error", "请填写完整模型名");
      return;
    }
    if ((form.model_options || []).some((item) => item.id === id)) {
      selectModel(id);
      return;
    }
    selectModel(id);
    showNotice("success", `已添加并选中 ${id}`);
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
      showNotice("error", "请填写请求头名称");
      return;
    }
    if (!/^[A-Za-z0-9!#$%&'*+._`|~^-]+$/.test(name)) {
      showNotice("error", "请求头名称包含无效字符");
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
      || configItems.find((item) => normalizeProviderId(item.provider) === providerId)
      || initialConfigForProvider(providerId);
    formRef.current = persisted;
    isDirtyRef.current = false;
    setForm(persisted);
    setIsDirty(false);
    setConnectionTest({ status: "idle", message: "" });
    setLocalModelOptions({ key: "", items: [] });
    setModelMenuOpen(false);
    setVersionMenuOpen(false);
    setManualModelOpen(false);
    setManualModelName("");
    setDraftHeader({ name: "", value: "" });
  }

  function selectProvider(providerId) {
    setModelMenuOpen(false);
    setVersionMenuOpen(false);
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    requestDraftReplacement(() => {
      const provider = normalizeProviderId(providerId);
      const firstMatch = configItems.find((item) => normalizeProviderId(item.provider) === provider);
      const next = firstMatch || initialConfigForProvider(provider);
      setConnectionTest({ status: "idle", message: "" });
      formRef.current = next;
      setForm(next);
      setIsDirty(false);
      isDirtyRef.current = false;
    });
  }

  function toggleGroup(groupId) {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  async function saveCurrentConfig() {
    if (!onSave || saving) return false;
    if (saveBlockedByParameters) {
      showNotice("error", "模型参数超出允许范围，请修正后再保存。");
      return false;
    }
    const snapshot = formRef.current;
    setSaving(true);
    try {
      const saved = await onSave(snapshot);
      formRef.current = saved;
      isDirtyRef.current = false;
      setForm(saved);
      setIsDirty(false);
      showNotice("success", "模型配置已保存");
      return true;
    } catch (error) {
      showNotice("error", error.message || "模型配置保存失败");
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
    const item = providerVersionItems.find((candidate) => candidate.id === configId);
    if (!item) return;
    setModelMenuOpen(false);
    setVersionMenuOpen(false);
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    requestDraftReplacement(() => {
      setConnectionTest({ status: "idle", message: "" });
      formRef.current = item;
      setForm(item);
      setIsDirty(false);
      isDirtyRef.current = false;
    });
  }

  function createConfigPlaceholder(providerId = activeProviderId) {
    const provider = catalogItem(providerId);
    const draft = initialConfigForProvider(provider.id);
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    requestDraftReplacement(() => {
      setConnectionTest({ status: "idle", message: "" });
      formRef.current = draft;
      isDirtyRef.current = false;
      setForm(draft);
      setIsDirty(false);
    });
  }

  async function deleteCurrentConfig() {
    const target = deleteTargetConfig || formRef.current || form;
    if (!target?.id || deleting) return;
    const deletedProvider = normalizeProviderId(target.provider);
    const targetProviderConfigs = configItems.filter((item) => normalizeProviderId(item.provider) === deletedProvider);
    const remainingProviderConfigs = targetProviderConfigs.filter((item) => item.id !== target.id);
    setDeleting(true);
    setConfirmDeleteConfig(false);
    setDeleteTargetConfig(null);
    holdProviderAfterDeleteRef.current = deletedProvider;
    try {
      let nextForm;
      const persistedTarget = configItems.some((item) => item.id === target.id);
      if (!persistedTarget) {
        nextForm = targetProviderConfigs[0] || initialConfigForProvider(deletedProvider);
        showNotice("success", "已丢弃未保存的配置草稿");
      } else if (targetProviderConfigs.length <= 1 && catalogItem(deletedProvider).fixed !== false) {
        const cleared = { ...blankConfigForProvider(deletedProvider), id: target.id || initialConfigForProvider(deletedProvider).id };
        nextForm = onSave ? await onSave(cleared) : cleared;
        showNotice("success", "当前配置已清空");
      } else if (onDeleteConfig) {
        const activeAfterDelete = await onDeleteConfig(target.id);
        nextForm = remainingProviderConfigs[0] || activeAfterDelete || initialConfigForProvider("custom");
        showNotice("success", "当前配置已删除");
      } else {
        throw new Error("当前配置无法删除");
      }
      if (remainingProviderConfigs.length && normalizeProviderId(nextForm.provider) !== deletedProvider) {
        nextForm = remainingProviderConfigs[0] || initialConfigForProvider(deletedProvider);
      }
      setConnectionTest({ status: "idle", message: "" });
      formRef.current = nextForm;
      setForm(nextForm);
      setIsDirty(false);
      isDirtyRef.current = false;
    } catch (error) {
      showNotice("error", error.message || "删除配置失败");
    } finally {
      setDeleting(false);
    }
  }

  async function fetchModels() {
    if (loadingModelsRef.current) return;
    loadingModelsRef.current = true;
    setLoadingModels(true);
    setConnectionTest({ status: "idle", message: "" });
    setModelMenuOpen(false);
    try {
      const fetchConfig = formRef.current;
      const fetchKey = modelOptionsKey(fetchConfig);
      const models = await onFetchModels(fetchConfig);
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
            ? `已读取 ${models.length} 个模型，保留当前模型 ${nextModel}`
            : `已读取 ${models.length} 个模型，已选择 ${nextModel}`,
        );
      } else {
        showNotice("success", `已读取 ${models.length} 个模型`);
      }
    } catch (error) {
      showNotice("error", error.message || "读取模型失败");
    } finally {
      loadingModelsRef.current = false;
      setLoadingModels(false);
    }
  }

  const selectedConfigId = providerVersionItems.some((item) => item.id === form.id) ? form.id : providerVersionItems[0]?.id || "";
  const selectedConfig = providerVersionItems.find((item) => item.id === selectedConfigId) || form;
  const currentVersionConfig = selectedConfig?.id === form.id ? form : selectedConfig;
  const selectedVersionName = selectedConfig ? configVersionName({ ...selectedConfig, name: selectedConfig.id === form.id ? form.name : selectedConfig.name }, providerVersionItems) : "未命名";
  const deleteTarget = deleteTargetConfig || currentVersionConfig || form;
  const deleteTargetProviderId = normalizeProviderId(deleteTarget?.provider || activeProviderId);
  const deleteTargetVersions = configItems.filter((item) => normalizeProviderId(item.provider) === deleteTargetProviderId);
  const deleteTargetVersionName = deleteTarget
    ? configVersionName({ ...deleteTarget, name: deleteTarget.id === form.id ? form.name : deleteTarget.name }, deleteTargetProviderId === activeProviderId ? providerVersionItems : deleteTargetVersions)
    : "当前配置";
  const willClearCurrentConfig = deleteTargetVersions.length <= 1 && catalogItem(deleteTargetProviderId).fixed !== false;
  const canDeleteCurrent = Boolean(currentVersionConfig?.id) && !deleting;
  const sidePanel = (
    <ModelProviderSidebar
      providerItems={providerItems}
      createProviderItems={createProviderItems}
      activeProviderId={activeProviderId}
      collapsedGroups={collapsedGroups}
      onToggle={toggleGroup}
      onSelect={selectProvider}
      onCreate={createConfigPlaceholder}
      onRequestDelete={providerDeletion.requestDelete}
    />
  );

  const mainPanel = <ModelConfigDetail
    activeProvider={activeProvider}
    isImageProvider={isImageProvider}
    hasUnsavedChanges={hasUnsavedChanges}
    saving={saving}
    saveBlockedByParameters={saveBlockedByParameters}
    onCancel={cancelCurrentChanges}
    onSave={saveCurrentConfig}
    basicEditor={{
      form, activeProvider, isImageProvider, versionPickerRef, versionMenuOpen, setVersionMenuOpen,
      selectedVersionName, providerVersionItems, selectedConfigId, selectConfigId, createConfigPlaceholder,
      willClearCurrentConfig, confirmDeleteConfig, setConfirmDeleteConfig, canDeleteCurrent, currentVersionConfig,
      setDeleteTargetConfig, deleteTargetVersionName, deleting, deleteCurrentConfig, modelPickerRef, manualModelRef, modelMenuOpen,
      setModelMenuOpen, modelItems, selectModel, loadingModels, fetchModels, manualModelOpen, setManualModelOpen,
      manualModelName, setManualModelName, addManualModel, connectionTest, testingConnection, testConnection, updateField,
    }}
    parameterEditor={{
      form, imageParameterError, activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError,
      onUpdateImageSettings: (settings) => updateField("image_settings", settings),
      onUpdateModelOption: updateActiveModelOption,
    }}
    networkEditor={{
      form, draftHeader, setDraftHeader, onUpdateField: updateField, onUpdateHeader: updateHeader, onAddHeader: addHeader,
    }}
  />;

  const overlays = (
    <>
      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        title="保存修改？"
        description="离开前是否保存当前模型配置的修改？"
        saving={saving}
        onCancel={cancelDraftReplacement}
        onSave={saveDraftAndContinue}
        onDiscard={discardDraftAndContinue}
      />
      <ModelConnectionTestDialog state={connectionTestDialog} onDismiss={dismissConnectionTest} />
      <ModelProviderDeleteDialog
        target={providerDeletion.target}
        deleting={providerDeletion.deleting}
        error={providerDeletion.error}
        onCancel={providerDeletion.cancelDelete}
        onConfirm={providerDeletion.confirmDelete}
      />
    </>
  );

  return renderLayout({ sidePanel, mainPanel, overlays });
});
