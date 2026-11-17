import { describe, expect, it } from 'vitest';
import { officialLayoutFixture } from '../../../../tests/helpers/officialLayout.js';

describe('Android drawer presentation on the retained native layout store', () => {
  it.each([390, 800, 844, 1280])('keeps the real %ipx viewport while toggling and navigating a hidden drawer', width => {
    const { store, dispose } = officialLayoutFixture();
    try {
      store.actions.setViewportWidth(width);
      const preference = store.getSnapshot().layoutInfo.sidebar;
      store.actions.setSidebarDrawer(true);
      expect(store.getSnapshot().layoutInfo).toMatchObject({ viewportWidth: width, sidebarDrawer: true, narrowExpanded: false });
      store.actions.toggleSidebar();
      expect(store.getSnapshot().layoutInfo).toMatchObject({ viewportWidth: width, sidebar: preference, narrowExpanded: true });
      store.actions.selectPanel('character');
      expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false);
      store.actions.toggleSidebar();
      store.actions.setViewportWidth(width === 1280 ? 800 : 1280);
      expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(true);
      store.actions.openRightbar(true, false);
      expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false);
      expect(store.getSnapshot().layoutInfo.rightbarShown).toBe(true);
    } finally { dispose(); }
  });
  it('keeps the desktop responsive sidebar preference and toggle', () => {
    const { store, dispose } = officialLayoutFixture();
    try {
      store.actions.setViewportWidth(1280);
      store.actions.setSidebarDrawer(false);
      expect(store.getSnapshot().layoutInfo.sidebarDrawer).toBe(false);
      expect(store.getSnapshot().layoutInfo.sidebar).toBe(280);
      store.actions.toggleSidebar();
      expect(store.getSnapshot().layoutInfo.sidebar).toBe(0);
      store.actions.toggleSidebar();
      expect(store.getSnapshot().layoutInfo.sidebar).toBe(280);
      expect(store.getSnapshot().layoutInfo.narrowExpanded).toBe(false);
    } finally { dispose(); }
  });
});
