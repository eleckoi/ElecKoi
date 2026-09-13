import { useEffect, useRef, useState } from "react";

export function DynamicSettingsNameDialog({ dialog, busy, onCancel, onConfirm }) {
  const [value, setValue] = useState(dialog?.value || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(dialog?.value || "");
    if (dialog) requestAnimationFrame(() => inputRef.current?.select());
  }, [dialog]);

  if (!dialog) return null;
  const normalized = value.trim();
  return (
    <div className="setting-library-dialog-overlay" role="presentation" onMouseDown={onCancel}>
      <section className="setting-library-dialog dynamic-settings-name-dialog" role="dialog" aria-modal="true" aria-labelledby="dynamic-settings-name-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="dynamic-settings-name-title">{dialog.title}</h2>
        <label>
          <span>{dialog.label}</span>
          <input
            ref={inputRef}
            value={value}
            maxLength={dialog.maxLength || 60}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
              if (event.key === "Enter" && normalized && !busy) onConfirm(normalized);
            }}
          />
        </label>
        <div>
          <button type="button" disabled={busy} onClick={onCancel}>取消</button>
          <button type="button" className="is-primary" disabled={!normalized || busy} onClick={() => onConfirm(normalized)}>{busy ? "保存中…" : dialog.confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
