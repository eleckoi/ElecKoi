import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { EditorToggle } from '../../../ui/ui/EditorToggle.jsx';

export function PropertySegment({ label, value, options, onChange }) {
  return <section className="setting-property-row"><span className="setting-property-label">{label}</span>
    <SegmentedTabs size="sm" className={`setting-property-options${options.some(option => option.value === 'agent_tool') ? ' is-wide' : ''}`}
      label={label} value={value} onChange={onChange} items={options} /></section>;
}

export function PropertySwitch({ title, description, checked, onChange }) {
  return <div className="setting-property-row"><span className="setting-property-label">{title}</span>
    <EditorToggle label={title} title={description} checked={checked} onChange={onChange} /></div>;
}
