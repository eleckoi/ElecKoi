import { useEffect, useMemo, useState } from "react";
import { useChatSessions } from "../../modules/chat/index.js";
import { getModelConfig, getModelMeta, useModelRuntime } from "../../modules/models/index.js";
import { usePersonaCharacters } from "../../modules/persona/index.js";
import { listenRecordsChanged } from "../../bridge/recordEvents.js";

export function useChatClient() {
  const [activeSection, setActiveSectionState] = useState("messages");
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("就绪");
  const [notice, setNotice] = useState(null);

  function notify(type, message) {
    const id = Date.now();
    setNotice({ id, type, message });
    window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, type === "error" ? 5200 : 3200);
  }

  const {
    modelConfig,
    modelConfigs,
    modelOptionsByKey,
    applyModelMeta,
    saveModelConfig,
    deleteModelConfig,
    deleteModelProvider,
    loadModelOptions,
    probeModelOptions,
    testConnection,
  } = useModelRuntime({ setStatus });
  const language = meta?.defaults?.language || "zh-CN";
  const chatModelConfigs = useMemo(
    () =>
      (modelConfigs || []).filter((config) =>
        [
          config.name,
          config.base_url,
          config.api_key,
          config.proxy_url,
          config.model,
        ].some((value) => String(value || "").trim()) || (Array.isArray(config.model_options) && config.model_options.length),
      ),
    [modelConfigs],
  );
  const {
    persona,
    characters,
    selectedCharacterId,
    loadPersona,
    loadCharacters,
    importPreparedCharacters,
    saveCharacterGroups,
    updateCharacter,
    selectCharacter,
    createCharacter,
    deleteCharacterIds: deletePersonaCharacterIds,
    updateUserProfile,
  } = usePersonaCharacters({ setStatus, setActiveSectionState });
  const chatSessions = useChatSessions({ persona, characters, modelConfigs: chatModelConfigs, language, setStatus, setActiveSectionState });
  const latestChatCharacter = useMemo(
    () => (characters.items || []).find((item) => item.id === chatSessions.chatCharacter?.character_id) || null,
    [characters.items, chatSessions.chatCharacter?.character_id],
  );
  const chatBackgroundCharacter = useMemo(() => {
    if (latestChatCharacter) return latestChatCharacter;
    return {
      id: chatSessions.chatCharacter?.character_id || "",
      name: chatSessions.chatCharacter?.assistant_name || chatSessions.chatCharacter?.character_name || "",
      avatar: chatSessions.chatCharacter?.assistant_avatar || chatSessions.chatCharacter?.character_avatar || "",
      squareImage: chatSessions.chatCharacter?.assistant_square || "",
      coverImage: chatSessions.chatCharacter?.assistant_cover || "",
      chatBackground: chatSessions.chatCharacter?.chat_background || "",
      chatBackgroundOpacity: chatSessions.chatCharacter?.chat_background_opacity ?? 0.72,
      chatBackgroundBlur: chatSessions.chatCharacter?.chat_background_blur ?? 2,
      chatBackgroundScrim: chatSessions.chatCharacter?.chat_background_scrim ?? 0.5,
    };
  }, [chatSessions.chatCharacter, latestChatCharacter]);
  const chatPersona = useMemo(
    () => {
      const hasLatestCharacter = Boolean(latestChatCharacter);
      const latestPersona = latestChatCharacter?.persona || {};
      return {
        user_name: persona.user_name,
        user_avatar: persona.user_avatar,
        user_square: persona.user_square,
        user_portrait: persona.user_portrait,
        assistant_name: hasLatestCharacter
          ? latestPersona.assistant_name || latestChatCharacter?.name || ""
          : chatSessions.chatCharacter?.assistant_name || "",
        assistant_avatar: hasLatestCharacter
          ? latestPersona.assistant_avatar || latestChatCharacter?.avatar || ""
          : chatSessions.chatCharacter?.assistant_avatar || "",
        assistant_square: hasLatestCharacter
          ? latestPersona.assistant_square || latestChatCharacter?.squareImage || ""
          : chatSessions.chatCharacter?.assistant_square || "",
        assistant_cover: hasLatestCharacter
          ? latestPersona.assistant_cover || latestChatCharacter?.coverImage || ""
          : chatSessions.chatCharacter?.assistant_cover || "",
        opening: hasLatestCharacter ? latestPersona.opening || "" : chatSessions.chatCharacter?.opening || "",
        show_opening: hasLatestCharacter ? Boolean(latestPersona.show_opening) : Boolean(chatSessions.chatCharacter?.show_opening),
      };
    },
    [chatSessions.chatCharacter, latestChatCharacter, persona.user_avatar, persona.user_name, persona.user_portrait, persona.user_square],
  );

  function setActiveSection(section) {
    setActiveSectionState(section);
  }

  async function openCharacterChat(characterId) {
    const character = characters.items.find((item) => item.id === characterId);
    if (!character) return;
    const latestPersona = character.persona || {};
    await chatSessions.openCharacterChat({
      id: character.id,
      name: latestPersona.assistant_name || character.name || "未命名角色",
      avatar: latestPersona.assistant_avatar || character.avatar || "",
      assistant_name: latestPersona.assistant_name || character.name || "",
      assistant_avatar: latestPersona.assistant_avatar || character.avatar || "",
      assistant_square: latestPersona.assistant_square || character.squareImage || "",
      assistant_cover: latestPersona.assistant_cover || character.coverImage || "",
      opening: latestPersona.opening || "",
      show_opening: Boolean(latestPersona.show_opening),
      chat_background: character.chatBackground || "",
      chat_background_opacity: character.chatBackgroundOpacity ?? 0.72,
      chat_background_blur: character.chatBackgroundBlur ?? 2,
      chat_background_scrim: character.chatBackgroundScrim ?? 0.5,
    });
  }

  async function updateChatBackground(patch) {
    const characterId = chatSessions.chatCharacter?.character_id;
    if (!characterId) throw new Error("请先选择一个角色。");
    const currentCharacter = characters.items.find((item) => item.id === characterId);
    if (!currentCharacter) throw new Error("没有找到当前角色卡。");
    const saved = await updateCharacter({ ...currentCharacter, ...patch }, true, { skipApply: true });
    setStatus("聊天背景已保存");
    return saved.items.find((item) => item.id === characterId) || currentCharacter;
  }

  async function deleteCharacterIds(characterIds) {
    const ids = [...new Set((characterIds || []).filter(Boolean))];
    if (!ids.length) return null;
    const saved = await deletePersonaCharacterIds(ids);
    await chatSessions.refreshSessionsOnly({ keepSection: true });
    if (ids.includes(chatSessions.chatCharacter?.character_id)) {
      chatSessions.clearActiveChat();
    }
    return saved;
  }

  async function loadMeta() {
    const [data, modelData] = await Promise.all([getModelMeta(), getModelConfig()]);
    setMeta(data);
    applyModelMeta(modelData);
  }

  useEffect(() => {
    const initialChatId = new URLSearchParams(window.location.search).get("chat") || "";
    loadMeta().catch((error) => setStatus(error.message));
    loadPersona()
      .then(() => loadCharacters())
      .catch((error) => setStatus(error.message));
    chatSessions.loadSessions(initialChatId).catch(() => {});
    return () => {
      chatSessions.abortActiveRequest();
    };
  }, []);

  useEffect(() => {
    return listenRecordsChanged((event) => {
      if (event.module !== "personas" && event.module !== "settingLibraries") return;
      loadCharacters().catch((error) => setStatus(error.message));
    });
  }, []);

  return {
    activeSection,
    setActiveSection,
    selectedCharacterId,
    meta,
    persona,
    characters,
    modelConfig,
    modelConfigs,
    chatModelConfigs,
    modelOptionsByKey,
    selectedChatModelConfigId: chatSessions.modelSelection.configId,
    selectedChatModel: chatSessions.modelSelection.model,
    chatModelParameters: chatSessions.modelSelection.parameters,
    selectChatModel: chatSessions.selectChatModel,
    sessions: chatSessions.sessions,
    sessionId: chatSessions.sessionId,
    messages: chatSessions.messages,
    input: chatSessions.input,
    setInput: chatSessions.setInput,
    inputImages: chatSessions.inputImages,
    addInputImages: chatSessions.addInputImages,
    removeInputImage: chatSessions.removeInputImage,
    keyword: chatSessions.keyword,
    setKeyword: chatSessions.setKeyword,
    isSending: chatSessions.isSending,
    status,
    notice,
    notify,
    language,
    chatPersona,
    chatBackgroundCharacter,
    chatCharacter: chatSessions.chatCharacter,
    filteredSessions: chatSessions.filteredSessions,
    historyOpen: chatSessions.historyOpen,
    pinnedIds: chatSessions.pinnedIds,
    currentTitle: chatSessions.currentTitle,
    scrollRef: chatSessions.scrollRef,
    scrollRequest: chatSessions.scrollRequest,
    hasOlderMessages: chatSessions.hasOlderMessages,
    isLoadingOlderMessages: chatSessions.isLoadingOlderMessages,
    loadOlderMessages: chatSessions.loadOlderMessages,
    createChat: chatSessions.createChat,
    clearActiveChat: chatSessions.clearActiveChat,
    refreshSessionsOnly: chatSessions.refreshSessionsOnly,
    openHistory: chatSessions.openHistory,
    closeHistory: chatSessions.closeHistory,
    loadChat: chatSessions.loadChat,
    sendMessage: chatSessions.sendMessage,
    stopSend: chatSessions.stopSend,
    regenerateReply: chatSessions.regenerateReply,
    selectOpening: chatSessions.selectOpening,
    updateUserProfile,
    importPreparedCharacters,
    saveCharacterGroups,
    selectCharacter,
    openCharacterChat,
    updateChatBackground,
    createCharacter,
    deleteCharacterIds,
    saveModelConfig,
    deleteModelConfig,
    deleteModelProvider,
    loadModelOptions,
    probeModelOptions,
    testModelConnection: testConnection,
    togglePinChat: chatSessions.togglePinChat,
    removeChat: chatSessions.removeChat,
    removeHistoryChat: chatSessions.removeHistoryChat,
    openChatWindow: chatSessions.openChatWindow,
  };
}
