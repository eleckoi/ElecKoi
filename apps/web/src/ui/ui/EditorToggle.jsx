import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import './editor-toggle.css';

/** Keep tree selection separate from the official switch's state change. */
export function EditorToggle({ label, title, checked, onChange, disabled = false, className = '' }) {
  const stop = event => event.stopPropagation();
  return <span className="editor-toggle-control" onClick={stop} onMouseDown={stop} onDoubleClick={stop}>
    <Switch className={`editor-toggle ${className}`} label={label} title={title} checked={checked} disabled={disabled} onChange={onChange} />
  </span>;
}
