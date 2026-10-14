const regexTag = '__eleckoiKeywordRegex';
const encode = value => Object.prototype.toString.call(value) === '[object RegExp]'
  ? { [regexTag]: { source: value.source, flags: value.flags } } : value;
const decode = value => value && typeof value === 'object' && value[regexTag]
  ? new RegExp(value[regexTag].source, value[regexTag].flags) : value;

/** Only keyword values need a wire representation; the native library keeps the actual entries. */
function keywords(entries, convert) {
  return entries.map(entry => {
    const value = structuredClone(entry);
    for (const key of ['key', 'keysecondary', 'keys', 'filters']) {
      if (Array.isArray(value[key])) value[key] = value[key].map(convert);
    }
    if (value.strategy) {
      if (Array.isArray(value.strategy.keys)) value.strategy.keys = value.strategy.keys.map(convert);
      if (Array.isArray(value.strategy.keys_secondary?.keys)) value.strategy.keys_secondary.keys = value.strategy.keys_secondary.keys.map(convert);
    }
    return value;
  });
}
export const serializeWorldbookEntries = entries => keywords(entries, encode);
export const hydrateWorldbookEntries = entries => keywords(entries, decode);
