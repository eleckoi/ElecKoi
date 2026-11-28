import { DshTriangleRightIcon } from '../icons/dshTreeIcons.jsx';

export function TreeDisclosureButton({ item, expanded, label, className = '', children }) {
  return <button type="button" className={`tree-disclosure-button ${className}`} aria-label={label} aria-expanded={expanded}
    onDoubleClick={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      if (expanded) item.collapse();
      else item.expand();
    }}>
    <span className="tree-disclosure-icon" aria-hidden="true">{children}</span>
    <span className="tree-disclosure-arrow" aria-hidden="true"><DshTriangleRightIcon /></span>
  </button>;
}
