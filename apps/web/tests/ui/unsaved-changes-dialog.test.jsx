// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsavedChangesDialog } from '../../src/ui/ui/UnsavedChangesDialog.jsx';

globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await act(() => root.unmount()); root = null; document.body.replaceChildren(); });
async function mount(props = {}) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const actions = { onCancel: vi.fn(), onDiscard: vi.fn(), onSave: vi.fn() };
  await act(() => root.render(<UnsavedChangesDialog open title="保存修改？" description="离开前是否保存当前模型配置的修改？" {...actions} {...props} />));
  return { host, actions, dialog: document.querySelector('[role=dialog]') };
}
describe('official shared unsaved changes dialog', () => {
  it('uses the official portal and cancellation-first footer with a primary Save action', async () => {
    const { host, actions, dialog } = await mount();
    expect(host.contains(dialog)).toBe(false); expect(dialog.textContent).toContain('离开前是否保存当前模型配置的修改？');
    const buttons = [...dialog.querySelector('.product-dialog-actions').querySelectorAll('button')];
    expect(buttons.map(n => n.textContent)).toEqual(['取消', '不保存', '保存']);
    expect(document.activeElement).toBe(buttons[0]);
    await act(() => buttons[2].click()); expect(actions.onSave).toHaveBeenCalledOnce();
    await act(() => buttons[1].click()); expect(actions.onDiscard).toHaveBeenCalledOnce();
    await act(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(actions.onCancel).toHaveBeenCalledOnce();
  });
  it('blocks dismissal and all three actions while saving and keeps failure detail available', async () => {
    const { actions, dialog } = await mount({ saving: true, error: '合成保存失败' });
    expect(dialog.querySelector('[role=alert]').textContent).toBe('合成保存失败');
    const buttons = [...dialog.querySelector('.product-dialog-actions').querySelectorAll('button')];
    expect(buttons.every(n => n.disabled)).toBe(true); expect(buttons[2].textContent).toBe('保存中');
    await act(() => dialog.querySelector('[aria-label="关闭"]').click());
    await act(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(actions.onCancel).not.toHaveBeenCalled(); expect(actions.onSave).not.toHaveBeenCalled(); expect(actions.onDiscard).not.toHaveBeenCalled();
  });
  it('preserves owner labels and disabled Save without blocking discard', async () => {
    const { actions, dialog } = await mount({ saveDisabled: true, saveLabel: '应用', discardLabel: '放弃', cancelLabel: '继续编辑' });
    const buttons = [...dialog.querySelector('.product-dialog-actions').querySelectorAll('button')];
    expect(buttons.map(n => n.textContent)).toEqual(['继续编辑', '放弃', '应用']);
    expect(buttons[2].disabled).toBe(true); await act(() => buttons[1].click()); expect(actions.onDiscard).toHaveBeenCalledOnce();
  });
});
