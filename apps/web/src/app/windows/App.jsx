import { MainWindow } from "./MainWindow.jsx";
import { ChatWindow } from "./ChatWindow.jsx";
import { CharacterEditorWindow } from "./CharacterEditorWindow.jsx";
import { CharacterManagerWindow } from "./CharacterManagerWindow.jsx";
import { CreatorStudioWindow } from "./CreatorStudioWindow.jsx";
import { PresetManagerWindow } from "./PresetManagerWindow.jsx";
import { WebSearchProvider } from "../../modules/agentTools/index.js";
import { AppearanceProvider } from "../../modules/appearance/index.js";
import { DisplayPreferencesProvider } from "../../modules/settings/index.js";
import { OfficialMarkdownProvider } from "../../ui/messages/OfficialMarkdown.jsx";
import { ApplicationFrontendController } from "../../modules/authorFrontend/index.js";

export default function App(props = {}) {
  return <OfficialMarkdownProvider component={props.markdownComponent}>
    <AppearanceProvider model={props.appearance}>
    <DisplayPreferencesProvider model={props.displayPreferences}>
      <WebSearchProvider model={props.webSearch}>
        <ApplicationFrontendController slots={props.slots} subscribeSlots={props.subscribeSlots} navigation={props.navigation}>
          {navigation => <AppContent {...props} navigation={navigation} />}
        </ApplicationFrontendController>
      </WebSearchProvider>
    </DisplayPreferencesProvider>
    </AppearanceProvider>
  </OfficialMarkdownProvider>;
}

function AppContent({ conversations, characters, characterConfiguration, creatorStudio, models, persona, presets, webSearch, settingsSections, navigation, rightbar, renderSettingsSection, renderUserProfileEditor, renderCharacterPageSection, renderCharacterEditorSection, renderCharacterManager, renderConversationList, renderPresetEditorSection, renderPresetManager, renderRoleplay } = {}) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "chat") {
    return <ChatWindow conversations={conversations} characters={characters} characterConfiguration={characterConfiguration}
      models={models} persona={persona} presets={presets} renderRoleplay={renderRoleplay} />;
  }
  if (params.get("view") === "character-editor") {
    return <CharacterEditorWindow characterCatalog={characters} characterConfiguration={characterConfiguration} renderCharacterEditorSection={renderCharacterEditorSection} />;
  }
  if (params.get("view") === "character-manager") {
    return <CharacterManagerWindow characterCatalog={characters} personaModel={persona} renderCharacterManager={renderCharacterManager} />;
  }
  if (params.get("view") === "preset-manager") {
    return <PresetManagerWindow presetCatalog={presets} renderPresetManager={renderPresetManager} />;
  }
  if (params.get("view") === "creator-studio") {
    return <CreatorStudioWindow characterCatalog={characters} projectCatalog={creatorStudio} />;
  }

  return <MainWindow conversations={conversations} characters={characters} characterConfiguration={characterConfiguration} models={models} persona={persona} presets={presets}
    settingsSections={settingsSections} navigation={navigation} rightbar={rightbar} renderSettingsSection={renderSettingsSection}
    renderUserProfileEditor={renderUserProfileEditor} renderCharacterPageSection={renderCharacterPageSection}
    renderConversationList={renderConversationList} renderPresetEditorSection={renderPresetEditorSection}
    renderRoleplay={renderRoleplay} />;
}
