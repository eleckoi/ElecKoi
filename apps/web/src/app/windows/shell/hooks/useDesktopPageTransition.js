import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { bestEffort } from '../../../../utils/swallowedFailure.js';

const CONTENT_SELECTOR = '[data-desktop-page-content]:not(:empty)';

function visibleContent(frame) {
  return [...frame.querySelectorAll(CONTENT_SELECTOR)].find(element => element.getClientRects().length);
}

function waitForContent(frame, presentation) {
  if (visibleContent(frame)) return;
  // The selected Slot may still be loading its lazy page. Only hold the snapshot briefly.
  return new Promise(resolve => {
    const release = () => {
      observer.disconnect();
      window.clearTimeout(deadline);
      presentation.release = null;
      resolve();
    };
    const observer = new MutationObserver(() => { if (visibleContent(frame)) release(); });
    const deadline = window.setTimeout(() => {
      presentation.transition.skipTransition();
      release();
    }, 360);
    presentation.release = release;
    observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  });
}

export function useDesktopPageTransition(frameRef, activeSection, navigationItems, enabled = true) {
  const current = useRef(activeSection);
  const pending = useRef(null);

  function clear(presentation) {
    if (pending.current !== presentation) return;
    pending.current = null;
    delete document.documentElement.dataset.pcMotion;
    delete presentation.frame.dataset.pcMotionScope;
  }

  function skip() {
    const presentation = pending.current;
    if (!presentation) return;
    presentation.transition.skipTransition();
    presentation.release?.();
    clear(presentation);
  }

  useLayoutEffect(() => {
    current.current = activeSection;
    if (pending.current && pending.current.destination !== activeSection) skip();
  }, [activeSection]);
  useLayoutEffect(() => skip, []);

  return (destination, commit) => {
    if (pending.current?.destination === destination) return pending.current.transition.updateCallbackDone;
    skip();
    const from = current.current;
    if (!enabled || from === destination || globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android'
      || !document.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return commit();
    const frame = frameRef.current;
    const outgoing = frame && visibleContent(frame);
    if (!outgoing) return commit();

    // On the main window, Settings and profile share the rail's footer destination.
    const position = id => id === 'settings' ? navigationItems.length : navigationItems.findIndex(item => item.id === id);
    document.documentElement.dataset.pcMotion = position(destination) < position(from) ? 'backward' : 'forward';
    frame.dataset.pcMotionScope = '';
    if (getComputedStyle(outgoing).viewTransitionName !== 'pc-content') {
      delete document.documentElement.dataset.pcMotion;
      delete frame.dataset.pcMotionScope;
      return commit();
    }
    const presentation = { destination, frame, transition: null, release: null };
    const transition = document.startViewTransition(() => {
      if (pending.current !== presentation) return;
      flushSync(commit);
      if (pending.current === presentation) return waitForContent(frame, presentation);
    });
    presentation.transition = transition;
    pending.current = presentation;

    // A superseded animation or a missing snapshot may reject ready; the navigation has its own result.
    transition.ready.catch(bestEffort);
    transition.finished.then(() => clear(presentation), () => clear(presentation));
    return transition.updateCallbackDone;
  };
}
