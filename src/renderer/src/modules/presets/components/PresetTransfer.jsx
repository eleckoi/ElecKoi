import { useEffect } from 'react';
import { ChevronRightIcon, ImportIcon, XIcon } from '../../../ui/icons/index.jsx';

export function PresetImportDialog({ onSelect, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="preset-import-overlay" role="presentation" onMouseDown={onClose}>
    <section className="preset-import-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <h3 id="preset-import-title">导入预设</h3>
        <button type="button" aria-label="关闭" onClick={onClose}><XIcon /></button>
      </header>
      <div className="preset-import-source-list">
        <button type="button" autoFocus onClick={() => onSelect('eleckoi')}>
          <ImportIcon /><span><strong>ElecKoi 预设</strong><small>PNG 或 JSON</small></span><ChevronRightIcon />
        </button>
        <button type="button" onClick={() => onSelect('sillytavern')}>
          <ImportIcon /><span><strong>酒馆预设</strong><small>JSON</small></span><ChevronRightIcon />
        </button>
      </div>
    </section>
  </div>;
}

export function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.onerror = () => reject(new Error(`${file.name} 无法读取`));
    reader.readAsDataURL(file);
  });
}

export function downloadPresetJson(fileName, json) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
