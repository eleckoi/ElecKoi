import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../ui/styles/product-dialogs.css';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { ImportSourceList } from '../../../ui/ui/ImportSourceList.jsx';

const SOURCES = [
  { id: 'eleckoi', title: 'ElecKoi 预设', detail: 'PNG 或 JSON' },
  { id: 'sillytavern', title: '酒馆预设', detail: 'JSON' },
];

export function PresetImportDialog({ onSelect, onClose }) {
  const tUi = useProductTranslation();
  return <Modal open title={tUi('导入预设')} closeLabel={tUi('关闭')} onClose={onClose} className="product-dialog" contentClassName="product-dialog-content">
    <ImportSourceList sources={SOURCES} onSelect={onSelect} />
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
