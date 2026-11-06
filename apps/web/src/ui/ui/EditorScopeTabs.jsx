import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useId } from 'react';
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import './editor-scope-tabs.css';

/** Scope changes only the visible directory; each editor retains its own drafts. */
export function EditorScopeTabs({ value, onChange, panelId, ownerValue = 'character', ownerLabel: ownerLabelSource }) {
  const tUi = useProductTranslation();
  const ownerLabel = ownerLabelSource === undefined ? tUi("角色") : ownerLabelSource;
  const id = useId();
  return <div className="editor-scope-tabs-bar"><SegmentedTabs className="editor-scope-tabs" label={tUi("配置范围")}
    value={value} onChange={onChange} items={[
      { value: ownerValue, label: ownerLabel, id: `${id}-owner`, panelId },
      { value: 'global', label: tUi("全局"), id: `${id}-global`, panelId },
    ]} /></div>;
}
