import { useRef, useState } from "react";

function sameMessageIdentity(current, incoming) {
  if (!current || !incoming || current.role !== incoming.role) return false;
  // Message ids such as "opening" are local to a conversation. Reuse of
  // display state, row keys and process items must stay inside that owner.
  if (current.conversationId !== incoming.conversationId) return false;
  if (current.runtimeSessionId && incoming.runtimeSessionId
    && current.runtimeSessionId !== incoming.runtimeSessionId) return false;
  if (current.id && current.id === incoming.id) return true;
  if (current.role === 'user' && current.requestId && current.requestId === incoming.requestId) return true;
  if (!current.runtimeSessionId || current.runtimeSessionId !== incoming.runtimeSessionId) return false;
  return Boolean((current.dshMessageId && current.dshMessageId === incoming.dshMessageId)
    || (current.dshNodeKey && current.dshNodeKey === incoming.dshNodeKey)
    || (current.renderKey && current.renderKey === incoming.renderKey));
}

const sameRecord = (left, right) => left === right || Boolean(left && right)
  && Object.keys(left).length === Object.keys(right).length
  && Object.keys(left).every(key => Object.hasOwn(right, key) && left[key] === right[key]);
const sameItems = (left, right) => left === right || left.length === right.length && left.every((item, index) => item === right[index]);
const reconciledMessages = new WeakMap();

function preserveAttachmentRenderKeys(current = [], incoming = []) {
  const byId = new Map(current.filter(image => image?.attachmentId).map(image => [image.attachmentId, image]));
  const next = incoming.map((image, index) => {
    const previous = byId.get(image?.attachmentId) || current[index];
    const renderKey = previous?.renderKey || previous?.localId || previous?.attachmentId;
    const next = renderKey && image.renderKey !== renderKey ? { ...image, renderKey } : image;
    return sameRecord(previous, next) ? previous : next;
  });
  return sameItems(current, next) ? current : next;
}

export function mergeProcessItems(current = [], incoming = []) {
  const order = [];
  const byId = new Map();
  for (const item of [...current, ...incoming]) {
    if (!item?.id) continue;
    if (!byId.has(item.id)) order.push(item.id);
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      continue;
    }
    const incomingTerminal = item.status !== 'running';
    const previousTerminal = previous.status !== 'running';
    const keepPreviousStatus = previousTerminal && !incomingTerminal;
    const reasoning = item.kind === 'reasoning' || item.toolName === 'reasoning';
    const merged = {
      ...previous,
      ...item,
      ...(keepPreviousStatus ? {
        status: previous.status,
        completedAtMillis: previous.completedAtMillis,
      } : {}),
      ...(reasoning ? {
        summary: longerText(previous.summary, item.summary),
        detail: longerText(previous.detail, item.detail),
      } : {}),
    };
    if (reasoning && (merged.status === 'running' || (merged.detail || merged.summary || '') !== (previous.detail || previous.summary || ''))
      && !Object.hasOwn(item, 'displayDetail')) delete merged.displayDetail;
    byId.set(item.id, sameRecord(previous, merged) ? previous : merged);
  }
  const next = order.map((id) => byId.get(id));
  return sameItems(current, next) ? current : next;
}

function longerText(left, right) {
  const first = typeof left === 'string' ? left : '';
  const second = typeof right === 'string' ? right : '';
  return second.length >= first.length ? second : first;
}

