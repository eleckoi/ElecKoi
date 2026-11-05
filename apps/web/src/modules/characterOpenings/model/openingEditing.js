export function primaryFirstOpeningMessages(entry) {
  const messages = entry.openingMessages?.length
    ? entry.openingMessages
    : [{ id: "opening-default", title: "默认开场", content: entry.content || "" }];
  const primary = messages.find((message) => message.id === entry.defaultOpeningMessageId) || messages[0];
  return [primary, ...messages.filter((message) => message.id !== primary.id)];
}

function withOpeningMessages(entry, messages, defaultMessageId) {
  const primary = messages.find((message) => message.id === defaultMessageId) || messages[0];
  return {
    ...entry,
    openingMessages: messages,
    defaultOpeningMessageId: primary.id,
  };
}

export function createBackupOpening(entry) {
  const messages = primaryFirstOpeningMessages(entry);
  const next = { id: `opening-${crypto.randomUUID()}`, title: "", content: "" };
  return { entry: withOpeningMessages(entry, [...messages, next], messages[0].id), createdId: next.id };
}

export function updateOpening(entry, messageId, patch) {
  const messages = primaryFirstOpeningMessages(entry).map((message) => message.id === messageId
    ? { ...message, ...patch, title: Object.hasOwn(patch, "title") ? patch.title : message.title }
    : message);
  return withOpeningMessages(entry, messages, messages[0].id);
}

export function duplicateOpening(entry, messageId) {
  const messages = primaryFirstOpeningMessages(entry);
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  if (sourceIndex < 0) return { entry, createdId: "" };
  const source = messages[sourceIndex];
  const copy = {
    ...source,
    id: `opening-${crypto.randomUUID()}`,
    title: source.title.trim() ? `${source.title} 副本` : "",
  };
  const next = [...messages];
  next.splice(sourceIndex + 1, 0, copy);
  return { entry: withOpeningMessages(entry, next, messages[0].id), createdId: copy.id };
}

export function moveBackupOpening(entry, messageId, offset) {
  const messages = primaryFirstOpeningMessages(entry);
  const fromIndex = messages.findIndex((message) => message.id === messageId);
  const toIndex = fromIndex + offset;
  if (fromIndex <= 0 || toIndex < 1 || toIndex >= messages.length) return entry;
  const next = [...messages];
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
  return withOpeningMessages(entry, next, messages[0].id);
}

export function deleteOpening(entry, messageId) {
  const messages = primaryFirstOpeningMessages(entry);
  if (messages.length <= 1) return entry;
  const remaining = messages.filter((message) => message.id !== messageId);
  const defaultMessageId = messageId === messages[0].id ? remaining[0].id : messages[0].id;
  return withOpeningMessages(entry, remaining, defaultMessageId);
}
