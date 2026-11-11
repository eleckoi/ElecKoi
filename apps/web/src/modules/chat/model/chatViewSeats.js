// Read-only render adapters: DSH owns input admission and echo retirement.
// This module does not retain transcript or pending-message state.
const messageIndices = new WeakMap();
const userSeats = new WeakMap();
function messageIndex(messages) {
  let lookup = messageIndices.get(messages);
  if (lookup) return lookup;
  lookup = new Map();
  messages.forEach((message, index) => {
    for (const [field, value] of [['renderKey', message.renderKey], ['sequence', message.sessionEventSeq], ['request', message.requestId]]) {
      if (value === undefined || value === '') continue;
      const key = JSON.stringify([typeof message.runtimeSessionId, message.runtimeSessionId, field, value]);
      if (!lookup.has(key)) lookup.set(key, index);
    }
  });
  messageIndices.set(messages, lookup);
  return lookup;
}
function indexOf(messages, session, field, value) {
  if (value === undefined || value === '') return -1;
  return messageIndex(messages).get(JSON.stringify([typeof session, session, field, value])) ?? -1;
}
function inputAttachments(content = []) {
  return {
    inputImageAttachments: content.filter(block => block.type === 'image').map(block => block.attachment),
    inputFileAttachments: content.filter(block => block.type === 'file').map(block => block.attachment),
  };
}

export function selectRoleplayChatSeat(messages, runtimeSessionId, node) {
  if (node.kind === 'turn-process') {
    const turn = node.location?.turn?.turn;
    if (!Number.isSafeInteger(turn)) return null;
    const key = `dsh-reply-${runtimeSessionId}-${turn}`;
    const index = indexOf(messages, runtimeSessionId, 'renderKey', key);
    return index < 0 ? null : { item: messages[index], index };
  }
  if (node.kind !== 'user' && node.kind !== 'steering') {
    // These built-in details stay in the trajectory or the roleplay process row.
    // Every other node belongs to its registered DSH or plugin renderer.
    return ['context', 'turn-trigger', 'system-prompt', 'assistant-step', 'tool-call', 'compaction', 'model-retry',
      'turn-error', 'turn-max-tokens', 'turn-tail']
      .includes(node.kind) ? null : undefined;
  }
  const input = node.data;
  const requestId = input.source?.kind === 'user' ? input.source.rpcId : undefined;
  const bySequence = indexOf(messages, runtimeSessionId, 'sequence', input.seq);
  const byRequest = indexOf(messages, runtimeSessionId, 'request', requestId);
  const index = bySequence < 0 ? byRequest : byRequest < 0 ? bySequence : Math.min(bySequence, byRequest);
  if (index >= 0 && !messages[index].pending) {
    const message = messages[index];
    let previous = userSeats.get(message);
    if (previous?.key !== node.key) {
      previous = { key: node.key, item: message.renderKey === node.key ? message : { ...message, renderKey: node.key } };
      userSeats.set(message, previous);
    }
    return { item: previous.item, index };
  }
  // A formal Node can arrive before product metadata. Metadata must not gate
  // an admitted input's visibility; the official Seat retains its identity.
  return {
    index: index < 0 ? messages.length : index,
    item: {
      ...(index < 0 ? {} : messages[index]),
      id: input.messageId || node.key,
      renderKey: node.key,
      runtimeSessionId, requestId, dshMessageId: input.messageId || '',
      dshNodeKey: node.key, sessionEventSeq: input.seq, sequence: input.seq,
      role: 'user', pending: false, status: 'complete',
      content: input.content.filter(block => block.type === 'text').map(block => block.text).join(''),
      created_at: new Date(input.time).toISOString(), ...inputAttachments(input.content),
    },
  };
}

export function selectRoleplayPendingInput(messages, runtimeSessionId, input) {
  const requestId = 'requestId' in input ? input.requestId : input.source?.rpcId;
  const index = indexOf(messages, runtimeSessionId, 'request', requestId);
  if (index >= 0) return { item: { ...messages[index], pending: true }, index };
  const submission = 'requestId' in input;
  return {
    index: messages.length,
    item: {
      id: `dsh-pending-${requestId || input.id}`, runtimeSessionId, requestId,
      role: 'user', pending: true, status: 'streaming',
      content: submission ? input.text : input.content.filter(block => block.type === 'text').map(block => block.text).join(''),
      created_at: submission ? new Date(input.time).toISOString() : undefined,
      ...(submission ? {
        inputImageAttachments: input.attachments.flatMap((item, attachmentIndex) => item.type === 'image'
          ? [{ ...item.value, attachmentId: `pending-${requestId}-${attachmentIndex}` }] : []),
        inputFileAttachments: input.attachments.filter(item => item.type === 'file').map(item => item.value),
      } : inputAttachments(input.content)),
    },
  };
}
