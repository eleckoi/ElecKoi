import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { DshPlusIcon } from "../icons/dshComposerIcons.jsx";
import "../styles/sidebar-create-button.css";

export function SidebarCreateButton({ title, expanded, onClick, onPointerDown }) {
  return (
    <Tooltip label={title} side="bottom" delayMs={500}><button
      className="sidebar-create-button"
      type="button"
      aria-label={title}
      aria-expanded={typeof expanded === "boolean" ? expanded : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {/* Share the button's viewport so fractional zoom cannot snap the icon's
          smaller canvas independently of its surrounding border. */}
      <svg className="sidebar-create-icon" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
        <g transform="translate(7 7)"><DshPlusIcon size={16} /></g>
      </svg>
    </button></Tooltip>
  );
}
