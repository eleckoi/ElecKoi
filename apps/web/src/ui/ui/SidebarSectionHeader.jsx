import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Tooltip, IconCloseFillRegular, IconCloseOutlineRegular, IconSearchOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { SidebarCreateButton } from "./SidebarCreateButton.jsx";
import "../styles/sidebar-section-header.css";

export const SidebarSectionHeader = forwardRef(function SidebarSectionHeader({
  title, value, onValueChange, placeholder, searchLabel: searchLabelSource,
  createLabel, createExpanded, onCreate, onCreatePointerDown, onSearchFocus, renderSearch,
  compact = false, compactTitle, compactActions,
}, ref) {
  const tUi = useProductTranslation();
  const searchLabel = searchLabelSource === undefined ? tUi("搜索{value0}", {value0: title}) : searchLabelSource;
  const searchInput = useRef(null);
  const searchTrigger = useRef(null);
  const restoreFocus = useRef(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useLayoutEffect(() => {
    if (compact && searchOpen) searchInput.current?.focus({ preventScroll: true });
    if (!searchOpen && restoreFocus.current) {
      restoreFocus.current = false;
      searchTrigger.current?.focus({ preventScroll: true });
    }
  }, [compact, searchOpen]);

  function clearSearch() {
    onValueChange("");
    searchInput.current?.focus({ preventScroll: true });
  }

  function closeSearch() {
    restoreFocus.current = true;
    onValueChange("");
    setSearchFocused(false);
    setSearchOpen(false);
  }

  const search = <div className="sidebar-section-search" onClick={() => searchInput.current?.focus({ preventScroll: true })}
    onFocus={() => setSearchFocused(true)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false);
    }}>
    <Input data-dsh-control ref={searchInput} className="sidebar-section-search-field" icon={<IconSearchOutlineRegular />} type="search"
      value={value} onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder} aria-label={searchLabel} onFocus={onSearchFocus}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        if (compact) closeSearch();
        else clearSearch();
      }} />
    {compact || (searchFocused && value) ? <Button data-dsh-control type="button" variant="ghost" size="sm" className="sidebar-section-search-clear"
      aria-label={tUi(compact ? "关闭" : "清空搜索")}
      onClick={(event) => { event.stopPropagation(); if (compact) closeSearch(); else clearSearch(); }}>
      {compact ? <IconCloseOutlineRegular size={14} /> : <IconCloseFillRegular size={14} />}
    </Button> : null}
  </div>;

  return <div ref={ref} className={`sidebar-section-header${compact ? ' is-compact' : ''}`}>
    <div className="sidebar-section-controls">
      {compact && !searchOpen ? <>
        <div className="sidebar-section-label">{compactTitle ?? title}</div>
        <Tooltip label={searchLabel} side="bottom" delayMs={500} portal>
          <Button ref={searchTrigger} data-dsh-control variant="ghost" size="sm" className="sidebar-section-action"
            aria-label={searchLabel} onClick={() => setSearchOpen(true)}><IconSearchOutlineRegular size={16} /></Button>
        </Tooltip>
        {compactActions}
      </> : (renderSearch ? renderSearch(search) : search)}
      {!compact && <SidebarCreateButton title={createLabel} expanded={createExpanded}
        onClick={onCreate} onPointerDown={onCreatePointerDown} />}
    </div>
  </div>;
});
