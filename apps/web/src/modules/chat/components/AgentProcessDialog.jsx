import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCloseOutlineRegular, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useBottomSheetDismiss } from '../../../ui/hooks/useBottomSheetDismiss.js';
import { isProcessTimingRunning, processDurationText } from '../model/agentProcessTiming.js';
import '../styles/process-dialog.css';

/** Product container; process rows retain their original Session Slot ownership. */
export function AgentProcessDialog({ message, onClose, onContentTarget }) {
  const { overlayRef, sheetRef, closing, dismiss } = useBottomSheetDismiss(onClose);
  const [now, setNow] = useState(Date.now);
  const timingRunning = isProcessTimingRunning(message);
  const running = message?.pending === true || message?.status === 'streaming' || message?.status === 'running';
  const duration = processDurationText(message, now);

  useEffect(() => {
    if (!timingRunning) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [timingRunning, message?.processTiming?.startedAtMillis]);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const onEscape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || closing) return;
      const dialog = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (dialog && dialog !== sheetRef.current) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [closing, dismiss]);

  return createPortal(<SystemBarOverlay ref={overlayRef} className="roleplay-process-backdrop" maskPseudo="::before"
    systemBarSurfaceRef={sheetRef} data-sheet-closing={closing || undefined} role="presentation"
    onMouseDown={dismiss}>
    <MenuSurface ref={sheetRef} className="roleplay-process-dialog" role="dialog" aria-modal="true"
      aria-label="处理过程" tabIndex={-1} onMouseDown={event => event.stopPropagation()}>
      <header className="roleplay-process-header">
        <div><h2>处理过程</h2><span>{running ? '进行中' : message?.status === 'error' ? '处理失败'
          : message?.status === 'cancelled' ? '已停止' : '已完成'}{duration ? <><i />{duration}</> : null}</span></div>
        <button type="button" className="roleplay-process-close" onClick={dismiss} aria-label="关闭处理过程">
          <IconCloseOutlineRegular size={20} />
        </button>
      </header>
      <div className="roleplay-process-scroll"><div className="roleplay-process-content" ref={onContentTarget} /></div>
    </MenuSurface>
  </SystemBarOverlay>, document.body);
}
