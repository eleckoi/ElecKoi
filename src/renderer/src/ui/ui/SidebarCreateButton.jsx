import { PlusIcon } from "../icons/index.jsx";

export function SidebarCreateButton({ title, expanded, onClick, onPointerDown }) {
  return (
    <button
      className="sidebar-create-button"
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={typeof expanded === "boolean" ? expanded : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <PlusIcon />
    </button>
  );
}
