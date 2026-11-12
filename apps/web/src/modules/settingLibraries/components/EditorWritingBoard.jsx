import { useState } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { EditorTextInput } from '../../../ui/ui/EditorTextInput.jsx';
import { MarkdownTextareaField } from './MarkdownTextareaField.jsx';

export function EditorWritingBoard({ label, value, onChange, placeholder, code = true, className = '', status, readOnly = false, mode, disabled = false, showHeading = true }) {
  const tUi = useProductTranslation(), [host, setHost] = useState(null);
  return <section className={`rs-writing ${className}`} aria-label={tUi('{value0}输入区', { value0: label })}>
    {showHeading && <header className="rs-writing-heading"><span>{label}</span>{mode && <span className="rs-writing-mode">{mode}</span>}</header>}
    {readOnly ? <EditorTextInput label={label} value={value} readOnly code={code} /> : <MarkdownTextareaField label={label} value={value} onChange={onChange} placeholder={placeholder} code={code} preview={false} disabled={disabled} immersiveHost={host} />}
    <footer className="rs-writing-footer"><span>{status || tUi('{value0} 字符', { value0: value.length })}</span><div className="setting-footer-tools">{status && <span>{tUi('{value0} 字符', { value0: value.length })}</span>}{!readOnly && <div className="setting-immersive-host" ref={setHost} />}</div></footer>
  </section>;
}
