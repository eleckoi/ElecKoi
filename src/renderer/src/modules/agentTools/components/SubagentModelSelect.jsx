import { CaretRight } from '@phosphor-icons/react';
import { ModelIdentityIcon, ModelPicker } from '../../models/index.js';

export function SubagentModelSelect({
  configs = [],
  selection,
  modelOptionsByKey,
  disabled = false,
  onChange,
  onLoadModels,
  onSaveModelConfig,
  onNotify,
}) {
  const selectedConfig = configs.find((config) => config.id === selection?.configId) || null;
  const selectedModel = selectedConfig ? String(selection?.model || selectedConfig.model || '').trim() : '';

  return <section className="subagent-model-setting">
    <h3>子 Agent 模型</h3>
    <ModelPicker
      configs={configs}
      selectedConfigId={selectedConfig?.id || ''}
      selectedModel={selectedModel}
      modelParameters={{}}
      modelOptionsByKey={modelOptionsByKey}
      title="选择子 Agent 模型"
      allowFollowMain
      showStream={false}
      elevated
      onLoadModels={onLoadModels}
      onSelect={({ configId, model }) => onChange({ configId, model })}
      onSaveModelConfig={onSaveModelConfig}
      onNotify={onNotify}
      renderTrigger={({ open, openPicker }) => <button
        type="button"
        className={`subagent-model-entry${open ? ' active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={openPicker}
      >
        <ModelIdentityIcon
          modelName={selectedModel}
          providerId={selectedConfig?.provider}
          className="subagent-model-icon"
        />
        <span className="subagent-model-copy">
          <strong>{selectedConfig?.name || '跟随主模型'}</strong>
          <small>{selectedConfig ? selectedModel || '未选择模型' : '使用当前对话选择的模型与参数'}</small>
        </span>
        <CaretRight size={17} aria-hidden="true" />
      </button>}
    />
  </section>;
}
