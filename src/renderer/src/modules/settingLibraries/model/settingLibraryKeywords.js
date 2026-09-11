const KEYWORD_DELIMITER = /[,，、\n]/;

export function normalizeKeywordValues(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

export function commitKeywordDraft(keywords, draft) {
  return normalizeKeywordValues([
    ...keywords,
    ...String(draft).split(KEYWORD_DELIMITER),
  ]);
}

export function splitKeywordDraft(keywords, draft) {
  const value = String(draft);
  const delimiterIndexes = [...value.matchAll(new RegExp(KEYWORD_DELIMITER.source, "g"))];
  if (!delimiterIndexes.length) return { keywords, draft: value };
  const lastDelimiter = delimiterIndexes.at(-1).index;
  return {
    keywords: commitKeywordDraft(keywords, value.slice(0, lastDelimiter)),
    draft: value.slice(lastDelimiter + 1),
  };
}
