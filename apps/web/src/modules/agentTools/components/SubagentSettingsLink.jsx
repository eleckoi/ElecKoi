import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { CaretRight, UsersThree } from '../../../ui/icons/interfaceIcons.jsx';

export function SubagentSettingsLink({ onBeforeOpen, onOpen, onNotify }) {
  const tUi = useProductTranslation();
  function openSettings() {
    if (onBeforeOpen?.() === false) return;
    const detail = { id: 'subagent', kind: 'item', opened: false, error: null };
    window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:select', { detail }));
    if (!detail.opened) {
      onNotify?.('error', detail.error || tUi("子智能体设置暂时无法打开"));
      return;
    }
    onOpen?.();
  }

  return <button type="button" className="subagent-settings-link" onClick={openSettings}>
    <UsersThree size={23} aria-hidden="true" />
    <strong>{tUi("前往子智能体设置")}</strong>
    <CaretRight size={17} aria-hidden="true" />
  </button>;
}
