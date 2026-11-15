// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ConfirmationDialog } from '../../src/ui/ui/ConfirmationDialog.jsx';

globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
it('states destructive consequences through official Modal and requires the explicit confirm action', async () => {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host),confirm=vi.fn(),cancel=vi.fn();
  try {
    await act(() => root.render(<ConfirmationDialog open title="删除这些消息？" description="将删除选中消息及其后的全部内容，共 3 条。" confirmLabel="删除消息" destructive onCancel={cancel} onConfirm={confirm} />));
    const dialog=document.querySelector('[role=dialog]');expect(host.contains(dialog)).toBe(false);expect(dialog.textContent).toContain('共 3 条');expect(confirm).not.toHaveBeenCalled();
    await act(() => [...dialog.querySelectorAll('button')].find(n=>n.textContent==='删除消息').click());expect(confirm).toHaveBeenCalledOnce();
    await act(() => dialog.querySelector('[aria-label="关闭"]').click());expect(cancel).toHaveBeenCalledOnce();
  } finally { await act(() => root.unmount());host.remove(); }
});
