import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { ArrowClockwise, DotsThree, X } from '../../../ui/icons/interfaceIcons.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import { FrontendDiagnostics } from '../../authorFrontend/index.js';
import '../styles/native-script-ui.css';

/** The modal owns DOM lifetime; the injected Client service owns the exact script identity. */
export function NativeScriptPanel({ runtime, panel }) {
  const tUi = useProductTranslation();
  const frame = useRef(null), release = useRef(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [reload, setReload] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState([]);
  const channel = useMemo(() => crypto.randomUUID(), [panel.key, reload]);
  const source = useMemo(() => buildAuthorDocumentSource(panel.html, channel, false, { baseUrl: panel.baseUrl }), [panel.html, panel.baseUrl, channel]);
  const close = () => runtime.dismissPanel(panel.key);
  const reloadPanel = () => { setMoreOpen(false); setReload(value => value + 1); };
  useLayoutEffect(() => {
    setError(''); setReady(false); setDiagnostics([]);
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:frontend-ready') setReady(true);
      if (event.data.type === 'eleckoi:frontend-diagnostic') {
        const message = String(event.data.message);
        setDiagnostics(previous => previous.includes(message) ? previous : [...previous, message]);
      }
      if (event.data.type === 'eleckoi:frontend-error') {
        release.current?.(); release.current = null;
        setError(String(event.data.message));
      }
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); release.current?.(); release.current = null; };
  }, [channel, runtime]);
  const loaded = () => {
    const target = frame.current?.contentWindow;
    if (!target || release.current) return;
    let complete;
    try {
      complete = target.__ElecKoiCompleteDocument;
      if (target.__ElecKoiDocumentChannel !== channel) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '作者面板已离开所属文档', { what: '作者面板的所属文档' });
      release.current = runtime.mountScriptPanelDocument(target, panel.key);
      target.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) close(); });
      complete(target.ElecKoi);
    } catch (failure) {
      release.current?.(); release.current = null;
      complete?.(undefined, failure);
      setError(resolveFailure(failure, { fallback: tUi("作者面板加载失败") }).text);
    }
  };
  return <Modal open headless title={panel.title} onClose={close} className="native-script-modal">
    <div className="native-script-document">
      {error ? <div className="native-script-failure"><p className="native-script-panel-error" role="alert">{error}</p>
        <Button variant="outline" onClick={reloadPanel}>{tUi('重新加载')}</Button></div> : <iframe key={channel} ref={frame}
        className="native-script-frame" title={panel.title} name={channel} srcDoc={source} onLoad={loaded} aria-busy={!ready} tabIndex={0}
        allow="autoplay; clipboard-read; clipboard-write" />}
    </div>
    <FrontendDiagnostics messages={diagnostics} />
    <div className="native-script-controls">
      <Menu portal dense side="top" align="end" open={moreOpen} onClose={() => setMoreOpen(false)} autoFocus
        items={[{ id: 'reload', label: tUi('重新加载'), icon: <ArrowClockwise size={16} /> }]}
        onSelect={reloadPanel} anchor={<Button data-dsh-control className="native-script-action" variant="ghost" size="sm"
          aria-label={tUi('{name}的更多操作', { name: panel.title })} aria-haspopup="menu" aria-expanded={moreOpen}
          onClick={() => setMoreOpen(value => !value)}><DotsThree size={14} /></Button>} />
      <Button data-dsh-control className="native-script-action native-script-action-close" variant="ghost" size="sm"
        aria-label={tUi('关闭作者面板')} onClick={close}><X size={14} /></Button>
    </div>
  </Modal>;
}
