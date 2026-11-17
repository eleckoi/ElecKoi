import { useVirtualizer } from '@tanstack/react-virtual';

/** Share the existing scroll surface; only the viewport and its nearby rows mount. */
export function useVirtualListRows({ items, scrollRef, estimateSize, initialOffset = 0 }) {
  return useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: index => items[index].id,
    estimateSize,
    initialOffset,
    initialRect: { width: 0, height: typeof window === 'undefined' ? 0 : window.innerHeight },
    overscan: 3,
  });
}

export function VirtualListRows({ items, virtualizer, children }) {
  return <div className="virtual-list-rows" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
    {virtualizer.getVirtualItems().map(row => <div key={row.key} data-index={row.index}
      ref={virtualizer.measureElement} style={{ position: 'absolute', top: row.start, width: '100%', display: 'flow-root' }}>
      {children(items[row.index], row.index)}
    </div>)}
  </div>;
}
