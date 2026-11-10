export const variableContainer = value => value !== null && typeof value === 'object';
export const variablePointer = path => path.length ? '/' + path.map(key => String(key).replaceAll('~', '~0').replaceAll('/', '~1')).join('/') : '';
export function variableAt(root, path) {
  let value = root;
  for (const key of path) {
    if (!variableContainer(value) || !Object.hasOwn(value, key)) return { present: false, value: undefined };
    value = value[key];
  }
  return { present: true, value };
}
export function variableSearch(root, query) {
  const matches = [], pending = [{ value: root, path: [] }], needle = query.toLocaleLowerCase();
  while (pending.length) {
    const item = pending.pop(), entries = variableContainer(item.value) ? Object.entries(item.value) : [];
    if (entries.length) {
      for (let i = entries.length - 1; i >= 0; i--) pending.push({ path: [...item.path, entries[i][0]], value: entries[i][1] });
    } else if (item.path.length && `${item.path.join('/')} ${JSON.stringify(item.value)}`.toLocaleLowerCase().includes(needle)) matches.push(item);
  }
  return matches;
}
export function variableDifferences(previous, current) {
  const changes = [], pending = [{ path: [], before: previous, after: current, beforePresent: true, afterPresent: true }];
  while (pending.length) {
    const item = pending.pop();
    if (item.beforePresent === item.afterPresent && JSON.stringify(item.before) === JSON.stringify(item.after)) continue;
    const beforeObject = variableContainer(item.before) && !Array.isArray(item.before);
    const afterObject = variableContainer(item.after) && !Array.isArray(item.after);
    const keys = (beforeObject || !item.beforePresent) && (afterObject || !item.afterPresent)
      ? [...new Set([...Object.keys(item.before || {}), ...Object.keys(item.after || {})])] : [];
    if (keys.length) {
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        pending.push({ path: [...item.path, key], before: item.before?.[key], after: item.after?.[key],
          beforePresent: beforeObject && Object.hasOwn(item.before, key), afterPresent: afterObject && Object.hasOwn(item.after, key) });
      }
    } else if (item.path.length) changes.push(item);
  }
  return changes;
}
