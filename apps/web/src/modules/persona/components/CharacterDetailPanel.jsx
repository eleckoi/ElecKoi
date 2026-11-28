import { useId, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { assetSrc } from '../../../app/services/assets.js';
import { ChatCircleDots } from '../../../ui/icons/interfaceIcons.jsx';
import { PencilIcon } from '../../../ui/icons/index.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { CatalogCardDialog } from '../../../ui/ui/CatalogCardDialog.jsx';
import { characterCover, characterName } from './characterUtils.js';

export function CharacterDetailPanel({ character, trigger, onClose, onStartConversation, onEditCharacter }) {
  const tUi = useProductTranslation();
  const titleId = useId();
  const [failedCover, setFailedCover] = useState(null);
  const cover = assetSrc(characterCover(character));
  const name = characterName(character, tUi);
  const author = character.authorName?.trim() || tUi('未填写作者');
  const introduction = String(character.description || character.profileDescription || character.profileLike || '').trim();

  return <CatalogCardDialog title={name} className="character-home-detail-modal" sheetClassName="character-home-detail"
    trigger={trigger} artworkSelector=".character-card-cover, .sidebar-character-artwork" onClose={onClose} labelledBy={titleId}>
    {closeButton => <>
      <div className="character-home-detail-art" data-catalog-card-art>
        {cover && cover !== failedCover
          ? <img src={cover} alt={name} onError={() => setFailedCover(cover)} />
          : <span aria-hidden="true">{name.slice(0, 1)}</span>}
      </div>
      <article className="character-home-detail-reading">
        <header className="character-home-detail-author">
          <Avatar as="span" className="character-home-detail-author-avatar" src={character.authorAvatar} name={author}
            aria-hidden="true" />
          <span>{author}</span>
          {closeButton}
        </header>
        <div className="character-home-detail-intro" tabIndex={0} aria-label={tUi('简介')}>
          <h1 id={titleId}>{name}</h1>
          <p className={introduction ? undefined : 'is-empty'}>{introduction || tUi('暂无简介')}</p>
        </div>
        <footer className="character-home-detail-actions">
          <Button data-dsh-control variant="primary" icon={<ChatCircleDots aria-hidden="true" />}
            onClick={() => onStartConversation(character.id)}>{tUi('进入对话')}</Button>
          <Button data-dsh-control variant="outline" icon={<PencilIcon aria-hidden="true" />}
            onClick={() => onEditCharacter(character.id)}>{tUi('编辑角色')}</Button>
        </footer>
      </article>
    </>}
  </CatalogCardDialog>;
}
