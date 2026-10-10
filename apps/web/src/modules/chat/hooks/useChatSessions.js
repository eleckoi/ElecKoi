import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createChat as createChatSession,
  deleteChat,
  deleteChatMessagesFrom,
  editChatMessage,
  getChat,
  mapChatDetails,
  mapConversations,
  regenerateChatMessage,
  selectChatOpening,
  updateChatOpening,
} from "../api/chatApi.js";
import { useChatInputFiles } from './useChatInputFiles.js';
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
  filterHiddenConversationEntries,
  filterConversationSessions,
  selectSessionForCharacter,
  sortSessionsByPinned,
} from "../model/chatSessionView.js";
import { findRegenerateBranchUserIndex } from "../model/chatRegeneration.js";
import { useConversationListPreferences } from "./useConversationListPreferences.js";
import { useActiveChatModel } from "./useActiveChatModel.js";
import { useConversationMessages } from "./useConversationMessages.js";
import { useChatHistoryPaging } from "./useChatHistoryPaging.js";
import { useAuthorFrontendActions } from "./useAuthorFrontendActions.js";
import { useChatInputImages } from "./useChatInputImages.js";
import { getErrorMessage, isAbortError, runChatMessageSend, stopChatMessageSend, throwIfAborted } from "./chatMessageSend.js";

const EMPTY_CATALOG = { status: "loading", items: [], error: "" };
const EMPTY_DETAILS = { id: "", status: "idle", details: null, error: "" };
const EMPTY_STREAM = { id: "", status: "idle", content: "", process: [] };
const subscribeEmptyCatalog = () => () => {};
const getEmptyCatalog = () => EMPTY_CATALOG;

function getLegacyChatSnapshot(conversations) {
  return {
    details: conversations?.getDetailsSnapshot?.() || EMPTY_DETAILS,
    stream: conversations?.getStreamSnapshot?.() || EMPTY_STREAM,
  };
}

function createLegacyChatSubscription(conversations) {
  let snapshot = getLegacyChatSnapshot(conversations);
  const getSnapshot = () => {
    const next = getLegacyChatSnapshot(conversations);
    if (next.details === snapshot.details && next.stream === snapshot.stream) return snapshot;
    snapshot = next;
    return snapshot;
  };
  const subscribe = (listener) => {
    const update = () => {
      getSnapshot();
      listener();
    };
    const stops = [
      conversations?.subscribeDetails?.(update),
      conversations?.subscribeStream?.(update),
    ].filter(Boolean);
    return () => stops.forEach((stop) => stop());
  };
  return { subscribe, getSnapshot };
}

