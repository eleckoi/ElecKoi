import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../ui/styles/product-dialogs.css';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { ChevronRightIcon, ImportIcon } from '../../../ui/icons/index.jsx';

export function PresetImportDialog({ onSelect, onClose }) {
  const tUi = useProductTranslation();
  return <Modal open title={tUi('导入预设')} closeLabel={tUi('关闭')} onClose={onClose} className="product-dialog" contentClassName="product-dialog-content">
      <div className="preset-import-source-list">
        <button type="button" data-modal-autofocus onClick={() => onSelect('eleckoi')}>
          <ImportIcon /><span><strong>{tUi("ElecKoi 预设")}</strong><small>{tUi("PNG 或 JSON")}</small></span><ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onSelect('sillytavern')}>
          <ImportIcon /><span><strong>{tUi("酒馆预设")}</strong><small>JSON</small></span><ChevronRightIcon />
        </button>
      </div>
  </Modal>;
}

export function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.onerror = () => reject(new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, `${file.name} 无法读取`, { operation: 'read', path: file.name }));
    reader.readAsDataURL(file);
  });
}

export function downloadPresetFile({ fileName, mimeType, base64 }) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
