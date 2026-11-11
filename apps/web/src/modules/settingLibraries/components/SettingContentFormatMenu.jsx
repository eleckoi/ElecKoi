import { useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown } from '../../../ui/icons/interfaceIcons.jsx';

export function SettingContentFormatMenu({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return <Menu open={open} portal align="end" autoFocus selectedId={value} onClose={() => setOpen(false)}
    anchor={<Button data-dsh-control variant="outline" className="setting-format-button" aria-label={`${label}：${options.find(option => option.value === value)?.label || ''}`}
      title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{options.find(option => option.value === value)?.label}<CaretDown size={13} /></Button>}
    items={options.map(option => ({ id: option.value, label: option.label }))} onSelect={next => { setOpen(false); onChange(next); }} />;
}
