// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceSidebarSurface } from '../../src/app/windows/shell/components/SidebarContent.jsx';

let root, host;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  document.documentElement.removeAttribute('data-windows-titlebar');
  vi.unstubAllGlobals();
});

it.each([true, false])('leaves the desktop host marker unchanged across sidebar navigation (%s)', async windows => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.documentElement.toggleAttribute('data-windows-titlebar', windows);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  for (let visit = 0; visit < 2; visit++) {
    await act(async () => root.render(<WorkspaceSidebarSurface collapsed={false}><span>合成工作区</span></WorkspaceSidebarSurface>));
    expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(windows);
    expect(host.textContent).toContain('合成工作区');
    await act(async () => root.render(null));
    expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(windows);
  }
});
