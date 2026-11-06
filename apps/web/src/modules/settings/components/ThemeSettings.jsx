import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Check, MagnifyingGlass, Plus, CaretDown } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import appIcon from '../../../assets/eleckoi-app-icon.png';
import '../styles/settings-design.css';

const modes = [{ id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }, { id: 'system', label: '跟随系统' }];
function MiniAppContents() {
  return <><span className="sd-mini-title"><i /><i /><i /></span><span className="sd-mini-side"><b /><i /><i /><i /></span>
    <span className="sd-mini-thread"><i /><i /><b /><i /><span /></span></>;
}
export function ThemeSettings({ persona, appearanceMode = 'system', onAppearanceModeChange, sidebarCharacterArtwork = 'cover', onSidebarCharacterArtworkChange }) {
  const tUi = useProductTranslation();
  const name = persona?.assistant_name || tUi("示例角色");
  const source = persona?.assistant_avatar || appIcon;
  return <div className="settings-design sd-theme-page">
    <header className="app-settings-heading"><h1>{tUi("主题风格")}</h1></header>
    <section className="sd-section" aria-label={tUi("外观模式")}><h2>{tUi("外观模式")}</h2>
      <div className="sd-appearance-choices" role="radiogroup" aria-label={tUi("外观模式")}>
        {localizeUiCopy(modes, tUi).map(mode => <button type="button" className="sd-visual-choice" role="radio" key={mode.id}
          aria-checked={appearanceMode === mode.id} onClick={() => onAppearanceModeChange(mode.id)}>
          <span className={`sd-mini-app sd-mini-${mode.id}`} aria-hidden="true"><MiniAppContents />
            {mode.id === 'system' && <span className="sd-system-dark"><MiniAppContents /></span>}
            <span className="sd-choice-check"><Check /></span>
          </span><span>{mode.label}</span>
        </button>)}
      </div>
    </section>
    <section className="sd-section" aria-label={tUi("侧栏角色图")}><h2>{tUi("侧栏角色图")}</h2>
      <div className="sd-artwork-choices" role="radiogroup" aria-label={tUi("侧栏角色图")}>
        {[{ id: 'cover', label: tUi("封面立绘") }, { id: 'avatar', label: tUi("头像") }].map(mode => <button type="button" key={mode.id}
          className="sd-visual-choice" role="radio" aria-checked={sidebarCharacterArtwork === mode.id} onClick={() => onSidebarCharacterArtworkChange(mode.id)}>
          <span className="sd-sidebar-demo" aria-hidden="true">
            <span className="sd-demo-toolbar"><MagnifyingGlass /><span /><Plus /></span>
            <span className="sd-demo-contact"><Avatar src={source} name={name} /><span><b>{name}</b><i /></span></span>
            {mode.id === 'cover' ? <span className="sd-demo-art"><Avatar src={persona?.assistant_cover || source} name={name} /></span>
              : <span className="sd-demo-avatar"><Avatar src={source} name={name} /><b>{name}</b></span>}
            <span className="sd-demo-bottom"><CaretDown /><span>{name}</span></span>
            <span className="sd-choice-check"><Check /></span>
          </span><span>{mode.label}</span>
        </button>)}
      </div>
    </section>
    <section className="sd-section sd-color-section" aria-label={tUi("界面配色")}>
      <header className="sd-section-heading"><h2>{tUi("界面配色")}</h2><span>{tUi("开发中")}</span></header>
      <div className="sd-visual-choice sd-color-choice" aria-disabled="true">
        <span className="sd-mini-app" aria-hidden="true"><MiniAppContents /></span>
        <span className="sd-color-caption"><span>{tUi("默认")}</span><span className="sd-color-samples" aria-hidden="true"><i /><i /><i /></span></span>
      </div>
    </section>
  </div>;
}
