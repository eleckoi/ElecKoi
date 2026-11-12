import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { desktopIpcFailureOf } from '@shared/foundation/ipcFailure';

/** The main renderer keeps ownership of official plugin views and leave guards. */
// RETIRE WHEN: the ADR 0043 platform adapter is replaced by official cross-window navigation.
export function installMainPluginNavigation() {
  if (new URLSearchParams(window.location.search).has('view')) return;
  return window.dshDesktop?.plugins?.subscribeOpenSettings(id => {
    const detail = { id, kind: 'item', opened: false, error: null };
    window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:select', { detail }));
    if (!detail.opened) return desktopIpcFailureOf(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady,
      detail.error || '插件设置当前不可用。', { what: '插件设置' }));
  });
}
