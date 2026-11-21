import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { CheckCircle } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';

export function PresetHomeCard({ preset, active, onOpen, selecting, checked, disabled, onContextMenu }) {
  const t = useProductTranslation();
  const { authorName, authorAvatarPath } = preset.profile;
  return <button type="button" className={`character-card preset-home-card${checked ? ' selected' : ''}`} onClick={onOpen}
    aria-pressed={selecting ? checked : undefined} disabled={disabled} onContextMenu={onContextMenu}>
    {selecting && !disabled && <span className="character-card-check" aria-hidden="true" />}
    <Avatar as="span" className="character-card-cover preset-home-card-avatar" src={authorAvatarPath || defaultPresetAvatar} thumbnail={false}
      name={authorName || preset.name} aria-hidden="true" />
    <span className="character-card-copy">
      <strong title={preset.name}>{preset.name}</strong>
      <span className="preset-home-card-byline">
        <span>{authorName || t('未填写作者')}</span>
        {active && <span className="preset-home-current"><CheckCircle size={14} aria-hidden="true" />{t('使用中')}</span>}
      </span>
    </span>
  </button>;
}
