import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelChatStream,
  createChat as createChatSession,
  deleteChat,
  getChat,
  listenAgentProcess,
  listenChatStreamDelta,
  listChats,
  regenerateChatMessage,
  regenerateChatMessageStream,
  selectChatOpening,
  updateChatOpening,
} from "../api/chatApi.js";
import {
  createEmptyChatCharacter,
  normalizeChatItemCharacter,
  normalizeChatCharacter,
  withLatestCharacter,
} from "../model/chatCharacter.js";
import {
  applyLatestCharactersToSessions,
  collapseSessionsByCharacter,
  createCharacterLookup,
  currentChatTitle,
  filterConversationSessions,
  sortSessionsByPinned,
} from "../model/chatSessionView.js";
import { findRegenerateBranchUserIndex } from "../model/chatRegeneration.js";
import { usePinnedChats } from "./usePinnedChats.js";
import { useActiveChatModel } from "./useActiveChatModel.js";
import { useConversationMessages } from "./useConversationMessages.js";
import { useChatHistoryPaging } from "./useChatHistoryPaging.js";
import { useAuthorFrontendActions } from "./useAuthorFrontendActions.js";
import { useChatInputImages } from "./useChatInputImages.js";
import { getErrorMessage, isAbortError, runChatMessageSend, throwIfAborted, upsertProcess } from "./chatMessageSend.js";

