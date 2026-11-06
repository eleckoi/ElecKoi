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
import { ApplicationFrontendController, NativeFrontendProvider } from "../../modules/authorFrontend/index.js";
import { ProductLocaleProvider } from '../i18n/ProductLocaleContext.jsx';

export default function App(props = {}) {
  return <ProductLocaleProvider locale={props.locale}><OfficialMarkdownProvider component={props.markdownComponent}>
    <AppearanceProvider model={props.appearance}>
    <DisplayPreferencesProvider model={props.displayPreferences}>
      <WebSearchProvider model={props.webSearch}>
        <NativeFrontendProvider connection={props.frontendConnection} authorConnection={props.characterConfiguration?.scriptRuntimeConnection}>
        <ApplicationFrontendController slots={props.slots} subscribeSlots={props.subscribeSlots} navigation={props.navigation}>
          {navigation => <AppContent {...props} navigation={navigation} />}
        </ApplicationFrontendController>
        </NativeFrontendProvider>
      </WebSearchProvider>
    </DisplayPreferencesProvider>
    </AppearanceProvider>
  </OfficialMarkdownProvider></ProductLocaleProvider>;
}

function AppContent({ renderWindow, ...windowProps } = {}) {
  const { conversations, characters, characterConfiguration, creatorStudio, models, persona, presets, settingsSections, navigation, rightbar, renderSettingsSection, renderLanguageSettings, renderUserProfileEditor, renderCharacterPageSection, renderCharacterEditorSection, renderCharacterManager, renderConversationList, renderPresetEditorSection, renderPresetManager, renderRoleplay } = windowProps;
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
  if (params.get("view") === "creator-studio-nodes") {
    return <CreatorStudioWindow characterCatalog={characters} projectCatalog={creatorStudio} models={models} presetCatalog={presets} rightbar={rightbar}
      navigation={navigation}
      renderCreatorStudioConversation={windowProps.renderCreatorStudioConversation} />;
  }

  const fallback = <MainWindow conversations={conversations} characters={characters} characterConfiguration={characterConfiguration} models={models} persona={persona} presets={presets}
    creatorStudio={creatorStudio} renderCreatorStudioConversation={windowProps.renderCreatorStudioConversation}
    settingsSections={settingsSections} navigation={navigation} rightbar={rightbar} renderSettingsSection={renderSettingsSection} renderLanguageSettings={renderLanguageSettings}
    renderUserProfileEditor={renderUserProfileEditor} renderCharacterPageSection={renderCharacterPageSection}
    renderConversationList={renderConversationList} renderPresetEditorSection={renderPresetEditorSection}
    renderRoleplay={renderRoleplay} />;
  return renderWindow?.(windowProps, fallback) ?? fallback;
}
