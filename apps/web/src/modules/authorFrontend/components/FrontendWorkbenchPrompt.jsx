import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useState, useRef } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import '../../../ui/styles/product-dialogs.css';

export function FrontendWorkbenchPrompt({ question, onResolve }) {
  const tUi = useProductTranslation(), [value, setValue] = useState(question.initialValue ?? '');
  const completed = useRef(false), inputMode = question.initialValue !== undefined;
  const finish = result => { if (!completed.current) { completed.current = true; onResolve(result); } };
  const submit = event => { event?.preventDefault(); if (!inputMode || value.trim()) finish(inputMode ? value.trim() : true); };
  return <Modal open title={question.title} description={inputMode ? undefined : question.message} closeLabel={tUi('关闭')} onClose={() => finish(null)}
    tone={question.danger ? 'warning' : undefined} className="product-dialog" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions"><Button variant="outline" data-modal-autofocus={!inputMode || undefined} onClick={() => finish(null)}>{tUi('取消')}</Button><Button variant="primary" disabled={inputMode && !value.trim()} onClick={submit}>{question.confirmLabel}</Button></div>}>
    {inputMode ? <form className="product-dialog-fields" onSubmit={submit}><label><span>{question.label || question.title}</span><Input data-modal-autofocus className="product-dialog-field" aria-label={question.label || question.title} value={value} onChange={event => setValue(event.target.value)} /></label></form> : undefined}
  </Modal>;
}
