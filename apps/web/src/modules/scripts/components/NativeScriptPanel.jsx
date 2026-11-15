import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { ArrowClockwise } from '../../../ui/icons/interfaceIcons.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import '../styles/native-script-ui.css';
import '../../../ui/styles/product-dialogs.css';

/** The modal owns DOM lifetime; the injected Client service owns the exact script identity. */
export function NativeScriptPanel({ runtime, panel }) {
  const tUi = useProductTranslation();
  const frame = useRef(null), release = useRef(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [reload, setReload] = useState(0);
  const channel = useMemo(() => crypto.randomUUID(), [panel.key, reload]);
  const source = useMemo(() => buildAuthorDocumentSource(panel.html, channel, false, { baseUrl: panel.baseUrl }), [panel.html, panel.baseUrl, channel]);
  const close = () => runtime.dismissPanel(panel.key);
  useLayoutEffect(() => {
    setError(''); setReady(false);
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:frontend-ready') setReady(true);
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
      target.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      complete(target.ElecKoi);
    } catch (failure) {
      release.current?.(); release.current = null;
      complete?.(undefined, failure);
      setError(resolveFailure(failure, { fallback: tUi("作者面板加载失败") }).text);
    }
  };
  return <Modal open title={panel.title} closeLabel={tUi('关闭作者面板')} onClose={close}
    className="product-dialog native-script-modal" contentClassName="product-dialog-content"
    footer={<Button variant="outline" icon={<ArrowClockwise size={16} />} aria-label={tUi('重新加载作者面板')} onClick={() => setReload(value => value + 1)}>{tUi('重新加载')}</Button>}>
      {error ? <p className="native-script-panel-error" role="alert">{error}</p> : <iframe key={channel} ref={frame}
        className="native-script-frame" title={panel.title} name={channel} srcDoc={source} onLoad={loaded} aria-busy={!ready}
        allow="autoplay; clipboard-read; clipboard-write" />}
  </Modal>;
}
