import { CharacterListPanel, CharacterProfilePanel, openCharacterEditorWindow } from "../../../../../apps/web/src/modules/persona/index.js";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
import { LOG_ACTIONS, runLoggedAction } from '../../../../../apps/web/src/utils/logAction.js';
export { PersonNavIcon as NavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function CharacterPage() {
  const view = useMainPageView();
  const { chat, appearance, renderCharacterPageSection, renderLayout } = view;
  const listOwner = {
    characters: chat.characters,
    activeCharacterId: chat.selectedCharacterId || chat.characters.active_character_id,
    artworkMode: appearance.sidebarCharacterArtwork,
    onSelectCharacter: chat.selectCharacter,
    onOpenCharacterChat: chat.openCharacterChat,
    onSaveCharacterGroups: chat.saveCharacterGroups,
    onImportPreparedCharacters: chat.importPreparedCharacters,
    onPrepareCharacterImports: chat.prepareCharacterImports,
    onDiscardCharacterImports: chat.discardCharacterImports,
    onCreateCharacter: chat.createCharacter,
    onDeleteCharacters: chat.deleteCharacterIds,
    onExportCharacters: (ids, format) => runLoggedAction(LOG_ACTIONS.characterExport, () => view.characters.exportCharacters(ids, format)),
  };
  const listFallback = <CharacterListPanel {...listOwner} />;
  const profileOwner = {
    characters: chat.characters,
    selectedCharacterId: chat.selectedCharacterId,
    onSelectCharacter: chat.selectCharacter,
    onStartConversation: chat.openCharacterChat,
    onEditCharacter: openCharacterEditorWindow,
    onCreateFirstCharacter: () => chat.createCharacter(),
  };
  const profileFallback = <CharacterProfilePanel {...profileOwner} />;
  return renderLayout({
    sidePanel: renderCharacterPageSection?.("list", listOwner, listFallback) ?? listFallback,
    mainPanel: renderCharacterPageSection?.("profile", profileOwner, profileFallback) ?? profileFallback,
  });
}
