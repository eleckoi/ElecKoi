import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AppFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx';
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts';
import { MobileWindow } from '../../src/mobile/MobileWindow.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { MobileMessagesPage } from '../../src/mobile/MobileMessagesPage.jsx';
import { MobilePresetsPage } from '../../src/mobile/MobilePresetsPage.jsx';
import { MobileModelsPage } from '../../src/mobile/MobileModelsPage.jsx';
import { MobileCreatorStudioPage } from '../../src/mobile/MobileCreatorStudioPage.jsx';
import { MobileHeader } from '../../src/mobile/MobileChrome.jsx';
import { OfficialFrameSidebar } from '../../src/app/windows/shell/components/OfficialFrameSidebar.jsx';
import { useMainPageView } from '../../src/app/windows/MainPageContext.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import { characters, presets, models, characterConfiguration, previewActions, creatorStudio } from './tablet-layout-model.fixture.jsx';
import { renderRoleplay } from './tablet-conversation.fixture.jsx';
import { renderStudio, StudioSidebar } from './tablet-studio.fixture.jsx';
import { TabletRightbar, rightbar } from './tablet-rightbar.fixture.jsx';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

installBrowserIconSprite();
const dark = new URLSearchParams(location.search).get('theme') === 'dark';
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.body.toggleAttribute('data-ds-dark-theme', dark);
const noop = () => {};
const layout = createLayoutStore().create();
layout.actions.setSidebarDrawer(true);
layout.actions.selectPanel('character');
let sidebar = { shown: false, width: 0, drawer: true }, guard;
const sidebarListeners = new Set();
const items = [ ['messages', '消息'], ['character', '角色'], ['creatorStudio', 'AI创作'], ['presets', '预设'], ['model', '模型'],
  ['plugins', '插件'], ['automation', '自动化'] ].map(([id, label]) => ({ id, label }));
const navigationBase = {
  items, productPanelIds: items.map(item => item.id),
  sidebar: { subscribe: callback => { sidebarListeners.add(callback); return () => sidebarListeners.delete(callback); }, getSnapshot: () => sidebar },
  reportSidebar: next => {
    if (Object.keys(next).every(key => next[key] === sidebar[key])) return;
    sidebar = next; sidebarListeners.forEach(callback => callback());
  },
  toggleSidebar: () => layout.actions.toggleSidebar(),
  closeSidebar: () => { if (sidebar.shown) layout.actions.toggleSidebar(); },
  selectPanel: id => { const select = () => layout.actions.selectPanel(id); guard ? guard(select) : select(); },
  setPanelGuard: next => { guard = next; return () => { guard = undefined; }; },
};
const useStore = select => select(useSyncExternalStore(layout.subscribe, layout.getSnapshot));
const usePanelInfo = select => select(useSyncExternalStore(layout.subscribe, layout.getSnapshot).panelInfo);
function NativeFrame() {
  const view = useMainPageView();
  const renderSlot = useCallback((name, owner) => {
    if (name === 'sidebar') return <OfficialFrameSidebar {...owner} workspaceSidebar={<StudioSidebar owner={owner} layout={layout} />} renderSidebarSlot={() => null} />;
    if (name === 'rightbar') return <TabletRightbar owner={owner} layout={layout} />;
    if (name !== 'main') return null;
    if (view.navigation.selectedPanelId === 'character') return <MobileCharactersPage />;
    if (view.navigation.selectedPanelId === 'messages') return <MobileMessagesPage />;
    if (view.navigation.selectedPanelId === 'presets') return <MobilePresetsPage />;
    if (view.navigation.selectedPanelId === 'model') return <MobileModelsPage />;
    if (view.navigation.selectedPanelId === 'creatorStudio') return <MobileCreatorStudioPage />;
    const title = items.find(item => item.id === view.navigation.selectedPanelId)?.label || '设置';
    return <div className="mobile-root-page"><MobileHeader title={title} /><div className="mobile-scroll" /></div>;
  }, [view.navigation.selectedPanelId]);
  return <AppFrame actions={layout.actions} useStore={useStore} usePanelInfo={usePanelInfo}
    useSessions={select => select({ byId: {} })} useFoldedLandscape={select => select(false)} t={key => key} renderSlot={renderSlot} />;
}
function Fixture() {
  const selected = usePanelInfo(info => info.activePanelId);
  const navigation = useMemo(() => ({ ...navigationBase, selectedPanelId: selected }), [selected]);
  window.tabletFixture = { layout, navigation, noop, previewActions, models, presets };
  return <MobileWindow navigation={navigation} rightbar={rightbar} characters={characters} presets={presets} models={models} creatorStudio={creatorStudio} characterConfiguration={characterConfiguration} renderRoleplay={renderRoleplay} renderCreatorStudioConversation={renderStudio} nativeFrame={<NativeFrame />} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
