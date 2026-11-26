import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';

export function RoleplayReplyDisableDialog({ open, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  return <ConfirmationDialog open={open} title={tUi('关闭角色扮演回复？')}
    description={tUi('关闭后，AI 的角色扮演正文将不可见。')}
    confirmLabel={tUi('关闭工具')} destructive onCancel={onCancel} onConfirm={onConfirm} />;
}
