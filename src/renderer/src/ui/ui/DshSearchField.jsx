import { DshCloseFillIcon, DshSearchIcon } from "../icons/dshComposerIcons.jsx";

export function DshSearchField({ value, onValueChange, placeholder = "搜索…", ariaLabel = "搜索", className = "", autoFocus = false }) {
  return (
    <div className={`dsh-search-field${className ? ` ${className}` : ""}`}>
      <span className="dsh-search-field-icon">
        <DshSearchIcon size={11} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      />
      {value ? (
        <button type="button" className="dsh-search-field-clear" aria-label="清除搜索" onClick={() => onValueChange("")}>
          <DshCloseFillIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
