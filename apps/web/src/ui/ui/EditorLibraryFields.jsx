import { EditorToggle } from './EditorToggle.jsx';

export function EditorField({ label, children, top = false }) {
  return <div className={`rs-field${top ? ' is-top' : ''}`}><span className="rs-label">{label}</span><div className="rs-control">{children}</div></div>;
}

export function EditorSwitch({ label, checked, onChange, disabled = false }) {
  return <EditorToggle className="rs-switch" label={label} checked={checked} disabled={disabled} onChange={onChange} />;
}
