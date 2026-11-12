import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorTextInput } from '../../../ui/ui/EditorTextInput.jsx';

// These thresholds select a rendering strategy, never a content or saving limit.
function needsViewport(value) {
  if (value.length > 12000) return true;
  let index = -1;
  for (let lines = 0; lines < 200; lines++) {
    index = value.indexOf('\n', index + 1);
    if (index < 0) return false;
  }
  return true;
}

/** Short prose keeps its document layout; long prose shares the editor's complete viewport document. */
export function PresetReadableText({ value, label, className = '', emptyText = '' }) {
  const long = useMemo(() => needsViewport(value), [value]);
  const host = useRef(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!long || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '240px 0px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [long, visible]);
  return long ? <div ref={host} className={`${className} preset-long-reading`}>
    {visible && <EditorTextInput label={label} value={value} readOnly />}
  </div> : <p className={className}>{value || emptyText}</p>;
}
