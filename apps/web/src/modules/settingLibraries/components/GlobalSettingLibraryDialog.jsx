import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X } from '../../../ui/icons/interfaceIcons.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { EditorPresentationContext } from '../../../ui/ui/EditorPresentationContext.jsx';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { MobileConversationOverlay, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';
import { GlobalSettingLibraryPanel } from './GlobalSettingLibraryPanel.jsx';
import '../styles/global-setting-library.css';

export function GlobalSettingLibraryDialog({ settingLibraries, onClose }) {
  const mobile = isMobilePresentation();
  const panelRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const dirtyRef = useRef(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subpage, setSubpage] = useState(null);
  const registerSubpage = useCallback(page => {
    setSubpage(page);
    return () => setSubpage(current => current === page ? null : current);
  }, []);
  const presentation = useMemo(() => ({ compact: mobile, registerSubpage, autoFocusInputs: false }), [mobile, registerSubpage]);
  const onDirtyChange = useCallback(dirty => { dirtyRef.current = dirty; }, []);

  const beforeClose = useCallback(() => {
    if (saving) return false;
    if (dirtyRef.current) {
      setUnsavedOpen(true);
      return false;
    }
    return true;
  }, [saving]);
  const requestClose = useCallback(() => { if (beforeClose()) onClose(); }, [beforeClose, onClose]);

  useEffect(() => {
    if (mobile) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [mobile]);

  useEffect(() => {
    if (mobile || unsavedOpen) return undefined;
    function keys(event) {
      const dialog = dialogRef.current;
      if (event.defaultPrevented || !dialog?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
        .filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [mobile, requestClose, unsavedOpen]);

  async function saveAndClose() {
    if (saving) return;
    setSaving(true);
    try {
      if (await panelRef.current?.save()) onClose();
      else setUnsavedOpen(false);
    } finally { setSaving(false); }
  }

  const content = <>
    <EditorPresentationContext.Provider value={presentation}>
      <div className="global-setting-library-content">
        {settingLibraries ? <GlobalSettingLibraryPanel ref={panelRef} settingLibraries={settingLibraries} onDirtyChange={onDirtyChange} />
          : <div className="setting-library-loading" role="alert">设定库服务尚未就绪</div>}
      </div>
    </EditorPresentationContext.Provider>
    <UnsavedChangesDialog open={unsavedOpen} title="保存设定库更改？" description="设定库还有未保存的更改。"
      saving={saving} onCancel={() => setUnsavedOpen(false)} onSave={saveAndClose}
      onDiscard={() => { panelRef.current?.discard(); onClose(); }} />
  </>;

  if (mobile) return <MobileConversationOverlay kind="page" className="global-setting-library-dialog mobile-character-editor"
    title={subpage?.title || '全局设定库'} onClose={onClose} onBack={subpage?.back} beforeClose={beforeClose} busy={saving}>
    {content}
  </MobileConversationOverlay>;

  return createPortal(<SystemBarOverlay className="global-setting-library-backdrop" role="presentation" onMouseDown={requestClose}>
    <section ref={dialogRef} className="global-setting-library-dialog" role="dialog" aria-modal="true"
      aria-label="全局设定库" onMouseDown={event => event.stopPropagation()}>
      <header className="global-setting-library-header">
        <BookOpen size={20} aria-hidden="true" />
        <h2>全局设定库</h2>
        <button ref={closeRef} type="button" aria-label="关闭全局设定库" disabled={saving} onClick={requestClose}><X size={20} /></button>
      </header>
      {content}
    </section>
  </SystemBarOverlay>, document.body);
}
