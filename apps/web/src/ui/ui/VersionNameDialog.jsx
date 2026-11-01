import { useId, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import './editor-collection-controls.css';
import '../styles/version-name-dialog.css';

export function VersionNameDialog({ title, confirmLabel, versions, onCancel, onCreate, initialName = '', excludeId, nameLabel = '版本名称' }) {
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [validation, setValidation] = useState('');
  function submit(event) {
    event?.preventDefault();
    const normalized = name.trim();
    if (!normalized) return setValidation(`请输入${nameLabel}`);
    if (versions.some(version => version.id !== excludeId && version.name.trim() === normalized)) return setValidation(`${nameLabel}已存在`);
    onCreate(normalized);
  }
  return <Modal open title={title} closeLabel="关闭" onClose={onCancel} className="editor-management-modal version-name-dialog"
    contentClassName="editor-management-content" footer={<><Button variant="outline" onClick={onCancel}>取消</Button><Button variant="primary" onClick={submit}>{confirmLabel}</Button></>}>
      <form onSubmit={submit}><div className="editor-management-fields">
        <label>
          <span>{nameLabel}</span>
          <input data-modal-autofocus value={name} placeholder={nameLabel} aria-invalid={Boolean(validation)}
            aria-describedby={validation ? errorId : undefined}
            onChange={(event) => { setName(event.target.value); setValidation(''); }} />
        </label>
        </div>
        {validation ? <small id={errorId} role="alert">{validation}</small> : null}
      </form>
    </Modal>;
}
