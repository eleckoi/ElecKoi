export const ALL_CHARACTERS = "全部角色";

export function characterName(character) {
  return character?.persona?.assistant_name || character?.name || "未命名角色";
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
