export function createEmptyChatCharacter() {
  return {
    character_id: "",
    character_name: "",
    character_avatar: "",
    assistant_name: "",
    assistant_avatar: "",
    assistant_square: "",
    assistant_cover: "",
    opening: "",
    show_opening: false,
    chat_background: "",
    chat_background_opacity: 0.72,
    chat_background_blur: 2,
    chat_background_scrim: 0.5,
  };
}

export function normalizeChatCharacter(character = {}) {
  return {
    character_id: character.character_id || character.id || "",
    character_name: character.character_name || character.name || "",
    character_avatar: character.character_avatar || character.avatar || "",
    assistant_name: character.assistant_name || character.character_name || character.name || "",
    assistant_avatar: character.assistant_avatar || character.character_avatar || character.avatar || "",
    assistant_square: character.assistant_square || character.squareImage || "",
    assistant_cover: character.assistant_cover || character.coverImage || "",
    opening: character.opening || "",
    show_opening: Boolean(character.show_opening),
    chat_background: character.chat_background ?? character.chatBackground ?? "",
    chat_background_opacity: character.chat_background_opacity ?? character.chatBackgroundOpacity ?? 0.72,
    chat_background_blur: character.chat_background_blur ?? character.chatBackgroundBlur ?? 2,
    chat_background_scrim: character.chat_background_scrim ?? character.chatBackgroundScrim ?? 0.5,
  };
}

export function normalizeCharacterFromLibrary(character = {}) {
  const persona = character.persona || {};
  const name = persona.assistant_name || character.name || "未命名角色";
  const avatar = persona.assistant_avatar || character.avatar || "";
  return normalizeChatCharacter({
    character_id: character.id || "",
    character_name: name,
    character_avatar: avatar,
    assistant_name: name,
    assistant_avatar: avatar,
    assistant_square: persona.assistant_square || character.squareImage || "",
    assistant_cover: persona.assistant_cover || character.coverImage || "",
    opening: persona.opening || "",
    show_opening: Boolean(persona.show_opening),
    chat_background: character.chatBackground ?? "",
    chat_background_opacity: character.chatBackgroundOpacity ?? 0.72,
    chat_background_blur: character.chatBackgroundBlur ?? 2,
    chat_background_scrim: character.chatBackgroundScrim ?? 0.5,
  });
}

export function withLatestCharacter(chat, lookup) {
  const latest = lookup.get(chat.character_id || "");
  if (!latest) return chat;
  return {
    ...chat,
    character_name: latest.assistant_name || latest.character_name || chat.character_name,
    character_avatar: latest.assistant_avatar || latest.character_avatar || chat.character_avatar,
    character_persona: {
      ...(chat.character_persona || {}),
      assistant_name: latest.assistant_name || latest.character_name || chat.character_persona?.assistant_name,
      assistant_avatar: latest.assistant_avatar || latest.character_avatar || chat.character_persona?.assistant_avatar,
      assistant_square: latest.assistant_square || chat.character_persona?.assistant_square || "",
      assistant_cover: latest.assistant_cover || chat.character_persona?.assistant_cover || "",
      opening: latest.opening,
      show_opening: latest.show_opening,
      chat_background: latest.chat_background,
      chat_background_opacity: latest.chat_background_opacity,
      chat_background_blur: latest.chat_background_blur,
      chat_background_scrim: latest.chat_background_scrim,
    },
  };
}

export function normalizeChatItemCharacter(chat = {}) {
  const characterPersona = chat.character_persona || {};
  return normalizeChatCharacter({
    character_id: chat.character_id || "",
    character_name: chat.character_name || characterPersona.assistant_name || "",
    character_avatar: chat.character_avatar || characterPersona.assistant_avatar || "",
    assistant_name: characterPersona.assistant_name || chat.character_name || "",
    assistant_avatar: characterPersona.assistant_avatar || chat.character_avatar || "",
    assistant_square: characterPersona.assistant_square || "",
    assistant_cover: characterPersona.assistant_cover || "",
    opening: characterPersona.opening || "",
    show_opening: Boolean(characterPersona.show_opening),
    chat_background: characterPersona.chat_background ?? "",
    chat_background_opacity: characterPersona.chat_background_opacity ?? 0.72,
    chat_background_blur: characterPersona.chat_background_blur ?? 2,
    chat_background_scrim: characterPersona.chat_background_scrim ?? 0.5,
  });
}