export function useChatSessions({ persona, characters, modelConfigs, language, setStatus, setActiveSectionState }) {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatCharacter, setChatCharacter] = useState(() => createEmptyChatCharacter());

  const requestRef = useRef(null);
  const { pinnedIds, togglePinChat: togglePinnedChat, unpinChat } = usePinnedChats();
  const { modelConfig, modelSelection, selectChatModel } = useActiveChatModel({ modelConfigs, setStatus });
  const {
    inputImages, inputImagesRef, modelSupportsImages, addInputImages, removeInputImage, clearInputImages,
  } = useChatInputImages({ modelConfig, isSending });
  const {
    messages,
    displayedMessages,
    setMessages,
    setMessagesWithScroll,
    reconcileMessages,
    updatePendingReply,
    settlePendingReply,
    commitPendingError,
    prependMessages,
    historyPage,
    requestScrollToEnd,
    scrollRequest,
    scrollRef,
  } = useConversationMessages();
  const { isLoadingOlderMessages, loadOlderMessages } = useChatHistoryPaging({
    sessionId,
    historyPage,
    prependMessages,
    setStatus,
  });

  const characterLookup = useMemo(() => createCharacterLookup(characters), [characters]);
  const displaySessions = useMemo(() => applyLatestCharactersToSessions(sessions, characterLookup), [characterLookup, sessions]);
  const sortedSessions = useMemo(() => sortSessionsByPinned(displaySessions, pinnedIds), [displaySessions, pinnedIds]);
  const conversationSessions = useMemo(() => collapseSessionsByCharacter(sortedSessions, sessionId), [sessionId, sortedSessions]);
  const filteredSessions = useMemo(() => filterConversationSessions(conversationSessions, keyword), [conversationSessions, keyword]);
  const currentTitle = useMemo(
    () => currentChatTitle(displaySessions, sessionId, chatCharacter),
    [chatCharacter.assistant_name, chatCharacter.character_name, displaySessions, sessionId],
  );

  function normalizeLatestChatCharacter(chat) {
    return normalizeChatItemCharacter(withLatestCharacter(chat || {}, characterLookup));
  }

  function replaceChatMessages(chat, behavior = null) {
    setMessagesWithScroll(chat?.messages || [], behavior, {
      hasMore: chat?.messages_has_more,
      beforeSequence: chat?.messages_before_sequence,
    });
  }

  function reconcileChatMessages(chat) {
    reconcileMessages(chat?.messages || [], {
      hasMore: chat?.messages_has_more,
      beforeSequence: chat?.messages_before_sequence,
    });
  }

  async function loadSessions(preferredId = "") {
    const data = await listChats();
    const items = data.items || [];
    setSessions(items);
    const targetId = preferredId || sessionId || "";
    if (targetId) await loadChat(targetId);
    else {
      setSessionId("");
      setMessagesWithScroll([], "auto");
    }
  }

  async function refreshSessionsOnly(options = {}) {
    const data = await listChats();
    setSessions(data.items || []);
    if (!options.keepSection) setActiveSectionState("messages");
  }

  async function openHistory() {
    const data = await listChats();
    setSessions(data.items || []);
    setHistoryOpen(true);
  }

  function closeHistory() {
    setHistoryOpen(false);
  }

  async function loadChat(sessionIdToLoad, options = {}) {
    if (isSending) {
      setStatus("正在生成，请先停止或等待完成");
      return;
    }
    clearInputImages();
    const shouldBumpToTop = Boolean(options.bumpToTop);
    const data = await getChat(sessionIdToLoad, { touch: shouldBumpToTop });
    setSessionId(data.chat.id);
    replaceChatMessages(data.chat, "auto");
    setChatCharacter(normalizeLatestChatCharacter(data.chat));
    setActiveSectionState("messages");
    if (shouldBumpToTop) {
      await refreshSessionsOnly({ keepSection: true });
    }
  }

  async function openCharacterChat(role) {
    if (isSending) {
      setStatus("正在生成，请先停止或等待完成");
      return;
    }
    const characterData = normalizeChatCharacter(role);
    const characterId = characterData.character_id;
    const characterName = characterData.assistant_name || characterData.character_name || "未命名角色";
    if (!characterId) return;
    clearInputImages();
    setChatCharacter(characterData);
    const data = await listChats();
    const items = data.items || [];
    setSessions(items);
    const existing = items
      .filter((item) => item.character_id === characterId)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
    if (existing?.id) {
      await loadChat(existing.id, { bumpToTop: true });
      return;
    }
    const created = await createChatSession(characterName, characterData);
    setSessionId(created.chat.id);
    replaceChatMessages(created.chat, "auto");
    setChatCharacter(normalizeLatestChatCharacter(created.chat));
    await refreshSessionsOnly();
    setActiveSectionState("messages");
  }

  function abortActiveRequest() {
    const activeRequest = requestRef.current;
    requestRef.current = null;
    activeRequest?.controller?.abort?.();
    activeRequest?.unlisten?.();
    if (activeRequest?.requestId) {
      cancelChatStream(activeRequest.requestId).catch(() => {});
    }
  }

  async function createChat() {
    if (!chatCharacter.character_id) {
      setStatus("请先从角色设定中双击角色进入聊天");
      return;
    }
    abortActiveRequest();
    clearInputImages();
    const characterName = chatCharacter.assistant_name || chatCharacter.character_name || "新对话";
    try {
      const created = await createChatSession(characterName, chatCharacter);
      const chat = created.chat;
      setSessionId(chat.id);
      replaceChatMessages(chat, "auto");
      setInput("");
      setIsSending(false);
      setChatCharacter(normalizeLatestChatCharacter(chat));
      await refreshSessionsOnly();
      setStatus("新会话");
      setActiveSectionState("messages");
    } catch (error) {
      setStatus(getErrorMessage(error, "新建会话失败"));
    }
  }

  async function selectOpening(message, openingId) {
    if (!sessionId || isSending || message?.id !== "opening" || !openingId) return;
    try {
      const result = await selectChatOpening(sessionId, openingId);
      replaceChatMessages(result.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
    } catch (error) {
      setStatus(getErrorMessage(error, "切换开场白失败"));
    }
  }

  async function editOpening(message, replacementMessage) {
    if (!sessionId || isSending || message?.id !== "opening") return;
    try {
      const result = await updateChatOpening(sessionId, replacementMessage);
      replaceChatMessages(result.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
    } catch (error) {
      setStatus(getErrorMessage(error, "修改开场白失败"));
    }
  }

  function clearActiveChat() {
    abortActiveRequest();
    clearInputImages();
    setSessionId("");
    setMessagesWithScroll([], "auto");
    setInput("");
    setChatCharacter(createEmptyChatCharacter());
    setIsSending(false);
    setStatus("就绪");
  }

  function togglePinChat(chatId) {
    togglePinnedChat(chatId);
  }

  async function removeChat(chatId) {
    const target = sessions.find((item) => item.id === chatId);
    const targetCharacterId = target?.character_id || "";
    const idsToRemove = targetCharacterId ? sessions.filter((item) => item.character_id === targetCharacterId).map((item) => item.id) : [chatId];
    await Promise.all(idsToRemove.map((id) => deleteChat(id)));
    idsToRemove.forEach((id) => unpinChat(id));
    if (idsToRemove.includes(sessionId)) {
      clearActiveChat();
    }
    await refreshSessionsOnly();
  }

  async function removeHistoryChat(chatId) {
    if (!chatId) return;
    const target = displaySessions.find((item) => item.id === chatId) || sessions.find((item) => item.id === chatId);
    const targetCharacterId = target?.character_id || "";
    const sameCharacterSessions = targetCharacterId ? displaySessions.filter((item) => item.character_id === targetCharacterId) : [];
    const remainingSameCharacterSessions = sameCharacterSessions
      .filter((item) => item.id !== chatId)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const shouldCreateReplacement = Boolean(targetCharacterId) && remainingSameCharacterSessions.length === 0;

    await deleteChat(chatId);
    unpinChat(chatId);

    if (shouldCreateReplacement) {
      const latestCharacter = characterLookup.get(targetCharacterId);
      const replacementCharacter = latestCharacter || normalizeChatCharacter({
        character_id: targetCharacterId,
        character_name: target?.character_name || chatCharacter.character_name || chatCharacter.assistant_name || "新对话",
        character_avatar: target?.character_avatar || chatCharacter.character_avatar || chatCharacter.assistant_avatar || "",
        assistant_name: target?.character_name || chatCharacter.assistant_name || chatCharacter.character_name || "新对话",
        assistant_avatar: target?.character_avatar || chatCharacter.assistant_avatar || chatCharacter.character_avatar || "",
      });
      const characterName = replacementCharacter.assistant_name || replacementCharacter.character_name || "新对话";
      const created = await createChatSession(characterName, replacementCharacter);
      setSessionId(created.chat.id);
      replaceChatMessages(created.chat, "auto");
      setInput("");
      setChatCharacter(normalizeLatestChatCharacter(created.chat));
      setActiveSectionState("messages");
      await refreshSessionsOnly({ keepSection: true });
      return;
    }

    if (chatId === sessionId) {
      const nextSession = remainingSameCharacterSessions[0];
      if (nextSession?.id) {
        await loadChat(nextSession.id);
        await refreshSessionsOnly({ keepSection: true });
        return;
      }
      clearActiveChat();
    }
    await refreshSessionsOnly({ keepSection: true });
  }

  async function openChatWindow(chatId) {
    if (!chatId) return;

    const label = `chat-${String(chatId).replace(/[^a-zA-Z0-9-/:_]/g, "_")}`;
    const url = new URL(window.location.href);
    url.search = `?view=chat&chat=${encodeURIComponent(chatId)}`;
    window.open(url.toString(), label, "width=960,height=720");
    clearActiveChat();
  }

  function stopSend() {
    abortActiveRequest();
    settlePendingReply();
    setIsSending(false);
    setStatus("已停止");
  }

  function sendMessage(event) {
    return runChatMessageSend({
      event, input, inputImagesRef, isSending, modelConfig, modelSupportsImages, setStatus,
      requestRef, setIsSending, sessionId, chatCharacter, setSessionId, replaceChatMessages,
      setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly, setInput, clearInputImages,
      modelSelection, language, setMessages, updatePendingReply, requestScrollToEnd,
      reconcileChatMessages, commitPendingError,
    });
  }

  async function regenerateReply(options = {}) {
    if (!sessionId || isSending) return;
    if (!modelConfig?.id || !modelConfig.model?.trim()) {
      setStatus("请先在发送按钮左侧选择模型");
      return;
    }
    const targetMessageId = String(options.targetMessageId || "").trim();
    const hasReplacementMessage = Object.prototype.hasOwnProperty.call(options, "replacementMessage");
    const replacementMessage = hasReplacementMessage ? String(options.replacementMessage || "").trim() : "";
    if (!targetMessageId) {
      setStatus(hasReplacementMessage ? "请选择要修改的输入" : "请选择要重新生成的 AI 回复");
      return;
    }
    if (hasReplacementMessage && !replacementMessage) {
      setStatus("输入不能为空");
      return;
    }

    const branchUserIndex = findRegenerateBranchUserIndex(messages, targetMessageId, hasReplacementMessage);
    if (branchUserIndex < 0) {
      setStatus(hasReplacementMessage ? "没有找到要修改的用户输入" : "没有找到这条回复对应的用户输入");
      return;
    }

    const controller = new AbortController();
    const activeRequest = { controller };
    requestRef.current = activeRequest;
    setIsSending(true);
    setStatus("正在重新生成...");
    let assistantId = "";

    try {
      const createdAt = new Date().toISOString();
      assistantId = `regen-${Date.now()}`;
      const parameters = modelSelection.parameters || {};
      const streamEnabled = Boolean(parameters.stream);
      const payload = {
        model_config: modelConfig,
        language,
        target_message_id: targetMessageId,
        replacement_message: hasReplacementMessage ? replacementMessage : null,
      };
      setMessages((items) => {
        const userIndex = findRegenerateBranchUserIndex(items, targetMessageId, hasReplacementMessage);
        if (userIndex < 0) return items;
        const branch = items.slice(0, userIndex + 1).map((item, index) =>
          index === userIndex && hasReplacementMessage ? { ...item, content: replacementMessage } : item,
        );
        return branch;
      });
      updatePendingReply({ id: assistantId, conversationId: sessionId, role: "assistant", content: "", variableStateJson: '{}', pending: true, created_at: createdAt });
      requestScrollToEnd("smooth");

      let result;
      const requestId = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeRequest.requestId = requestId;
      const unlistenProcess = await listenAgentProcess((event) => {
        if (event?.request_id !== requestId || event?.session_id !== sessionId || !event?.item) return;
        updatePendingReply((current) => current?.id === assistantId
          ? { ...current, process: upsertProcess(current.process, event.item) }
          : current);
      });
      activeRequest.unlisten = unlistenProcess;
      throwIfAborted(controller.signal);
      let unlistenDelta = () => {};
      if (streamEnabled) {
        unlistenDelta = await listenChatStreamDelta((event) => {
          if (event?.request_id !== requestId || event?.session_id !== sessionId || !event?.delta) return;
          updatePendingReply((current) => current?.id === assistantId
            ? { ...current, pending: true, content: `${current.content || ""}${event.delta}` }
            : current);
        });
      }
      activeRequest.unlisten = () => { unlistenDelta(); unlistenProcess(); };
      throwIfAborted(controller.signal);
      result = streamEnabled
        ? await regenerateChatMessageStream(sessionId, payload, requestId)
        : await regenerateChatMessage(sessionId, payload, requestId);
      if (requestRef.current !== activeRequest) return;
      if (result.cancelled) {
        reconcileChatMessages(result.chat);
        setStatus("已停止");
        return;
      }
      reconcileChatMessages(result.chat);
      setChatCharacter(normalizeLatestChatCharacter(result.chat || {}));
      await refreshSessionsOnly();
      if (requestRef.current !== activeRequest) return;
      setStatus("回复完成");
    } catch (error) {
      if (requestRef.current === activeRequest && !isAbortError(error)) {
        const message = getErrorMessage(error, "重新生成失败");
        commitPendingError(assistantId);
        setStatus(message);
      }
    } finally {
      activeRequest.unlisten?.();
      if (requestRef.current === activeRequest) {
        requestRef.current = null;
        setIsSending(false);
      }
    }
  }

  useEffect(() => {
    if (!chatCharacter.character_id) return;
    const latest = characterLookup.get(chatCharacter.character_id);
    if (!latest) return;
    setChatCharacter((current) => {
      if (current.character_id !== latest.character_id) return current;
      const next = {
        ...current,
        character_name: latest.character_name,
        character_avatar: latest.character_avatar,
        assistant_name: latest.assistant_name,
        assistant_avatar: latest.assistant_avatar,
        assistant_square: latest.assistant_square,
        assistant_cover: latest.assistant_cover,
        opening: latest.opening,
        show_opening: latest.show_opening,
        chat_background: latest.chat_background,
        chat_background_opacity: latest.chat_background_opacity,
        chat_background_blur: latest.chat_background_blur,
        chat_background_scrim: latest.chat_background_scrim,
      };
      return Object.keys(next).some((key) => next[key] !== current[key]) ? next : current;
    });
  }, [chatCharacter.character_id, characterLookup]);

  useAuthorFrontendActions({ sessionId, setIsSending, setStatus, setMessages, reconcileChatMessages,
    setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly, requestScrollToEnd });

  return {
    sessions: displaySessions,
    sessionId,
    messages: displayedMessages,
    input,
    setInput,
    inputImages,
    addInputImages,
    removeInputImage,
    keyword,
    setKeyword,
    isSending,
    filteredSessions,
    historyOpen,
    pinnedIds,
    currentTitle,
    chatCharacter,
    modelSelection,
    selectChatModel,
    scrollRef,
    scrollRequest,
    hasOlderMessages: historyPage.hasMore,
    isLoadingOlderMessages,
    loadOlderMessages,
    loadSessions,
    refreshSessionsOnly,
    openHistory,
    closeHistory,
    loadChat,
    openCharacterChat,
    createChat,
    selectOpening,
    editOpening,
    clearActiveChat,
    sendMessage,
    stopSend,
    regenerateReply,
    togglePinChat,
    removeChat,
    removeHistoryChat,
    openChatWindow,
    abortActiveRequest,
  };
}
