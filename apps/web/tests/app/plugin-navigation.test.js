// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installMainPluginNavigation } from '../../src/app/services/pluginNavigation.js';
afterEach(() => { history.replaceState(null, '', '/'); delete window.dshDesktop; });

it('lets only the main window handle official navigation and releases its subscription', () => {
  let receive;
  const stop = vi.fn(), subscribeOpenSettings = vi.fn(listener => { receive = listener; return stop; });
  window.dshDesktop = { plugins: { subscribeOpenSettings } };
  history.replaceState(null, '', '?view=preset-editor&preset=synthetic-preset&section=tools');
  expect(installMainPluginNavigation()).toBeUndefined(); expect(subscribeOpenSettings).not.toHaveBeenCalled();
  history.replaceState(null, '', '/');
  const dispose = installMainPluginNavigation();
  const select = event => { expect(event.detail).toMatchObject({ id: 'web-search', kind: 'item' }); event.detail.opened = true; };
  window.addEventListener('eleckoi:dsh-plugins:select', select);
  try { expect(() => receive('web-search')).not.toThrow(); }
  finally { window.removeEventListener('eleckoi:dsh-plugins:select', select); }
  expect(receive('web-search')).toMatchObject({ isDSHRemoteError: true, message: '插件设置当前不可用。' });
  dispose(); expect(stop).toHaveBeenCalledOnce();
});
