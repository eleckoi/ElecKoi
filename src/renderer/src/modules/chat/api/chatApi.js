import { desktopClient } from "../../../bridge/desktopClient.ts";
import { primeRichMessageHeightCache } from "../../authorFrontend/index.js";

const streamDeltaListeners = new Set();
const processListeners = new Set();
const streamRequestBySession = new Map();

function mapMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence,
    role: message.role,
    content: message.content,
    displayContent: message.displayContent,
    variableStateJson: message.variableStateJson || '{}',
    created_at: message.createdAt,
    status: message.status,
    pending: message.status === "streaming",
    process: message.process || [],
    inputImageAttachments: message.inputImageAttachments || [],
    openingOptions: message.openingOptions || [],
    selectedOpeningId: message.selectedOpeningId || '',
  };
}

function mapConversation(conversation, metadata = conversation.metadata || {}) {
  const characterPersona = metadata.characterPersona || {};
  return {
    id: conversation.id,
    title: conversation.title,
    summary: conversation.preview || "",
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    character_id: metadata.characterId || "",
    character_name: metadata.characterName || characterPersona.assistant_name || conversation.title || "未命名角色",
    character_avatar: metadata.characterAvatar || characterPersona.assistant_avatar || "",
    character_persona: characterPersona,
    model_settings: metadata.modelSettings || {},
  };
}

function mapChat(details) {
  return {
    ...mapConversation(details.conversation, details.metadata),
    messages: details.messages.map(mapMessage),
    messages_has_more: Boolean(details.hasMore),
    messages_before_sequence: details.beforeSequence ?? null,
  };
}

function disposeAll(disposers) {
  for (const dispose of disposers) dispose();
}

export async function listChats() {
  const conversations = await desktopClient.request("query.conversations.list", {});
  return { items: conversations.map((item) => mapConversation(item, item.metadata)) };
}

export async function getChat(sessionId) {
  const [details] = await Promise.all([
    desktopClient.request("query.conversations.details", { conversationId: sessionId }),
    primeRichMessageHeightCache(sessionId),
  ]);
  return { chat: mapChat(details) };
}

export async function getChatMessages(sessionId, options = {}) {
  const page = await desktopClient.request("query.conversations.messages", {
    conversationId: sessionId,
    ...(Number.isInteger(options.beforeSequence) ? { beforeSequence: options.beforeSequence } : {}),
    ...(Number.isInteger(options.limit) ? { limit: options.limit } : {}),
  });
  return {
    messages: page.messages.map(mapMessage),
    has_more: page.hasMore,
    before_sequence: page.beforeSequence,
  };
}

export function getVariableTimeline(sessionId) {
  return desktopClient.request("query.conversations.variable_timeline", { conversationId: sessionId });
}

export async function createChat(title, role = {}) {
  const details = await desktopClient.request("command.conversations.create", {
    title: title || "新对话",
    metadata: {
      characterId: role.id || role.character_id || "",
      characterName: role.name || role.character_name || role.assistant_name || title || "未命名角色",
      characterAvatar: role.avatar || role.character_avatar || role.assistant_avatar || "",
      characterPersona: role,
      modelSettings: {},
    },
  });
  return { chat: mapChat(details) };
}

export async function deleteChat(sessionId) {
  await desktopClient.request("command.conversations.delete", { conversationId: sessionId });
  return { ok: true };
}

export async function selectChatOpening(sessionId, openingId) {
  const details = await desktopClient.request("command.conversations.opening.select", {
    conversationId: sessionId,
    openingId,
  });
  return { chat: mapChat(details) };
}

export async function updateChatOpening(sessionId, content) {
  const details = await desktopClient.request("command.conversations.opening.update", {
    conversationId: sessionId,
    content,
  });
  return { chat: mapChat(details) };
}

export async function applyChatHistoryPolicy() {
  return { ok: true };
}

