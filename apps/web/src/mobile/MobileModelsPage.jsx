import { localizeUiCopy } from "../app/i18n/productCopy.js";
import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useRef, useState, useSyncExternalStore } from 'react';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { ModelConfigPanel } from '../modules/models/components/ModelConfigPanel.jsx';
import { initialConfigForProvider } from '../modules/models/model/modelConfigDraft.js';
import { addableProviderItems, builtinProviderItems, configurationItems, modelProviderSections } from '../modules/models/model/modelProviderCatalog.js';
import { MobileDialog, MobileHeader, MobileState, useMobileScroll } from './MobileChrome.jsx';
import { MobileChevronRightIcon } from './MobileIcons.jsx';
import { resolveFailure } from '../utils/failureText.js';
import { MobileModelConfigDetail, MobileProviderLogo } from './MobileModelConfigDetail.jsx';
import './mobile-models.css';

export function MobileModelsPage() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { models, chat, route } = view;
  const snapshot = useSyncExternalStore(models.subscribe, models.getSnapshot);
  const [picker, setPicker] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const panelRef = useRef(null);
  const ref = useMobileScroll('models', route.kind === 'root');
  function openConfig(config) { view.pushRoute({ kind: 'model-editor', configId: config.id }); }
  function create(providerId) {
    setPicker(false);
    const route = snapshot.providers?.find(item => item.provider === providerId);
    const existing = route && snapshot.configs.find(item => item.id === route.provider);
    if (existing) { openConfig(existing); return; }
    const draft = initialConfigForProvider(providerId, snapshot.providers, tUi);
    view.pushRoute({ kind: 'model-editor', draft: { ...draft, draftKey: draft.id } });
  }
  if (route.kind === 'model-editor') {
    const config = route.draft || snapshot.configs.find(item => item.id === route.configId);
    return <div className="mobile-root-page mobile-model-editor">
      {config ? <ModelConfigPanel ref={panelRef} config={config} configs={snapshot.configs} providers={snapshot.providers || []} modelOptionsByKey={chat.modelOptionsByKey}
        navigationGuardRef={view.guardRef} onSave={draft => models.save(draft)} onRevealApiKey={id => models.revealApiKey(id)}
        onDeleteConfig={id => models.deleteConfig(id)}
        onFetchModels={draft => models.discover(draft)}
        onNotify={chat.notify} renderLayout={view.renderLayout} showHeader={false}
        renderDetail={detail => <MobileModelConfigDetail {...detail} />}
        renderEditor={(editor, detail) => <><MobileHeader title={tUi("模型配置")} back={view.goBack}>
          <button type="button" className="mobile-model-save" disabled={!editor.canSave} aria-busy={editor.saving || undefined} onClick={editor.onSave}>{tUi("保存")}</button>
        </MobileHeader>{detail}</>} /> : <><MobileHeader title={tUi("模型配置")} back={view.goBack} /><MobileState error={snapshot.error || tUi("模型配置已不存在，请返回模型列表")} /></>}
    </div>;
  }
  const configurations = configurationItems(snapshot.configs, snapshot.providers, tUi);
  const createProviders = addableProviderItems(snapshot.providers, tUi);
  const builtinProviders = builtinProviderItems(snapshot.providers);
  return <div className="mobile-root-page"><MobileHeader title={tUi("模型")} onSearch={view.openSearch} onAdd={() => setPicker(true)} addLabel={tUi("新建模型配置")} />
    <div className="mobile-scroll mobile-model-list" ref={ref}>
      {localizeUiCopy(modelProviderSections, tUi).map(section => {
        const sectionConfigs = configurations.filter(item => item.section === section.id);
        if (!sectionConfigs.length) return null;
        const collapsed = Boolean(collapsedSections[section.id]);
        return <section key={section.id} aria-label={section.label}><h2><button type="button" className="mobile-model-group" aria-expanded={!collapsed} aria-controls={`mobile-model-group-${section.id}`} onClick={() => setCollapsedSections(current => ({ ...current, [section.id]: !current[section.id] }))}>
          <MobileChevronRightIcon size={17} /><span>{section.label}</span>
        </button></h2><div id={`mobile-model-group-${section.id}`} hidden={collapsed}>
        {sectionConfigs.map(item => <button type="button" key={item.id} className="mobile-provider-row" onClick={() => openConfig(item.config)}>
          <span className="mobile-provider-logo-seat"><MobileProviderLogo provider={item} /></span><span className="mobile-provider-copy"><strong>{item.label}</strong><small>{item.summary}</small></span><MobileChevronRightIcon />
        </button>)}
      </div></section>;
      })}
      <MobileState error={snapshot.error} loading={snapshot.status === 'loading'} empty={!snapshot.configs.length && snapshot.status === 'ready' ? tUi("暂无模型配置") : ''} onRetry={() => models.refresh().catch(error => chat.notify('error', resolveFailure(error, { fallback: tUi("刷新模型配置失败") }).text))} />
    </div>
    {picker && <MobileDialog title={tUi("新建模型配置")} onClose={() => setPicker(false)}><div className="mobile-picker-list mobile-model-create-list">
      {createProviders.filter(provider => provider.id === 'custom').map(provider => <button type="button" key={provider.id} onClick={() => create(provider.id, tUi)}><MobileProviderLogo provider={provider} /><span>{provider.label}</span><MobileChevronRightIcon /></button>)}
      <div className="mobile-model-create-group"><label htmlFor="mobile-builtin-provider">{tUi("内置提供商")}</label>
        <select id="mobile-builtin-provider" aria-label={tUi("从 DSH 目录选择")} value="" disabled={!builtinProviders.length} onChange={event => { if (event.target.value) create(event.target.value, tUi); }}>
          <option value="" disabled>{tUi("从 DSH 目录选择")}</option>
          {builtinProviders.map(route => <option key={route.provider} value={route.provider}>{route.displayName || route.provider}</option>)}
        </select>
      </div>
      <div className="mobile-model-create-group"><span>{tUi("绘画模型")}</span>{createProviders.filter(provider => provider.section === 'image').map(provider => <button type="button" key={provider.id} onClick={() => create(provider.id, tUi)}><MobileProviderLogo provider={provider} /><span>{provider.label}</span><MobileChevronRightIcon /></button>)}</div>
    </div></MobileDialog>}
  </div>;
}
