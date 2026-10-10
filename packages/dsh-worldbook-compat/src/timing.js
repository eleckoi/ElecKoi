import { normalizeWorldbook, clone, object } from './codec.js';
import { worldbookEntryHash } from './scanner.js';

/** Read/update one captured conversation's durable timed-effect record. */
export function worldbookTimedEffect({ book, name, uid, effect, timedState = {}, messageCount, state }) {
  effect = String(effect).trim().toLowerCase();
  if (!['sticky', 'cooldown', 'delay'].includes(effect)) throw new TypeError(`Invalid worldbook timed effect: ${effect}`);
  const entry = normalizeWorldbook(book).entries.find(entry => String(entry.uid) === String(uid));
  if (!entry) throw new Error(`Worldbook entry does not exist: ${name}/${uid}`);
  if (!Number.isInteger(messageCount) || messageCount < 0) throw new TypeError('Timed effects require the captured message count');
  const duration = entry.effect[effect] ?? entry[effect] ?? 0, key = `${name}:${uid}`, hash = worldbookEntryHash(entry);
  const timing = clone(timedState), previous = object(timing[key]);
  const record = previous.hash === hash ? clone(previous) : {};
  const remaining = Math.max(0, (record[effect]?.end ?? messageCount) - messageCount);
  if (state !== undefined) {
    if (duration <= 0) throw new Error(`Configure a positive ${effect} duration before enabling the effect`);
    const input = String(state).toLowerCase();
    const enabled = ['toggle', 't', ''].includes(input) ? remaining === 0 : ['true', 'on', '1'].includes(input) ? true : ['false', 'off', '0'].includes(input) ? false : remaining > 0;
    record.hash = hash; delete record[effect];
    if (enabled) record[effect] = { start: messageCount, end: messageCount + duration, protected: true, hash };
    timing[key] = record;
  }
  const metadata = record[effect] ?? null, left = Math.max(0, (metadata?.end ?? messageCount) - messageCount);
  return { result: { active: left > 0, remaining: left, metadata }, timedState: timing };
}
