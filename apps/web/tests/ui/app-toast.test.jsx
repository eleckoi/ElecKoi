// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppToast } from '../../src/ui/ui/AppToast.jsx';

let root, host;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = async props => act(async () => root.render(<AppToast {...props} />));

describe('official app notices', () => {
  it('uses the official success notification portal, icon and complete fade lifecycle', async () => {
    vi.useFakeTimers(); const onDismiss = vi.fn();
    await render({ notice: { id: 1, type: 'success', message: '已保存' }, onDismiss });
    expect(host.textContent).toBe('');
    expect(document.querySelector('[role=alert]').textContent).toBe('已保存');
    expect(document.querySelector('[role=alert] svg')).not.toBeNull();
    expect(document.querySelector('.app-toast')).toBeNull();
    await act(async () => vi.advanceTimersByTime(3999)); expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1)); expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('restarts repeated notifications and cancels the previous completion', async () => {
    vi.useFakeTimers(); const onDismiss = vi.fn();
    await render({ notice: { id: 1, message: '已保存' }, onDismiss });
    await act(async () => vi.advanceTimersByTime(3000));
    await render({ notice: { id: 2, message: '已保存' }, onDismiss });
    await act(async () => vi.advanceTimersByTime(1000)); expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(3000)); expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('keeps errors persistent in the official modal and retains the original message', async () => {
    vi.useFakeTimers(); const onDismiss = vi.fn();
    const message = 'RESOURCE_EXHAUSTED\nCaused by: HTTP 429 {"retryDelay":"59s"}';
    await render({ notice: { id: 2, type: 'error', message }, onDismiss });
    expect(document.querySelector('[role=dialog][aria-modal=true]').getAttribute('aria-label')).toBe('运行错误');
    expect(document.querySelector('.app-error-detail').textContent).toBe(message);
    expect(document.activeElement.textContent).toBe('复制');
    expect(document.querySelector('.app-error-actions').textContent).not.toContain('复制错误');
    await act(async () => vi.advanceTimersByTime(10000)); expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('shows the failure code and parameters and exposes full technical detail', async () => {
    const failure = { code: 'eleckoi/storage/corrupt', details: { what: '创作项目索引' }, diagnostic: 'eleckoi-renderer-failure [eleckoi/storage/corrupt] 库坏了（what: 创作项目索引）' };
    await render({ notice: { id: 3, type: 'error', message: '存储内容已损坏，读不出来：创作项目索引。', failure } });
    const dialog = document.querySelector('[role=dialog]');
    expect(dialog.querySelector('.app-error-failure').textContent).toContain('eleckoi/storage/corrupt');
    expect([...dialog.querySelectorAll('dd')].map(node => node.textContent)).toContain('创作项目索引');
    expect(dialog.querySelector('details').open).toBe(false);
    expect(dialog.querySelector('details pre').textContent).toBe(failure.diagnostic);
  });
});
