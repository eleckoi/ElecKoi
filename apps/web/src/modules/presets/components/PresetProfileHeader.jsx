import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { CheckCircle, NotePencil } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';

export function PresetProfileActions({ active, activating, onActivate, onEdit, activateFirst = false }) {
  const tUi = useProductTranslation();
  const edit = <Button key="edit" data-dsh-control variant="outline" className="preset-summary-edit" icon={<NotePencil size={16} />} onClick={onEdit}>{tUi('编辑预设')}</Button>;
  const useLabel = tUi('使用此预设');
  const activeLabel = tUi('使用中');
  const use = <Button key="use" data-dsh-control variant={active ? 'outline' : 'primary'}
    className={`preset-summary-use${active ? ' preset-summary-active' : ''}`}
    disabled={active || activating} icon={<CheckCircle size={16} aria-hidden="true" />} onClick={onActivate}>
    <span className="preset-summary-use-label" data-use-label={useLabel} data-active-label={activeLabel}>
      <span role="status">{active ? activeLabel : useLabel}</span>
    </span>
  </Button>;
  return activateFirst ? [use, edit] : [edit, use];
}

export function PresetProfileHeader({ preset, active, onActivate, onEdit, showActivate = true, editingAvailable = false,
  activating = false, showActions = true, backAction, headingId }) {
  const tUi = useProductTranslation();
  const profile = preset.profile;

  if (editingAvailable) return <header className="preset-summary">
    {backAction}
    <Avatar src={profile.authorAvatarPath || defaultPresetAvatar} name={preset.name} className="preset-summary-avatar" />
    <div className="preset-summary-identity"><h1 id={headingId} title={preset.name}>{preset.name}</h1><div className="preset-summary-meta"><span>{profile.authorName || tUi('未填写作者')}</span>{preset.modelTags.map(tag => <span className="preset-summary-tag" key={tag.id}>{tag.label}</span>)}</div></div>
    {showActions && <div className="preset-summary-actions">
      <PresetProfileActions active={active} activating={activating} onActivate={onActivate} onEdit={onEdit} />
    </div>}
  </header>;

  return <header className="preset-profile-hero">
    <Avatar src={profile.authorAvatarPath || defaultPresetAvatar} name={profile.authorName || preset.name} className="preset-profile-hero-avatar" />
    <div className="preset-profile-hero-copy">
      <div className="preset-profile-hero-heading">
        <div className="preset-profile-hero-title">
          <h1 title={preset.name}>{preset.name}</h1>
          <button type="button" aria-label={tUi("编辑预设资料")} onClick={onEdit}><NotePencil size={20} aria-hidden="true" /></button>
        </div>
        {(active || showActivate) && <div className="preset-profile-hero-actions">
          {active
            ? <span className="preset-profile-active"><CheckCircle size={16} weight="fill" aria-hidden="true" />{tUi("使用中")}</span>
            : <Button data-dsh-control variant="primary" type="button" className="preset-profile-use" onClick={onActivate}><CheckCircle size={16} aria-hidden="true" />{tUi("使用此预设")}</Button>}
        </div>}
      </div>
      <div className="preset-profile-hero-meta">
        <span>{profile.authorName || tUi("未填写作者")}</span>
      </div>
      {preset.modelTags.length ? <div className="preset-profile-hero-tags">{preset.modelTags.map((tag) => <span key={tag.id}>{tag.label}</span>)}</div> : null}
    </div>
  </header>;
}
