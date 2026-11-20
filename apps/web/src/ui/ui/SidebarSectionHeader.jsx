import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { forwardRef, useRef, useState } from "react";
import { Button, Input, IconCloseFillRegular, IconSearchOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { SidebarCreateButton } from "./SidebarCreateButton.jsx";
import "../styles/sidebar-section-header.css";

export const SidebarSectionHeader = forwardRef(function SidebarSectionHeader({
  title, value, onValueChange, placeholder, searchLabel: searchLabelSource,
  createLabel, createExpanded, onCreate, onCreatePointerDown, onSearchFocus, renderSearch,
}, ref) {
  const tUi = useProductTranslation();
  const searchLabel = searchLabelSource === undefined ? tUi("搜索{value0}", {value0: title}) : searchLabelSource;
  const searchInput = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);

  function clearSearch() {
    onValueChange("");
    searchInput.current?.focus({ preventScroll: true });
  }

  const search = <div className="sidebar-section-search" onClick={() => searchInput.current?.focus({ preventScroll: true })}
    onFocus={() => setSearchFocused(true)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false);
    }}>
    <Input data-dsh-control ref={searchInput} className="sidebar-section-search-field" icon={<IconSearchOutlineRegular />} type="search"
      value={value} onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder} aria-label={searchLabel} onFocus={onSearchFocus}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); clearSearch(); } }} />
    {searchFocused && value ? <Button data-dsh-control type="button" variant="ghost" size="sm" className="sidebar-section-search-clear" aria-label={tUi("清空搜索")}
      onClick={(event) => { event.stopPropagation(); clearSearch(); }}><IconCloseFillRegular size={14} /></Button> : null}
  </div>;

  return <div ref={ref} className="sidebar-section-header">
    <div className="sidebar-section-controls">
      {renderSearch ? renderSearch(search) : search}
      <SidebarCreateButton title={createLabel} expanded={createExpanded}
        onClick={onCreate} onPointerDown={onCreatePointerDown} />
    </div>
  </div>;
});
