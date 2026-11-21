import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const measureCard = (element, entry) => entry?.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height;

/** One scroll surface and one shared measurement observer for visible masonry cards. */
export function VirtualMasonry({ items, scrollClassName, gridClassName, initialState, onSaveState,
  estimateHeight, leading, empty, active = true, children }) {
  const scroll = useRef(null), grid = useRef(null), anchor = useRef(initialState?.anchor || null);
  const [geometry, setGeometry] = useState(initialState?.geometry || { width: 0, columns: 1, columnGap: 0, gap: 0, margin: 0 });
  const cardWidth = (geometry.width - geometry.columnGap * (geometry.columns - 1)) / geometry.columns;
  const keyForItem = useCallback(index => items[index].id, [items]);
  const estimateSize = useCallback(index => estimateHeight(items[index], index, Math.max(1, cardWidth)), [items, estimateHeight, cardWidth]);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => scroll.current,
    getItemKey: keyForItem, estimateSize, lanes: geometry.columns, gap: geometry.gap, overscan: 2,
    scrollMargin: geometry.margin, initialOffset: initialState?.offset || 0,
    initialMeasurementsCache: initialState?.measurements || [], enabled: geometry.width > 0,
    useAnimationFrameWithResizeObserver: true,
    measureElement: measureCard,
  });
  const latest = useRef(null);
  latest.current = { geometry, virtualizer, onSaveState };

  const releaseCardAnchor = useCallback(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
  }, [virtualizer]);

  useLayoutEffect(() => {
    const element = grid.current, viewport = scroll.current;
    const measure = () => {
      const style = getComputedStyle(element), width = element.getBoundingClientRect().width;
      if (!width) return;
      const columns = style.gridTemplateColumns.split(/\s+/).filter(value => value.endsWith('px')).length || 1;
      const columnGap = parseFloat(style.columnGap) || 0;
      const gap = parseFloat(style.getPropertyValue('--character-card-gap')) || parseFloat(style.getPropertyValue('--masonry-card-gap')) || parseFloat(style.rowGap) || 0;
      const margin = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - viewport.clientTop;
      const next = { width, columns, columnGap, gap, margin }, previous = latest.current.geometry;
      if (Object.keys(next).every(key => next[key] === previous[key])) return;
      if (previous.width && (previous.width !== width || previous.columns !== columns)) {
        releaseCardAnchor();
        const first = latest.current.virtualizer.getVirtualItems().filter(item => item.end > viewport.scrollTop)
          .sort((a, b) => a.start - b.start)[0];
        if (first) anchor.current = { index: first.index, key: first.key, delta: viewport.scrollTop - first.start, resize: true };
      }
      setGeometry(next);
    };
    measure();
    let frame;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(element); observer.observe(viewport);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [releaseCardAnchor]);

  useLayoutEffect(() => {
    if (!active || !geometry.width) return;
    const pending = anchor.current;
    if (pending) {
      anchor.current = null;
      if (pending.resize) virtualizer.measure();
      if (pending.clicked && !pending.resize) {
        // Complete pending measurements before positioning the clicked card.
        for (const node of grid.current.children) {
          const size = measureCard(node);
          if (size > 0) virtualizer.resizeItem(Number(node.dataset.index), size);
        }
      }
      const found = items.findIndex(item => item.id === pending.key);
      const index = found < 0 ? Math.min(pending.index, items.length - 1) : found;
      const row = virtualizer.getVirtualItems().find(item => item.index === index);
      const offset = row?.start ?? virtualizer.getOffsetForIndex(index, 'start')?.[0];
      if (pending.clicked && row) {
        // A measurement in another lane does not move the clicked card.
        virtualizer.shouldAdjustScrollPositionOnItemSizeChange = item =>
          item.lane === row.lane && item.index < row.index;
      }
      if (offset !== undefined) virtualizer.scrollToOffset(Math.max(0, offset + pending.delta));
    }
  }, [active, geometry.width, geometry.columns, virtualizer, items.length]);

  useLayoutEffect(() => () => {
    const current = latest.current;
    if (!current.onSaveState) return;
    releaseCardAnchor();
    const offset = scroll.current?.scrollTop || 0;
    const rows = current.virtualizer.getVirtualItems();
    const first = rows.filter(item => item.end > offset).sort((a, b) => a.start - b.start)[0];
    const measurements = new Map(current.virtualizer.takeSnapshot().map(item => [item.key, item]));
    // A user can open a card before the pending ResizeObserver frame. Capture
    // those few mounted sizes too, so returning does not restart from estimates.
    for (const node of grid.current?.children || []) {
      const row = rows.find(item => item.index === Number(node.dataset.index));
      if (!row) continue;
      const size = measureCard(node);
      if (size > 0) measurements.set(row.key, { ...row, size, end: row.start + size });
    }
    const clicked = anchor.current?.clicked ? anchor.current : null;
    current.onSaveState?.({ offset: clicked?.offset ?? offset,
      anchor: clicked ?? (first ? { index: first.index, key: first.key, delta: offset - first.start } : null),
      geometry: current.geometry, measurements: [...measurements.values()].sort((a, b) => a.index - b.index) });
  }, [releaseCardAnchor]);

  function rememberCard(row) {
    const viewport = scroll.current;
    if (!viewport || !grid.current) return;
    const card = [...grid.current.children].find(node => node.dataset.masonryId === row.key);
    if (!card) return;
    const delta = viewport.getBoundingClientRect().top + viewport.clientTop - card.getBoundingClientRect().top;
    anchor.current = { key: row.key, index: row.index, delta, offset: viewport.scrollTop, clicked: true };
  }

  return <div className={scrollClassName} ref={scroll}
    onWheelCapture={onSaveState ? releaseCardAnchor : undefined}
    onPointerDownCapture={onSaveState ? releaseCardAnchor : undefined}
    onKeyDownCapture={onSaveState ? releaseCardAnchor : undefined}>
    {leading}
    <div className={gridClassName} ref={grid} data-virtual-masonry
      style={{ position: 'relative', height: virtualizer.getTotalSize(), overflowAnchor: 'none' }}>
      {virtualizer.getVirtualItems().map(row => <div key={row.key} data-index={row.index} data-masonry-id={row.key}
        ref={virtualizer.measureElement} style={{ position: 'absolute', top: row.start - geometry.margin,
          left: row.lane * (cardWidth + geometry.columnGap), width: cardWidth, display: 'flow-root' }}>
        {children(items[row.index], row.index, cardWidth, onSaveState ? () => rememberCard(row) : undefined)}
      </div>)}
    </div>
    {!items.length && empty}
  </div>;
}
