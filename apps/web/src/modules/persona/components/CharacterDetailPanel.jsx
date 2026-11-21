import { useEffect, useId, useRef, useState } from 'react';
import { Button, IconChevronLeftOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { assetSrc } from '../../../app/services/assets.js';
import { ChatCircleDots } from '../../../ui/icons/interfaceIcons.jsx';
import { PencilIcon } from '../../../ui/icons/index.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { characterCover, characterName } from './characterUtils.js';

export function CharacterDetailPanel({ character, onBack, focusBack, onStartConversation, onEditCharacter }) {
  const tUi = useProductTranslation();
  const titleId = useId();
  const back = useRef(null);
  const [failedCover, setFailedCover] = useState(null);
  const cover = assetSrc(characterCover(character));
  const name = characterName(character, tUi);
  const author = character.authorName?.trim() || tUi('未填写作者');
  const introduction = String(character.description || character.profileDescription || character.profileLike || '').trim();

  useEffect(() => {
    if (focusBack) back.current?.focus({ preventScroll: true });
  }, [focusBack]);

  return <section className="character-home-detail" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      onBack();
    }
  }}>
    <div className="character-home-detail-art">
      <Tooltip label={tUi('返回')}>
        <Button ref={back} data-dsh-control variant="toolbar" className="character-home-detail-back" aria-label={tUi('返回')}
          icon={<IconChevronLeftOutlineMedium size={22} aria-hidden="true" />} onClick={onBack} />
      </Tooltip>
      {cover && cover !== failedCover
        ? <img src={cover} alt={name} onError={() => setFailedCover(cover)} />
        : <span aria-hidden="true">{name.slice(0, 1)}</span>}
    </div>
    <article className="character-home-detail-reading">
      <header className="character-home-detail-author">
        <Avatar as="span" className="character-home-detail-author-avatar" src={character.authorAvatar} name={author}
          aria-hidden="true" />
        <span>{author}</span>
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
  </section>;
}
