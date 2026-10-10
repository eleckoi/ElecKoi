export { normalizeWorldbook, defaultWorldbookSettings, worldbookScanSettings } from './codec.js';
export { scanWorldbooks, worldbookEntryHash } from './scanner.js';
export { worldbookOrderedKeys, worldbookVectorMatches, worldbookFragments, worldbookExampleContent, projectWorldbookAnchors, projectFrozenWorldbookMessages } from './projection.js';
export { NativeWorldbookAdapter } from './native-adapter.js';
export { worldbookTimedEffect } from './timing.js';

/** Freeze one Agent round's worldbook projection before its first model request. */
export async function freezeWorldbookRound(adapter, request) {
  const conversationId = request.conversationId;
  if (!conversationId) throw new TypeError('Worldbook scan must capture a conversationId');
  const captured = { ...request, books: structuredClone(request.books), messages: [...(request.messages ?? [])],
    settings: structuredClone(request.settings ?? {}), scanContext: structuredClone(request.scanContext ?? {}),
    forcedEntries: structuredClone(request.forcedEntries ?? {}), vectorMatches: request.vectorMatches && new Set(request.vectorMatches) };
  const { scanWorldbooks } = await import('./scanner.js');
  const timedState = await adapter.readTiming(conversationId);
  const result = await scanWorldbooks({ ...captured, timedState });
  if (!captured.dryRun) adapter.atomic(() => {
    adapter.saveTiming(conversationId, result.timedState);
    adapter.saveLastScan(conversationId, result);
  });
  const frozen = structuredClone(result);
  const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
  return freeze(frozen);
}
