import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { MobileBackIcon } from '../../../mobile/MobileIcons.jsx';
import { CornersIn } from '../../../ui/icons/interfaceIcons.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';

export function ImmersiveMarkdownEditor({ label, onClose, tabs, fullWidth = false, children }) {
  const tUi = useProductTranslation();
  const { compact, registerBackHandler } = useEditorPresentation();
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const trigger = document.activeElement;
    const root = document.documentElement;
    root.classList.add('immersive-editor-open');
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      root.classList.remove('immersive-editor-open');
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    const releaseBack = compact ? registerBackHandler?.(() => { onClose(); return true; }) : undefined;
    return () => {
      releaseBack?.();
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [compact, onClose, registerBackHandler]);

  return createPortal(
    <section ref={dialogRef} tabIndex={-1} className={`immersive-markdown-editor${compact ? ' is-compact' : ''}${fullWidth ? ' is-full-width' : ''}`}
      role="dialog" aria-modal="true" aria-label={compact ? label : undefined} aria-labelledby={compact ? undefined : titleId} data-mobile-back-owner="immersive-editor">
      <header className="immersive-markdown-header">
        {compact ? <Button data-dsh-control variant="ghost" type="button" className="immersive-markdown-exit"
          aria-label={tUi('返回')} icon={<MobileBackIcon />} onClick={onClose} /> : <>
          <strong id={titleId}>{label}</strong>
          <div className="immersive-markdown-actions">
            {tabs}
            <Button data-dsh-control variant="outline" type="button" className="immersive-markdown-exit" onClick={onClose}>
              <CornersIn size={15} aria-hidden="true" />{tUi('退出沉浸')}
            </Button>
          </div>
        </>}
      </header>
      <div className="immersive-markdown-body">{children}</div>
    </section>,
    document.querySelector('.qq-character-editor-window-shell') || document.body,
  );
}
