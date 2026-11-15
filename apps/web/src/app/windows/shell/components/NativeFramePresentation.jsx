import { cloneElement, createContext, useContext, useLayoutEffect } from 'react';

const Presentation = createContext(null);
function FrameSlot({ name, owner, options }) {
  const value = useContext(Presentation);
  const sidebar = name === 'sidebar' ? owner : null;
  useLayoutEffect(() => {
    if (sidebar) value.onSidebar?.(sidebar);
  }, [sidebar?.collapsed, sidebar?.width, sidebar?.drawer, value.onSidebar]);
  if (sidebar) return <div className="native-frame-sidebar-content" aria-hidden={owner.collapsed || undefined} inert={owner.collapsed || undefined}
    style={{ height: '100%', visibility: owner.collapsed ? 'hidden' : undefined }}>
    {value.sidebar}
  </div>;
  if (name === 'main') return value.main;
  return value.nativeRenderSlot(name, owner, options);
}
const renderSlot = (name, owner, options) => <FrameSlot name={name} owner={owner} options={options} />;

/** Retain the actual root frame, controller, stores and right panel for a separate product window. */
export function NativeFramePresentation({ frame, sidebar, main, onSidebar }) {
  return <Presentation.Provider value={{ sidebar, main, onSidebar, nativeRenderSlot: frame.props.renderSlot }}>
    {cloneElement(frame, { renderSlot })}
  </Presentation.Provider>;
}
