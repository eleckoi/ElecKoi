import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DatabaseIcon, formatTokens } from "./GenerationStats.jsx";

const exactTokens = (value) => new Intl.NumberFormat("en-US").format(value);

export function TurnUsage({ usage, compact = false }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const top = anchor.bottom + 8 + height <= window.innerHeight - 12
        ? anchor.bottom + 8
        : Math.max(12, anchor.top - height - 8);
      setPosition({ left, top });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!usage || !Number.isSafeInteger(usage.totalTokens)) return null;
  const promptTokens = usage.totalTokens - usage.outputTokens;
  const cacheHit = usage.cacheReadTokens != null && promptTokens > 0
    ? `${Math.round(usage.cacheReadTokens / promptTokens * 1000) / 10}%`
    : null;
  const rows = [
    usage.routes?.length ? [tUi("提供方 / 模型"), usage.routes.map(({ provider, model }) => `${provider}/${model}`).join("、")] : null,
    cacheHit ? [tUi("缓存命中"), cacheHit] : null,
    [tUi("未缓存输入"), `${exactTokens(usage.uncachedInputTokens)} tok`],
    usage.cacheReadTokens != null ? [tUi("缓存读取"), `${exactTokens(usage.cacheReadTokens)} tok`] : null,
    usage.cacheWriteTokens != null ? [tUi("缓存写入"), `${exactTokens(usage.cacheWriteTokens)} tok`] : null,
    [tUi("输出"), `${exactTokens(usage.outputTokens)} tok`],
    usage.reasoningTokens != null ? [tUi("推理"), `${exactTokens(usage.reasoningTokens)} tok`] : null,
  ].filter(Boolean);

  const label = tUi("用量 {value0} tok", {value0: formatTokens(usage.totalTokens)});
  return <span className="turn-usage">
    <button ref={triggerRef} type="button" className={`turn-usage-trigger${compact ? " is-compact" : ""}`} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <DatabaseIcon />{compact ? null : label}
    </button>
    {open && typeof document !== "undefined" ? createPortal(
      <div ref={panelRef} className="generation-stat-panel turn-usage-panel" role="dialog" aria-label={tUi("本轮用量")} style={position || { visibility: "hidden" }} onPointerDown={(event) => event.stopPropagation()}>
        <div className="generation-stat-heading"><span><DatabaseIcon />{tUi("本轮用量")}</span><strong>{exactTokens(usage.totalTokens)} tok</strong></div>
        <dl className="generation-stat-details">
          {rows.map(([label, value], index) => <div key={label} className={index === 0 && usage.routes?.length ? "turn-usage-route" : undefined}>
            <dt>{label}</dt><dd title={index === 0 && usage.routes?.length ? value : undefined}>{value}</dd>
          </div>)}
        </dl>
      </div>, document.body) : null}
  </span>;
}
