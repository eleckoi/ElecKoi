import { forwardRef, useRef } from "react";
import { Button, Input, IconCloseFillRegular, IconSearchOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { SidebarCreateButton } from "./SidebarCreateButton.jsx";
import "../styles/sidebar-section-header.css";

export const SidebarSectionHeader = forwardRef(function SidebarSectionHeader({
  title, value, onValueChange, placeholder, searchLabel = `搜索${title}`,
  createLabel, createExpanded, onCreate, onCreatePointerDown, onSearchFocus,
}, ref) {
  const searchInput = useRef(null);

  function clearSearch() {
    onValueChange("");
    searchInput.current?.focus({ preventScroll: true });
  }

  return <div ref={ref} className="sidebar-section-header">
    <div className="sidebar-section-controls">
      <div className="sidebar-section-search" onClick={() => searchInput.current?.focus({ preventScroll: true })}>
        <Input data-dsh-control ref={searchInput} className="sidebar-section-search-field" icon={<IconSearchOutlineRegular />} type="search"
          value={value} onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder} aria-label={searchLabel} onFocus={onSearchFocus}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); clearSearch(); } }} />
        <Button data-dsh-control type="button" variant="ghost" size="sm" className="sidebar-section-search-clear" aria-label="清空搜索"
          onClick={(event) => { event.stopPropagation(); clearSearch(); }}><IconCloseFillRegular size={14} /></Button>
      </div>
      <SidebarCreateButton title={createLabel} expanded={createExpanded}
        onClick={onCreate} onPointerDown={onCreatePointerDown} />
    </div>
  </div>;
});
