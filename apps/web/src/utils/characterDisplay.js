import { sourceText } from "../app/i18n/productCopy.js";
export const ALL_CHARACTERS = "全部角色";

export function characterName(character, tUi = sourceText) {
  return character?.name || character?.persona?.assistant_name || tUi("未命名角色");
}

export function characterAvatar(character) {
  return character?.persona?.assistant_avatar || character?.avatar || "";
}

export function characterCover(character) {
  return character?.persona?.assistant_cover || characterAvatar(character);
}

export function characterGroup(character) {
  return typeof character?.group === "string" ? character.group.trim() : "";
}
