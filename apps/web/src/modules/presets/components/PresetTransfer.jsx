import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect } from 'react';
import { ChevronRightIcon, ImportIcon, XIcon } from '../../../ui/icons/index.jsx';

export function PresetImportDialog({ onSelect, onClose }) {
  const tUi = useProductTranslation();
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <SystemBarOverlay className="preset-import-overlay" role="presentation" onMouseDown={onClose}>
    <section className="preset-import-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <h3 id="preset-import-title">{tUi("导入预设")}</h3>
        <button type="button" aria-label={tUi("关闭")} onClick={onClose}><XIcon /></button>
      </header>
      <div className="preset-import-source-list">
        <button type="button" autoFocus onClick={() => onSelect('eleckoi')}>
          <ImportIcon /><span><strong>{tUi("ElecKoi 预设")}</strong><small>{tUi("PNG 或 JSON")}</small></span><ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onSelect('sillytavern')}>
          <ImportIcon /><span><strong>{tUi("酒馆预设")}</strong><small>JSON</small></span><ChevronRightIcon />
        </button>
      </div>
    </section>
  </SystemBarOverlay>;
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
