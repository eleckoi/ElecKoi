import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState } from 'react';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { assetSrc } from '../../app/services/assets.js';
import '../styles/product-dialogs.css';

export function AvatarPreviewDialog({ src, name, onClose, onPin }) {
  const tUi = useProductTranslation(), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <Modal open title={tUi('{value0}的头像预览', {value0: name || tUi('角色')})} closeLabel={tUi('关闭头像预览')} onClose={onClose}
    className="product-dialog avatar-preview-modal" contentClassName="product-dialog-content"
    footer={onPin ? <Button variant="primary" onClick={onPin}>{tUi('固定在聊天中')}</Button> : undefined}>
    {failed ? <p className="product-dialog-error">{tUi('头像无法加载')}</p> : <img className="avatar-preview-image" src={assetSrc(src)} alt={tUi('{value0}的头像', {value0: name || tUi('角色')})} onError={() => setFailed(true)} />}
  </Modal>;
}
