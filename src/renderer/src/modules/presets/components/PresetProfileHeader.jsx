import { CheckCircle, NotePencil } from '@phosphor-icons/react';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';

export function PresetProfileHeader({ preset, active, onActivate, onEdit }) {
  const profile = preset.profile;

  return <header className="preset-profile-hero">
    <Avatar src={profile.authorAvatarPath || defaultPresetAvatar} name={profile.authorName || preset.name} className="preset-profile-hero-avatar" />
    <div className="preset-profile-hero-copy">
      <div className="preset-profile-hero-title">
        <h1>{preset.name}</h1>
        <button type="button" aria-label="编辑预设资料" onClick={onEdit}><NotePencil size={20} /></button>
      </div>
      <div className="preset-profile-hero-meta">
        <span>{profile.authorName || '未填写作者'}</span>
      </div>
      {preset.modelTags.length ? <div className="preset-profile-hero-tags">{preset.modelTags.map((tag) => <span key={tag.id}>{tag.label}</span>)}</div> : null}
    </div>
    {active
      ? <span className="preset-profile-active"><CheckCircle size={16} weight="fill" />使用中</span>
      : <button type="button" className="preset-profile-use" onClick={onActivate}><CheckCircle size={16} />使用此预设</button>}
  </header>;
}
