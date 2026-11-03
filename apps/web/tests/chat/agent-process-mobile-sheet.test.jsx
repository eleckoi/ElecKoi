// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentProcessDialog } from '../../src/modules/chat/components/AgentProcessDialog.jsx';

const message = { status: 'running', content: '', process: [
  { id: 'synthetic-tool', kind: 'tool', status: 'running', toolName: 'synthetic_read',
    arguments: '{"path":"synthetic.txt"}', detail: '合成详情', startedAtMillis: 1 },
] };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
let root;
let container;

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  container?.remove();
  delete document.documentElement.dataset.eleckoiMobile;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderDialog(mobile = true, processMessage = message) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  if (mobile) document.documentElement.dataset.eleckoiMobile = 'true';
  // jsdom does not implement pseudo-element style queries.
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1, 0, 0, 1, 0, 23)', opacity: '0.7' }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onClose = vi.fn();
  await act(async () => root.render(<AgentProcessDialog message={processMessage} onClose={onClose} />));
  return { onClose, overlay: document.querySelector('.roleplay-process-backdrop'),
    dialog: document.querySelector('.roleplay-process-dialog') };
}

describe('mobile process bottom sheet', () => {
  it('updates an open turn clock and stops at the official end while the dialog stays open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const live = { ...message, pending: true, processTiming: { startedAtMillis: 1000 } };
    const { dialog } = await renderDialog(false, live);
    expect(dialog.querySelector('.roleplay-process-header > div').textContent).toBe('处理过程进行中1秒');
    await act(async () => vi.advanceTimersByTime(43000));
    expect(dialog.querySelector('.roleplay-process-header > div').textContent).toBe('处理过程进行中43秒');
    await act(async () => root.render(<AgentProcessDialog message={{ ...live, pending: false, status: 'complete',
      processTiming: { startedAtMillis: 1000, completedAtMillis: 44000 } }} onClose={() => {}} />));
    await act(async () => vi.advanceTimersByTime(3600000));
    expect(dialog.querySelector('.roleplay-process-header > div').textContent).toBe('处理过程已完成43秒');
  });
  it('does not grow a historical duration when completed reasoning lacks an item end time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3600000);
    const historical = { status: 'complete', processTiming: { startedAtMillis: 1000, completedAtMillis: 44000 },
      process: [{ id: 'synthetic-thought', kind: 'reasoning', toolName: 'reasoning', status: 'complete', startedAtMillis: 3000, detail: '合成分析' }] };
    const { dialog } = await renderDialog(false, historical);
    expect(dialog.querySelector('.roleplay-process-header > div').textContent).toBe('处理过程已完成43秒');
    await act(async () => vi.advanceTimersByTime(3600000));
    expect(dialog.querySelector('.roleplay-process-header > div').textContent).toBe('处理过程已完成43秒');
  });
  it('waits only for the sheet exit while its running tool animation continues', async () => {
    const { onClose, overlay } = await renderDialog();
    let finishSheet;
    let finishScrim;
    overlay.getAnimations = () => [
      { animationName: 'mobile-sheet-out', finished: new Promise(resolve => { finishSheet = resolve; }) },
      { animationName: 'mobile-sheet-scrim-out', finished: new Promise(resolve => { finishScrim = resolve; }) },
      { animationName: 'agent-process-spin', finished: new Promise(() => {}) },
    ];
    await act(async () => overlay.querySelector('.roleplay-process-close').click());
    expect(overlay.dataset.sheetClosing).toBe('true');
    expect(overlay.style.getPropertyValue('--mobile-sheet-exit-from')).toContain('23');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finishScrim(); await flush(); });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finishSheet(); await flush(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape and restores the previous focus', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const { onClose, dialog } = await renderDialog();
    expect(document.activeElement).toBe(dialog);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flush(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount()); root = undefined;
    expect(document.activeElement).toBe(trigger); trigger.remove();
  });

  it('dismisses immediately when reduced motion has no exit animation', async () => {
    const { onClose, overlay } = await renderDialog();
    overlay.getAnimations = () => [];
    await act(async () => { overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await flush(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps desktop dismissal synchronous without starting a mobile exit', async () => {
    const { onClose, overlay } = await renderDialog(false);
    overlay.querySelector('.roleplay-process-close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(overlay.hasAttribute('data-sheet-closing')).toBe(false);
  });
});
