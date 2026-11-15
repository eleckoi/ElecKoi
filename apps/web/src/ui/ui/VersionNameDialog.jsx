import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useId, useState } from 'react';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../styles/product-dialogs.css';
import '../styles/version-name-dialog.css';

export function VersionNameDialog({ title, confirmLabel, versions, onCancel, onCreate, initialName = '', excludeId, nameLabel: nameLabelSource }) {
  const tUi = useProductTranslation();
  const nameLabel = nameLabelSource === undefined ? tUi("版本名称") : nameLabelSource;
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [validation, setValidation] = useState('');
  function submit(event) {
    event?.preventDefault();
    const normalized = name.trim();
    if (!normalized) return setValidation(tUi("请输入{value0}", {value0: nameLabel}));
    if (versions.some(version => version.id !== excludeId && version.name.trim() === normalized)) return setValidation(tUi("{value0}已存在", {value0: nameLabel}));
    onCreate(normalized);
  }
  return <Modal open title={title} closeLabel={tUi("关闭")} onClose={onCancel} className="product-dialog version-name-dialog"
    contentClassName="product-dialog-content" footer={<div className="product-dialog-actions"><Button variant="outline" onClick={onCancel}>{tUi("取消")}</Button><Button variant="primary" onClick={submit}>{confirmLabel}</Button></div>}>
      <form className="product-dialog-fields" onSubmit={submit}>
        <label>
          <span>{nameLabel}</span>
          <Input className="product-dialog-field" data-modal-autofocus value={name} placeholder={nameLabel} aria-invalid={Boolean(validation)}
            aria-describedby={validation ? errorId : undefined}
            onChange={(event) => { setName(event.target.value); setValidation(''); }} />
        </label>
        {validation ? <small id={errorId} role="alert">{validation}</small> : null}
      </form>
    </Modal>;
}
