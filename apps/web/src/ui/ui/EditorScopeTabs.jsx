import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useId } from 'react';
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEditorPresentation } from './EditorPresentationContext.jsx';
import './editor-scope-tabs.css';

/** Scope changes only the visible directory; each editor retains its own drafts. */
export function EditorScopeTabs({ value, onChange, panelId, ownerValue = 'character', ownerLabel: ownerLabelSource }) {
  const tUi = useProductTranslation();
  const ownerLabel = ownerLabelSource === undefined ? tUi("角色") : ownerLabelSource;
  const id = useId();
  const { compact, characterStudio } = useEditorPresentation();
  return <div className="editor-scope-tabs-bar"><SegmentedTabs className={`editor-scope-tabs${compact ? '' : ' setting-scope-switch'}${characterStudio ? ' is-studio-scope' : ''}`} size={compact ? 'md' : 'sm'} label={tUi("配置范围")}
    value={value} onChange={onChange} items={[
      { value: ownerValue, label: <span>{ownerLabel}</span>, id: `${id}-owner`, panelId },
      { value: 'global', label: <span>{tUi("全局")}</span>, id: `${id}-global`, panelId },
    ]} /></div>;
}
