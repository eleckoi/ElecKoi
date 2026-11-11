import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { conversationPreviewText } from "../../../ui/messages/conversationPreviewText.js";

const mappedMessages = new WeakMap();
const EMPTY_ITEMS = Object.freeze([]);
function mapMessage(message) {
  const previous = mappedMessages.get(message);
  if (previous) return previous;
  const mapped = {
    id: message.id,
    renderKey: message.renderKey,
    runtimeSessionId: message.runtimeSessionId || '',
    dshMessageId: message.dshMessageId || '',
    dshNodeKey: message.dshNodeKey || '',
    requestId: message.requestId || '',
    sessionEventSeq: message.sessionEventSeq,
    dshTurn: message.dshTurn,
    inputEventSeq: message.inputEventSeq,
    conversationId: message.conversationId,
    sequence: message.sequence,
    messageIndex: message.messageIndex,
    role: message.role,
    content: message.content,
    displayContent: message.displayContent,
    variableStateJson: message.variableStateJson || '{}',
    created_at: message.createdAt,
    status: message.status,
    pending: message.status === "streaming",
    process: message.process || EMPTY_ITEMS,
    processTiming: message.processTiming,
    turnUsage: message.turnUsage,
    inputImageAttachments: message.inputImageAttachments || EMPTY_ITEMS,
    generatedImageAttachments: message.generatedImageAttachments || EMPTY_ITEMS,
    inputFileAttachments: message.inputFileAttachments || EMPTY_ITEMS,
    openingOptions: message.openingOptions || EMPTY_ITEMS,
    selectedOpeningId: message.selectedOpeningId || '',
    canChangeOpening: message.canChangeOpening === true,
  };
  mappedMessages.set(message, mapped);
  return mapped;
}

function mapConversation(conversation, metadata = conversation.metadata || {}) {
  const characterPersona = metadata.characterPersona || {};
  return {
    id: conversation.id,
    title: conversation.title,
    summary: conversationPreviewText(conversation.preview),
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    character_id: metadata.characterId || "",
    character_name: metadata.characterName || characterPersona.assistant_name || conversation.title || "未命名角色",
    character_avatar: metadata.characterAvatar || characterPersona.assistant_avatar || "",
    character_persona: characterPersona,
  };
}

export function mapConversations(conversations) {
  return conversations.map((item) => mapConversation(item, item.metadata));
}

export function mapChatDetails(details) {
  return {
    ...mapConversation(details.conversation, details.metadata),
    runtimeSessionId: details.runtimeSessionId || '',
    messages: details.messages.map(mapMessage),
    messages_has_more: Boolean(details.hasMore),
    messages_before_sequence: details.beforeSequence ?? null,
  };
}

export async function getChat(sessionId, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const details = await model.open(sessionId);
  return details ? { chat: mapChatDetails(details) } : null;
}

export async function getChatMessages(sessionId, options = {}) {
  if (!options.model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const page = await options.model.pageOlder(sessionId, options.beforeSequence);
  if (!page) return null;
  return {
    messages: page.messages.map(mapMessage),
    replace: page.replace === true,
    has_more: page.hasMore,
    before_sequence: page.beforeSequence,
  };
}

export async function createChat(title, role = {}, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const input = {
    title: title || "新对话",
    metadata: {
      characterId: role.id || role.character_id || "",
      characterName: role.name || role.character_name || role.assistant_name || title || "未命名角色",
      characterAvatar: role.avatar || role.character_avatar || role.assistant_avatar || "",
      characterPersona: role,
    },
  };
  const details = await model.create(input);
  return { chat: mapChatDetails(details) };
}

export async function deleteChat(sessionId, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  await model.delete(sessionId);
  return { ok: true };
}

export async function exportChatHistory(sessionId, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  return { json: await model.exportArchive(sessionId) };
}

export async function importChatHistory(characterId, json, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  return { conversationId: await model.importArchive(characterId, json) };
}

export async function deleteChatMessagesFrom(sessionId, message, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const result = await model.deleteMessagesFrom(
    sessionId,
    Number(message?.sessionEventSeq),
    message?.role,
  );
  return { ...result, chat: mapChatDetails(result.details) };
}

export async function editChatMessage(sessionId, message, content, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const details = await model.editMessage(
    sessionId,
    Number(message?.sessionEventSeq),
    message?.role,
    content,
  );
  return { chat: mapChatDetails(details) };
}

export async function selectChatOpening(sessionId, openingId, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const details = await model.selectOpening(sessionId, openingId);
  return { chat: mapChatDetails(details) };
}

export async function updateChatOpening(sessionId, content, { model } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const details = await model.updateOpening(sessionId, content);
  return { chat: mapChatDetails(details) };
}

export async function applyChatHistoryPolicy() {
  return { ok: true };
}

export async function sendChatMessage(payload, requestId = "", { model, signal } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const result = await model.send({
    conversationId: payload.session_id,
    requestId,
    text: payload.message,
    images: payload.images || [],
    files: payload.files || [],
    ...(payload.mode ? { mode: payload.mode } : {}),
    ...(signal ? { signal } : {}),
  });
  return { session_id: payload.session_id, chat: mapChatDetails(result.details), cancelled: result.cancelled };
}

export function revealChatFile(conversationId, attachmentId, name, { model } = {}) {
  if (!model) return Promise.reject(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" }));
  return model.revealFile(conversationId, attachmentId, name);
}

export async function regenerateChatMessage(sessionId, payload = {}, requestId = "", { model, signal } = {}) {
  if (!model) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "DSH 聊天服务尚未就绪", { what: "聊天服务" });
  const result = await model.regenerate({
    conversationId: sessionId,
    requestId,
    eventSeq: Number(payload.session_event_seq),
    replacementMessage: payload.replacement_message == null ? null : String(payload.replacement_message),
    ...(signal ? { signal } : {}),
  });
  return { session_id: sessionId, chat: mapChatDetails(result.details), cancelled: result.cancelled };
}
