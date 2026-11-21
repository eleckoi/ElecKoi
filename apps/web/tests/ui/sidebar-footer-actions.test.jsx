import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { OfficialFrameSidebar } from '../../src/app/windows/shell/components/OfficialFrameSidebar.jsx';
import { SidePanelShell } from '../../src/app/windows/shell/components/SidePanelShell.jsx';
import { SidebarContent } from '../../src/app/windows/shell/components/SidebarContent.jsx';

vi.mock('../../src/ui/icons/dshComposerIcons.jsx', () => ({ DshPanelLeftIcon: () => null }));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

describe('sidebar footer actions', () => {
  it('keeps plugin actions after the scrollable side panel content', () => {
    const html = renderToStaticMarkup(
      <SidePanelShell footerActions={<button type="button">插件操作</button>}>
        <div>聊天列表</div>
      </SidePanelShell>,
    );
    expect(html).toContain('has-footer-actions');
    expect(html.indexOf('聊天列表')).toBeLessThan(html.indexOf('侧边栏插件操作'));
    expect(html).toContain('<button type="button">插件操作</button>');
  });

  it('does not reserve footer space without plugin actions', () => {
    const html = renderToStaticMarkup(<SidePanelShell><div>聊天列表</div></SidePanelShell>);
    expect(html).not.toContain('has-footer-actions');
    expect(html).not.toContain('侧边栏插件操作');
  });

  it('leaves the PC character sidebar footer out even with active plugin and update slots', () => {
    const view = {
      chat: { activeSection: 'character' },
      navigation: { productPanelIds: ['character'], hasSidebarFooterActions: true },
    };
    const renderSidebarSlot = vi.fn(name => {
      if (name === 'sidebar.footer.action' || name === 'sidebar.update') return <button>{name}</button>;
      return null;
    });
    const html = renderToStaticMarkup(<MainPageContext.Provider value={view}>
      <OfficialFrameSidebar width={328} renderSidebarSlot={renderSidebarSlot} />
    </MainPageContext.Provider>);
    expect(html).toContain('side-panel-brand');
    expect(html).toContain('official-product-sidebar-target');
    expect(html).not.toContain('has-footer-actions');
    expect(html).not.toContain('side-panel-footer-actions');
    expect(renderSidebarSlot.mock.calls.map(([name]) => name)).toEqual(['sidebar.brand.name']);
  });

  it.each([false, true])('puts the single update slot at the right footer of the %s workspace sidebar', workspace => {
    const calls = [];
    const html = renderToStaticMarkup(<SidebarContent collapsed={false} workspaceCollapsed={false}
      sidePanel={<div>角色会话列表</div>} workspaceSidebar={workspace ? <div>工作区会话列表</div> : null}
      navigationItems={[]} persona={{ user_name: '合成用户' }} renderSidebarSlot={name => {
        if (name !== 'sidebar.update') return null;
        calls.push(name); return <button>47%</button>;
      }} />);
    expect(calls).toEqual(['sidebar.update']);
    expect(html).not.toContain('rail-desktop-update');
    expect(html).toContain('class="sidebar-update-seat"><button>47%</button>');
    expect(html.indexOf('sidebar-update-seat')).toBeGreaterThan(html.indexOf('</aside>'));
    expect(html).toContain(workspace ? 'workspace-update-footer' : 'side-panel-footer-actions is-update-only');
  });
});
