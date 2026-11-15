import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../ui/styles/product-dialogs.css';
import '../../models/styles/model-picker.css';

export function DesktopIllustrationModelPicker({ subtitle, tab, onTabChange, canEditParameters, saving, canSave,
  leaveOpen, onClose, onSave, children }) {
  const tUi = useProductTranslation();
  return <Modal open title={tUi('选择绘图模型')} description={subtitle} closeLabel={tUi('关闭绘图模型选择')}
    onClose={() => { if (!saving && !leaveOpen) onClose(); }} className="product-dialog illustration-model-modal" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions"><Button variant="outline" disabled={saving} onClick={onClose}>{tUi('取消')}</Button><Button variant="primary" disabled={!canSave || saving} onClick={onSave}>{saving ? tUi('保存中…') : tUi('保存')}</Button></div>}>
    <div className="illustration-model-tabs" role="tablist" aria-label={tUi('绘图模型设置')}>
      <Button variant={tab === 'models' ? 'toolbar' : 'ghost'} role="tab" aria-selected={tab === 'models'} onClick={() => onTabChange('models')}>{tUi('模型')}</Button>
      <Button variant={tab === 'parameters' ? 'toolbar' : 'ghost'} role="tab" aria-selected={tab === 'parameters'} disabled={!canEditParameters} onClick={() => onTabChange('parameters')}>{tUi('参数')}</Button>
    </div>
    <div className="desktop-illustration-scroll" key={tab}>{children}</div>
  </Modal>;
}
