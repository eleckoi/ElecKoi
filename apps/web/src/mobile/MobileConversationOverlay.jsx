import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { MainPageContext } from '../app/windows/MainPageContext.jsx';
import { SystemBarOverlay } from '../ui/ui/SystemBarOverlay.jsx';
import { useBottomSheetDismiss } from '../ui/hooks/useBottomSheetDismiss.js';
import { MobileBackIcon } from './MobileIcons.jsx';
import './mobile-conversation-overlays.css';

export function isMobilePresentation() {
  return document.documentElement.dataset.eleckoiMobile === 'true';
}

/** A single mobile surface owns keyboard, native Back, focus and its exit animation. */
export function MobileConversationOverlay({
  title,
  subtitle,
  kind = 'sheet',
  className = '',
  elevated = false,
  onClose,
  onBack,
  beforeClose,
  busy = false,
  footer,
  children,
}) {
  const tUi = useProductTranslation();
  const view = useContext(MainPageContext);
  const { overlayRef, sheetRef, closing, dismiss } = useBottomSheetDismiss(onClose);
  const actions = useRef(null);
  function requestClose() {
    if (!busy && !closing && beforeClose?.() !== false) dismiss();
  }
  function back() {
    if (!busy && !closing) {
      if (onBack) onBack();
      else requestClose();
    }
    return true;
  }
  actions.current = { back, requestClose };
  useEffect(() => view?.registerBackHandler?.(() => actions.current.back()), [view?.registerBackHandler]);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, [Boolean(onBack), title]);
  useEffect(() => {
    function keys(event) {
      if (event.defaultPrevented || !sheetRef.current?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        actions.current.back();
      }
      if (event.key !== 'Tab') return;
      const focusRoot = sheetRef.current.querySelector('[role="alertdialog"]') || sheetRef.current;
      const controls = [
        ...focusRoot.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === sheetRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === sheetRef.current)
      ) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, []);
  return createPortal(
    <SystemBarOverlay
      ref={overlayRef}
      maskPseudo="::before"
      className={`mobile-conversation-overlay is-${kind}${elevated ? ' is-elevated' : ''}`}
      data-sheet-closing={closing || undefined}
      onMouseDown={kind === 'sheet' ? requestClose : undefined}
    >
      <section
        ref={sheetRef}
        className={`mobile-conversation-surface ${className}`}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        data-mobile-back-owner="conversation-overlay"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {kind === 'sheet' && <div className="mobile-sheet-handle" aria-hidden="true" />}
        <header className={`mobile-overlay-header${onBack || kind === 'page' ? ' has-back' : ''}`}>
          {(onBack || kind === 'page') && (
            <button type="button" aria-label={tUi("返回")} disabled={busy || closing} onClick={back}>
              <MobileBackIcon />
            </button>
          )}
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" aria-label={tUi("关闭")} disabled={busy || closing} onClick={requestClose}>
            <X size={24} />
          </button>
        </header>
        {typeof children === 'function' ? children({ dismiss: requestClose }) : children}
        {footer && (
          <footer className="mobile-overlay-footer">
            {typeof footer === 'function' ? footer({ dismiss: requestClose }) : footer}
          </footer>
        )}
      </section>
    </SystemBarOverlay>,
    document.body,
  );
}

/** Preserve a page's scroll position when navigating to another mobile detail. */
export function MobileOverlayScroll({
  children,
  className = '',
  scrollKey,
  positions,
  direction = 'forward',
}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    node.scrollTop = positions?.get(scrollKey) || 0;
    node.focus({ preventScroll: true });
    return () => {
      positions?.set(scrollKey, node.scrollTop);
    };
  }, [scrollKey, positions]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={`mobile-overlay-scroll ${className}`}
      data-page-direction={direction}
    >
      {children}
    </div>
  );
}
