import { useLayoutEffect, useRef, useState } from 'react';

/** Swap the mobile toolbar after fading out; keep its header clearance until then. */
export function useMessageToolbarMotion(expanded, mobile, toolsRef, articleRef, visible) {
  const [presentedExpanded, setPresentedExpanded] = useState(expanded);
  const [swapping, setSwapping] = useState(false);
  const settled = useRef(expanded);

  useLayoutEffect(() => {
    if (!mobile) return undefined;
    if (settled.current === expanded && !swapping) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      settled.current = expanded;
      setPresentedExpanded(expanded);
      setSwapping(false);
      return undefined;
    }
    setSwapping(true);
    let frame;
    const timer = window.setTimeout(() => {
      settled.current = expanded;
      setPresentedExpanded(expanded);
      frame = window.requestAnimationFrame(() => setSwapping(false));
    }, 125);
    return () => { window.clearTimeout(timer); if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, [expanded, mobile]);

  useLayoutEffect(() => {
    if (!mobile || !visible) return undefined;
    const tools = toolsRef.current;
    const article = articleRef.current;
    const content = article?.querySelector(':scope > .message-content');
    if (!tools || !article || !content) return undefined;
    const measure = () => {
      // Both siblings use the article's layout origin; opening transforms must not change clearance.
      const overlap = Math.max(0, content.offsetLeft + content.offsetWidth - tools.offsetLeft + 6);
      const height = tools.offsetHeight;
      // Complete geometry reads before invalidating layout, including ResizeObserver's first delivery.
      const clearance = `${overlap}px`, toolHeight = `${height}px`;
      if (article.style.getPropertyValue('--mobile-message-tool-clearance') !== clearance)
        article.style.setProperty('--mobile-message-tool-clearance', clearance);
      if (article.style.getPropertyValue('--mobile-message-tool-height') !== toolHeight)
        article.style.setProperty('--mobile-message-tool-height', toolHeight);
    };
    measure();
    let resizeFrame;
    const observer = new ResizeObserver(() => {
      if (resizeFrame !== undefined) return;
      resizeFrame = requestAnimationFrame(() => { resizeFrame = undefined; measure(); });
    });
    observer.observe(tools);
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      article.style.removeProperty('--mobile-message-tool-clearance'); article.style.removeProperty('--mobile-message-tool-height');
    };
  }, [mobile, visible, presentedExpanded, toolsRef, articleRef]);

  const collapseBeforeDialog = () => {
    // A modal replaces these controls immediately; do not resize the chat again
    // halfway through its entrance animation when the toolbar fade timer expires.
    settled.current = false;
    setPresentedExpanded(false);
    setSwapping(false);
  };
  return { presentedExpanded: mobile ? presentedExpanded : expanded, reserved: mobile && visible && presentedExpanded,
    swapping: mobile && swapping, collapseBeforeDialog };
}
