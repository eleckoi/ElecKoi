import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { ArrowClockwise, X } from '../../../ui/icons/interfaceIcons.jsx';
import '../styles/native-script-ui.css';
import { activateFrontendScripts, deferFrontendScripts } from '../../authorFrontend/model/sharedFrontendDocument.js';

/** The modal owns DOM lifetime; the injected Client service owns the exact script identity. */
export function NativeScriptPanel({ runtime, panel }) {
  const dialog = useRef(null), frame = useRef(null), release = useRef(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [reload, setReload] = useState(0);
  const channel = useMemo(() => crypto.randomUUID(), [panel.key, reload]);
  const source = useMemo(() => buildAuthorDocumentSource(deferFrontendScripts(panel.html), channel, false, { baseUrl: panel.baseUrl }), [panel.html, panel.baseUrl, channel]);
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
  useEffect(() => {
    const target = dialog.current, previous = document.activeElement;
    target.showModal();
    return () => { target.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const loaded = async () => {
    const target = frame.current?.contentWindow;
    if (!target || release.current) return;
    let complete, mounted;
    const current = () => frame.current?.contentWindow === target && target.__ElecKoiDocumentChannel === channel && release.current === mounted;
    try {
      complete = target.__ElecKoiCompleteDocument;
      if (target.__ElecKoiDocumentChannel !== channel) throw new Error('作者面板已离开所属文档');
      mounted = runtime.mountScriptPanelDocument(target, panel.key);
      release.current = mounted;
      target.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      await mounted.ready;
      if (!current()) return;
      complete(target.ElecKoi);
      await activateFrontendScripts(target, current);
    } catch (failure) {
      if (mounted && !current()) return;
      release.current?.(); release.current = null;
      complete?.(undefined, failure);
      setError(failure.message || String(failure));
    }
  };
  return createPortal(<dialog ref={dialog} className="native-script-dialog" aria-label={panel.title}
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
    <div className="native-script-dialog-layout">
      <header><h2>{panel.title}</h2>
        <button type="button" title="重新加载" aria-label="重新加载作者面板" onClick={() => setReload(value => value + 1)}><ArrowClockwise /></button>
        <button type="button" title="关闭" aria-label="关闭作者面板" onClick={close}><X /></button>
      </header>
      {error ? <p className="native-script-panel-error" role="alert">{error}</p> : <iframe key={channel} ref={frame}
        title={panel.title} name={channel} srcDoc={source} onLoad={loaded} aria-busy={!ready}
        allow="autoplay; clipboard-read; clipboard-write" />}
    </div>
  </dialog>, document.body);
}
