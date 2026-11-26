import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Keep a mobile sheet mounted until its closing presentation has finished. */
export function useBottomSheetDismiss(onClose) {
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const dismiss = useCallback(() => {
    if (document.documentElement.dataset.eleckoiMobile !== 'true') {
      onCloseRef.current();
      return;
    }
    const overlay = overlayRef.current;
    if (overlay && sheetRef.current) {
      overlay.style.setProperty('--mobile-sheet-exit-from', getComputedStyle(sheetRef.current).transform);
      overlay.style.setProperty('--mobile-sheet-scrim-exit-from', getComputedStyle(overlay, '::before').opacity);
    }
    setClosing(true);
  }, []);

  useLayoutEffect(() => {
    if (!closing) return undefined;
    let active = true;
    const animations = (overlayRef.current?.getAnimations?.({ subtree: true }) || [])
      .filter(animation => animation.animationName === 'mobile-sheet-out' || animation.animationName === 'mobile-sheet-scrim-out');
    const finish = () => {
      if (!active) return;
      active = false;
      window.clearTimeout(timer);
      onCloseRef.current();
    };
    // WebView can finish the CSS exit without settling a captured animation promise.
    const endTime = Math.max(0, ...animations.map(animation => animation.effect?.getComputedTiming().endTime ?? 180));
    const timer = window.setTimeout(finish, endTime);
    Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
    return () => { active = false; window.clearTimeout(timer); };
  }, [closing]);

  return { overlayRef, sheetRef, closing, dismiss };
}