function waitForReply(sessionId, message, requestId = "", command = "command.agent.start", commandPayload = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let runId = "";
    const queuedTerminalEvents = [];
    const disposers = [];
    const cleanup = () => {
      disposeAll(disposers);
      if (!requestId || streamRequestBySession.get(sessionId) === requestId) {
        streamRequestBySession.delete(sessionId);
      }
    };
    const finish = async (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const result = await getChat(sessionId);
        resolve({
          session_id: sessionId,
          chat: result.chat,
          cancelled: event.message.status === "cancelled",
        });
      } catch (error) {
        reject(error);
      }
    };
    const fail = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message));
    };
    const handleTerminalEvent = (type, event) => {
      if (event.conversationId !== sessionId || settled) return;
      if (!runId) {
        queuedTerminalEvents.push({ type, event });
        return;
      }
      if (event.runId !== runId) return;
      if (type === "failed") fail(event);
      else void finish(event);
    };
    disposers.push(
      desktopClient.on("agent.output.delta", (event) => {
        if (event.conversationId !== sessionId || event.runId !== runId || !requestId) return;
        if (streamRequestBySession.get(sessionId) !== requestId) return;
        for (const listener of streamDeltaListeners) {
          listener({ request_id: requestId, session_id: sessionId, delta: event.delta });
        }
      }),
      desktopClient.on("agent.run.failed", (event) => {
        handleTerminalEvent("failed", event);
      }),
      desktopClient.on("agent.process.updated", (event) => {
        if (event.conversationId !== sessionId || event.runId !== runId || !requestId) return;
        if (streamRequestBySession.get(sessionId) !== requestId) return;
        for (const listener of processListeners) listener({ request_id: requestId, session_id: sessionId, message_id: event.messageId, item: event.item });
      }),
      desktopClient.on("agent.run.finished", (event) => {
        handleTerminalEvent("finished", event);
      }),
    );

    if (requestId) streamRequestBySession.set(sessionId, requestId);
    desktopClient.request(command, {
      conversationId: sessionId,
      ...(command === "command.agent.start" ? { text: message, ...(commandPayload.images?.length ? { images: commandPayload.images } : {}) } : commandPayload),
    }).then((accepted) => {
      if (settled) return;
      runId = accepted.runId;
      const queued = queuedTerminalEvents.find(({ event }) => event.runId === runId);
      if (queued) handleTerminalEvent(queued.type, queued.event);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

export function sendChatMessage(payload, requestId = "") {
  return waitForReply(payload.session_id, payload.message, requestId, "command.agent.start", { images: payload.images || [] });
}

export function sendChatMessageStream(payload, requestId) {
  return sendChatMessage(payload, requestId);
}

export async function readChatImage(conversationId, attachmentId) {
  const image = await desktopClient.request("query.agent.image", { conversationId, attachmentId });
  return `data:${image.mediaType};base64,${image.data}`;
}

export async function cancelChatStream(requestId) {
  const entry = [...streamRequestBySession.entries()].find(([, value]) => value === requestId);
  if (!entry) return;
  await desktopClient.request("command.agent.cancel", { conversationId: entry[0] });
}

export async function listenChatStreamDelta(handler) {
  streamDeltaListeners.add(handler);
  return () => streamDeltaListeners.delete(handler);
}

export async function listenAgentProcess(handler) {
  processListeners.add(handler);
  return () => processListeners.delete(handler);
}

export function listenAgentOutputEvent(handler) {
  return desktopClient.on('agent.output.delta', handler);
}

export function listenAgentProcessEvent(handler) {
  return desktopClient.on('agent.process.updated', handler);
}

export function listenAgentFinishedEvent(handler) {
  return desktopClient.on('agent.run.finished', handler);
}

export function listenAgentFailedEvent(handler) {
  return desktopClient.on('agent.run.failed', handler);
}

export async function getGenerationStats(conversationId) {
  const result = await desktopClient.request("query.agent.generation_stats", { conversationId });
  return result.stats;
}

export function getTrajectory(conversationId, options = {}) {
  return desktopClient.request("query.agent.trajectory", {
    conversationId,
    ...(Number.isInteger(options.beforeIndex) ? { beforeIndex: options.beforeIndex } : {}),
    ...(Number.isInteger(options.limit) ? { limit: options.limit } : {}),
  });
}

export function listenGenerationStatsEvent(handler) {
  return desktopClient.on("agent.generation.stats", handler);
}

export async function regenerateChatMessage(sessionId, payload = {}, requestId = "") {
  return waitForReply(sessionId, "", requestId, "command.agent.regenerate", {
    targetMessageId: String(payload.target_message_id || ""),
    replacementMessage: payload.replacement_message == null ? null : String(payload.replacement_message),
  });
}

export function regenerateChatMessageStream(sessionId, payload, requestId) {
  return regenerateChatMessage(sessionId, payload, requestId);
}
