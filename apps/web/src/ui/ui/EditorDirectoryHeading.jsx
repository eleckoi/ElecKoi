import '../styles/editor-heading.css';

/** Titles share their origin; range controls keep their own row only where available. */
export function EditorDirectoryHeading({ title, leading, children, toplineClassName = '' }) {
  return <header className={`editor-directory-heading${leading ? ' has-scope' : ''}`}>
    <div className={`editor-directory-topline ${toplineClassName}`}><div className="editor-page-title">{typeof title === 'string' ? <h1>{title}</h1> : title}</div>{!leading && children}</div>
    {leading && <div className="editor-directory-scopebar">{leading}{children}</div>}
  </header>;
}
