import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, CaretRight, SlidersHorizontal } from '../../../ui/icons/interfaceIcons.jsx';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { MobileConversationOverlay, MobileOverlayScroll, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';
import { DesktopIllustrationModelPicker } from './DesktopIllustrationModelPicker.jsx';
import { ModelIdentityIcon, ModelImageParametersSection } from '../../models/index.js';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { failureMessage } from '../../../utils/failureText.js';
import { NOVELAI_IMAGE_PROVIDER, normalizeNovelAiImageSettings, novelAiImageSettingsError } from '@shared/contracts/agent/novelAiImageSettings';
import '../../../mobile/mobile-models.css';
import './auto-illustration.css';

const unavailable = Object.freeze({ status: 'error', configs: [], error: '模型目录当前不可用。' });
const emptySnapshot = () => unavailable;
const noSubscription = () => () => {};

export function AutoIllustrationSettings({ configId = '', onSelect, modelCatalog }) {
  const mobile = isMobilePresentation();
  const view = useContext(MainPageContext);
  const models = modelCatalog || view?.models;
  const snapshot = useSyncExternalStore(models?.subscribe || noSubscription, models?.getSnapshot || emptySnapshot);
  const selected = snapshot.configs.find(config => config.id === configId && config.provider === NOVELAI_IMAGE_PROVIDER);
  const [open, setOpen] = useState(false);
  return <section className={`auto-illustration-settings${mobile ? '' : ' desktop-auto-illustration-settings'}`} aria-label="绘图模型与参数">
    <h3>绘图模型与参数</h3>
    <button type="button" className="auto-illustration-model" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <span><strong>{selected?.name || (configId ? '绑定的模型配置已不可用' : '不指定图片模型')}</strong><small>{selected?.model || (configId ? configId : '未绑定模型时不会生成图片')}</small></span><CaretRight size={18} />
    </button>
    {open && <IllustrationModelPicker configs={snapshot.configs.filter(config => config.provider === NOVELAI_IMAGE_PROVIDER)} status={snapshot.status} catalogError={snapshot.error} selectedId={configId}
      onSaveConfig={config => models.save(config)} onReload={() => models.refresh()} onSelect={onSelect} onClose={() => setOpen(false)} />}
  </section>;
}

function IllustrationModelPicker({ configs, selectedId, status, catalogError, onSaveConfig, onReload, onSelect, onClose }) {
  const mobile = isMobilePresentation();
  const withDefaults = config => ({ ...config, image_settings: { ...normalizeNovelAiImageSettings(), ...config.image_settings } });
  const [drafts, setDrafts] = useState(() => configs.map(withDefaults));
  const [chosenId, setChosenId] = useState(selectedId);
  const [changedIds, setChangedIds] = useState([]);
  const [tab, setTab] = useState('models');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const positions = useRef(new Map()).current;
  const selected = drafts.find(config => config.id === chosenId);
  const dirty = chosenId !== selectedId || changedIds.length > 0;
  const validation = changedIds.some(id => !drafts.some(config => config.id === id)) ? '修改过的模型配置已不存在，请取消后重新打开。'
    : chosenId && selected && !selected.model?.trim() ? '请先在模型设置中为此配置选择 NovelAI 模型。'
    : [...new Set([...changedIds, ...(chosenId ? [chosenId] : [])])].map(id => drafts.find(config => config.id === id)).filter(Boolean).map(config => novelAiImageSettingsError(config.image_settings)).find(Boolean) || '';
  const unavailableSelection = Boolean(chosenId && !selected);
  useEffect(() => {
    setDrafts(current => configs.map(config => changedIds.includes(config.id)
      ? current.find(draft => draft.id === config.id) || withDefaults(config) : withDefaults(config)));
  }, [configs]);
  function beforeClose() {
    if (!dirty) return true;
    setLeaveOpen(true); return false;
  }
  async function save() {
    if (saving || validation || unavailableSelection) return;
    setSaving(true); setError(null);
    try {
      for (const id of changedIds) {
        const config = drafts.find(item => item.id === id);
        await onSaveConfig({ ...config, image_settings: normalizeNovelAiImageSettings(config.image_settings) });
      }
      await onSelect(chosenId);
      onClose();
    } catch (cause) { setError(cause); }
    finally { setSaving(false); }
  }
  function requestClose() {
    if (!saving && beforeClose()) onClose();
  }
  const choice = (id, title, subtitle) => <button type="button" className={mobile ? 'mobile-model-follow' : 'desktop-illustration-choice'} aria-pressed={chosenId === id} disabled={saving} onClick={() => { setChosenId(id); setError(null); }}>
    <span className={`chat-model-selection${chosenId === id ? ' selected' : ''}`} aria-hidden="true">{chosenId === id && <Check size={17} />}</span><span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
  </button>;
  const content = <>
        <FailureAlert failure={error} className="model-parameter-error" />
        {tab === 'models' && validation && <p className="model-parameter-error" role="alert">{validation}</p>}
        {tab === 'parameters' && selected ? <div className="model-detail-form"><ModelImageParametersSection form={selected} validationMessage={validation} onChange={settings => {
          setDrafts(current => current.map(config => config.id === chosenId ? { ...config, image_settings: settings } : config));
          setChangedIds(current => [...new Set([...current, chosenId])]); setError(null);
        }} /></div> : <>
          <div className={mobile ? 'mobile-choice-group' : 'desktop-illustration-unbound'}>{choice('', '不指定图片模型', '未绑定模型时不会生成图片')}</div>
          {chosenId && !selected && <p className="model-parameter-error" role="alert">绑定的图片模型配置已不可用，请重新选择。</p>}
          <section className={mobile ? 'mobile-provider-choices' : 'desktop-illustration-provider'}><h3><ModelIdentityIcon modelName="" providerId={NOVELAI_IMAGE_PROVIDER} />NovelAI</h3>
            <div className={mobile ? 'mobile-choice-group' : 'desktop-illustration-configs'}>{drafts.map(config => <div key={config.id} className={mobile ? 'mobile-config-choice' : 'desktop-illustration-config'}>{choice(config.id, config.name || '未命名配置', config.model || '未选择模型')}
              <button type="button" className={mobile ? 'illustration-config-parameters' : 'desktop-illustration-parameters'} title={`设置 ${config.name || '未命名配置'} 的参数`} aria-label={`设置 ${config.name || '未命名配置'} 的参数`} disabled={saving || !config.model?.trim()} onClick={() => { setChosenId(config.id); setTab('parameters'); }}>{mobile ? <CaretRight size={19} /> : <SlidersHorizontal size={18} />}</button>
            </div>)}</div>
          </section>
          {status === 'loading' ? <p className={mobile ? 'mobile-overlay-empty' : 'desktop-illustration-state'} role="status">正在读取模型</p> : catalogError ? <FailureAlert failure={catalogError} className="model-parameter-error" onRetry={async () => {
            try { await onReload(); setError(null); }
            catch (cause) { setError(cause); }
          }} /> : !drafts.length && <p className={mobile ? 'mobile-overlay-empty' : 'desktop-illustration-state'}>请先在模型设置中添加 NovelAI 配置</p>}
        </>}
    </>;
  return <>
    {mobile ? <MobileConversationOverlay title="选择绘图模型" subtitle={selected?.model} elevated className="mobile-chat-models mobile-model-editor mobile-root-page mobile-illustration-models" busy={saving}
      onClose={onClose} beforeClose={beforeClose} onBack={leaveOpen ? () => setLeaveOpen(false) : tab === 'parameters' ? () => setTab('models') : undefined}
      footer={({ dismiss }) => <><button type="button" className="mobile-overlay-secondary" disabled={saving} onClick={dismiss}>取消</button><button type="button" className="mobile-overlay-primary" disabled={saving || !dirty || Boolean(validation) || unavailableSelection} onClick={save}>{saving ? '保存中…' : '保存'}</button></>}>
      <div className="mobile-overlay-tabs" role="tablist" aria-label="绘图模型设置">
        <button type="button" role="tab" aria-selected={tab === 'models'} onClick={() => setTab('models')}>模型</button>
        <button type="button" role="tab" aria-selected={tab === 'parameters'} disabled={!selected} onClick={() => setTab('parameters')}>参数</button>
      </div>
      <MobileOverlayScroll key={tab} scrollKey={tab} positions={positions}>{content}</MobileOverlayScroll>
    </MobileConversationOverlay> : <DesktopIllustrationModelPicker subtitle={selected?.model} tab={tab} onTabChange={setTab} canEditParameters={Boolean(selected)}
      saving={saving} canSave={dirty && !validation && !unavailableSelection} leaveOpen={leaveOpen} onClose={requestClose} onSave={save}>{content}</DesktopIllustrationModelPicker>}
    <UnsavedChangesDialog open={leaveOpen} title="保存绘图设置？" description="模型选择和参数尚未保存。" error={error ? failureMessage(error) : validation} saving={saving}
      onCancel={() => setLeaveOpen(false)} onDiscard={onClose} onSave={save} />
  </>;
}
