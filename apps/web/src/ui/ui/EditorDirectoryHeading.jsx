import { useEditorPresentation } from './EditorPresentationContext.jsx';
import '../styles/editor-heading.css';

/** Titles share their origin; range controls keep their own row only where available. */
export function EditorDirectoryHeading({ title, leading, children, unified = false, toplineClassName = '' }) {
  const { sectionTitleInHeader } = useEditorPresentation();
  const showTitle = title && !sectionTitleInHeader;
  if (!showTitle && !leading && !children) return null;
  const heading = showTitle && <div className="editor-page-title">{typeof title === 'string' ? <h1>{title}</h1> : title}</div>;
  if (unified) return <header className="editor-directory-heading character-studio-toolbar">{heading}{leading}{children}</header>;
  return <header className={`editor-directory-heading${leading ? ' has-scope' : ''}`}>
    {(showTitle || (!leading && children)) && <div className={`editor-directory-topline ${toplineClassName}`}>
      {heading}
      {!leading && children}
    </div>}
    {leading && <div className="editor-directory-scopebar">{leading}{children}</div>}
  </header>;
}

export function EditorDirectoryActions({ label, children, className = '' }) {
  return <div className={`editor-directory-actions setting-toolbar-group ${className}`} role="group" aria-label={label}>{children}</div>;
}
