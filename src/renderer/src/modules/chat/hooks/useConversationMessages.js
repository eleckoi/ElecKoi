import { useMemo, useRef, useState } from "react";

export function useConversationMessages() {
  const [messages, setMessages] = useState([]);
  const [pendingReply, setPendingReply] = useState(null);
  const pendingReplyRef = useRef(null);
  const scrollRef = useRef(null);
  const [historyPage, setHistoryPage] = useState({ hasMore: false, beforeSequence: null });
  const [scrollRequest, setScrollRequest] = useState({ revision: 0, behavior: "auto" });
  const displayedMessages = useMemo(
    () => pendingReply ? [...messages, pendingReply] : messages,
    [messages, pendingReply],
  );

  function updatePendingReply(updater) {
    setPendingReply((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      pendingReplyRef.current = next;
      return next;
    });
  }

  function clearPendingReply() {
    pendingReplyRef.current = null;
    setPendingReply(null);
  }

  function requestScrollToEnd(behavior = "smooth") {
    setScrollRequest((current) => ({ revision: current.revision + 1, behavior }));
  }

  function setMessagesWithScroll(nextMessages, behavior = null, page = {}) {
    clearPendingReply();
    setMessages(nextMessages);
    setHistoryPage({
      hasMore: Boolean(page.hasMore),
      beforeSequence: page.beforeSequence ?? null,
    });
    if (behavior) requestScrollToEnd(behavior);
  }

  function reconcileMessages(nextMessages, page = {}) {
    clearPendingReply();
    setMessages((current) => {
      const firstIncomingSequence = nextMessages.reduce((first, message) => (
        Number.isInteger(message.sequence) ? Math.min(first, message.sequence) : first
      ), Number.POSITIVE_INFINITY);
      if (!Number.isFinite(firstIncomingSequence)) return nextMessages;
      const retained = current.filter((message) => (
        Number.isInteger(message.sequence) && message.sequence < firstIncomingSequence
      ));
      return retained.length ? [...retained, ...nextMessages] : nextMessages;
    });
    setHistoryPage((current) => current.beforeSequence === null
      ? {
          hasMore: Boolean(page.hasMore),
          beforeSequence: page.beforeSequence ?? null,
        }
      : current);
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

  function settlePendingReply() {
    const pending = pendingReplyRef.current;
    if (pending && String(pending.content || "").trim()) {
      setMessages((items) => [...items, { ...pending, pending: false }]);
    }
    clearPendingReply();
  }

  function commitPendingError(assistantId) {
    const pending = pendingReplyRef.current;
    if (pending?.id === assistantId && (String(pending.content || "").trim() || (pending.process || []).length)) {
      setMessages((items) => [...items, { ...pending, pending: false }]);
    }
    clearPendingReply();
  }

  return {
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
  };
}
