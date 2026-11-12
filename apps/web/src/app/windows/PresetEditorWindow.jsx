import { useEffect } from 'react';
import { FileText, Wrench, BracketsCurly, FileCode, NotePencil } from '../../ui/icons/interfaceIcons.jsx';
import { ElecKoiWordmark } from '../../ui/icons/ElecKoiWordmark.jsx';
import logo from '../../assets/eleckoi-app-icon.png';
import { PresetProvider, PresetWorkspace } from '../../modules/presets/index.js';
import { applyAppearanceTheme } from '../../modules/appearance/index.js';
import { useProductTranslation } from '../i18n/ProductLocaleContext.jsx';
import { showCurrentWindow } from '../services/windowControls.js';
import { bestEffort } from '../../utils/swallowedFailure.js';
import { TitleBar } from './shell/components/TitleBar.jsx';
import '../../modules/presets/styles/preset-workspace.css';

const SECTIONS = [{ id: 'profile', label: '基础资料', Icon: NotePencil }, { id: 'prompts', label: '预设提示词', Icon: FileText }, { id: 'tools', label: '工具', Icon: Wrench }, { id: 'regex', label: '正则', Icon: BracketsCurly }, { id: 'scripts', label: '脚本', Icon: FileCode }];

export function PresetEditorWindow({ presetCatalog, characterConfiguration, renderPresetEditorSection }) {
  const tUi = useProductTranslation(), params = new URLSearchParams(window.location.search), id = params.get('preset') || '';
  const section = SECTIONS.some(item => item.id === params.get('section')) ? params.get('section') : 'profile';
  useEffect(() => { applyAppearanceTheme(null); document.title = tUi('预设编辑器 - ElecKoi'); showCurrentWindow().catch(bestEffort); }, [tUi]);
  return <PresetProvider catalogModel={presetCatalog} fixedPresetId={id}>
    <PresetWorkspace characterConfiguration={characterConfiguration} requestedTab={section} editorMode renderEditorSection={renderPresetEditorSection}
      onTestRegex={(text, rule, target) => characterConfiguration.regexRules.test(text, rule, target)}
      renderDesktopEditor={({ tab, body, onSectionChange, onClose, unavailable }) => <main className="qq-shell qq-character-editor-window-shell preset-editor-window">
        <aside className="character-editor-side-panel"><header className="side-panel-header" data-tauri-drag-region><div className="side-panel-brand"><img src={logo} alt="" draggable={false} /><ElecKoiWordmark /></div></header>
          <nav className="character-editor-navigation" aria-label={tUi('预设编辑区域')}>{SECTIONS.map(({ id, label, Icon }) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onSectionChange(id)}><Icon size={19} /><span>{tUi(label)}</span></button>)}</nav>
        </aside>
        <section className="character-editor-main-panel"><TitleBar splitSurface onClose={onClose} /><section className={`preset-editor-canvas is-${tab}`} aria-busy={unavailable || undefined}>{body}</section></section>
      </main>} />
  </PresetProvider>;
}
