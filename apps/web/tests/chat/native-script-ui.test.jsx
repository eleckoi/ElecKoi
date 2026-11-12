// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleplayInputMenu } from '../../src/modules/chat/components/RoleplayInputMenu.jsx';
import { NativeScriptPanel } from '../../src/modules/scripts/components/NativeScriptPanel.jsx';

let container, root;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute('open', ''); this.querySelector('button')?.focus(); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute('open'); });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('native script chat controls', () => {

  const openMore = async () => {
    await act(() => container.querySelector('.roleplay-menu-trigger').click());
    await act(() => [...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent === '更多').click());
  };
  it('runs the exact script identity from More and shows the author-provided source', async () => {
    const run = vi.fn(), key = JSON.stringify(['synthetic-script', 'synthetic-action']);
    await act(() => root.render(<RoleplayInputMenu scriptsReady scriptButtons={[
      { key, label: 'Synthetic action', scriptName: 'Synthetic script', busy: false, error: '' },
      { key: 'synthetic-busy', label: 'Busy action', scriptName: 'Synthetic script', busy: true, error: '' },
    ]} onRunScriptButton={run} />));
    await openMore();
    expect(document.querySelector('.composer-menu-section').textContent).toBe('脚本提供');
    const buttons = document.querySelectorAll('.composer-menu-script');
    expect(buttons[0].querySelector('small').textContent).toBe('全局脚本 · Synthetic script');
    expect(buttons[1].disabled).toBe(true);
    await act(() => buttons[0].click()); expect(run).toHaveBeenCalledExactlyOnceWith(key);
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.roleplay-menu-trigger'));
  });
  it.each(['roleplay', 'creator'])('shows the script group and real empty state in %s without fabricating actions', async purpose => {
    await act(() => root.render(<RoleplayInputMenu purpose={purpose} scriptButtons={[]} />)); await openMore();
    expect(document.querySelector('.composer-menu-section').textContent).toBe('脚本提供');
    expect(document.querySelector('[role=status]').textContent).toBe('暂无可用按钮');
    expect(document.querySelector('.composer-menu-script')).toBeNull();
  });
  it.each(['escape', 'platform-back'])('returns from More with %s before closing the menu', async action => {
    await act(() => root.render(<RoleplayInputMenu />)); await openMore();
    const back = () => window.dispatchEvent(action === 'escape' ? new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }) : new Event('eleckoi:platform-back', { cancelable: true }));
    await act(back); expect(document.querySelector('[role=menu]').classList.contains('is-main')).toBe(true);
    await act(back); expect(document.querySelector('[role=menu]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.roleplay-menu-trigger'));
  });
  it('updates readiness, busy state, errors and withdrawn actions while More stays open', async () => {
    const run = vi.fn(), button = { key: 'synthetic-action', label: 'Synthetic action', scriptName: 'Synthetic script', busy: false, error: '' };
    const render = (buttons, ready = true) => root.render(<RoleplayInputMenu scriptsReady={ready} scriptButtons={buttons} onRunScriptButton={run} />);
    await act(() => render([button], false)); await openMore();
    expect(document.querySelector('.composer-menu-script').disabled).toBe(true);
    await act(() => render([{ ...button, busy: true, error: 'Synthetic action failure' }]));
    expect(document.querySelector('.composer-menu-script').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('[role=alert]').textContent).toBe('Synthetic action failure');
    await act(() => document.querySelector('.composer-menu-script').click()); expect(run).not.toHaveBeenCalled();
    await act(() => render([])); expect(document.querySelector('.composer-menu-script')).toBeNull();
    expect(document.querySelector('[role=status]').textContent).toBe('暂无可用按钮');
  });
  it('unmounts actions with their chat so retired actions cannot run in a different conversation', async () => {
    const run = vi.fn();
    const render = id => root.render(<RoleplayInputMenu key={id} scriptsReady onRunScriptButton={run} scriptButtons={[{ key: id, label: id, scriptName: 'Synthetic script', busy: false, error: '' }]} />);
    await act(() => render('synthetic-chat-one')); await openMore();
    const retired = document.querySelector('.composer-menu-script'); await act(() => render('synthetic-chat-two'));
    expect(document.querySelector('[role=menu]')).toBeNull(); await act(() => retired.click()); expect(run).not.toHaveBeenCalled();
    await openMore(); expect(document.querySelector('.composer-menu-script').textContent).toContain('synthetic-chat-two');
  });

  it('mounts the exact script panel, ignores other frames, releases errors and remounts on retry', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
    const getWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function () {
      const target = getWindow.call(this);
      if (target && this.name && !target.__ElecKoiCompleteDocument) {
        target.__ElecKoiDocumentChannel = this.name; target.__ElecKoiCompleteDocument = vi.fn();
      }
      return target;
    });
    const stop = vi.fn(), runtime = { mountScriptPanelDocument: vi.fn(target => { target.ElecKoi = {}; return stop; }), dismissPanel: vi.fn() };
    const panel = { id: 'synthetic-settings', key: 'synthetic-panel-key', title: 'Synthetic settings',
      html: '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Settings</body></html>',
      baseUrl: '/eleckoi/scripts/global/_/synthetic-version/scripts/entry.js' };
    const previous = document.createElement('button'); container.append(previous); previous.focus();
    await act(() => root.render(<NativeScriptPanel runtime={runtime} panel={panel} />));
    const dialog = document.querySelector('.native-script-dialog'), frame = dialog.querySelector('iframe');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    await act(() => frame.dispatchEvent(new Event('load')));
    expect(runtime.mountScriptPanelDocument).toHaveBeenCalledWith(frame.contentWindow, panel.key);
    expect(frame.srcdoc).toContain('/eleckoi/scripts/global/_/synthetic-version/scripts/entry.js');
    await act(() => window.dispatchEvent(new MessageEvent('message', { source: window, data: { channel: frame.name, type: 'eleckoi:frontend-error', message: 'Wrong source' } })));
    expect(dialog.querySelector('[role=alert]')).toBeNull();
    await act(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { channel: frame.name, type: 'eleckoi:frontend-error', message: 'Synthetic panel error' } })));
    expect(stop).toHaveBeenCalledOnce(); expect(dialog.querySelector('[role=alert]').textContent).toBe('Synthetic panel error');
    await act(() => dialog.querySelector('[aria-label="重新加载作者面板"]').click());
    const second = dialog.querySelector('iframe'); await act(() => second.dispatchEvent(new Event('load')));
    expect(second).not.toBe(frame); expect(runtime.mountScriptPanelDocument).toHaveBeenCalledTimes(2);
    await act(() => second.contentWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(runtime.dismissPanel).toHaveBeenCalledWith(panel.key);
    await act(() => root.render(null)); expect(stop).toHaveBeenCalledTimes(2);
  });
});
