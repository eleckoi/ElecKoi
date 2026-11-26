import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect, useMemo, useState } from 'react';
import { runRegexEjs } from './runtime/runRegexEjs.js';
import { hasRegexEjsOutput } from '@shared/foundation/regex/RegexEjsMarkers';
import { finalReplyText } from '@shared/foundation/finalReply';

export function useRegexEjsDisplay(message, content) {
  const input = useMemo(() => {
    if (message.pending || message.status === 'streaming' || !hasRegexEjsOutput(content)) return null;
    let variables = null, error = '';
    try {
      if (message.variableSnapshotAvailable === false) variables = null;
      else if (message.variableState !== undefined) variables = message.variableState;
      else {
        const json = message.nativeVariableStateJson ?? message.variableStateJson;
        if (json !== undefined) variables = JSON.parse(json);
      }
      if (variables !== null && (!variables || typeof variables !== 'object' || Array.isArray(variables))) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '消息变量快照必须是 JSON 对象。', { what: '消息变量快照' });
    } catch (cause) { error = cause.message; }
    return { content, rawContent: message.content ?? '', surface: 'Display', variables, error, message: { id: message.id, conversationId: message.conversationId,
      role: message.role, status: message.status ?? 'complete', content: message.content ?? '' } };
  }, [content, message.id, message.conversationId, message.role, message.status, message.pending,
    message.content, message.variableState, message.nativeVariableStateJson, message.variableStateJson, message.variableSnapshotAvailable]);
  const [accepted, setAccepted] = useState(null);
  const original = message.role === 'assistant' && !message.roleplayReply ? finalReplyText(message.content ?? '') : message.content ?? '';
  useEffect(() => {
    if (!input) return undefined;
    const controller = new AbortController();
    if (input.error) setAccepted({ input, content: original, error: input.error });
    else void runRegexEjs(input, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setAccepted({ input, content: result.content,
        error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setAccepted({ input, content: original, error: error.message });
    });
    return () => controller.abort();
  }, [input]);
  const sameSource = accepted && input && accepted.input.message.id === input.message.id
    && accepted.input.message.conversationId === input.message.conversationId
    && accepted.input.message.content === input.message.content;
  if (!input) return { content, error: '', pending: false };
  if (sameSource) return { content: accepted.content, error: accepted.error, pending: false };
  return { content: original, error: '', pending: true };
}
