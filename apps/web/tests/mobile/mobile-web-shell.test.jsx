// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppUpdates } from '../../src/modules/updates/hooks/useAppUpdates.js';
import { WindowControls } from '../../src/app/windows/shell/components/TitleBar.jsx';
import { AboutSettings } from '../../src/modules/settings/components/AboutSettings.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function Shell() {
  const updates = useAppUpdates();
  return <><span>页面已挂载</span><WindowControls /><AboutSettings updates={updates} /></>;
}
async function mount() {
  const node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<Shell />));
}
describe('Android Web Client platform admission', () => {
  it('mounts in a browser without desktop or Android native bridges', async () => {
    vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', undefined);
    vi.stubGlobal('dshDesktop', undefined);
    vi.stubGlobal('ElecKoiPlatform', undefined);
    await mount();
    expect(document.body.textContent).toContain('页面已挂载');
    expect(document.querySelector('.window-controls')).toBeNull();
  });
  it('mounts without an Electron facade and attaches Android checks when the platform bridge becomes ready', async () => {
    vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', { kind: 'android', version: '0.2.8' });
    vi.stubGlobal('dshDesktop', undefined);
    await mount();
    expect(document.body.textContent).toContain('页面已挂载');
    expect(document.body.textContent).toContain('当前版本 v0.2.8');
    expect(document.body.textContent).toContain('检查更新');
    expect(document.querySelector('.window-controls')).toBeNull();
    const unsubscribe=vi.fn();
    const updates={ subscribe:vi.fn(() => unsubscribe), status:vi.fn(async () => ({phase:'idle',currentVersion:'0.2.8'})),
      check:vi.fn(async () => ({phase:'idle',currentVersion:'0.2.8',message:'暂无已发布的安卓更新。'})) };
    vi.stubGlobal('ElecKoiPlatform',{updates});
    await act(async () => window.dispatchEvent(new Event('eleckoi:platform-ready')));
    expect(updates.subscribe).toHaveBeenCalledOnce();
    await act(async () => document.querySelector('.about-update-button').click());
    expect(updates.check).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('暂无已发布的安卓更新。');
    await act(async () => root.unmount()); root=undefined;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('retains the actual desktop update subscription and window actions', async () => {
    const unsubscribe = vi.fn();
    const updates = { subscribe: vi.fn(() => unsubscribe), status: vi.fn(async () => ({ phase: 'idle', currentVersion: '0.2.8' })) };
    const minimize = vi.fn();
    vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', undefined);
    vi.stubGlobal('dshDesktop', { updates, windowControls: { minimize } });
    await mount();
    expect(updates.subscribe).toHaveBeenCalledOnce();
    expect(updates.status).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('检查更新');
    await act(async () => document.querySelector('[title="最小化"]').click());
    expect(minimize).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = undefined;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
