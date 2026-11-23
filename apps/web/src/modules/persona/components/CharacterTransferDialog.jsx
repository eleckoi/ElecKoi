import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useId } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ExportIcon, ImportIcon, PictureFrameIcon } from '../../../ui/icons/index.jsx';
import '../../../ui/styles/product-dialogs.css';
import '../styles/character-transfer.css';

const phases = {
  reading: {
    icon: ImportIcon,
    status: '正在读取文件',
    detail: '正在检查角色资料和随卡附带的素材。',
  },
  importing: {
    icon: PictureFrameIcon,
    status: '正在写入角色和素材',
    detail: '图片和照片较多时，导入可能需要一点时间。',
  },
  exporting: {
    icon: ExportIcon,
    status: '正在准备导出文件',
    detail: '文件准备好后，将进入保存流程。',
  },
};

// Transfer calls settle with a result and do not expose an interruption command.
const keepOpen = () => {};

export function CharacterTransferDialog({ phase, names, format }) {
  const tUi = useProductTranslation();
  const statusId = useId();
  const detailId = useId();
  const { icon: Icon, status, detail } = phases[phase];
  const exporting = phase === 'exporting';
  const title = exporting ? tUi('导出角色卡') : tUi('导入角色卡');
  const count = names.length > 1
    ? tUi(exporting ? '等 {value0} 张' : '等 {value0} 个文件', { value0: names.length }) : '';

  return (
    <Modal open headless title={title} onClose={keepOpen} className="product-dialog transfer-waiting-dialog">
      <div className="product-dialog-content transfer-waiting-content">
        <h2>{title}</h2>
        <div className="transfer-waiting">
          <div className="transfer-waiting-file">
            <div className="transfer-waiting-icon" aria-hidden="true"><Icon size={21} /></div>
            <div className="transfer-waiting-name" title={names.join('、')}>
              <strong>{names[0]}</strong>
              {count && <span>{count}</span>}
            </div>
            {format && <span className="transfer-waiting-format">{format.toUpperCase()}</span>}
          </div>
          <div className="transfer-waiting-copy" role="status">
            <strong id={statusId}>{tUi(status)}</strong>
            <p id={detailId}>{tUi(detail)}</p>
          </div>
          <div className="transfer-waiting-track" role="progressbar" aria-labelledby={statusId} aria-describedby={detailId}>
            <span aria-hidden="true" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
