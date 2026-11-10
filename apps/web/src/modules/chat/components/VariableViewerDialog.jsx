import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Input, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { Database, MagnifyingGlass, X } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { MobileConversationOverlay, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';
import { VariableBrowser } from './VariableBrowser.jsx';
import { VariableConfigurationSelect } from './VariableConfigurationSelect.jsx';
import { VariableFloors, VariableSnapshot } from './VariableHistory.jsx';

const EMPTY = { id: '', status: 'idle', timeline: null, error: '' };
const subscribeEmpty = () => () => {}, getEmpty = () => EMPTY;

export function VariableViewerDialog({ conversationId, conversationModel, onClose, onNotify, isSending = false }) {
  const t = useProductTranslation(), mobile = isMobilePresentation();
  const [view, setView] = useState('manage'), [selectedId, setSelectedId] = useState(''), [historyDetail, setHistoryDetail] = useState(false);
  const [path, setPath] = useState([]), [historyPath, setHistoryPath] = useState([]), [query, setQuery] = useState(''), [search, setSearch] = useState(false);
  const closeRef = useRef(null), dialogRef = useRef(null);
  const snapshot = useSyncExternalStore(conversationModel?.subscribeTimeline || subscribeEmpty, conversationModel?.getTimelineSnapshot || getEmpty);
  const timeline = snapshot.id === conversationId ? snapshot.timeline : null;
  const error = snapshot.id === conversationId ? snapshot.error : '';
  const loading = !timeline && (snapshot.id !== conversationId || snapshot.status === 'loading');
  useEffect(() => {
    let active = true;
    if (!conversationModel) return undefined;
    conversationModel.openTimeline(conversationId).catch(cause => { if (active) onNotify?.('error', cause.message); });
    return () => { active = false; conversationModel.closeTimeline(conversationId); };
  }, [conversationId, conversationModel]);
  useEffect(() => {
    if (timeline && !timeline.floors.some(floor => floor.id === selectedId)) {
      setSelectedId(timeline.floors.at(-1)?.id || ''); setHistoryPath([]);
    }
  }, [timeline, selectedId]);
  useEffect(() => {
    if (mobile) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const keys = event => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])].filter(item => !item.closest('[hidden]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('keydown', keys); if (previous?.isConnected) previous.focus(); };
  }, [mobile, onClose]);
  const floor = timeline?.floors.find(item => item.id === selectedId);
  function selectFloor(id) { setSelectedId(id); setHistoryPath([]); setHistoryDetail(true); }
  function back() {
    if (search) { setSearch(false); setQuery(''); }
    else if (view === 'manage' && path.length) setPath(current => current.slice(0, -1));
    else if (view === 'history' && historyDetail) {
      if (historyPath.length) setHistoryPath(current => current.slice(0, -1)); else setHistoryDetail(false);
    } else onClose();
  }
  const title = mobile && view === 'history' && historyDetail && floor ? floor.label : t('变量查看与管理');
  const tabs = <nav className="vm-tabs" aria-label={t('变量页面')}>
    <button type="button" role="tab" aria-selected={view === 'manage'} onClick={() => setView('manage')}>{t('变量管理')}</button>
    <button type="button" role="tab" aria-selected={view === 'history'} onClick={() => { setView('history'); setHistoryDetail(false); }}>{t('历史快照')}</button>
  </nav>;
  const body = <>
    {(!mobile || view !== 'history' || !historyDetail) && tabs}
    <div className="vm-page" hidden={view !== 'manage'}>
      <VariableConfigurationSelect conversationId={conversationId} model={conversationModel} mobile={mobile} sending={isSending} refreshKey={timeline} />
      {(!mobile || search) && <div className="vm-toolbar">{!mobile && <h3>{t('当前变量')}</h3>}<Input aria-label={t('搜索变量')} placeholder={t('搜索变量')} value={query} onChange={event => setQuery(event.target.value)} icon={<MagnifyingGlass size={16} />} autoFocus={mobile && search} /></div>}
      <div className="vm-current-body">{loading ? <p className="vm-empty" role="status">{t('正在读取…')}</p> : timeline && <VariableBrowser document={timeline.current} path={path} onNavigate={setPath} query={query} onClearSearch={() => { setQuery(''); setSearch(false); }} mobile={mobile} />}</div>
      {error && <p className="vm-error" role="alert">{error}</p>}
    </div>
    <div className={`vm-history ${mobile ? 'is-mobile' : ''}`} hidden={view !== 'history'}>
      <VariableFloors timeline={timeline} selectedId={selectedId} onSelect={selectFloor} hidden={mobile && historyDetail} />
      {timeline && (!mobile || historyDetail) && <VariableSnapshot key={selectedId} timeline={timeline} floor={floor} mobile={mobile} path={historyPath} onNavigate={setHistoryPath} />}
      {loading && <p className="vm-empty">{t('正在读取…')}</p>}{error && <p className="vm-error" role="alert">{error}</p>}
    </div>
  </>;
  if (mobile) return <MobileConversationOverlay kind="page" title={title} className="mobile-variable-manager" onClose={onClose} onBack={back}
    headerAction={view === 'manage' ? <button type="button" className="vm-mobile-search" aria-label={t('搜索变量')} onClick={() => { setSearch(value => !value); setQuery(''); }}><MagnifyingGlass size={23} /></button> : null}>
    {body}
  </MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="variable-viewer-backdrop" role="presentation" onMouseDown={onClose}>
    <MenuSurface ref={dialogRef} className="variable-viewer-dialog vm-dialog" role="dialog" aria-modal="true" aria-labelledby="vm-title" onMouseDown={event => event.stopPropagation()}>
      <header className="vm-header"><Database size={20} /><h2 id="vm-title">{title}</h2><button ref={closeRef} type="button" aria-label={t('关闭')} onClick={onClose}><X size={20} /></button></header>{body}
    </MenuSurface>
  </SystemBarOverlay>, document.body);
}
