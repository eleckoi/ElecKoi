import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ImageSquare } from '@phosphor-icons/react';
import { characterAssetBaseUrl } from '@shared/foundation/characterAssetReference';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ArrowDown, ArrowUp, CaretDown, ChatCircleDots, CornersOut, Plus, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { EditorTextInput } from '../../../ui/ui/EditorTextInput.jsx';
import { CastPortrait } from '../../persona/index.js';
import { ImmersiveMarkdownEditor } from '../../settingLibraries/components/ImmersiveMarkdownEditor.jsx';
import { editableOpeningSegments } from '../model/openingEditing.js';

function openingRolePhoto(character, role) {
  const assetId = role?.circleAssetId ?? role?.portraitAssetId;
  return assetId && character?.id ? characterAssetBaseUrl(character.id) + assetId : undefined;
}

export function OpeningBodyEditor({ message, character, busy, dirty, onChange }) {
  const tUi = useProductTranslation();
  const [menuId, setMenuId] = useState(null);
  const [immersive, setImmersive] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const nextSection = useRef(null), nextInput = useRef(null);
  const segments = editableOpeningSegments(message);
  const roles = character?.cast ?? [];
  const label = tUi('开场白正文');
  const choices = [
    { id: 'cover', kind: 'cover', label: tUi('卡片封面＋正文'), icon: <ImageSquare size={15} /> },
    ...roles.map(role => ({
      id: `speech:${role.id}`, kind: 'speech', speakerId: role.id, label: role.name || tUi('未命名角色'),
      icon: <CastPortrait className="opening-speaker-avatar" src={openingRolePhoto(character, role)}
        crop={role.circleAssetId ? undefined : role.crop} iconSize={11} />
    }))
  ];
  const charCount = tUi('{value0} 字符', { value0: segments.reduce((count, segment) => count + segment.text.length, 0) });

  useLayoutEffect(() => {
    if (!focusId || !nextInput.current || !nextSection.current) return undefined;
    let focusFrame;
    const frame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        nextSection.current?.scrollIntoView({ block: 'nearest' });
        nextInput.current?.focus();
        setFocusId(null);
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); };
  }, [focusId, immersive]);

  const closeImmersive = useCallback(() => {
    setMenuId(null);
    setImmersive(false);
  }, []);

  function selectSpeaker(id, segment) {
    setMenuId(null);
    const choice = choices.find(option => option.id === id);
    if (!choice) return;
    const type = { kind: choice.kind, ...(choice.kind === 'speech' ? { speakerId: choice.speakerId } : {}) };
    if (segment) {
      onChange(segments.map(item => item.id === segment.id ? { id: item.id, text: item.text, ...type } : item));
    } else {
      const created = { id: crypto.randomUUID(), text: '', ...type };
      onChange([...segments, created]);
      setFocusId(created.id);
    }
  }

  function speakerPicker(segment) {
    const id = segment?.kind === 'speech' ? `speech:${segment.speakerId}` : segment?.kind;
    const current = choices.find(choice => choice.id === id);
    const text = segment ? current?.label ?? tUi('角色已移除') : tUi('添加段落');
    const key = segment ? `speaker:${segment.id}` : 'add';
    return <Menu portal autoFocus dense align={segment ? 'start' : 'end'} open={menuId === key}
      onClose={() => setMenuId(null)} selectedId={id}
      items={roles.length ? [choices[0], { type: 'label', id: 'cast-label', text: tUi('角色对话') }, ...choices.slice(1)] : choices}
      onSelect={choice => selectSpeaker(choice, segment)}
      anchor={<Button data-dsh-control variant="outline" disabled={busy}
        className={segment ? 'opening-speaker-button' : 'opening-add-button'}
        icon={segment ? current?.icon ?? <ChatCircleDots size={15} /> : <Plus size={15} />}
        aria-haspopup="menu" aria-expanded={menuId === key} onClick={() => setMenuId(menuId === key ? null : key)}>
        <span>{text}</span><CaretDown size={11} aria-hidden="true" />
      </Button>} />;
  }

  function moveSegment(index, direction) {
    const next = [...segments];
    next.splice(index + direction, 0, next.splice(index, 1)[0]);
    onChange(next);
  }

  const paragraphList = <div className="opening-segments-scroll">
    <ol className="opening-segments">
      {segments.map((segment, index) => <li key={segment.id} ref={segment.id === focusId ? nextSection : null} className="opening-segment-editor">
        <div className="opening-segment-toolbar">
          {speakerPicker(segment)}
          <div className="opening-segment-actions">
            {[
              { icon: ArrowUp, text: tUi('上移'), disabled: index === 0, run: () => moveSegment(index, -1) },
              { icon: ArrowDown, text: tUi('下移'), disabled: index === segments.length - 1, run: () => moveSegment(index, 1) },
              { icon: Trash, text: tUi('删除段落'), disabled: segments.length === 1, run: () => onChange(segments.filter(item => item.id !== segment.id)) }
            ].map(({ icon: Icon, text, disabled, run }) => <Button key={text} data-dsh-control variant="ghost"
              className="opening-row-action" title={text} aria-label={text} icon={<Icon size={14} aria-hidden="true" />}
              disabled={busy || disabled} onClick={run} />)}
          </div>
        </div>
        <EditorTextInput ref={segment.id === focusId ? nextInput : null} disabled={busy} label={label}
          value={segment.text} placeholder={tUi('输入正文…')}
          onChange={text => onChange(segments.map(item => item.id === segment.id ? { ...item, text } : item))} />
      </li>)}
    </ol>
  </div>;

  return <div className="opening-body-field">
    <div className="opening-body-toolbar">
      <h3 className="opening-body-label">{label}</h3>
      {!immersive && speakerPicker()}
    </div>
    <section className="rs-writing opening-writing" aria-label={label}>
      {!immersive && paragraphList}
      <footer className="rs-writing-footer">
        <span>{dirty ? tUi('未保存') : tUi('已保存')}</span>
        <div className="setting-footer-tools"><span>{charCount}</span>
          <div className="setting-immersive-host">
            <button type="button" disabled={busy} onClick={() => { setMenuId(null); setImmersive(true); }}>
              <CornersOut size={14} aria-hidden="true" />{tUi('沉浸编辑')}
            </button>
          </div>
        </div>
      </footer>
    </section>
    {immersive && <ImmersiveMarkdownEditor label={label} onClose={closeImmersive}>
      <div className="opening-immersive-workspace">
        <div className="opening-immersive-toolbar">{speakerPicker()}</div>
        {paragraphList}
      </div>
    </ImmersiveMarkdownEditor>}
  </div>;
}
