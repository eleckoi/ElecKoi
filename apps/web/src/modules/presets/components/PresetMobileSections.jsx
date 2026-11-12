import { FileText, NotePencil, Wrench, BracketsCurly, FileCode } from '../../../ui/icons/interfaceIcons.jsx';
import { EditorNavigationRail } from '../../../ui/ui/EditorNavigationRail.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';

const SECTIONS = [
  { id: 'profile', label: '基础资料', Icon: NotePencil },
  { id: 'prompts', label: '预设提示词', Icon: FileText },
  { id: 'tools', label: '工具', Icon: Wrench },
  { id: 'regex', label: '正则', Icon: BracketsCurly },
  { id: 'scripts', label: '脚本', Icon: FileCode },
];
export function PresetMobileSections({ value, onChange, sidebar }) {
  const tUi = useProductTranslation();
  return <aside className="character-editor-side-panel">
    <EditorNavigationRail id="preset-editor-navigation" label={tUi('预设编辑区域')} items={SECTIONS.map(item => ({ ...item, label: tUi(item.label) }))}
      value={value} onChange={onChange} compact collapsed={sidebar.collapsed} busy={sidebar.busy} onToggle={sidebar.toggle} />
    {sidebar.error && <p role="alert">{sidebar.error}</p>}
  </aside>;
}
