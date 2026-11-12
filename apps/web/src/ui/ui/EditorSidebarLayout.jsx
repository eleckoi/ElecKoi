import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_INSPECTOR_WIDTH, inspectorWidthBounds } from '../hooks/editorSidebarSizing.js';
import { useInspectorPresence } from '../hooks/useInspectorPresence.js';
import { EditorPresentationContext, useEditorPresentation, useEditorSubpage } from './EditorPresentationContext.jsx';
import '../styles/editor-mobile-workspace.css';

/** 各编辑页共用宽度、拖动、键盘操作与开关生命周期，表单和数据仍由所属页面维护。 */
export function EditorSidebarLayout({
  as: Element = 'section', className = '', paneClassName = '', overlay = true,
  inspector, inspectorTitle, inspectorActions, onCloseInspector, feedback, children, preferredWidth, onWidthChange, documentLayout = false, ...props
}) {
  const tUi = useProductTranslation();
  const layoutRef = useRef(null);
  const pageRef = useRef(null);
  const [localWidth, setLocalWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth || 1024);
  const [toolbarHeight, setToolbarHeight] = useState(null);
  const [drag, setDrag] = useState(null);
  const presence = useInspectorPresence(inspector);
  const presentation = useEditorPresentation();
  const { compact } = presentation;
  const [nestedPage, setNestedPage] = useState(null);
  const registerNestedPage = useCallback(page => {
    setNestedPage(page);
    return () => setNestedPage(current => current === page ? null : current);
  }, []);
  useEditorSubpage(Boolean(inspector), nestedPage?.title || inspectorTitle, nestedPage?.back || onCloseInspector, nestedPage ? nestedPage.actions : inspectorActions);
  useLayoutEffect(() => {
    if (!compact || !inspector) return undefined;
    const previous = document.activeElement;
    pageRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [compact, Boolean(inspector)]);
  const { min, max } = inspectorWidthBounds(containerWidth);
  const width = Math.min(max, Math.max(min, preferredWidth ?? localWidth));
  const changeWidth = onWidthChange || setLocalWidth;

  useEffect(() => {
    if (!inspector) setDrag(null);
  }, [Boolean(inspector)]);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const toolbar = layout.querySelector('.editor-collection-toolbar');
    const measure = () => {
      const measured = layout.getBoundingClientRect().width;
      if (measured > 0) setContainerWidth(measured);
      if (toolbar && toolbar.getBoundingClientRect().height > 0) setToolbarHeight(toolbar.getBoundingClientRect().bottom - layout.getBoundingClientRect().top);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(layout);
    if (toolbar) observer?.observe(toolbar);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      if (event.pointerId !== drag.pointerId) return;
      changeWidth(Math.min(max, Math.max(min, drag.width + drag.x - event.clientX)));
    };
    const finish = (event) => {
      if (event.type !== 'blur' && event.pointerId !== drag.pointerId) return;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
  }, [drag, min, max, changeWidth]);

  const reset = () => changeWidth(DEFAULT_INSPECTOR_WIDTH);
  if (compact) return <Element {...props} ref={layoutRef} className={`editor-sidebar-layout is-page-layout ${className}${documentLayout ? ' is-document-layout' : ''}${inspector ? ' is-inspector-open' : ''}`}>
    <div className="editor-page-list" hidden={Boolean(inspector)} inert={Boolean(inspector)}>{children}</div>
    {inspector ? <>
      <div ref={pageRef} tabIndex={-1} className={`editor-page-detail${documentLayout ? ' setting-document mobile-editor-document' : ''} ${paneClassName}`}>
        <EditorPresentationContext.Provider value={{ ...presentation, registerSubpage: registerNestedPage }}>{inspector}</EditorPresentationContext.Provider>
      </div>
      {feedback && <div className="editor-page-feedback">{feedback}</div>}
    </> : null}
  </Element>;
  return (
    <Element {...props} ref={layoutRef}
      className={`editor-sidebar-layout ${className}${presence.content ? ' is-inspector-open' : ''}${drag ? ' is-resizing' : ''}`}
      style={{ ...props.style, '--editor-sidebar-width': `${width}px`, ...(toolbarHeight ? { '--editor-sidebar-top': `${toolbarHeight}px` } : {}) }}>
      {children}
      {presence.content ? (
        <div className={`editor-sidebar-pane ${paneClassName}${overlay ? ' is-overlay' : ''}${presence.closing ? ' is-closing' : ''}`}
          inert={presence.closing} onAnimationEnd={presence.onAnimationEnd}>
          <div className="editor-sidebar-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
            aria-label={tUi("调整编辑器宽度")} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(width)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDrag({ x: event.clientX, width, pointerId: event.pointerId });
            }}
            onLostPointerCapture={() => setDrag(null)} onDoubleClick={reset}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 48 : 24;
              const next = { ArrowLeft: width + step, ArrowRight: width - step, Home: min, End: max }[event.key];
              if (next !== undefined) {
                event.preventDefault();
                changeWidth(Math.min(max, Math.max(min, next)));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                reset();
              } else if (event.key === 'Escape') {
                setDrag(null);
              }
            }}>
            <span aria-hidden="true" />
          </div>
          {presence.content}
        </div>
      ) : null}
    </Element>
  );
}
