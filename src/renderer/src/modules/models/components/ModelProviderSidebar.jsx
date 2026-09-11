import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { DshSearchField } from "../../../ui/ui/DshSearchField.jsx";
import { SidebarCreateButton } from "../../../ui/ui/SidebarCreateButton.jsx";
import { filterProviderItems, modelProviderSections } from "../model/modelProviderCatalog.js";
import { ProviderLogo } from "./ProviderLogo.jsx";

export function ModelProviderSidebar({
  providerItems,
  createProviderItems,
  activeProviderId,
  collapsedGroups,
  onToggle,
  onSelect,
  onCreate,
  onRequestDelete,
}) {
  const [query, setQuery] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [providerMenu, setProviderMenu] = useState(null);
  const createMenuRef = useRef(null);
  const visibleItems = useMemo(() => filterProviderItems(providerItems, query), [providerItems, query]);
  const visibleGroups = useMemo(() => modelProviderSections
    .map((section) => ({ ...section, items: visibleItems.filter((item) => item.section === section.id) }))
    .filter((section) => section.items.length), [visibleItems]);
  const createGroups = useMemo(() => modelProviderSections
    .map((section) => ({ ...section, items: createProviderItems.filter((item) => item.section === section.id) }))
    .filter((section) => section.items.length), [createProviderItems]);

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && createMenuRef.current?.contains(event.target)) return;
      setCreateMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [createMenuOpen]);

  function openProviderMenu(event, provider) {
    event.preventDefault();
    event.stopPropagation();
    setCreateMenuOpen(false);
    if (provider.fixed !== false) {
      setProviderMenu(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const openedFromKeyboard = event.clientX === 0 && event.clientY === 0;
    setProviderMenu({
      provider,
      trigger: event.currentTarget,
      x: openedFromKeyboard ? bounds.left + 24 : event.clientX,
      y: openedFromKeyboard ? bounds.top + 24 : event.clientY,
    });
  }

  return (
    <aside className="model-config-sidebar">
      <header className="model-sidebar-header">
        <h2>模型库</h2>
      </header>
      <div className="model-sidebar-tools" ref={createMenuRef}>
        <DshSearchField
          value={query}
          onValueChange={setQuery}
          placeholder="搜索模型配置…"
          ariaLabel="搜索模型配置"
        />
        <SidebarCreateButton
          title="新建模型配置"
          expanded={createMenuOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setCreateMenuOpen((current) => !current);
          }}
        />
        {createMenuOpen ? (
          <div className="model-provider-create-menu" role="menu" aria-label="新建模型配置">
            {createGroups.map((section) => (
              <div className="model-provider-create-group" key={section.id}>
                <span>{section.label}</span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onCreate(item.id);
                    }}
                  >
                    <ProviderLogo provider={item} className="model-create-provider-icon" />
                    <b>{item.label}</b>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="model-config-list">
        {visibleGroups.map((section) => {
          const collapsed = collapsedGroups?.[section.id] === true;
          const showProviderList = !collapsed || Boolean(query.trim());
          return (
            <div className="model-group-block" key={section.id}>
              <button className="model-group-row" type="button" onClick={() => onToggle(section.id)}>
                <span>
                  <i className={`model-group-toggle ${collapsed ? "collapsed" : ""}`}>
                    <ChevronRightIcon />
                  </i>
                  {section.label}
                </span>
                <em>{section.items.length}</em>
              </button>
              {showProviderList ? (
                <div className="model-provider-list">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      className={`model-config-provider ${activeProviderId === item.id ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setProviderMenu(null);
                        onSelect(item.id);
                      }}
                      onContextMenu={(event) => openProviderMenu(event, item)}
                      onKeyDown={(event) => {
                        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                          openProviderMenu(event, item);
                        }
                      }}
                    >
                      <span className="model-provider-logo">
                        <ProviderLogo provider={item} className="model-provider-icon" />
                      </span>
                      <span className="model-provider-copy">
                        <b>{item.label}</b>
                        <em>{item.summary}</em>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {!visibleGroups.length ? <p className="model-provider-empty">没有匹配的模型配置</p> : null}
      </div>
      {providerMenu ? (
        <ModelProviderContextMenu
          menu={providerMenu}
          onClose={() => setProviderMenu(null)}
          onDelete={() => {
            const { provider, trigger } = providerMenu;
            setProviderMenu(null);
            onRequestDelete?.(provider, trigger);
          }}
        />
      ) : null}
    </aside>
  );
}

function ModelProviderContextMenu({ menu, onClose, onDelete }) {
  const menuRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const element = menuRef.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector("button")?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    function closeOutside(event) {
      if (!menuRef.current?.contains(event.target)) closeRef.current();
    }
    function close() {
      closeRef.current();
    }
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOutside, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOutside, true);
    };
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className="model-provider-context-menu"
      role="menu"
      aria-label={`${menu.provider.label}的操作`}
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
          menu.trigger?.focus();
        }
      }}
    >
      <button type="button" role="menuitem" onClick={onDelete}>
        <TrashIcon aria-hidden="true" />
        <span>删除模型入口</span>
      </button>
    </div>,
    document.body,
  );
}
