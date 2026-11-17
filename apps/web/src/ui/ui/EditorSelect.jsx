import { useRef, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown } from '../icons/interfaceIcons.jsx';
import { useEditorPresentation } from './EditorPresentationContext.jsx';
import './editor-select.css';

/** Menu choices use official controls; touch dragging leaves the document scrollable. */
export function EditorSelect({ value, options, onChange, label, disabled = false, menu = false }) {
  const { compact } = useEditorPresentation();
  const [open, setOpen] = useState(false);
  const gesture = useRef(null);
  if (!compact && !menu) return <select aria-label={label} disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>
    {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </select>;
  const selected = options.find(option => option.value === value);
  return <Menu className="editor-select" portal dense minWidthFromAnchor autoFocus={!compact} open={open} selectedId={value} onClose={() => setOpen(false)}
    items={options.map(option => ({ id: option.value, label: option.label, disabled: option.disabled }))}
    onSelect={next => { setOpen(false); onChange(next); }}
    anchor={<Button variant="outline" className={`editor-select-control${compact ? '' : ' is-desktop'}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onKeyDown={event => {
        if (!compact && !open && ['ArrowDown', 'ArrowUp'].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault(); setOpen(true);
        }
      }}
      onPointerDown={event => { gesture.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY, moved: false } : null; }}
      onPointerMove={event => {
        const touch = gesture.current;
        if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) touch.moved = true;
      }}
      onPointerCancel={() => { if (gesture.current) gesture.current.moved = true; }}
      onClick={event => {
        if (event.detail !== 0 && gesture.current?.moved) { event.preventDefault(); return; }
        setOpen(current => !current);
      }}><span>{selected?.label ?? value}</span><CaretDown size={14} /></Button>} />;
}
