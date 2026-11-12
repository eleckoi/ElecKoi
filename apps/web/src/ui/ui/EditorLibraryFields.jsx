export function EditorField({ label, children, top = false }) {
  return <div className={`rs-field${top ? ' is-top' : ''}`}><span className="rs-label">{label}</span><div className="rs-control">{children}</div></div>;
}

export function EditorSwitch({ label, checked, onChange, disabled = false }) {
  return <button type="button" className="rs-switch" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={event => { event.stopPropagation(); onChange(!checked); }}><span /></button>;
}
