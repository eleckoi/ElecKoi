import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { CaretRight, UsersThree } from '../../../ui/icons/interfaceIcons.jsx';

export function SubagentSettingsLink({ onBeforeOpen, onOpen, onNotify }) {
  const tUi = useProductTranslation();
  async function openSettings() {
    if (onBeforeOpen?.() === false) return;
    // RETIRE WHEN: official Desktop replaces the complete ADR 0043 main-window adapter.
    if (new URLSearchParams(window.location.search).has('view') && window.dshDesktop?.plugins) {
      try {
        await window.dshDesktop.plugins.openSettings('subagent');
        onOpen?.();
      } catch (error) {
        onNotify?.('error', error.message || tUi("子智能体设置暂时无法打开"));
      }
      return;
    }
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
