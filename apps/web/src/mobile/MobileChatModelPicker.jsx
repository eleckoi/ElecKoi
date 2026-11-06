import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useMemo, useRef, useState } from 'react';
import { ModelIdentityIcon } from '../modules/models/components/ModelIdentityIcon.jsx';
import { ModelParametersSection } from '../modules/models/components/ModelParametersSection.jsx';
import { catalogItem } from '../modules/models/model/modelProviderCatalog.js';
import { DshRefreshIcon, DshSearchIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileChevronRightIcon } from './MobileIcons.jsx';
import { MobileConversationOverlay, MobileOverlayScroll } from './MobileConversationOverlay.jsx';
import './mobile-models.css';

export function MobileChatModelPicker({
  title,
  elevated,
  configs,
  focusedConfig,
  selectedConfig,
  selectedModelId,
  followingMain,
  allowFollowMain,
  tab,
  setTab,
  query,
  setQuery,
  visibleModels,
  loading,
  saving,
  hasChanges,
  canEditParameters,
  parameterForm,
  parameterState,
  modelCapabilities,
  onParameters,
  onOpenConfig,
  onChooseConfig,
  onChooseModel,
  onFollowMain,
  onRefresh,
  onSave,
  onClose,
  beforeClose,
  selectionIndicator: SelectionIndicator,
}) {
  const tUi = useProductTranslation();
  const [page, setPage] = useState('configs');
  const [direction, setDirection] = useState('forward');
  const positions = useRef(new Map()).current;
  const groups = useMemo(() => {
    const byProvider = new Map();
    for (const config of configs) {
      if (!byProvider.has(config.provider)) byProvider.set(config.provider, []);
      byProvider.get(config.provider).push(config);
    }
    return [...byProvider.entries()];
  }, [configs]);
  const back =
    tab === 'parameters'
      ? () => {
          setDirection('back');
          setTab('models');
        }
      : page === 'models'
        ? () => {
            setDirection('back');
            setPage('configs');
          }
        : undefined;
  const footer = ({ dismiss }) => (
    <>
      <button type="button" className="mobile-overlay-secondary" disabled={saving} onClick={dismiss}>
        {tUi("取消")}</button>
      <button
        type="button"
        className="mobile-overlay-primary chat-model-save"
        disabled={!hasChanges || saving}
        onClick={onSave}
      >
        {saving ? tUi("保存中…") : tUi("保存")}
      </button>
    </>
  );
  return (
    <MobileConversationOverlay
      title={page === 'models' && tab === 'models' ? focusedConfig?.name || tUi("模型") : title}
      elevated={elevated}
      subtitle={selectedModelId || undefined}
      className="mobile-chat-models mobile-model-editor mobile-root-page"
      busy={saving}
      onClose={onClose}
      beforeClose={beforeClose}
      onBack={back}
      footer={footer}
    >
      {canEditParameters && (
        <div className="mobile-overlay-tabs" role="tablist" aria-label={tUi("模型设置")}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'models'}
            onClick={() => {
              setDirection('back');
              setTab('models');
            }}
          >
            {tUi("模型")}</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'parameters'}
            onClick={() => {
              setDirection('forward');
              setTab('parameters');
            }}
          >
            {tUi("参数")}</button>
        </div>
      )}
      <MobileOverlayScroll
        key={tab === 'parameters' ? 'parameters' : page}
        scrollKey={
          tab === 'parameters'
            ? `parameters:${selectedConfig?.id}:${selectedModelId}`
            : page === 'configs'
              ? 'configs'
              : `models:${focusedConfig?.id}`
        }
        positions={positions}
        direction={direction}
      >
        {tab === 'parameters' ? (
          <div className="model-detail-form">
            <ModelParametersSection
              compact
              form={parameterForm}
              {...parameterState}
              modelCapabilities={modelCapabilities}
              onChange={onParameters}
            />
          </div>
        ) : page === 'configs' ? (
          <>
            {allowFollowMain && (
              <div className="mobile-choice-group">
                <button
                  className="mobile-model-follow"
                  type="button"
                  aria-pressed={followingMain}
                  onClick={onFollowMain}
                >
                  <SelectionIndicator selected={followingMain} />
                  <span>
                    <strong>{tUi("跟随主模型")}</strong>
                    <small>{tUi("使用当前对话选择的模型")}</small>
                  </span>
                </button>
              </div>
            )}
            {groups.map(([provider, items]) => (
              <section className="mobile-provider-choices" key={provider}>
                <h3>
                  <ModelIdentityIcon modelName="" providerId={provider} />
                  {catalogItem(provider, tUi).label}
                </h3>
                <div className="mobile-choice-group">
                  {items.map((config) => (
                    <div className="mobile-config-choice" key={config.id}>
                      <button
                        type="button"
                        className="mobile-choice-check"
                        aria-label={tUi("使用 {value0}", {value0: config.name || tUi("未命名")})}
                        aria-pressed={selectedConfig?.id === config.id}
                        onClick={() => onChooseConfig(config)}
                      >
                        <SelectionIndicator selected={selectedConfig?.id === config.id} />
                      </button>
                      <button
                        type="button"
                        className="mobile-choice-open"
                        aria-label={tUi("查看 {value0} 的模型", {value0: config.name || tUi("未命名")})}
                        onClick={() => {
                          onOpenConfig(config);
                          setDirection('forward');
                          setPage('models');
                        }}
                      >
                        <span>
                          <strong>{config.name || tUi("未命名")}</strong>
                          <small>{config.model || tUi("未选择模型")}</small>
                        </span>
                        <MobileChevronRightIcon />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!configs.length && <p className="mobile-overlay-empty">{tUi("请先在模型设置中配置模型")}</p>}
          </>
        ) : (
          <>
            <div className="mobile-model-search-tools">
              <label className="mobile-overlay-search">
                <DshSearchIcon size={20} />
                <input
                  type="search"
                  aria-label={tUi("搜索模型")}
                  placeholder={tUi("搜索模型")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button
                className="mobile-overlay-icon"
                type="button"
                aria-label={tUi("刷新模型")}
                disabled={loading || !focusedConfig}
                onClick={onRefresh}
              >
                <DshRefreshIcon size={20} />
              </button>
            </div>
            <div className="mobile-choice-group mobile-chat-model-list">
              {visibleModels.map((model) => {
                const selected = selectedConfig?.id === focusedConfig?.id && selectedModelId === model.id;
                return (
                  <button
                    type="button"
                    key={model.id}
                    aria-pressed={selected}
                    onClick={() => onChooseModel(focusedConfig, model.id)}
                  >
                    <SelectionIndicator selected={selected} />
                    <span>{model.name}</span>
                  </button>
                );
              })}
            </div>
            {!visibleModels.length && (
              <p className="mobile-overlay-empty">{query ? tUi("没有匹配模型") : tUi("当前提供商没有可用模型")}</p>
            )}
          </>
        )}
      </MobileOverlayScroll>
    </MobileConversationOverlay>
  );
}
