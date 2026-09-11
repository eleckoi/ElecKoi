import { useState } from "react";
import { initialConfigForProvider } from "../model/modelConfigDraft.js";
import { normalizeProviderId } from "../model/modelProviderCatalog.js";

export function useModelProviderDeletion({
  activeProviderId,
  configItems,
  formRef,
  isDirtyRef,
  onDeleteProvider,
  onRequestDraftReplacement,
  onApplyActiveConfig,
  onNotify,
}) {
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function requestDelete(provider, returnFocus) {
    if (provider.fixed !== false) return;
    const providerId = normalizeProviderId(provider.id);
    const openDialog = () => {
      setError("");
      setTarget({
        providerId,
        label: provider.label,
        configCount: configItems.filter((item) => normalizeProviderId(item.provider) === providerId).length,
        hasUnsavedChanges: providerId === activeProviderId && isDirtyRef.current,
        returnFocus,
      });
    };
    if (isDirtyRef.current && providerId !== activeProviderId) {
      onRequestDraftReplacement(openDialog);
      return;
    }
    openDialog();
  }

  function cancelDelete() {
    if (deleting) return;
    setTarget(null);
    setError("");
  }

  async function confirmDelete() {
    if (!target || deleting) return;
    const storedConfigs = configItems.filter((item) => normalizeProviderId(item.provider) === target.providerId);
    const fallback = configItems.find((item) => normalizeProviderId(item.provider) !== target.providerId)
      || initialConfigForProvider("custom");
    const deletingActiveProvider = target.providerId === activeProviderId;
    const preferredConfigId = deletingActiveProvider ? fallback.id : formRef.current?.id || fallback.id;
    setDeleting(true);
    setError("");
    try {
      let nextForm = fallback;
      if (storedConfigs.length) {
        if (!onDeleteProvider) throw new Error("当前模型入口无法删除");
        nextForm = await onDeleteProvider(target.providerId, preferredConfigId) || fallback;
      }
      if (deletingActiveProvider) onApplyActiveConfig(nextForm);
      setTarget(null);
      onNotify("success", `已删除 ${target.label} 入口`);
    } catch (cause) {
      setError(cause?.message || "删除模型入口失败");
    } finally {
      setDeleting(false);
    }
  }

  return {
    target,
    deleting,
    error,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
