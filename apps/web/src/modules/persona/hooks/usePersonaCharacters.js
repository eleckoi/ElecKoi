import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { emptyPersona } from "../../../utils/constants/defaults.js";
import { LOG_ACTIONS, logAction } from "../../../utils/logAction.js";

export function newCharacter(group = "") {
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

const EMPTY_CHARACTER_CATALOG = {
  status: "loading",
  collection: { active_character_id: "", groups: [], items: [] },
  error: "",
};
const subscribeEmptyCatalog = () => () => {};
const getEmptyCatalog = () => EMPTY_CHARACTER_CATALOG;
const EMPTY_PERSONA_PROFILE = { status: "loading", profile: null, error: "" };
const getEmptyProfile = () => EMPTY_PERSONA_PROFILE;

export function usePersonaCharacters({ characterCatalog, personaModel, setStatus, setActiveSectionState, notify }) {
  const [persona, setPersona] = useState(() => ({ ...emptyPersona, ...(personaModel?.getSnapshot().profile || {}) }));
  const [localCharacters, setLocalCharacters] = useState(EMPTY_CHARACTER_CATALOG.collection);
  const catalog = useSyncExternalStore(
    characterCatalog?.subscribe || subscribeEmptyCatalog,
    characterCatalog?.getSnapshot || getEmptyCatalog,
  );
  const characters = characterCatalog ? catalog.collection : localCharacters;
  const profileSnapshot = useSyncExternalStore(
    personaModel?.subscribe || subscribeEmptyCatalog,
    personaModel?.getSnapshot || getEmptyProfile,
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const selectedCharacterIdRef = useRef("");
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!characterCatalog || catalog.status !== "error" || !catalog.error) return;
    setStatus(catalog.error);
    notifyRef.current?.("error", catalog.error);
  }, [catalog.error, catalog.status, characterCatalog, setStatus]);

  useEffect(() => {
    if (!personaModel || profileSnapshot.status !== "error" || !profileSnapshot.error) return;
    setStatus(profileSnapshot.error);
    notifyRef.current?.("error", profileSnapshot.error);
  }, [personaModel, profileSnapshot.error, profileSnapshot.status, setStatus]);

  useEffect(() => {
    if (!personaModel || !profileSnapshot.profile) return;
    const profile = profileSnapshot.profile;
    setPersona((current) => ({
      ...current,
      user_name: profile.user_name,
      user_avatar: profile.user_avatar,
      user_square: profile.user_square,
      user_portrait: profile.user_portrait,
    }));
  }, [personaModel, profileSnapshot.profile]);

  function setCharacterState(next) {
    charactersRef.current = next;
    if (characterCatalog) characterCatalog.adopt(next);
    else setLocalCharacters(next);
  }

  function setSelectedCharacter(characterId) {
    const value = characterId || "";
    selectedCharacterIdRef.current = value;
    setSelectedCharacterId(value);
  }

  function applyCharacterView(saved) {
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

  function applyCharacterCollection(saved) {
    setCharacterState(saved);
    return applyCharacterView(saved);
  }

  useEffect(() => {
    if (characterCatalog && catalog.status === "ready") applyCharacterView(catalog.collection);
  }, [catalog.collection, catalog.status, characterCatalog]);

  async function loadPersona() {
    if (!personaModel) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "用户资料服务未装载。", { what: "用户资料服务" });
    const profile = personaModel.getSnapshot().profile || await personaModel.refresh();
    const loaded = { ...emptyPersona, ...(profile || {}) };
    setPersona(loaded);
    return loaded;
  }

  async function loadCharacters() {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    const data = characterCatalog?.getSnapshot().status === "ready"
      ? characterCatalog.getSnapshot().collection
      : await characterCatalog.refresh();
    const items = data.items || [];
    const active = items.find((item) => item.id === data.active_character_id) || items[0] || null;
    const next = {
      active_character_id: active?.id || "",
      groups: data.groups || [],
      items,
    };
    if (characterCatalog) applyCharacterView(next);
    else applyCharacterCollection(next);
    return next;
  }

  async function saveCharacterGroups(groups, assignments = []) {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    const saved = await characterCatalog.saveGroups(groups, assignments);
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
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    const saved = await characterCatalog.create(character);
    applyCharacterCollection(saved);
    setSelectedCharacter(character.id);
    setActiveSectionState("character");
    setStatus("已新建角色");
    return character.id;
  }

  async function updateCharacter(character, quiet = false, options = {}) {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    const saved = await characterCatalog.update(character);
    if (options.skipApply) setCharacterState(saved);
    else applyCharacterCollection(saved);
    if (!quiet) setStatus("角色卡已保存");
    return saved;
  }

  async function deleteCharacterIds(characterIds) {
    const ids = [...new Set(characterIds.filter(Boolean))];
    if (!ids.length) return charactersRef.current;
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    const saved = await characterCatalog.delete(ids);
    applyCharacterCollection(saved);
    setActiveSectionState("character");
    setStatus(ids.length > 1 ? `已删除 ${ids.length} 个角色` : "角色已删除");
    return saved;
  }

  async function importPreparedCharacters(token) {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    // 关键路径日志：导入角色卡（主窗口角色页这条路；角色卡管理器里另有一条同样的动作）。
    logAction(LOG_ACTIONS.characterImport, "start");
    let result;
    try {
      result = await characterCatalog.commitImport(token);
    } catch (error) {
      logAction(LOG_ACTIONS.characterImport, "failure", error);
      throw error;
    }
    logAction(LOG_ACTIONS.characterImport, "success");
    applyCharacterCollection(result.collection);
    const selectedId = result.importedCharacterIds?.[0] || result.collection.active_character_id;
    setSelectedCharacter(selectedId);
    setActiveSectionState("character");
    const imported = result.importedCharacterIds.length;
    const failed = result.failedMessages?.length || 0;
    setStatus(failed ? `已导入 ${imported} 个，${failed} 个失败` : imported > 1 ? `已导入 ${imported} 个角色` : "角色卡已导入");
    return result;
  }

  function prepareCharacterImports(source, files) {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    return characterCatalog.prepareImport(source, files);
  }

  function discardCharacterImports(token) {
    if (!characterCatalog) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "角色目录服务未装载。", { what: "角色目录服务" });
    return characterCatalog.discardImport(token);
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
    if (!personaModel) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "用户资料服务未装载。", { what: "用户资料服务" });
    const saved = { persona: await personaModel.save(nextPersona) };
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
    prepareCharacterImports,
    discardCharacterImports,
    updateUserProfile,
  };
}
