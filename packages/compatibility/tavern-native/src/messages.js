function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function indexOf(value, length, allowEnd = false) {
  const number = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isSafeInteger(number)) throw new TypeError('A message index must be an integer.');
  const index = number < 0 ? length + number : number;
  if (index < 0 || index > length || (!allowEnd && index === length)) {
    throw new RangeError(`Message index ${number} is outside the loaded chat.`);
  }
  return index;
}

function rangeIndices(range, length) {
  if (!length) return [];
  if (typeof range === 'number') return [indexOf(range, length)];
  const source = String(range).trim().replaceAll('{{lastMessageId}}', String(length - 1));
  if (/^-?\d+$/.test(source)) return [indexOf(source, length)];
  const match = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(source);
  if (!match) throw new TypeError('A message range must be an index or an inclusive range such as "0-5".');
  const begin = indexOf(match[1], length), end = indexOf(match[2], length);
  return Array.from({ length: Math.max(0, end - begin + 1) }, (_, offset) => begin + offset);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function options(value = {}) {
  object(value, 'Message options');
  const refresh = value.refresh ?? 'affected';
  if (!['none', 'affected', 'all'].includes(refresh)) throw new TypeError('refresh must be none, affected, or all.');
  return { ...value, refresh };
}

function patchOf(input, creating = false) {
  object(input, 'A chat message');
  const patch = {};
  const fields = {
    message: 'content', name: 'speakerName', role: 'role', data: 'variableState',
    is_hidden: 'isHidden', swipe_id: 'swipeId', swipes: 'swipes',
    swipes_data: 'swipesData', swipes_info: 'swipesInfo', extra: 'extra',
  };
  for (const [source, target] of Object.entries(fields)) {
    if (Object.hasOwn(input, source)) patch[target] = clone(input[source]);
  }
  if (creating && !Object.hasOwn(patch, 'content')) patch.content = '';
  if (creating && !Object.hasOwn(patch, 'role')) patch.role = 'assistant';
  if (Object.hasOwn(patch, 'content') && typeof patch.content !== 'string') throw new TypeError('message must be text.');
  if (Object.hasOwn(patch, 'speakerName') && typeof patch.speakerName !== 'string') throw new TypeError('name must be text.');
  if (Object.hasOwn(patch, 'role') && !['user', 'assistant', 'system'].includes(patch.role)) {
    throw new TypeError('role must be user, assistant, or system.');
  }
  if (Object.hasOwn(patch, 'isHidden') && typeof patch.isHidden !== 'boolean') throw new TypeError('is_hidden must be boolean.');
  if (Object.hasOwn(patch, 'variableState')) object(patch.variableState, 'Message data');
  if (Object.hasOwn(patch, 'swipeId') && (!Number.isSafeInteger(patch.swipeId) || patch.swipeId < 0)) {
    throw new TypeError('swipe_id must be a nonnegative integer.');
  }
  if (Object.hasOwn(patch, 'swipes') && (!Array.isArray(patch.swipes) || !patch.swipes.length
    || patch.swipes.some(swipe => typeof swipe !== 'string'))) throw new TypeError('swipes must be a nonempty text array.');
  for (const field of ['swipesData', 'swipesInfo']) {
    if (Object.hasOwn(patch, field) && !Array.isArray(patch[field])) throw new TypeError(`${field} must be an array.`);
  }
  return patch;
}

function messageView(message, index, includeSwipes) {
  const openings = message.openingOptions ?? [];
  const hasSwipes = Array.isArray(message.swipes) && message.swipes.length > 0;
  const swipes = hasSwipes ? message.swipes : openings.length
    ? openings.map(opening => opening.content) : [message.content];
  const selectedOpening = openings.findIndex(opening => opening.id === message.selectedOpeningId);
  const swipeId = message.swipeId ?? (selectedOpening < 0 ? 0 : selectedOpening);
  const data = message.variableState ?? {};
  const result = {
    message_id: index,
    name: message.speakerName ?? '',
    role: message.role,
    message: message.content,
    data: clone(data),
    is_hidden: message.isHidden ?? false,
    swipe_id: swipeId,
    extra: clone(message.extra ?? {}),
  };
  if (includeSwipes) {
    result.swipes = clone(swipes);
    result.swipes_data = clone(message.swipesData ?? (openings.length
      ? openings.map(opening => opening.initialVariableState ?? {}) : swipes.map(() => data)));
    result.swipes_info = clone(message.swipesInfo ?? swipes.map(() => ({})));
  }
  return result;
}

function browserWindows(view) {
  const result = [view];
  for (let index = 0; index < result.length; index++) {
    try {
      const parent = result[index].parent;
      if (parent && !result.includes(parent)) {
        void parent.document;
        result.push(parent);
      }
    } catch { /* Cross-origin parent documents are not accessible. */ }
  }
  return result;
}

/** The transcript stays owned by ElecKoi; public message IDs are its loaded message positions. */
export function createMessageApi(rt) {
  const messages = () => rt.snapshot.messages;
  const resolve = value => {
    const items = messages();
    const index = indexOf(value, items.length);
    return { index, message: items[index] };
  };

  const getChatMessages = (range = '0-{{lastMessageId}}', filter = {}) => {
    object(filter, 'Message filter');
    const role = filter.role ?? 'all', hideState = filter.hide_state ?? 'all';
    if (!['all', 'system', 'user', 'assistant'].includes(role)) throw new TypeError('Unknown role filter.');
    if (!['all', 'hidden', 'unhidden'].includes(hideState)) throw new TypeError('Unknown hide_state filter.');
    const items = messages();
    return rangeIndices(range, items.length).map(index => messageView(items[index], index, filter.include_swipes === true))
      .filter(message => (role === 'all' || role === message.role)
        && (hideState === 'all' || message.is_hidden === (hideState === 'hidden')));
  };

  const setChatMessages = async (updates, rawOptions = {}) => {
    if (!Array.isArray(updates)) throw new TypeError('Chat message updates must be an array.');
    const settings = options(rawOptions);
    const changes = updates.map(update => ({ id: resolve(update.message_id).message.id, patch: patchOf(update) }));
    if (!changes.length) return;
    await rt.commit('messages.update', { updates: changes, options: settings });
  };

  const createChatMessages = async (newMessages, rawOptions = {}) => {
    if (!Array.isArray(newMessages)) throw new TypeError('New chat messages must be an array.');
    const settings = options(rawOptions), items = messages();
    const insert = settings.insert_before ?? settings.insert_at;
    const at = insert === undefined || insert === 'end' ? items.length : indexOf(insert, items.length, true);
    const additions = newMessages.map(message => patchOf(message, true));
    if (!additions.length) return;
    await rt.commit('messages.create', {
      messages: additions, beforeId: items[at]?.id ?? null, options: settings,
    });
  };

  const deleteChatMessages = async (messageIds, rawOptions = {}) => {
    if (!Array.isArray(messageIds)) throw new TypeError('Message IDs must be an array.');
    const settings = options(rawOptions);
    const ids = [...new Set(messageIds.map(id => resolve(id).message.id))];
    if (!ids.length) return;
    await rt.commit('messages.delete', { ids, options: settings });
  };

  const rotateChatMessages = async (begin, middle, end, rawOptions = {}) => {
    const settings = options(rawOptions), items = messages();
    const first = indexOf(begin, items.length, true), split = indexOf(middle, items.length, true);
    const last = indexOf(end, items.length, true);
    if (first > split || split > last) throw new RangeError('Rotation requires begin <= middle <= end.');
    if (first === split || split === last) return;
    const ordered = [...items.slice(0, first), ...items.slice(split, last), ...items.slice(first, split), ...items.slice(last)];
    await rt.commit('messages.rotate', { begin: first, middle: split, end: last, ids: ordered.map(message => message.id), options: settings });
  };

  const retrieveDisplayedMessage = messageId => {
    const { index, message } = resolve(messageId), views = browserWindows(rt.window);
    const jquery = views.map(view => view.jQuery ?? view.$).find(value => typeof value === 'function' && value.fn?.jquery);
    if (!jquery) throw new Error('The chat document does not have jQuery loaded.');
    for (const view of views) {
      const nodes = [...view.document.querySelectorAll('[data-message-id], [data-eleckoi-message-id], .mes[mesid]')]
        .filter(node => node.getAttribute('data-message-id') === message.id
          || node.getAttribute('data-eleckoi-message-id') === message.id
          || (node.matches('.mes[mesid]') && node.getAttribute('mesid') === String(index)));
      if (nodes.length) return jquery(nodes);
    }
    return jquery([]);
  };

  const formatAsDisplayedMessage = (text, rawOptions = {}) => {
    if (typeof text !== 'string') throw new TypeError('Message text must be a string.');
    object(rawOptions, 'Formatting options');
    const settings = { ...rawOptions };
    if (settings.message_id !== undefined) {
      const { index, message } = resolve(settings.message_id);
      settings.message_id = index;
      settings.messageId = message.id;
    }
    return rt.formatMessage(text, settings);
  };

  const refreshOneMessage = async (messageId, rawOptions = {}) => {
    const { index, message } = resolve(messageId);
    return rt.refreshMessage(index, { ...options(rawOptions), messageId: message.id });
  };

  return {
    getChatMessages, setChatMessages, createChatMessages, deleteChatMessages,
    rotateChatMessages, retrieveDisplayedMessage, formatAsDisplayedMessage, refreshOneMessage,
  };
}
