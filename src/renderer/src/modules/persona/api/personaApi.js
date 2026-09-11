import { desktopClient } from "../../../bridge/desktopClient.ts";

const DEFAULT_PERSONA = {
  assistant_name: "",
  assistant_avatar: "",
  assistant_square: "",
  assistant_cover: "",
  opening: "",
  show_opening: false,
  user_name: "你",
  user_avatar: "",
  user_square: "",
  user_portrait: "",
};

export function getPersona() {
  return desktopClient.request("query.persona.read", {}).then((persona) => ({ persona }));
}

export function savePersona(persona) {
  return desktopClient.request("command.persona.save", { ...DEFAULT_PERSONA, ...persona }).then((saved) => ({ persona: saved }));
}

export function getCharacters() {
  return desktopClient.request("query.characters.list", {});
}

export function createCharacter(character) {
  return desktopClient.request("command.characters.create", character);
}

export function updateCharacter(character) {
  return desktopClient.request("command.characters.update", character);
}

export function deleteCharacters(characterIds) {
  return desktopClient.request("command.characters.delete", { characterIds: characterIds || [] });
}

export function prepareCharacterImports(source, files) {
  return desktopClient.request("command.characters.import.prepare", { source, files });
}

export function commitCharacterImports(token) {
  return desktopClient.request("command.characters.import.commit", { token });
}

export function discardCharacterImports(token) {
  return desktopClient.request("command.characters.import.discard", { token });
}

export function saveCharacterGroups(groups, assignments = []) {
  return desktopClient.request("command.character_groups.save", { groups, assignments });
}
