import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useId, useState } from 'react';
import { Button, Modal, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { AvatarManagerEditor } from '../../../ui/ui/AvatarSlotsEditor.jsx';
import '../styles/settings-design.css';
import '../../../ui/styles/product-dialogs.css';

const slots = [{ value: 'circle', label: '圆形' }, { value: 'square', label: '正方形' }, { value: 'portrait', label: '竖图' }];

function AvatarDialogSurface({ controls, name, initialSlot, onClose, saveError, onRetry }) {
  const tUi = useProductTranslation();
  const { avatars, busy, error, cropping, chooseImage, openCrop } = controls;
  const [slot, setSlot] = useState(initialSlot);
  const id = useId();
  const label = localizeUiCopy(slots, tUi).find(item => item.value === slot).label;
  return <Modal open title={tUi('管理头像')} closeLabel={tUi('关闭头像管理')} onClose={() => { if (!busy && !cropping) onClose(); }}
    className="product-dialog" contentClassName="product-dialog-content"><div className="settings-design profile-avatar-body">
      <SegmentedTabs className="sd-avatar-tabs" label={tUi("头像类型")} value={slot} onChange={setSlot}
        items={localizeUiCopy(slots, tUi).map(item => ({ ...item, id: `${id}-${item.value}`, panelId: `${id}-preview` }))} />
      <div id={`${id}-preview`} role="tabpanel" aria-labelledby={`${id}-${slot}`}>
        <button type="button" className={`sd-avatar-replace sd-avatar-${slot}`} aria-label={tUi("更换{value0}头像", {value0: label})}
          disabled={busy} onClick={chooseImage}>
          <Avatar src={avatars[slot] || (slot === 'circle' ? avatars.square : slot === 'square' ? avatars.circle : '')} name={name} />
        </button>
        <Button variant="outline" disabled={busy}
          onClick={() => openCrop(slot === 'portrait' ? 'portrait' : 'shared')}>{tUi("调整裁剪")}</Button>
      </div>
      {error && <p className="sd-error" role="alert">{error}</p>}
      {saveError && <p className="sd-error" role="alert">{saveError} <button type="button" onClick={onRetry}>{tUi("重试")}</button></p>}
    </div></Modal>;
}

export function ProfileAvatarDialog({ avatars, name, saving, initialSlot = 'circle', onChange, onClose, saveError, onRetry }) {
  return <AvatarManagerEditor value={avatars} name={name} saving={saving} onChange={onChange}
    renderPresentation={controls => <AvatarDialogSurface controls={controls} name={name} initialSlot={initialSlot} onClose={onClose} saveError={saveError} onRetry={onRetry} />} />;
}
