import { useEffect } from 'react';
import { getChat } from '../api/chatApi.js';

/** Reconcile externally started runs from the current conversation model. */
export function useExternalChatRuns({ sessionId, conversations, requestRef, setIsSending,
  setStatus, reconcileChatMessages, setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly }) {
  useEffect(() => {
    const refreshActiveChat = async () => {
      if (!sessionId) return;
      const data = await getChat(sessionId, { model: conversations });
      reconcileChatMessages(data.chat);
      setChatCharacter(normalizeLatestChatCharacter(data.chat));
      await refreshSessionsOnly({ keepSection: true });
    };
    let previousStream = conversations?.getStreamSnapshot?.() || null;
    const onStreamChanged = () => {
      const current = conversations?.getStreamSnapshot?.();
      if (!current || current.id !== sessionId) {
        previousStream = current || null;
        return;
      }
      if (current.status === 'running') setIsSending(true);
      const terminal = previousStream?.id === sessionId
        && previousStream.status === 'running' && current.status !== 'running';
      previousStream = current;
      if (!terminal) return;
      // Product submissions settle their own optimistic transcript and busy state.
      if (!requestRef?.current) setIsSending(false);
      if (current.status === 'error') setStatus(current.error || '生成失败');
      refreshActiveChat().catch(error => setStatus(
        (typeof error === 'string' ? error : error?.message)?.trim() || '刷新聊天失败'));
    };
    return conversations?.subscribeStream?.(onStreamChanged);
  }, [sessionId]);
}
