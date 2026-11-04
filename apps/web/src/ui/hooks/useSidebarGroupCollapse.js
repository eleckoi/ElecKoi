import { useLayoutEffect, useRef } from 'react';

export function useSidebarGroupCollapse(collapsedGroups, scrollSelector = '.character-list-scroll') {
  const pendingCollapse = useRef(null);
  // Keep the folded heading reachable while later sections still overflow.
  useLayoutEffect(() => {
    const heading = pendingCollapse.current;
    pendingCollapse.current = null;
    if (!heading?.isConnected) return;
    const scroll = heading.closest(scrollSelector);
    if (!scroll) return;
    const row = heading.getBoundingClientRect();
    const bounds = scroll.getBoundingClientRect();
    if (row.top < bounds.top || row.bottom > bounds.bottom) {
      scroll.scrollTop += row.top - bounds.top;
    }
  }, [collapsedGroups, scrollSelector]);
  return (heading) => { pendingCollapse.current = heading; };
}
