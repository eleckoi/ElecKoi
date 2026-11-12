import { useEffect } from 'react';
import { getChat } from '../api/chatApi.js';

/** Reconcile externally started runs from the current conversation model. */
export function useExternalChatRuns({ sessionId, conversations,
  setStatus, reconcileChatMessages, setChatCharacter, normalizeLatestChatCharacter, refreshSessionsOnly }) {
  useEffect(() => {
    let active = true;
    const refreshActiveChat = async () => {
      if (!active || !sessionId || conversations?.getDetailsSnapshot?.().id !== sessionId) return;
      const data = await getChat(sessionId, { model: conversations });
      if (!active || conversations?.getDetailsSnapshot?.().id !== sessionId) return;
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
      const terminal = previousStream?.id === sessionId
        && previousStream.status === 'running' && current.status !== 'running';
      previousStream = current;
      if (!terminal) return;
      if (current.status === 'error') setStatus(current.error || '生成失败');
      refreshActiveChat().catch(error => {
        if (active && conversations?.getDetailsSnapshot?.().id === sessionId) {
          setStatus((typeof error === 'string' ? error : error?.message)?.trim() || '刷新聊天失败');
        }
      });
    };
    const stop = conversations?.subscribeStream?.(onStreamChanged);
    return () => { active = false; stop?.(); };
  }, [sessionId]);
}
