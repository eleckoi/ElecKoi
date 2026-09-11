import { useEffect, useRef } from 'react';
import {
  getChat,
  listenAgentFailedEvent,
  listenAgentFinishedEvent,
  listenAgentOutputEvent,
  listenAgentProcessEvent,
} from '../api/chatApi.js';

function upsertProcess(items = [], item) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

function publicError(error, fallback) {
  const message = typeof error === 'string' ? error : error?.message;
  return message?.trim() ? message.split(/\r?\n/, 1)[0].slice(0, 200) : fallback;
}

export function useAuthorFrontendActions({
  sessionId,
  setIsSending,
  setStatus,
  setMessages,
  reconcileChatMessages,
  setChatCharacter,
  normalizeLatestChatCharacter,
  refreshSessionsOnly,
  requestScrollToEnd,
}) {
  const runsRef = useRef(new Map());

  useEffect(() => {
    const refreshActiveChat = async (targetSessionId) => {
      if (!targetSessionId || targetSessionId !== sessionId) return;
      const data = await getChat(targetSessionId);
      reconcileChatMessages(data.chat);
      setChatCharacter(normalizeLatestChatCharacter(data.chat));
      await refreshSessionsOnly({ keepSection: true });
    };
    const onAuthorAction = (event) => {
      const detail = event.detail || {};
      if (detail.conversationId !== sessionId) return;
      if (detail.method === 'chat.send' && detail.result?.runId) {
        runsRef.current.set(detail.result.runId, detail.result.messageId || '');
        setIsSending(true);
        requestScrollToEnd('smooth');
      }
      refreshActiveChat(detail.conversationId).catch((error) => setStatus(publicError(error, '刷新聊天失败')));
    };
    const updateExternalMessage = (event, update) => {
      if (event.conversationId !== sessionId || !runsRef.current.has(event.runId)) return;
      setMessages((items) => items.map((message) => message.id === event.messageId ? update(message) : message));
    };
    window.addEventListener('eleckoi:author-action', onAuthorAction);
    const disposeDelta = listenAgentOutputEvent((event) => updateExternalMessage(event, (message) => ({
      ...message,
      pending: true,
      content: `${message.content || ''}${event.delta}`,
    })));
    const disposeProcess = listenAgentProcessEvent((event) => updateExternalMessage(event, (message) => ({
      ...message,
      process: upsertProcess(message.process, event.item),
    })));
    const disposeFinished = listenAgentFinishedEvent((event) => {
      if (!runsRef.current.delete(event.runId)) return;
      if (event.conversationId === sessionId) setIsSending(false);
      refreshActiveChat(event.conversationId).catch((error) => setStatus(publicError(error, '刷新聊天失败')));
    });
    const disposeFailed = listenAgentFailedEvent((event) => {
      if (!runsRef.current.delete(event.runId)) return;
      if (event.conversationId === sessionId) {
        setIsSending(false);
        setStatus(event.message || '生成失败');
      }
      refreshActiveChat(event.conversationId).catch(() => {});
    });
    return () => {
      window.removeEventListener('eleckoi:author-action', onAuthorAction);
      disposeDelta();
      disposeProcess();
      disposeFinished();
      disposeFailed();
    };
  }, [sessionId]);
}
