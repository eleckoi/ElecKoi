import { useId, useLayoutEffect } from 'react';

/** Bind a mounted trigger to its portaled CSS-positioned panel. */
export function useCssAnchor(anchor) {
  const id = useId().replaceAll(':', '');
  const name = `--eleckoi-popover-${id}`;
  useLayoutEffect(() => {
    const previous = anchor.style.getPropertyValue('anchor-name');
    const priority = anchor.style.getPropertyPriority('anchor-name');
    anchor.style.setProperty('anchor-name', name);
    return () => anchor.style.setProperty('anchor-name', previous, priority);
  }, [anchor, name]);
  return name;
}
