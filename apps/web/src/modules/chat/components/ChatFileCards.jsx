import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { FileText, X } from '../../../ui/icons/interfaceIcons.jsx';
import { useState } from 'react';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatFileCards({ files = [], onRemove, onOpen, compact = false }) {
  const tUi = useProductTranslation();
  const [error, setError] = useState(null);
  if (!files.length) return null;
  return <div className={`chat-file-cards${compact ? ' compact' : ''}`}>
    {files.map((file) => {
      const Tag = onOpen ? 'button' : 'div';
      return <Tag className="chat-file-card" key={file.id || `${file.attachmentId}:${file.name}`} title={file.name}
        {...(onOpen ? { type: 'button', onClick: () => {
          setError(null);
          Promise.resolve(onOpen(file)).catch((cause) => setError(cause ?? tUi("打开文件失败")));
        } } : {})}>
      <FileText size={23} weight="regular" aria-hidden="true" />
      <span className="chat-file-card-label"><span className="chat-file-card-name">{file.name}</span><small>{sizeLabel(file.bytes)}</small></span>
      {onRemove ? <button type="button" onClick={() => onRemove(file.id)} aria-label={tUi("移除 {value0}", {value0: file.name})}><X size={14} /></button> : null}
    </Tag>;
    })}
    <FailureAlert failure={error} className="chat-file-error" />
  </div>;
}
