// Interaction ported from DeepSeek Harness `ui-layout/AppFrame.tsx`.
// Upstream license: MIT, Copyright (c) 2026 DeepSeek.
import { useCallback, useEffect, useRef, useState } from "react";

export function SidePanelResizeHandle({ onStart, onDrag, onEnd }) {
  const [dragging, setDragging] = useState(false);
  const originRef = useRef(0);
  const latestRef = useRef(0);
  const frameRef = useRef(null);
  const draggingRef = useRef(false);
  const callbacksRef = useRef({ onStart, onDrag, onEnd });
  callbacksRef.current = { onStart, onDrag, onEnd };

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (draggingRef.current) callbacksRef.current.onEnd();
  }, []);

  const finishDrag = useCallback((event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    callbacksRef.current.onDrag(latestRef.current - originRef.current);
    draggingRef.current = false;
    setDragging(false);
    callbacksRef.current.onEnd();
  }, []);

  const cancelDrag = useCallback((event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (!draggingRef.current) return;
    callbacksRef.current.onDrag(latestRef.current - originRef.current);
    draggingRef.current = false;
    setDragging(false);
    callbacksRef.current.onEnd();
  }, []);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    originRef.current = event.clientX;
    latestRef.current = event.clientX;
    callbacksRef.current.onStart();
    draggingRef.current = true;
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    latestRef.current = event.clientX;
    frameRef.current ??= requestAnimationFrame(() => {
      frameRef.current = null;
      callbacksRef.current.onDrag(latestRef.current - originRef.current);
    });
  }, []);

  return (
    <div
      className="side-panel-resizer"
      role="separator"
      aria-label="调整侧边栏宽度"
      aria-orientation="vertical"
      data-dragging={dragging || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    />
  );
}
