export function localDateLabel(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function createUsageDraft(profile) {
  return { kind: 'usage', value: profile.usageInstructions, initial: profile.usageInstructions };
}

export function createTimelineDraft(item = null, date = new Date()) {
  const value = item ? { ...item } : {
    id: `timeline-${globalThis.crypto.randomUUID()}`,
    title: '', dateLabel: localDateLabel(date), note: '',
  };
  return { kind: 'timeline', value, initial: { ...value }, isNew: !item };
}

export function isIntroductionDraftDirty(draft) {
  if (!draft) return false;
  if (draft.kind === 'usage') return draft.value !== draft.initial;
  return ['title', 'note', 'dateLabel'].some((field) => draft.value[field] !== draft.initial[field]);
}

export function visibleTimelineRecords(timeline, expanded, adding = false) {
  const records = expanded ? timeline : timeline.slice(0, adding ? 2 : 3);
  return { records, hiddenCount: timeline.length - records.length };
}

export function introductionDraftPatch(profile, draft) {
  if (draft.kind === 'usage') return { usageInstructions: draft.value };
  const item = { ...draft.value, title: draft.value.title.trim(), note: draft.value.note.trim() };
  if (!item.title && !item.note) throw new Error('填写更新标题或内容后再保存');
  if (draft.isNew) {
    if (profile.timeline.length >= 100) throw new Error('更新记录最多保留 100 条');
    return { timeline: [item, ...profile.timeline] };
  }
  return { timeline: profile.timeline.map((current) => current.id === item.id ? item : current) };
}

export function calendarDateValue(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return '';
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
}
