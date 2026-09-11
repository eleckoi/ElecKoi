import { ModelBasicConfigSection } from "./ModelBasicConfigSection.jsx";
import { ModelImageParametersSection } from "./ModelImageParametersSection.jsx";
import { ModelNetworkSection } from "./ModelNetworkSection.jsx";
import { ModelParametersSection } from "./ModelParametersSection.jsx";
import { ProviderLogo } from "./ProviderLogo.jsx";

export function ModelConfigDetail({
  activeProvider,
  isImageProvider,
  hasUnsavedChanges,
  saving,
  saveBlockedByParameters,
  onCancel,
  onSave,
  basicEditor,
  parameterEditor,
  networkEditor,
}) {
  return (
    <section className="model-config-detail">
      <div className="model-detail-body">
        <header className="model-detail-header">
          <h2>模型配置</h2>
          <div className="model-save-actions">
            <button className="model-cancel-button" type="button" disabled={!hasUnsavedChanges || saving} onClick={onCancel}>
              取消
            </button>
            <button type="button" disabled={!hasUnsavedChanges || saving || saveBlockedByParameters} onClick={onSave}>
              {saving ? "保存中..." : "保存配置"}
            </button>
          </div>
        </header>

        <div className="model-detail-hero">
          <div className="model-hero-logo">
            <ProviderLogo provider={activeProvider} className="model-hero-icon" />
          </div>
          <div className="model-hero-copy">
            <span>{activeProvider.badge}</span>
            <h3>{activeProvider.label}</h3>
            <p>{activeProvider.summary}</p>
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
              onChange={parameterEditor.onUpdateModelOption}
            />
          )}
          <ModelNetworkSection {...networkEditor} />
        </form>
      </div>
    </section>
  );
}
