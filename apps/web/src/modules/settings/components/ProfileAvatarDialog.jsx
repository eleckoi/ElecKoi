import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuSurface, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { X } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { AvatarManagerEditor } from '../../../ui/ui/AvatarSlotsEditor.jsx';
import '../styles/settings-design.css';

const slots = [{ value: 'circle', label: '圆形' }, { value: 'square', label: '正方形' }, { value: 'portrait', label: '竖图' }];

function AvatarDialogSurface({ controls, name, initialSlot, onClose, saveError, onRetry }) {
  const { avatars, busy, error, cropping, chooseImage, openCrop } = controls;
  const [slot, setSlot] = useState(initialSlot);
  const id = useId(), dialog = useRef(null), closeButton = useRef(null);
  const current = useRef();
  current.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    if (cropping) return;
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose();
      } else if (event.key === 'Tab') {
        const items = [...dialog.current.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [cropping]);
  const label = slots.find(item => item.value === slot).label;
  return <div className="profile-avatar-dialog-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy && !cropping) onClose();
  }}>
    <MenuSurface ref={dialog} className="settings-design profile-avatar-dialog" role="dialog" aria-modal="true"
      aria-labelledby={`${id}-title`} aria-busy={busy || undefined}>
      <header><h2 id={`${id}-title`}>管理头像</h2><button ref={closeButton} type="button" className="sd-close"
        aria-label="关闭头像管理" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
      <SegmentedTabs className="sd-avatar-tabs" label="头像类型" value={slot} onChange={setSlot}
        items={slots.map(item => ({ ...item, id: `${id}-${item.value}`, panelId: `${id}-preview` }))} />
      <div id={`${id}-preview`} role="tabpanel" aria-labelledby={`${id}-${slot}`}>
        <button type="button" className={`sd-avatar-replace sd-avatar-${slot}`} aria-label={`更换${label}头像`}
          disabled={busy} onClick={chooseImage}>
          <Avatar src={avatars[slot] || (slot === 'circle' ? avatars.square : slot === 'square' ? avatars.circle : '')} name={name} />
        </button>
        <button type="button" className="sd-crop-action" disabled={busy}
          onClick={() => openCrop(slot === 'portrait' ? 'portrait' : 'shared')}>调整裁剪</button>
      </div>
      {error && <p className="sd-error" role="alert">{error}</p>}
      {saveError && <p className="sd-error" role="alert">{saveError} <button type="button" onClick={onRetry}>重试</button></p>}
    </MenuSurface>
  </div>;
}

export function ProfileAvatarDialog({ avatars, name, saving, initialSlot = 'circle', onChange, onClose, saveError, onRetry }) {
  return createPortal(<AvatarManagerEditor value={avatars} name={name} saving={saving} onChange={onChange}
    renderPresentation={controls => <AvatarDialogSurface controls={controls} name={name} initialSlot={initialSlot} onClose={onClose} saveError={saveError} onRetry={onRetry} />} />,
  document.body);
}
