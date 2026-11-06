import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ModelBasicConfigSection } from "./ModelBasicConfigSection.jsx";
import { ModelImageParametersSection } from "./ModelImageParametersSection.jsx";
import { ModelNetworkSection } from "./ModelNetworkSection.jsx";
import { ModelParametersSection } from "./ModelParametersSection.jsx";
import { ProviderLogo } from "./ProviderLogo.jsx";
import { TrashIcon } from "../../../ui/icons/index.jsx";

export function ModelConfigDetail({
  showHeader = true,
  activeProvider,
  isImageProvider,
  hasUnsavedChanges,
  saving,
  saveBlockedByParameters,
  onCancel,
  onSave,
  onDelete,
  deleting,
  basicEditor,
  parameterEditor,
  networkEditor,
}) {
  const tUi = useProductTranslation();
  return (
    <section className="model-config-detail">
      <div className="model-detail-body">
        {showHeader && <header className="model-detail-header">
          <h2>{tUi("模型配置")}</h2>
          <div className="model-save-actions">
            <button type="button" className="model-icon-button danger" aria-label={tUi("删除配置")} title={tUi("删除配置")} disabled={deleting} onClick={onDelete}><TrashIcon /></button>
            <button className="model-cancel-button" type="button" disabled={!hasUnsavedChanges || saving} onClick={onCancel}>
              {tUi("取消")}</button>
            <button type="button" disabled={!hasUnsavedChanges || saving || saveBlockedByParameters} onClick={onSave}>
              {saving ? tUi("保存中...") : tUi("保存配置")}
            </button>
          </div>
        </header>}

        <div className="model-detail-hero">
          <div className="model-hero-logo">
            <ProviderLogo provider={activeProvider} className="model-hero-icon" />
          </div>
          <div className="model-hero-copy">
            <h3>{activeProvider.label}</h3>
          </div>
        </div>

        <form className="model-detail-form" onSubmit={(event) => event.preventDefault()}>
          <ModelBasicConfigSection editor={basicEditor} />
          {isImageProvider ? (
            <ModelImageParametersSection
              form={parameterEditor.form}
              validationMessage={parameterEditor.imageParameterError}
              onChange={parameterEditor.onUpdateImageSettings}
            />
          ) : (
            <ModelParametersSection
              form={parameterEditor.form}
              activeModelOption={parameterEditor.activeModelOption}
              automaticContextWindow={parameterEditor.automaticContextWindow}
              effectiveContextWindow={parameterEditor.effectiveContextWindow}
              parameterError={parameterEditor.parameterError}
              modelCapabilities={parameterEditor.modelCapabilities}
              showReasoningProfileEditor
              onChange={parameterEditor.onUpdateModelOption}
            />
          )}
          <ModelNetworkSection {...networkEditor} />
        </form>
      </div>
    </section>
  );
}
