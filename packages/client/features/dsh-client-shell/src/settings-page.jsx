import '@deepseek-ai/dsh-client-ui-sidebar/client';
import { SettingsPanel } from "../../../../../apps/web/src/modules/settings/index.js";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
import logoIcon from "../../../../../apps/web/src/assets/eleckoi-app-icon.png";
export { ElecKoiWordmark as SidebarBrandName } from "../../../../../apps/web/src/ui/icons/ElecKoiWordmark.jsx";
export { CreatorStudioNavIcon as CreatorStudioNavigationIcon, CommunityNavIcon as CommunityNavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function SidebarBrandMark({ size = 24 }) {
  return <img src={logoIcon} width={size} height={size} alt="" draggable="false" />;
}

export function SettingsPage() {
  const view = useMainPageView();
  const { chat, appearance, appUpdates, settingsSections, renderSettingsSection, renderUserProfileEditor, settingsPage, setSettingsPage, changeActiveSection, renderLayout } = view;
  return <SettingsPanel
    activePage={settingsPage}
    onPageChange={setSettingsPage}
    persona={chat.persona}
    onUpdateUserProfile={chat.updateUserProfile}
    renderUserProfileEditor={renderUserProfileEditor}
    chatDisplay={appearance.chatDisplay}
    onChatDisplayChange={appearance.changeChatDisplay}
    appearanceMode={appearance.appearanceMode}
    onAppearanceModeChange={appearance.changeAppearanceMode}
    sidebarCharacterArtwork={appearance.sidebarCharacterArtwork}
    onSidebarCharacterArtworkChange={appearance.changeSidebarCharacterArtwork}
    appUpdates={appUpdates}
    settingsSections={settingsSections}
    renderSettingsSection={renderSettingsSection}
    onClosePluginSection={() => changeActiveSection("messages")}
    renderLayout={renderLayout}
  />;
}
