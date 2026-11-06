import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { DshCloseFillIcon, DshSearchIcon } from "../icons/dshComposerIcons.jsx";

export function DshSearchField({ value, onValueChange, placeholder: placeholderSource, ariaLabel: ariaLabelSource, className = "", autoFocus = false }) {
  const tUi = useProductTranslation();
  const placeholder = placeholderSource === undefined ? tUi("搜索…") : placeholderSource;
  const ariaLabel = ariaLabelSource === undefined ? tUi("搜索") : ariaLabelSource;
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
        <button type="button" className="dsh-search-field-clear" aria-label={tUi("清除搜索")} onClick={() => onValueChange("")}>
          <DshCloseFillIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
