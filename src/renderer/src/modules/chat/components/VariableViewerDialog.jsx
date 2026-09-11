import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CaretDown, CaretRight, Database, X } from "@phosphor-icons/react";
import { getVariableTimeline, listenAgentFinishedEvent } from "../api/chatApi.js";

export function VariableViewerDialog({ conversationId, onClose, onNotify }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = await getVariableTimeline(conversationId);
        if (!active) return;
        setTimeline(value);
        setSelectedId((current) => value.floors.some((floor) => floor.id === current)
          ? current
          : value.floors.at(-1)?.id || "");
        setError("");
      } catch (loadError) {
        if (!active) return;
        const message = loadError?.message || "变量时间线读取失败";
        setError(message);
        onNotify?.("error", message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const dispose = listenAgentFinishedEvent((event) => {
      if (event.conversationId === conversationId) load();
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [conversationId, onNotify]);

  useEffect(() => {
    closeRef.current?.focus();
    const handleDialogKeys = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [onClose]);

  const selectedFloor = timeline?.floors.find((floor) => floor.id === selectedId) || null;
  const latestId = timeline?.floors.at(-1)?.id || "";

  return createPortal(
    <div className="variable-viewer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="variable-viewer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="variable-viewer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="variable-viewer-header">
          <span className="variable-viewer-heading-icon" aria-hidden="true"><Database weight="fill" /></span>
          <h2 id="variable-viewer-title">变量查看器</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭变量查看器"><X /></button>
        </header>
        <div className="variable-viewer-body">
          <TimelinePane
            timeline={timeline}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <SnapshotPane timeline={timeline} floor={selectedFloor} latestId={latestId} loading={loading} error={error} />
        </div>
      </section>
    </div>,
    document.body,
  );
}

function TimelinePane({ timeline, loading, error, selectedId, onSelect }) {
  const floors = [...(timeline?.floors || [])].reverse();
  return <aside className="variable-timeline" aria-label="状态时间线">
    <div className="variable-timeline-title">
      <strong>状态时间线</strong>
      {timeline ? <span>{timeline.current.valueCount} 个变量</span> : null}
    </div>
    <div className="variable-floor-list">
      {loading ? <p className="variable-viewer-empty">正在整理楼层变量</p> : null}
      {!loading && error ? <p className="variable-viewer-empty is-error">{error}</p> : null}
      {!loading && !error && !floors.length ? <p className="variable-viewer-empty">还没有可查看的助手楼层</p> : null}
      {floors.map((floor, index) => <button
        key={floor.id}
        type="button"
        className={`variable-floor${floor.id === selectedId ? " active" : ""}`}
        aria-current={floor.id === selectedId ? "true" : undefined}
        onClick={() => onSelect(floor.id)}
      >
        <span className="variable-floor-rail" aria-hidden="true"><i /></span>
        <span className="variable-floor-copy">
          <span className="variable-floor-heading">
            <strong>{floor.label}</strong>
            {index === 0 ? <em>最新变量</em> : null}
          </span>
          {floor.messagePreview ? <small>{floor.messagePreview}</small> : null}
          <span className="variable-floor-meta">
            {floor.id === "opening" ? "初始状态" : `${floor.changedValueCount} 处变化`}
            {floor.createdAt ? ` · ${formatTimestamp(floor.createdAt)}` : ""}
          </span>
        </span>
        <CaretRight className="variable-floor-caret" aria-hidden="true" />
      </button>)}
    </div>
  </aside>;
}

function SnapshotPane({ timeline, floor, latestId, loading, error }) {
  const [viewMode, setViewMode] = useState("changes");
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [focusStack, setFocusStack] = useState([]);
  const isOpening = floor?.id === "opening";
  const document = floor?.id === latestId ? timeline?.current : floor?.state;
  const changedPaths = useMemo(() => new Set(floor?.changedPaths || []), [floor]);

  useEffect(() => {
    setViewMode(floor?.id === "opening" ? "all" : "changes");
    setExpandedPaths(new Set());
    setFocusStack([]);
  }, [floor?.id]);

  if (loading || error) return <main className="variable-snapshot variable-snapshot-placeholder" />;
  if (!floor || !document) return <main className="variable-snapshot variable-snapshot-placeholder">
    <Database size={28} weight="duotone" aria-hidden="true" />
    <p>从时间线选择一个助手楼层</p>
  </main>;

  const focus = focusStack.at(-1) || null;
  const root = focus?.value || document.root;
  const visibleChanges = !isOpening && viewMode === "changes";

  function togglePath(path) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return <main className="variable-snapshot">
    <div className="variable-snapshot-heading">
      <div>
        <span className="variable-snapshot-titleline">
          {focus ? <button type="button" onClick={() => setFocusStack((stack) => stack.slice(0, -1))} aria-label="返回上一级变量"><ArrowLeft /></button> : null}
          <h3>{focus?.name || floor.label}</h3>
        </span>
        {focus ? <p>{focus.breadcrumb.join(" / ")}</p> : floor.messagePreview ? <p>{floor.messagePreview}</p> : null}
      </div>
      <span>{document.valueCount} 个变量{isOpening ? "" : ` · ${floor.changedValueCount} 处变化`}</span>
    </div>
    {!focus && !isOpening ? <div className="variable-view-switch" role="tablist" aria-label="变量显示范围">
      <button type="button" role="tab" aria-selected={viewMode === "changes"} onClick={() => setViewMode("changes")}>本轮变化</button>
      <button type="button" role="tab" aria-selected={viewMode === "all"} onClick={() => setViewMode("all")}>全部变量</button>
    </div> : null}
    <div className="variable-viewer-tree-scroll">
      {document.errorMessage ? <section className="variable-raw-state">
        <strong>{document.errorMessage}</strong>
        <pre>{document.rawJson}</pre>
      </section> : null}
      {!document.errorMessage && root ? <VariableTree
        root={root}
        basePath={focus?.path || ""}
        baseBreadcrumb={focus?.breadcrumb || []}
        depth={0}
        expandedPaths={expandedPaths}
        changedPaths={changedPaths}
        changesOnly={visibleChanges}
        onToggle={togglePath}
        onFocus={(entry) => setFocusStack((stack) => [...stack, entry])}
      /> : null}
      {!document.errorMessage && root && !hasVisibleEntries(root, focus?.path || "", changedPaths, visibleChanges)
        ? <p className="variable-viewer-empty">{visibleChanges ? "本轮没有可显示的新值" : "这一份快照没有变量"}</p>
        : null}
    </div>
  </main>;
}

function VariableTree({ root, basePath, baseBreadcrumb, depth, expandedPaths, changedPaths, changesOnly, onToggle, onFocus }) {
  return <div className="variable-viewer-tree" role={depth === 0 ? "tree" : "group"}>{Object.entries(root).map(([name, value]) => {
    const path = pointerPath(basePath, name);
    if (changesOnly && !pathIsVisible(path, changedPaths)) return null;
    const container = isObject(value);
    const expanded = container && expandedPaths.has(path);
    const opensFocusedSubtree = container && depth >= 2;
    const breadcrumb = [...baseBreadcrumb, name];
    return <div className={`variable-viewer-tree-node${changedPaths.has(path) ? " is-changed" : ""}`} key={path} role="treeitem" aria-expanded={container && !opensFocusedSubtree ? expanded : undefined}>
      {container ? <button
        className="variable-viewer-tree-row is-container"
        type="button"
        onClick={() => opensFocusedSubtree
          ? onFocus({ path, name, value, breadcrumb })
          : onToggle(path)}
      >
        <span className="variable-viewer-tree-chevron" aria-hidden="true">{expanded && !opensFocusedSubtree ? <CaretDown /> : <CaretRight />}</span>
        <span className="variable-viewer-tree-key">{name}</span>
      </button> : <div className="variable-viewer-tree-row is-scalar">
        <span className="variable-viewer-tree-chevron" aria-hidden="true" />
        <span className="variable-viewer-tree-key">{name}</span>
        <span className="variable-viewer-tree-value">{displayValue(value)}</span>
      </div>}
      {container && expanded && !opensFocusedSubtree ? <VariableTree
        root={value}
        basePath={path}
        baseBreadcrumb={breadcrumb}
        depth={depth + 1}
        expandedPaths={expandedPaths}
        changedPaths={changedPaths}
        changesOnly={changesOnly}
        onToggle={onToggle}
        onFocus={onFocus}
      /> : null}
    </div>;
  })}</div>;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pointerPath(parent, key) {
  return `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function pathIsVisible(path, changedPaths) {
  for (const changed of changedPaths) {
    if (changed === path || changed.startsWith(`${path}/`)) return true;
  }
  return false;
}

function hasVisibleEntries(root, basePath, changedPaths, changesOnly) {
  return Object.keys(root).some((key) => !changesOnly || pathIsVisible(pointerPath(basePath, key), changedPaths));
}

function displayValue(value) {
  if (value === null || value === "") return "未设置";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  return String(value);
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