export function preserveMessageRenderKeys(currentMessages = [], incomingMessages = [], pendingMessage = null) {
  const current = pendingMessage ? [...currentMessages, pendingMessage] : currentMessages;
  const byIdentity = new Map(), claimed = new Set(), matches = new Map();
  incomingMessages.forEach((message, index) => {
    const previous = current[index];
    if (previous && !claimed.has(previous) && (message === previous || reconciledMessages.get(message) === previous)) {
      matches.set(index, previous);claimed.add(previous);
    }
  });
  const identities = (message, indexing = false) => {
    const owner = [typeof message.conversationId, message.conversationId, message.role];
    const session = message.runtimeSessionId;
    const scopes = indexing ? [session ? ['session', session] : ['unbound'], ['any']]
      : session ? [['session', session], ['unbound']] : [['any']];
    const keys = [];
    for (const scope of scopes) {
      if (message.id) keys.push(JSON.stringify([...owner, scope, 'id', message.id]));
      if (message.role === 'user' && message.requestId) keys.push(JSON.stringify([...owner, scope, 'request', message.requestId]));
    }
    if (session) for (const field of ['dshMessageId', 'dshNodeKey', 'renderKey']) {
      if (message[field]) keys.push(JSON.stringify([...owner, ['session', session], field, message[field]]));
    }
    return keys;
  };
  current.forEach((message, index) => {
    if (claimed.has(message)) return;
    for (const key of identities(message, true)) {
      let bucket = byIdentity.get(key);
      if (!bucket) { bucket = { indices: [], cursor: 0 }; byIdentity.set(key, bucket); }
      bucket.indices.push(index);
    }
  });

  const next = incomingMessages.map((message, position) => {
    if (matches.has(position)) return matches.get(position);
    let matched = Number.POSITIVE_INFINITY;
    for (const key of identities(message)) {
      const bucket = byIdentity.get(key);
      while (bucket && bucket.cursor < bucket.indices.length && claimed.has(current[bucket.indices[bucket.cursor]])) bucket.cursor++;
      const index = bucket?.indices[bucket.cursor];
      if (index !== undefined && index < matched && sameMessageIdentity(current[index], message)) matched = index;
    }
    const previous = current[matched];
    if (!previous) return message;
    claimed.add(previous);
    if (previous === message) return previous;
    const renderKey = previous.renderKey || previous.id;
    const merged = {
      ...message,
      ...(renderKey ? { renderKey } : {}),
      process: mergeProcessItems(previous.process || [], message.process || []),
      inputImageAttachments: preserveAttachmentRenderKeys(
        previous.inputImageAttachments || [],
        message.inputImageAttachments || [],
      ),
    };
    const result = sameRecord(previous, merged) ? previous : merged;
    reconciledMessages.set(message, result);
    return result;
  });
  return sameItems(currentMessages, next) ? currentMessages : next;
}

export function preservePendingUser(currentMessages, incomingMessages, pendingUser) {
  if (!pendingUser || pendingUser.role !== "user") return incomingMessages;
  if (incomingMessages.some(message => sameMessageIdentity(pendingUser, message))) return incomingMessages;
  const previous = currentMessages.find(message => message.id === pendingUser.id);
  if (!previous) return incomingMessages;
  const previousIndex = currentMessages.indexOf(previous);
  const insertAt = Math.min(Math.max(previousIndex, 0), incomingMessages.length);
  return [
    ...incomingMessages.slice(0, insertAt),
    { ...previous, ...pendingUser },
    ...incomingMessages.slice(insertAt),
  ];
}

export function useConversationMessages() {
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);
  const [historyPage, setHistoryPage] = useState({ hasMore: false, beforeSequence: null });
  const [scrollRequest, setScrollRequest] = useState({ revision: 0, behavior: "auto" });
  const displayedMessages = messages;

  function requestScrollToEnd(behavior = "smooth", source = "submission") {
    setScrollRequest((current) => ({ revision: current.revision + 1, behavior, source }));
  }

  function setMessagesWithScroll(nextMessages, behavior = null, page = {}) {
    // Keep the mounted row identity while an optimistic/streaming assistant
    // message is replaced by the durable DSH message at turn completion.
    // Empty arrays are intentional clears (session switch/reset) and must not
    // retain the previous conversation.
    setMessages((current) => nextMessages.length
      ? preserveMessageRenderKeys(current, nextMessages)
      : nextMessages);
    setHistoryPage(current => current.hasMore === Boolean(page.hasMore) && current.beforeSequence === (page.beforeSequence ?? null)
      ? current : { hasMore: Boolean(page.hasMore), beforeSequence: page.beforeSequence ?? null });
    if (behavior) requestScrollToEnd(behavior);
  }

  function reconcileMessages(nextMessages, page = {}) {
    setMessages((current) => {
      const merged = preserveMessageRenderKeys(current, nextMessages);
      return preservePendingUser(current, merged, page.preservePendingUser);
    });
    setHistoryPage(current => current.hasMore === Boolean(page.hasMore) && current.beforeSequence === (page.beforeSequence ?? null)
      ? current : { hasMore: Boolean(page.hasMore), beforeSequence: page.beforeSequence ?? null });
  }

  function prependMessages(olderMessages, page = {}) {
    setMessages((current) => {
      const existing = new Set(current.map((message) => message.id));
      const uniqueOlder = olderMessages.filter((message) => !existing.has(message.id));
      return uniqueOlder.length ? [...uniqueOlder, ...current] : current;
    });
    setHistoryPage({
      hasMore: Boolean(page.hasMore),
      beforeSequence: page.beforeSequence ?? null,
    });
  }

  return {
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
  };
}
