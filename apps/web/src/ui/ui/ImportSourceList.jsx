import { localizeUiCopy } from '../../app/i18n/productCopy.js';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { ImportIcon } from '../icons/index.jsx';
import { CaretRight } from '../icons/interfaceIcons.jsx';
import '../styles/import-source-list.css';

export function ImportSourceList({ sources, onSelect, disabled = false }) {
  const tUi = useProductTranslation();
  return <div className="import-source-list">
    {localizeUiCopy(sources, tUi).map(({ id, title, detail }) => (
      <button type="button" key={id} disabled={disabled} onClick={() => onSelect(id)}>
        <ImportIcon size={22} />
        <span><strong>{title}</strong><small>{detail}</small></span>
        <CaretRight size={17} />
      </button>
    ))}
  </div>;
}
