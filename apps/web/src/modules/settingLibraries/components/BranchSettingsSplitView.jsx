import { EditorSidebarLayout } from "../../../ui/ui/EditorSidebarLayout.jsx";

export function BranchSettingsSplitView({ children, preferredWidth, onWidthChange, inspectorTitle, onCloseInspector, feedback }) {
  return (
    <EditorSidebarLayout as="div" className="dynamic-settings-editor-layout" paneClassName="dynamic-settings-editor-pane setting-document" documentLayout
      overlay={false} inspector={children[1]} inspectorTitle={inspectorTitle} onCloseInspector={onCloseInspector} feedback={feedback} preferredWidth={preferredWidth} onWidthChange={onWidthChange}>
      {children[0]}
    </EditorSidebarLayout>
  );
}
