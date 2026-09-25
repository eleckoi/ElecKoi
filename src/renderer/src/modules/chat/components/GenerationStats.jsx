import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [openPill, setOpenPill] = useState(null);
  const timeRef = useRef(null);
  const usageRef = useRef(null);
  const panelRef = useRef(null);
  const position = usePopupPosition(openPill, openPill === "time" ? timeRef : usageRef, 340);
  const timeRows = useMemo(() => sessionTimeRows(stats), [stats]);
  const usage = stats?.tokenUsage;
  const totalTokens = billedInputTokens(usage) + (usage?.outputTokens || 0);
  const hasTime = stats?.steps > 0;
  const hasUsage = totalTokens > 0;
  const cacheHit = cacheHitPercent(usage);

  useEffect(() => {
    if ((openPill === "time" && !hasTime) || (openPill === "usage" && !hasUsage)) setOpenPill(null);
  }, [hasTime, hasUsage, openPill]);

  useEffect(() => {
    if (!openPill) return undefined;
    const onPointerDown = (event) => {
      const activeTrigger = openPill === "time" ? timeRef.current : usageRef.current;
      if (!activeTrigger?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpenPill(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpenPill(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openPill]);

  if (!hasTime && !hasUsage && !contextOccupancy(stats?.contextPressure)) return null;
  const speed = stats?.decodeMs > 0
    ? `${formatThroughput(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s`
    : null;
  const timeLabel = `${stats?.turns || 0} 轮 ${stats?.steps || 0} 步${speed ? ` · ${speed}` : ""}`;
  const usageLabel = `${formatTokens(totalTokens)} tok${cacheHit !== null ? ` · 缓存命中 ${cacheHit}%` : ""}`;
  const panelTitle = openPill === "time" ? "会话统计" : "Token 用量";
  return (
    <div className="generation-stats-line">
      {hasTime ? <span className="generation-stat-anchor" ref={timeRef}>
        {timeRows.length ? <button type="button" className="generation-stat-pill" aria-label={timeLabel} aria-haspopup="dialog" aria-expanded={openPill === "time"} onClick={() => setOpenPill(openPill === "time" ? null : "time")}>
          <GaugeIcon /><span>{timeLabel}</span>
        </button> : <span className="generation-stat-pill"><GaugeIcon /><span>{timeLabel}</span></span>}
      </span> : null}
      {hasUsage ? <span className="generation-stat-anchor" ref={usageRef}>
        <button type="button" className="generation-stat-pill" aria-label={usageLabel} aria-haspopup="dialog" aria-expanded={openPill === "usage"} onClick={() => setOpenPill(openPill === "usage" ? null : "usage")}>
          <DatabaseIcon /><span>{usageLabel}</span>
        </button>
      </span> : null}
      <ContextMeter stats={stats} />
      {openPill && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} className="generation-stat-panel" role="dialog" aria-label={panelTitle} style={position || { visibility: "hidden" }}>
          <div className="generation-stat-heading">
            <span>{openPill === "time" ? <GaugeIcon /> : <DatabaseIcon />}{panelTitle}</span>
            {openPill === "usage" ? <strong>{formatExactTokens(totalTokens)} tok</strong> : null}
          </div>
          <dl className="generation-stat-details">
            {(openPill === "time" ? timeRows : sessionUsageRows(usage)).map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </div>, document.body) : null}
    </div>
  );
}

function GaugeIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><path d="M3.1 14.4a7.5 7.5 0 1 1 13.8 0M10 11.6l3.2-4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /><circle cx="10" cy="12" r="1.2" fill="currentColor" /></svg>;
}

function DatabaseIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><ellipse cx="10" cy="4.3" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.25" /><path d="M3.5 4.3v10.8c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V4.3M3.5 9.7c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6" stroke="currentColor" strokeWidth="1.25" /></svg>;
}

function usePopupPosition(open, anchorRef, width) {
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = Math.min(width, window.innerWidth - 24);
      setPosition({
        width: panelWidth,
        left: Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.left + rect.width / 2 - panelWidth / 2)),
        top: rect.top - 8,
        transform: "translateY(-100%)",
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open, width]);
  return position;
}

export function sessionTimeRows(stats) {
  if (!stats) return [];
  const rows = [];
  if (stats.llmMs > 0) rows.push({ label: "模型用时", value: formatDuration(stats.llmMs) });
  if (stats.toolMs > 0) rows.push({ label: "工具调用用时", value: formatDuration(stats.toolMs) });
  if (stats.ttftSteps > 0) rows.push({ label: "首 token 平均（TTFT）", value: formatDuration(stats.ttftMs / stats.ttftSteps) });
  if (stats.decodeMs > 0) rows.push({ label: "输出速度（TPS）", value: `${formatThroughput(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s` });
  return rows;
}

export function sessionUsageRows(usage) {
  if (!usage) return [];
  const rows = [];
  const cacheHit = cacheHitPercent(usage);
  if (cacheHit !== null) rows.push({ label: "缓存命中", value: `${cacheHit}%` });
  rows.push({ label: "未缓存输入", value: `${formatExactTokens(usage.uncachedInputTokens)} tok` });
  rows.push({ label: "缓存读取", value: `${formatExactTokens(usage.cacheReadTokens)} tok` });
  if (usage.cacheWriteTokens > 0) rows.push({ label: "缓存写入", value: `${formatExactTokens(usage.cacheWriteTokens)} tok` });
  rows.push({ label: "输出", value: `${formatExactTokens(usage.outputTokens)} tok` });
  return rows;
}

function formatExactTokens(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

export function ContextMeter({ stats }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const position = usePopupPosition(open, rootRef, 350);
  const context = contextOccupancy(stats?.contextPressure);

  useEffect(() => {
    if (!context) setOpen(false);
  }, [context]);

  useEffect(() => {
    if (!open || !context) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
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
        <span>{context.percentLabel}%</span>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} className="context-meter-panel" role="dialog" aria-label="上下文已用" style={position || { visibility: "hidden" }}>
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
        </div>, document.body
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
    const speed = stats.decodeMs > 0 ? ` · ${formatThroughput(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s` : "";
    groups.push(`${stats.turns} 轮 ${stats.steps} 步${speed}`);
  }
  const usage = stats.tokenUsage;
  const input = billedInputTokens(usage);
  if (usage && (input > 0 || usage.outputTokens > 0)) {
    const cacheHit = cacheHitPercent(usage);
    groups.push(`${formatTokens(input + usage.outputTokens)} tok${cacheHit !== null ? ` · 缓存命中 ${cacheHit}%` : ""}`);
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
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}秒`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}分${whole % 60}秒`;
}

function formatThroughput(value) {
  if (!Number.isFinite(value)) return "0";
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}