export function useChatSessions({ conversations, persona, characters, modelConfigs, language, setStatus, setActiveSectionState, notify }) {
  const catalog = useSyncExternalStore(
    conversations?.subscribe || subscribeEmptyCatalog,
    conversations?.getSnapshot || getEmptyCatalog,
  );
  const chatSubscription = useMemo(() => conversations?.subscribeChat && conversations?.getChatSnapshot
    ? { subscribe: conversations.subscribeChat, getSnapshot: conversations.getChatSnapshot }
    : createLegacyChatSubscription(conversations), [conversations]);
  const chatSnapshot = useSyncExternalStore(
    chatSubscription.subscribe,
    chatSubscription.getSnapshot,
    chatSubscription.getSnapshot,
  );
  const detailsSnapshot = chatSnapshot.details || EMPTY_DETAILS;
  const streamSnapshot = chatSnapshot.stream || EMPTY_STREAM;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  useEffect(() => {
    if (!conversations || catalog.status !== "error" || !catalog.error) return;
    setStatus(catalog.error);
    notifyRef.current?.("error", catalog.error);
  }, [catalog.error, catalog.status, conversations, setStatus]);
  useEffect(() => {
    if (!conversations || detailsSnapshot.status !== "error" || !detailsSnapshot.error) return;
    setStatus(detailsSnapshot.error);
    notifyRef.current?.("error", detailsSnapshot.error);
  }, [conversations, detailsSnapshot.error, detailsSnapshot.status, setStatus]);
  const sessions = useMemo(() => mapConversations(catalog.items), [catalog.items]);
  const [sessionId, setSessionId] = useState(() => conversations?.getDetailsSnapshot()?.id || "");
  const preferredSessionByCharacterRef = useRef(new Map());
  const [selectionReady, setSelectionReady] = useState(false);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const loadGenerationRef = useRef(0);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false);
  const [conversationTransitionRevision, setConversationTransitionRevision] = useState(0);
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isSending, setIsSending] = useState(false);
  const liveRun = Boolean(conversations && streamSnapshot.id === sessionId
    && streamSnapshot.status === "running" && streamSnapshot.runId);
  // The DSH stream is the source of truth for the running assistant row. It
  // must be visible during an ordinary send as well as after a restored run;
  // `isSending` only describes the product request wrapper, not DSH's row
  // lifecycle.
  const restoredRun = liveRun;
  const chatBusy = isSending || liveRun;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatCharacter, setChatCharacter] = useState(() => createEmptyChatCharacter());

  const requestRef = useRef(null);
  const {
    pinnedIds,
    hiddenIds,
    togglePinChat: togglePinnedChat,
    unpinChat,
    hideChatEntry,
    restoreChatEntry,
  } = useConversationListPreferences();
  const { modelConfig, modelSelection, selectChatModel } = useActiveChatModel({
    conversations, conversationId: sessionId, modelConfigs, setStatus,
  });
  const {
    inputImages, inputImagesRef, modelSupportsImages, addInputImages, removeInputImage, clearInputImages,
  } = useChatInputImages({ modelConfig, isSending: chatBusy });
  const { inputFiles, inputFilesRef, filesUploading, fileUploadProgress, addInputFiles, removeInputFile, clearInputFiles, discardInputFiles } = useChatInputFiles({
    conversationId: sessionId,
    conversations,
  });
  const {
    messages,
    displayedMessages,
    setMessages,
    setMessagesWithScroll,
    reconcileMessages,
    prependMessages,
    historyPage,
    requestScrollToEnd,
    scrollRequest,
    scrollRef,
  } = useConversationMessages();
  // ConversationCatalog projects both live and settled DSH nodes atomically.
  // The renderer must not build a second transcript from the stream snapshot.

  const { isLoadingOlderMessages, loadOlderMessages } = useChatHistoryPaging({
    sessionId,
    historyPage,
    prependMessages,
    reconcileMessages,
    setStatus,
    conversations,
  });

  const characterLookup = useMemo(() => createCharacterLookup(characters), [characters]);
  const displaySessions = useMemo(() => applyLatestCharactersToSessions(sessions, characterLookup), [characterLookup, sessions]);
  const sortedSessions = useMemo(() => sortSessionsByPinned(displaySessions, pinnedIds), [displaySessions, pinnedIds]);
  const conversationSessions = useMemo(() => collapseSessionsByCharacter(
    sortedSessions,
    sessionId,
    conversations?.preferredSessions || preferredSessionByCharacterRef.current,
  ), [conversations, sessionId, sortedSessions]);
  const visibleConversationSessions = useMemo(
    () => filterHiddenConversationEntries(conversationSessions, hiddenIds),
    [conversationSessions, hiddenIds],
  );
  const filteredSessions = useMemo(
    () => filterConversationSessions(visibleConversationSessions, keyword),
    [keyword, visibleConversationSessions],
  );
  const currentTitle = useMemo(
    () => currentChatTitle(displaySessions, sessionId, chatCharacter),
    [chatCharacter.assistant_name, chatCharacter.character_name, displaySessions, sessionId],
  );

  useEffect(() => {
    if (!conversations || !selectionReady) return;
    void conversations.saveSelection({
      active_conversation_id: sessionId,
      preferred_sessions: Object.fromEntries(preferredSessionByCharacterRef.current),
    }).catch((error) => {
      notifyRef.current?.("error", getErrorMessage(error, "保存当前聊天记录失败"));
    });
  }, [conversations, selectionReady, selectionRevision, sessionId]);

  function rememberPreferredSession(characterId, id) {
    if (!characterId || !id) return;
    if (preferredSessionByCharacterRef.current.get(characterId) !== id) {
      preferredSessionByCharacterRef.current.set(characterId, id);
      setSelectionRevision((value) => value + 1);
    }
    conversations?.rememberSession?.(characterId, id);
  }

  function forgetPreferredSession(characterId, id) {
    if (!characterId || preferredSessionByCharacterRef.current.get(characterId) !== id) return;
    preferredSessionByCharacterRef.current.delete(characterId);
    conversations?.forgetSession?.(characterId, id);
    setSelectionRevision((value) => value + 1);
  }

  function normalizeLatestChatCharacter(chat) {
    return normalizeChatItemCharacter(withLatestCharacter(chat || {}, characterLookup));
  }

  function replaceChatMessages(chat, behavior = null) {
    const nextMessages = chat?.messages || [];
    if (conversations && chat?.id && conversations.getDetailsSnapshot().id !== chat.id) {
      conversations.activate(chat.id);
      void conversations.refreshDetails().catch(() => {});
    }
    setMessagesWithScroll(nextMessages, behavior, {
      hasMore: chat?.messages_has_more,
      beforeSequence: chat?.messages_before_sequence,
    });
  }

  function reconcileChatMessages(chat, options = {}) {
    const nextMessages = chat?.messages || [];
    reconcileMessages(nextMessages, {
      hasMore: chat?.messages_has_more,
      beforeSequence: chat?.messages_before_sequence,
      preservePendingUser: requestRef.current?.pendingUserMessage,
    });
  }

  useEffect(() => {
    const details = detailsSnapshot.details;
    if (!conversations || !details || details.conversation.id !== sessionId) return;
    const chat = mapChatDetails(details);
    reconcileChatMessages(chat, {
      hasMore: chat?.messages_has_more,
      beforeSequence: chat?.messages_before_sequence,
    });
    setChatCharacter(normalizeLatestChatCharacter(chat));
  }, [chatBusy, conversations, detailsSnapshot.details, sessionId]);

  async function readSessions() {
    if (!conversations) throw new Error("DSH 聊天服务尚未就绪");
    return { items: mapConversations(await conversations.refresh()) };
  }

  async function loadSessions(preferredId = "") {
    const restoreGeneration = loadGenerationRef.current;
    let savedSelection = null;
    if (conversations) {
      try {
        savedSelection = await conversations.readSelection();
        if (restoreGeneration === loadGenerationRef.current) {
          for (const [characterId, id] of Object.entries(savedSelection?.preferred_sessions || {})) {
            if (characterId && id) rememberPreferredSession(characterId, id);
          }
        }
      } catch (error) {
        notifyRef.current?.("error", getErrorMessage(error, "读取当前聊天记录失败"));
      }
    }
    const data = await readSessions();
    const items = data.items || [];
    try {
      if (restoreGeneration !== loadGenerationRef.current) return;
      const availableIds = new Set(items.map((item) => item.id));
      const targetId = [preferredId, savedSelection?.active_conversation_id, sessionId,
        conversations?.getDetailsSnapshot()?.id, items[0]?.id]
        .find((id) => id && availableIds.has(id)) || "";
      if (targetId) await loadChat(targetId);
      else {
        setSessionId("");
        setMessagesWithScroll([], "auto");
      }
    } catch (error) {
      setSessionId("");
      setMessagesWithScroll([], "auto");
      notifyRef.current?.("error", getErrorMessage(error, "恢复当前聊天记录失败"));
    } finally {
      setSelectionReady(true);
    }
  }

  async function refreshSessionsOnly(options = {}) {
    await readSessions();
    if (!options.keepSection) setActiveSectionState("messages");
  }

  async function openHistory() {
    await readSessions();
    setHistoryOpen(true);
  }

  function closeHistory() {
    setHistoryOpen(false);
  }

  async function loadChat(sessionIdToLoad, options = {}) {
    if (chatBusy) {
      setStatus("正在生成，请先停止或等待完成");
      return;
    }
    clearInputImages();
    discardInputFiles();
    const loadGeneration = ++loadGenerationRef.current;
    const switching = sessionIdToLoad !== sessionId || Boolean(options.transition);
    if (switching) setIsSwitchingChat(true);
    const shouldBumpToTop = Boolean(options.bumpToTop);
    try {
      const data = await getChat(sessionIdToLoad, { model: conversations });
      if (!data || loadGeneration !== loadGenerationRef.current) return;
      if (data.chat.character_id) {
        rememberPreferredSession(data.chat.character_id, data.chat.id);
      }
      setSessionId(data.chat.id);
      replaceChatMessages(data.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(data.chat));
      setActiveSectionState("messages");
      if (switching) setConversationTransitionRevision((value) => value + 1);
      setIsSwitchingChat(false);
      if (shouldBumpToTop) {
        await refreshSessionsOnly({ keepSection: true });
      }
    } finally {
      if (loadGeneration === loadGenerationRef.current) setIsSwitchingChat(false);
    }
  }

  async function openCharacterChat(role) {
    if (chatBusy) {
      setStatus("正在生成，请先停止或等待完成");
      return;
    }
    const characterData = normalizeChatCharacter(role);
    const characterId = characterData.character_id;
    const characterName = characterData.assistant_name || characterData.character_name || "未命名角色";
    if (!characterId) return;
    const selectionGeneration = ++loadGenerationRef.current;
    setIsSwitchingChat(true);
    clearInputImages();
    discardInputFiles();
    try {
      const data = await readSessions();
      if (selectionGeneration !== loadGenerationRef.current) return;
      const items = data.items || [];
      const preferredId = conversations?.preferredSession?.(characterId)
        || preferredSessionByCharacterRef.current.get(characterId)
        || (chatCharacter.character_id === characterId ? sessionId : "");
      const existing = selectSessionForCharacter(items, characterId, preferredId);
      if (existing?.id) {
        restoreChatEntry(existing.id);
        await loadChat(existing.id, { bumpToTop: true, transition: true });
        return;
      }
      const created = await createChatSession(characterName, characterData, { model: conversations });
      if (selectionGeneration !== loadGenerationRef.current) return;
      rememberPreferredSession(characterId, created.chat.id);
      setSessionId(created.chat.id);
      replaceChatMessages(created.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(created.chat));
      setConversationTransitionRevision((value) => value + 1);
      setIsSwitchingChat(false);
      await refreshSessionsOnly();
      setActiveSectionState("messages");
    } catch (error) {
      const message = getErrorMessage(error, "添加对话失败");
      setStatus(message);
      notifyRef.current?.("error", message);
    } finally {
      if (selectionGeneration === loadGenerationRef.current) setIsSwitchingChat(false);
    }
  }

  function abortActiveRequest() {
    const activeRequest = requestRef.current;
    requestRef.current = null;
    activeRequest?.controller?.abort?.();
    if (activeRequest?.requestId && conversations) {
      conversations.cancelRequest(activeRequest.conversationId || sessionId, activeRequest.requestId).catch(() => {});
    }
  }

  async function createChat() {
    if (chatBusy) {
      setStatus("正在生成，请先停止或等待完成");
      return;
    }
    if (!chatCharacter.character_id) {
      setStatus("请先从角色设定中双击角色进入聊天");
      return;
    }
    abortActiveRequest();
    clearInputImages();
    discardInputFiles();
    const creationGeneration = ++loadGenerationRef.current;
    setIsSwitchingChat(true);
    const characterName = chatCharacter.assistant_name || chatCharacter.character_name || "新对话";
    try {
      const created = await createChatSession(characterName, chatCharacter, { model: conversations });
      if (creationGeneration !== loadGenerationRef.current) return;
      const chat = created.chat;
      rememberPreferredSession(chatCharacter.character_id, chat.id);
      setSessionId(chat.id);
      replaceChatMessages(chat, "auto");
      setInput("");
      setIsSending(false);
      setChatCharacter(normalizeLatestChatCharacter(chat));
      setConversationTransitionRevision((value) => value + 1);
      setIsSwitchingChat(false);
      await refreshSessionsOnly();
      setStatus("新会话");
      setActiveSectionState("messages");
    } catch (error) {
      const message = getErrorMessage(error, "新建会话失败");
      setStatus(message);
      notifyRef.current?.("error", message);
    } finally {
      if (creationGeneration === loadGenerationRef.current) setIsSwitchingChat(false);
    }
  }

  async function selectOpening(message, openingId) {
    if (!sessionId || chatBusy || message?.id !== "opening" || !message.canChangeOpening || !openingId) return;
    try {
      const result = await selectChatOpening(sessionId, openingId, { model: conversations });
      replaceChatMessages(result.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
    } catch (error) {
      setStatus(getErrorMessage(error, "切换开场白失败"));
    }
  }

  async function editOpening(message, replacementMessage) {
    if (!sessionId || chatBusy || message?.id !== "opening" || !message.canChangeOpening) return false;
    try {
      const result = await updateChatOpening(sessionId, replacementMessage, { model: conversations });
      replaceChatMessages(result.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
      return true;
    } catch (error) {
      setStatus(getErrorMessage(error, "修改开场白失败"));
      return false;
    }
  }

  function clearActiveChat() {
    loadGenerationRef.current += 1;
    setIsSwitchingChat(false);
    abortActiveRequest();
    clearInputImages();
    discardInputFiles();
    conversations?.activate("");
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

  async function removeHistoryChat(chatId) {
    if (!chatId) return;
    const target = displaySessions.find((item) => item.id === chatId) || sessions.find((item) => item.id === chatId);
    const targetCharacterId = target?.character_id || "";
    const sameCharacterSessions = targetCharacterId ? displaySessions.filter((item) => item.character_id === targetCharacterId) : [];
    const remainingSameCharacterSessions = sameCharacterSessions
      .filter((item) => item.id !== chatId)
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const shouldCreateReplacement = Boolean(targetCharacterId) && remainingSameCharacterSessions.length === 0;

    await deleteChat(chatId, { model: conversations });
    unpinChat(chatId);
    forgetPreferredSession(targetCharacterId, chatId);

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
      const created = await createChatSession(characterName, replacementCharacter, { model: conversations });
      rememberPreferredSession(targetCharacterId, created.chat.id);
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
    const activeRequest = requestRef.current;
    if (activeRequest) {
      stopChatMessageSend({
        requestRef, setIsSending, setStatus, notify,
        cancelRequest: (requestId) => conversations.cancelRequest(activeRequest.conversationId || sessionId, requestId),
      });
      return;
    }
    if (restoredRun && streamSnapshot.runId && typeof conversations.cancelStream === "function") {
      void conversations.cancelStream(streamSnapshot.runId).then((cancelled) => {
        if (!cancelled) setStatus("这次回复已结束");
      }).catch((error) => {
        const message = getErrorMessage(error, "停止生成失败");
        setStatus(message);
        notify?.("error", message);
      });
      return;
    }
    setIsSending(false);
  }

  function sendMessage(event, inputOverride) {
    return runChatMessageSend({
      event, input: inputOverride ?? input, inputImagesRef, inputFilesRef, isSending: chatBusy || filesUploading, modelConfig, modelSupportsImages, setStatus,
      requestRef, setIsSending, sessionId, chatCharacter, setSessionId, replaceChatMessages,
      setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly, setInput, clearInputImages, clearInputFiles,
      setMessages, requestScrollToEnd, reconcileChatMessages,
      notify, restoreChatEntry, conversationModel: conversations,
    });
  }

  async function deleteMessagesFrom(messageId) {
    if (!sessionId || !messageId || chatBusy) return false;
    try {
      const message = messages.find((item) => item.id === messageId);
      if (!message || !Number.isSafeInteger(message.sessionEventSeq)) throw new Error("找不到对应的 DSH 消息");
      const result = await deleteChatMessagesFrom(sessionId, message, { model: conversations });
      replaceChatMessages(result.chat, "auto");
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
      setStatus(`已删除 ${result.deletedMessageCount} 条消息`);
      return true;
    } catch (error) {
      setStatus(getErrorMessage(error, "删除消息失败"));
      return false;
    }
  }

  async function editMessage(message, replacementMessage) {
    if (!sessionId || !message?.id || chatBusy) return false;
    try {
      if (!Number.isSafeInteger(message.sessionEventSeq)) throw new Error("找不到对应的 DSH 消息");
      const result = await editChatMessage(sessionId, message, replacementMessage, { model: conversations });
      replaceChatMessages(result.chat, "auto");
      conversations?.invalidateDetails(sessionId);
      setChatCharacter(normalizeLatestChatCharacter(result.chat));
      await refreshSessionsOnly({ keepSection: true });
      return true;
    } catch (error) {
      setStatus(getErrorMessage(error, "修改消息失败"));
      return false;
    }
  }

  async function regenerateReply(options = {}) {
    if (!sessionId || chatBusy) return;
    if (!modelConfig?.id || !modelConfig.model?.trim()) {
      const message = "未配置可用的对话模型，请先前往“模型配置”添加模型和 API 密钥。";
      setStatus(message);
      notifyRef.current?.("error", message);
      return;
    }
    if (!conversations) {
      const message = "DSH 聊天服务尚未就绪";
      setStatus(message);
      notifyRef.current?.("error", message);
      return;
    }
    const requestedTargetMessageId = String(options.targetMessageId || "").trim();
    const hasReplacementMessage = Object.prototype.hasOwnProperty.call(options, "replacementMessage");
    const replacementMessage = hasReplacementMessage ? String(options.replacementMessage || "").trim() : "";
    if (!requestedTargetMessageId) {
      setStatus(hasReplacementMessage ? "请选择要修改的输入" : "请选择要重新生成的 AI 回复");
      return;
    }
    if (hasReplacementMessage && !replacementMessage) {
      setStatus("输入不能为空");
      return;
    }

    const branchUserIndex = findRegenerateBranchUserIndex(messages, requestedTargetMessageId, hasReplacementMessage);
    if (branchUserIndex < 0) {
      setStatus(hasReplacementMessage ? "没有找到要修改的用户输入" : "没有找到这条回复对应的用户输入");
      return;
    }
    const branchUser = messages[branchUserIndex];
    if (!Number.isSafeInteger(branchUser?.sessionEventSeq)) {
      setStatus("找不到这条输入对应的 DSH 消息");
      return;
    }
    const targetMessageId = String(branchUser?.turnId || branchUser?.id || requestedTargetMessageId).trim();
    restoreChatEntry(sessionId);

    const controller = new AbortController();
    const requestId = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const activeRequest = { controller, requestId };
    activeRequest.conversationId = sessionId;
    requestRef.current = activeRequest;
    setIsSending(true);
    setStatus("正在重新生成...");
    try {
      const payload = {
        target_message_id: targetMessageId,
        session_event_seq: branchUser.sessionEventSeq,
        replacement_message: hasReplacementMessage ? replacementMessage : null,
      };
      throwIfAborted(controller.signal);
      const result = await regenerateChatMessage(sessionId, payload, requestId, { model: conversations, signal: controller.signal });
      if (result.cancelled) {
        if (requestRef.current === null || requestRef.current === activeRequest) {
          replaceChatMessages(result.chat);
          conversations?.invalidateDetails(sessionId);
        }
        if (requestRef.current === activeRequest) setStatus("已停止");
        return;
      }
      if (requestRef.current !== activeRequest) return;
      replaceChatMessages(result.chat);
      conversations?.invalidateDetails(sessionId);
      setChatCharacter(normalizeLatestChatCharacter(result.chat || {}));
      await refreshSessionsOnly();
      if (requestRef.current !== activeRequest) return;
      setStatus("回复完成");
    } catch (error) {
      if (requestRef.current === activeRequest && !isAbortError(error)) {
        const message = getErrorMessage(error, "重新生成失败");
        setIsSending(false);
        setStatus(message);
        notify?.("error", message);
        let reconciled = false;
        try {
          const durable = await getChat(sessionId, { model: conversations });
          if (requestRef.current === activeRequest) {
            replaceChatMessages(durable.chat);
            conversations?.invalidateDetails(sessionId);
            setChatCharacter(normalizeLatestChatCharacter(durable.chat || {}));
            reconciled = true;
          }
        } catch {
          // Preserve the original regeneration failure when durable refresh also fails.
        }
        if (requestRef.current !== activeRequest) return;
        if (!reconciled) setStatus("重新生成失败，且无法刷新聊天记录");
      }
    } finally {
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

  useAuthorFrontendActions({ sessionId, setIsSending, setStatus, reconcileChatMessages,
    replaceChatMessages, conversations,
    setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly, requestScrollToEnd, loadChat,
    input, inputImages, setInput, sendMessage, requestRef });

  return {
    sessions: displaySessions,
    sessionId,
    isSwitchingChat,
    conversationTransitionRevision,
    runtimeSessionId: detailsSnapshot.id === sessionId
      ? detailsSnapshot.details?.runtimeSessionId || detailsSnapshot.runtimeSessionId || '' : '',
    messages: displayedMessages,
    input,
    setInput,
    inputImages,
    inputFiles,
    filesUploading,
    fileUploadProgress,
    addInputImages,
    addInputFiles,
    removeInputImage,
    removeInputFile,
    keyword,
    setKeyword,
    isSending: chatBusy,
    filteredSessions,
    historyOpen,
    visibleConversationSessions,
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
    editMessage,
    deleteMessagesFrom,
    togglePinChat,
    hideChatEntry,
    removeHistoryChat,
    openChatWindow,
    abortActiveRequest,
  };
}
