import { useEffect, useMemo, useRef, useState } from "react";

const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GENERATION_LINE_FIELDS = [
  "turns",
  "steps",
  "llmMs",
  "toolMs",
  "ttftMs",
  "ttftSteps",
  "decodeMs",
  "decodeTokens",
  "tokenUsage",
];

export function GenerationStatsLine({ stats }) {
  const groups = useMemo(() => generationStatGroups(stats), [stats]);
  if (!groups.length) return null;
  const title = groups.join(" | ");
  return (
    <div
      className="generation-stats-line"
      title={title}
      aria-label={title}
    >
      {groups.map((group) => (
        <span key={group} className="generation-stats-item">{group}</span>
      ))}
    </div>
  );
}

export function ContextMeter({ stats }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const context = contextOccupancy(stats?.contextPressure);

  useEffect(() => {
    if (!context) setOpen(false);
  }, [context]);

  useEffect(() => {
    if (!open || !context) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [context, open]);

  if (!context) return null;
  const breakdown = stats?.contextBreakdown;
  const rows = contextBreakdownRows(breakdown);

  return (
    <span className="context-meter" ref={rootRef}>
      <button
        type="button"
        className="context-meter-trigger"
        aria-label={`上下文已用 ${context.percentLabel}%`}
        title={`上下文已用 ${context.percentLabel}%`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
          <circle className="context-meter-track" cx="7" cy="7" r={RADIUS} />
          <circle
            className="context-meter-fill"
            cx="7"
            cy="7"
            r={RADIUS}
            strokeDasharray={`${CIRCUMFERENCE * context.percent / 100} ${CIRCUMFERENCE}`}
            transform="rotate(-90 7 7)"
          />
        </svg>
      </button>
      {open ? (
        <div className="context-meter-panel" role="dialog" aria-label="上下文已用">
          <div className="context-meter-heading">
            <span>上下文已用 <strong>{context.percentLabel}%</strong></span>
            <b>{`~${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)}`}</b>
          </div>
          <div className="context-meter-bar" aria-hidden="true">
            <i className="total" style={{ width: `${context.percent}%` }} />
          </div>
          {breakdown ? (
            <dl className="context-meter-rows">
              {rows.map((row) => (
                <div key={row.key}>
                  <dt><i className={row.className} />{row.label}</dt>
                  <dd>{`~${formatTokens(row.value)}`}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export function contextBreakdownRows(breakdown) {
  if (!breakdown) return [];
  const rows = [
    { key: "systemTokens", label: "系统提示词", className: "system", value: breakdown.systemTokens || 0 },
    { key: "toolsTokens", label: "工具定义", className: "tools", value: breakdown.toolsTokens || 0 },
    { key: "messageTokens", label: "对话消息", className: "messages", value: breakdown.messageTokens || 0 },
  ];
  return rows;
}

export function generationStatGroups(stats) {
  if (!stats) return [];
  const groups = [];
  if (stats.steps > 0) {
    groups.push(`${stats.turns} 轮 · ${stats.steps} 步`);
    const durations = [];
    if (stats.llmMs > 0) durations.push(`LLM ${formatDuration(stats.llmMs)}`);
    if (stats.toolMs > 0) durations.push(`工具调用 ${formatDuration(stats.toolMs)}`);
    if (durations.length) groups.push(durations.join(" · "));
    const speeds = [];
    if (stats.ttftSteps > 0) speeds.push(`首 token 平均 ${formatDuration(stats.ttftMs / stats.ttftSteps)}`);
    if (stats.decodeMs > 0) speeds.push(`${formatThroughput(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s`);
    if (speeds.length) groups.push(speeds.join(" · "));
  }
  const usage = stats.tokenUsage;
  const input = billedInputTokens(usage);
  if (usage && (input > 0 || usage.outputTokens > 0)) {
    const cacheHit = cacheHitPercent(usage);
    if (cacheHit !== null) groups.push(`缓存命中 ${cacheHit}%`);
    groups.push(`输入 ${formatTokens(input)} tok · 输出 ${formatTokens(usage.outputTokens)} tok`);
  }
  return groups;
}

export function billedInputTokens(usage) {
  if (!usage) return 0;
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

export function cacheHitPercent(usage) {
  const denominator = billedInputTokens(usage);
  if (denominator === 0) return null;
  const missedInputTokens = usage.uncachedInputTokens + usage.cacheWriteTokens;
  if (missedInputTokens === 0) return "100";

  const integerPercent = roundedIntegerPercent(usage.cacheReadTokens, denominator);
  if (integerPercent < 100) return String(integerPercent);

  let decimalPlaces = 1;
  let scaledDoubleGap = missedInputTokens * 200;
  const denominatorTens = Math.floor(denominator / 10);
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10;
    decimalPlaces += 1;
  }
  const denominatorOnes = denominator % 10;
  let roundedLoss = 5;
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1;
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10);
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss;
      break;
    }
  }
  return `99.${"9".repeat(decimalPlaces - 1)}${10 - roundedLoss}`;
}

function roundedIntegerPercent(cacheReadTokens, denominator) {
  const denominatorQuotient = Math.floor(denominator / 200);
  const denominatorRemainder = denominator % 200;
  let lower = 0;
  let upper = 100;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2);
    const factor = candidate * 2 - 1;
    const threshold = factor * denominatorQuotient
      + Math.ceil(factor * denominatorRemainder / 200);
    if (cacheReadTokens >= threshold) lower = candidate;
    else upper = candidate - 1;
  }
  return lower;
}

export function contextOccupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
  if (usedTokens == null || pressure?.contextWindow == null) return null;
  const percent = Math.min(100, Math.round(usedTokens / pressure.contextWindow * 1_000_000) / 10_000);
  return {
    percent,
    percentLabel: percent > 0 && percent < 0.1
      ? "<0.1"
      : String(percent < 1 ? Math.round(percent * 10) / 10 : Math.round(percent)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  };
}

export function retainVisibleGenerationStats(previous, next) {
  if (!previous) return next ?? null;
  if (!next) return previous;

  const retained = { ...next };
  if (!generationStatGroups(next).length && generationStatGroups(previous).length) {
    for (const field of GENERATION_LINE_FIELDS) retained[field] = previous[field];
  }
  if (!contextOccupancy(next.contextPressure) && contextOccupancy(previous.contextPressure)) {
    retained.contextPressure = previous.contextPressure;
    retained.contextBreakdown = previous.contextBreakdown;
  }
  return retained;
}

export function formatTokens(value) {
  const scaled = (number) => number >= 100 ? String(Math.round(number)) : String(Math.round(number * 10) / 10);
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${scaled(value / 1000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}

export function formatDuration(milliseconds) {
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m${whole % 60}s`;
}

function formatThroughput(value) {
  if (!Number.isFinite(value)) return "0";
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}
