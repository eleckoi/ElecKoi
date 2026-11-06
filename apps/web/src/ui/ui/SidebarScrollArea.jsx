import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import '../styles/sidebar-scroll-area.css';
import { applySidebarListWheel } from '../hooks/useSidebarListScroll.js';

export const SidebarScrollArea = forwardRef(function SidebarScrollArea({ className, children }, forwardedRef) {
  const tUi = useProductTranslation();
  const area = useRef(null), viewport = useRef(null), content = useRef(null), drag = useRef(null);
  const id = useId();
  const [metrics, setMetrics] = useState({ height: 0, thumb: 0, offset: 0, max: 0, value: 0 });
  const [dragging, setDragging] = useState(false);
  useImperativeHandle(forwardedRef, () => viewport.current, []);

  useLayoutEffect(() => {
    const element = viewport.current;
    const update = () => {
      const height = element.clientHeight, max = Math.max(0, element.scrollHeight - height);
      const thumb = Math.min(height, Math.max(24, height * height / Math.max(height, element.scrollHeight)));
      const value = Math.max(0, Math.min(max, element.scrollTop));
      const next = { height, thumb, max, value, offset: max ? value / max * (height - thumb) : 0 };
      setMetrics(previous => Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(content.current);
    element.addEventListener('scroll', update, { passive: true });
    const wheel = event => { if (event.target.closest('.sidebar-scrollbar')) applySidebarListWheel(element, event); };
    const container = area.current;
    container.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); container.removeEventListener('wheel', wheel); };
  }, []);

  function movePointer(event, grab) {
    const track = event.currentTarget.getBoundingClientRect();
    const travel = metrics.height - metrics.thumb;
    if (travel > 0) viewport.current.scrollTop = Math.max(0, Math.min(1, (event.clientY - track.top - grab) / travel)) * metrics.max;
  }

  return <div ref={area} className={`sidebar-scroll-area${dragging ? ' is-dragging' : ''}`}>
    <div ref={viewport} id={id} className={`sidebar-scroll-viewport ${className}`}>
      <div ref={content} className="sidebar-scroll-content">{children}</div>
    </div>
    {metrics.max > 0 ? <div className="sidebar-scrollbar" role="scrollbar" tabIndex={0} aria-label={tUi("滚动列表")}
      aria-controls={id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.ceil(metrics.max)} aria-valuenow={Math.round(metrics.value)}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const grab = event.target.closest('.sidebar-scroll-thumb') ? event.clientY - event.currentTarget.getBoundingClientRect().top - metrics.offset : metrics.thumb / 2;
        drag.current = { pointerId: event.pointerId, grab };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        movePointer(event, grab);
      }}
      onPointerMove={event => { if (drag.current?.pointerId === event.pointerId) movePointer(event, drag.current.grab); }}
      onPointerUp={event => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null; setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onKeyDown={event => {
        const element = viewport.current;
        const positions = { ArrowDown: element.scrollTop + 40, ArrowUp: element.scrollTop - 40,
          PageDown: element.scrollTop + element.clientHeight, PageUp: element.scrollTop - element.clientHeight, Home: 0, End: metrics.max };
        if (Object.hasOwn(positions, event.key)) { event.preventDefault(); element.scrollTop = positions[event.key]; }
      }}>
      <span className="sidebar-scroll-thumb" style={{ height: metrics.thumb, transform: `translateY(${metrics.offset}px)` }} />
    </div> : null}
  </div>;
});
