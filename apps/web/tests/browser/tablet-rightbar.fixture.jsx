import React, { useSyncExternalStore } from 'react';
import { Context } from '@deepseek-ai/cordis';
import { createSidebarRightStore } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/stores.ts';
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts';
import { createSidebarRightController } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/service.ts';
import { defaultSeed } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/contract/seed.ts';
import { guideDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tabs/guide/definition.ts';
import { GuideBody } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tabs/guide/GuideBody.tsx';
import { ExpandButton } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/shell/ExpandButton.tsx';
import { RightbarSeat } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/shell/SidebarRight.tsx';
import { zh } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/locales.ts';
import { useMainPageView } from '../../src/app/windows/MainPageContext.jsx';

const noop = () => {}, hook = value => select => select(value), empty = [];
const sessionId = 'tablet-runtime', t = key => zh[key] ?? key;
const tabs = new SidebarRightTabRegistry(new Context());
tabs.register(guideDefinition(t));
const store = createSidebarRightStore(() => defaultSeed(tabs)).create(sessionId);
store.actions.open(sessionId);
store.actions.setExpanded(sessionId, false);
const right = createSidebarRightController(tabs, noop, { autoFullscreen: () => innerWidth < 768,
  openWithFocus: (_id, open) => open(), closeWithFocus: (_id, _pane, close) => close() });
right.adopt(sessionId, store); right.show(sessionId);
const useStore = select => select(useSyncExternalStore(store.subscribe, store.getSnapshot));
const tabTypes = tabs.entries();
const useTabNavigation = (id, select = value => value) => {
  const source = right.controller.tabDomain.occurrence(sessionId, { id }).navigation;
  return select(useSyncExternalStore(source.subscribe, source.getSnapshot));
};
const render = (name, _owner, options) => {
  if (name.endsWith('.title')) return options.fallback;
  const context = options.hookContext;
  const useTabInfo = () => ({ tab: { actions: right.controller.tabDomain.occurrence(sessionId, { id: context.tabId }).tabActions } });
  return <GuideBody useTabInfo={useTabInfo} useGuideEntries={hook(empty)} useShortcuts={hook(empty)}
    useEntryPins={hook(empty)} useEntryActions={hook(false)} setPinned={noop} t={t}
    renderSlot={(_name, _owner, opts) => opts?.fallback} renderSlotChain={(_name, _owner, opts) => opts.fallback} />;
};
export function TabletRightbarExpand() {
  return <ExpandButton sessionId={sessionId} useStore={useStore} actions={store.actions} useShortcuts={hook(empty)} t={t} />;
}
export function TabletRightbar({ owner, layout }) {
  const view = useMainPageView(), active = ['conversation', 'creator-studio'].includes(view.route.kind);
  return <RightbarSeat {...owner} active={active} sessionId={sessionId} useStore={useStore} actions={store.actions} t={t}
    syncPresentation={React.useCallback(({ shown, track, fullscreen }) => shown ? layout.actions.openRightbar(track, fullscreen) : layout.actions.closeRightbar(), [layout])}
    measureRoom={noop} reportAutoFullscreen={noop} openTab={(kind, options) => right.controller.openTab(kind, options)}
    closeTab={id => right.controller.closeIn(sessionId, id)} splitPane={id => right.controller.split(id)}
    toggleFullscreen={() => { const target = right.controller.commandTarget(); if (target) right.controller.toggleFullscreen(target); }}
    useContextMenu={() => ({ getTriggerProps: () => ({}) })} useContextMenuTarget={hook(null)} useTabTypes={hook(tabTypes)}
    useTabNavigation={useTabNavigation} occurrence={tab => right.controller.tabDomain.occurrence(sessionId, tab)}
    useShortcuts={hook(empty)} useFlash={hook(undefined)} renderSlot={render} />;
}
let previousRightbarState, rightbarSnapshot = { shown: false };
export const rightbar = { subscribe: store.subscribe, getSnapshot: () => {
  const next = store.getSnapshot();
  if (next !== previousRightbarState) { previousRightbarState = next; rightbarSnapshot = { shown: Boolean(next.bySession[sessionId]?.layout.expanded) }; }
  return rightbarSnapshot;
},
  close: () => store.actions.setExpanded(sessionId, false) };
