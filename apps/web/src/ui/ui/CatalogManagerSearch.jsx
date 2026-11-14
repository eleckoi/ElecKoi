import { useRef } from 'react';
import { Input, IconSearchOutlineRegular, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';

export function CatalogManagerSearch({ value, onChange, label, placeholder, className = '' }) {
  const input = useRef(null);
  const tUi = useProductTranslation();
  return <div className={`catalog-manager-search ${className}`}>
    <Input ref={input} data-dsh-control type="search" icon={<IconSearchOutlineRegular />} value={value}
      onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
    {value ? <button type="button" className="catalog-manager-search-clear" aria-label={tUi('清空搜索')}
      onClick={() => { onChange(''); input.current?.focus(); }}><IconCloseOutlineRegular /></button> : null}
  </div>;
}
