import { sourceText } from "../../../app/i18n/productCopy.js";
export function formatLiveRunDuration(ms, tUi = sourceText) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  if (hours > 0) return tUi("{value0}小时{value1}分{value2}秒", {value0: hours, value1: minutes, value2: seconds});
  return minutes > 0 ? tUi("{value0}分{value1}秒", {value0: minutes, value1: seconds}) : tUi("{value0}秒", {value0: seconds});
}

export function isProcessTimingRunning(message) {
  return (message?.pending === true || message?.status === 'streaming' || message?.status === 'running')
    && Number.isFinite(message?.processTiming?.startedAtMillis)
    && !Number.isFinite(message?.processTiming?.completedAtMillis);
}

export function processDurationText(message, now, tUi = sourceText) {
  const start = message?.processTiming?.startedAtMillis;
  const end = message?.processTiming?.completedAtMillis;
  if (!Number.isFinite(start)) return '';
  const stop = Number.isFinite(end) ? end : isProcessTimingRunning(message) ? now : undefined;
  return Number.isFinite(stop) ? formatLiveRunDuration(Math.max(1000, stop - start), tUi) : '';
}
