import { useRef, useState } from "react";
import {
  createCharacter as persistCreateCharacter,
  commitCharacterImports,
  deleteCharacters,
  getCharacters,
  getPersona,
  saveCharacterGroups as persistCharacterGroups,
  savePersona,
  updateCharacter as persistUpdateCharacter,
} from "../api/personaApi.js";
import { emptyPersona } from "../../../utils/constants/defaults.js";

function newCharacter(group = "") {
  const id = `character-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id,
    name: "未命名角色",
    avatar: "",
    group,
    folder: "",
    chatBackground: "",
    chatBackgroundOpacity: 0.72,
    chatBackgroundBlur: 2,
    chatBackgroundScrim: 0.5,
    persona: { ...emptyPersona, assistant_name: "", assistant_avatar: "", opening: "", show_opening: false },
  };
}

function activeCharacterOf(characterState) {
  return (characterState.items || []).find((item) => item.id === characterState.active_character_id)
    || characterState.items?.[0]
    || null;
}

export function usePersonaCharacters({ setStatus, setActiveSectionState }) {
  const [persona, setPersona] = useState(emptyPersona);
  const [characters, setCharacters] = useState({ active_character_id: "", groups: [], items: [] });
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const charactersRef = useRef(characters);
  const selectedCharacterIdRef = useRef("");

  function setCharacterState(next) {
    charactersRef.current = next;
    setCharacters(next);
  }

  function setSelectedCharacter(characterId) {
    const value = characterId || "";
    selectedCharacterIdRef.current = value;
    setSelectedCharacterId(value);
  }

  function applyCharacterCollection(saved) {
    setCharacterState(saved);
    const active = activeCharacterOf(saved);
    const selected = saved.items.find((item) => item.id === selectedCharacterIdRef.current) || active;
    setSelectedCharacter(selected?.id || "");
    if (active?.persona) {
      setPersona((current) => ({ ...emptyPersona, ...current, ...active.persona }));
    } else {
      setPersona((current) => ({
        ...emptyPersona,
        user_name: current.user_name,
        user_avatar: current.user_avatar,
        user_square: current.user_square,
        user_portrait: current.user_portrait,
      }));
    }
    return active;
  }

  async function loadPersona() {
    const data = await getPersona();
    const loaded = { ...emptyPersona, ...(data.persona || {}) };
    setPersona(loaded);
    return loaded;
  }

  async function loadCharacters() {
    const data = await getCharacters();
    const items = data.items || [];
    const active = items.find((item) => item.id === data.active_character_id) || items[0] || null;
    const next = {
      active_character_id: active?.id || "",
      groups: data.groups || [],
      items,
    };
    applyCharacterCollection(next);
    return next;
  }

  async function saveCharacterGroups(groups, assignments = []) {
    const saved = await persistCharacterGroups(groups, assignments);
    applyCharacterCollection(saved);
    setStatus("角色分组已保存");
    return saved;
  }

  function selectCharacter(characterId) {
    if (!charactersRef.current.items.some((item) => item.id === characterId)) return;
    setSelectedCharacter(characterId);
    setActiveSectionState("character");
  }

  async function createCharacter(group = "") {
    const character = newCharacter(group);
    setSelectedCharacter(character.id);
    const saved = await persistCreateCharacter(character);
    applyCharacterCollection(saved);
    setSelectedCharacter(character.id);
    setActiveSectionState("character");
    setStatus("已新建角色");
  }

  async function updateCharacter(character, quiet = false, options = {}) {
    const saved = await persistUpdateCharacter(character);
    if (options.skipApply) setCharacterState(saved);
    else applyCharacterCollection(saved);
    if (!quiet) setStatus("角色卡已保存");
    return saved;
  }

  async function deleteCharacterIds(characterIds) {
    const ids = [...new Set(characterIds.filter(Boolean))];
    if (!ids.length) return charactersRef.current;
    const saved = await deleteCharacters(ids);
    applyCharacterCollection(saved);
    setActiveSectionState("character");
    setStatus(ids.length > 1 ? `已删除 ${ids.length} 个角色` : "角色已删除");
    return saved;
  }

  async function importPreparedCharacters(token) {
    const result = await commitCharacterImports(token);
    applyCharacterCollection(result.collection);
    const selectedId = result.importedCharacterIds?.[0] || result.collection.active_character_id;
    setSelectedCharacter(selectedId);
    setActiveSectionState("character");
    const imported = result.importedCharacterIds.length;
    const failed = result.failedMessages?.length || 0;
    setStatus(failed ? `已导入 ${imported} 个，${failed} 个失败` : imported > 1 ? `已导入 ${imported} 个角色` : "角色卡已导入");
    return result;
  }

  async function updateUserProfile({ name, avatars }) {
    const nextPersona = {
      ...emptyPersona,
      ...persona,
      user_name: name?.trim() || "你",
      user_avatar: avatars?.circle ?? persona.user_avatar ?? "",
      user_square: avatars?.square ?? persona.user_square ?? "",
      user_portrait: avatars?.portrait ?? persona.user_portrait ?? "",
    };
    const saved = await savePersona(nextPersona);
    const updated = { ...emptyPersona, ...(saved.persona || nextPersona) };
    setPersona(updated);
    return updated;
  }

  return {
    persona,
    characters,
    selectedCharacterId,
    loadPersona,
    loadCharacters,
    saveCharacterGroups,
    updateCharacter,
    selectCharacter,
    createCharacter,
    deleteCharacterIds,
    importPreparedCharacters,
    updateUserProfile,
  };
}
