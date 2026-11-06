import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useLayoutEffect, useRef } from "react";
import { CheckIcon } from "../icons/index.jsx";
import { DshFolderClosedIcon } from "../icons/dshTreeIcons.jsx";
import { MinusIcon } from "../icons/openSourceIcons.jsx";

export function GroupAssignmentMenu({ x, y, label, currentGroupId = "", groups, onMove, actions = [] }) {
  const tUi = useProductTranslation();
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    const menu = menuRef.current, bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [x, y]);

  function moveFocus(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(menuRef.current?.querySelectorAll("button:not(:disabled)") || [])];
    if (!buttons.length) return;
    event.preventDefault();
    const currentIndex = buttons.indexOf(document.activeElement);
    if (event.key === "Home") buttons[0].focus();
    else if (event.key === "End") buttons.at(-1).focus();
    else {
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (Math.max(0, currentIndex) + step + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
    }
  }

  return (
    <div
      ref={menuRef}
      className="group-assignment-menu"
      role="menu"
      aria-label={label}
      style={{ left: `${x}px`, top: `${y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {actions.length ? <div className="group-assignment-menu-actions" role="group" aria-label={tUi("角色卡操作")}>
        {actions.map(({ label: text, icon: Icon, disabled, run }) => <button key={text} type="button" role="menuitem" disabled={disabled} onClick={run}>
          <Icon /><span>{text}</span>
        </button>)}
      </div> : null}
      <button type="button" role="menuitem" disabled={!currentGroupId} onClick={() => void onMove("")}>
        {currentGroupId ? <MinusIcon /> : <CheckIcon />}
        <span>{currentGroupId ? tUi("移出分组") : tUi("未分组")}</span>
      </button>
      {groups.length ? <div className="group-assignment-menu-targets" role="group" aria-label={tUi("目标分组")}>
        {groups.map((group) => {
          const current = group.id === currentGroupId;
          return (
            <button key={group.id} type="button" role="menuitem" disabled={current} aria-current={current ? "true" : undefined} onClick={() => void onMove(group.id)}>
              {current ? <CheckIcon /> : <DshFolderClosedIcon />}
              <span>{group.name}</span>
            </button>
          );
        })}
      </div> : null}
    </div>
  );
}
