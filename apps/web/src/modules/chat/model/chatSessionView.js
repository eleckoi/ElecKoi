import { normalizeCharacterFromLibrary, withLatestCharacter } from "./chatCharacter.js";

export function createCharacterLookup(characters) {
  const next = new Map();
  for (const character of characters?.items || []) {
    next.set(character.id, normalizeCharacterFromLibrary(character));
  }
  return next;
}

export function applyLatestCharactersToSessions(sessions, characterLookup) {
  return (sessions || []).map((item) => withLatestCharacter(item, characterLookup));
}

export function sortSessionsByPinned(displaySessions, pinnedIds) {
  const pinnedOrder = new Map(pinnedIds.map((id, index) => [id, index]));
  return [...displaySessions].sort((a, b) => {
    const aPinned = pinnedOrder.has(a.id);
    const bPinned = pinnedOrder.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) return pinnedOrder.get(a.id) - pinnedOrder.get(b.id);
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

export function collapseSessionsByCharacter(sortedSessions, sessionId, preferredSessions = new Map()) {
  const byCharacter = new Map();
  for (const item of sortedSessions) {
    const key = item.character_id || item.character_name || item.id;
    if (!byCharacter.has(key) || item.id === sessionId || item.id === preferredSessions.get(key)) {
      byCharacter.set(key, item);
    }
  }
  return [...byCharacter.values()];
}

export function selectSessionForCharacter(sessions, characterId, preferredId = "") {
  const matching = (sessions || []).filter((item) => item.character_id === characterId);
  return matching.find((item) => item.id === preferredId)
    || matching.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
    || null;
}

export function normalizeConversationEntryIds(ids) {
  const next = [];
  for (const id of ids || []) {
    const value = String(id || "").trim();
    if (value && !next.includes(value)) next.push(value);
  }
  return next;
}

export function hideConversationEntry(hiddenIds, sessionId) {
  const id = String(sessionId || "").trim();
  const normalized = normalizeConversationEntryIds(hiddenIds);
  if (!id || normalized.includes(id)) return normalized;
  return [id, ...normalized];
}

export function restoreConversationEntry(hiddenIds, sessionId) {
  const id = String(sessionId || "").trim();
  const normalized = normalizeConversationEntryIds(hiddenIds);
  if (!id) return normalized;
  return normalized.filter((hiddenId) => hiddenId !== id);
}

export function filterHiddenConversationEntries(conversationSessions, hiddenIds) {
  const hidden = new Set(normalizeConversationEntryIds(hiddenIds));
  return (conversationSessions || []).filter((item) => !hidden.has(item.id));
}

export function filterConversationSessions(conversationSessions, keyword) {
  if (!keyword.trim()) return conversationSessions;
  const key = keyword.trim().toLowerCase();
  return conversationSessions.filter((item) =>
    `${item.character_name || ""} ${item.title || ""} ${item.id || ""}`.toLowerCase().includes(key),
  );
}

export function currentChatTitle(displaySessions, sessionId, chatCharacter) {
  if (!sessionId) return "";
  const currentSession = displaySessions.find((item) => item.id === sessionId);
  return currentSession?.character_name || chatCharacter.character_name || chatCharacter.assistant_name || "";
}
