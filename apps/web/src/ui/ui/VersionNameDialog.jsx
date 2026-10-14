import { SystemBarOverlay } from './SystemBarOverlay.jsx';
import { useEffect, useId, useRef, useState } from 'react';

export function VersionNameDialog({ title, confirmLabel, versions, onCancel, onCreate, autoFocus = true }) {
  const titleId = useId();
  const errorId = useId();
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const [name, setName] = useState('');
  const [validation, setValidation] = useState('');

  useEffect(() => {
    const previousFocus = document.activeElement;
    if (autoFocus) inputRef.current?.focus();
    else formRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
      } else if (event.key === 'Tab') {
        const controls = [...formRef.current.querySelectorAll('input, button')];
        const target = event.shiftKey ? controls.at(-1) : controls[0];
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (document.activeElement === boundary) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onCancel, autoFocus]);

  return (
    <SystemBarOverlay className="version-name-overlay" role="presentation" onMouseDown={onCancel}>
      <form ref={formRef} tabIndex={-1} className="version-name-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => {
          event.preventDefault();
          const normalized = name.trim();
          if (!normalized) return setValidation('请输入版本名称');
          if (versions.some((version) => version.name.trim() === normalized)) return setValidation('版本名称已存在');
          onCreate(normalized);
        }}>
        <h2 id={titleId}>{title}</h2>
        <label>
          <span>版本名称</span>
          <input ref={inputRef} value={name} maxLength={60} placeholder="版本名称" aria-invalid={Boolean(validation)}
            aria-describedby={validation ? errorId : undefined}
            onChange={(event) => { setName(event.target.value); setValidation(''); }} />
        </label>
        {validation ? <small id={errorId} role="alert">{validation}</small> : null}
        <div className="version-name-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="submit" className="is-primary">{confirmLabel}</button>
        </div>
      </form>
    </SystemBarOverlay>
  );
}
