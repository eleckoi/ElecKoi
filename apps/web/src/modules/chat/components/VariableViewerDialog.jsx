import { VariableEditorPane } from './VariableEditorPane.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CaretDown, CaretRight, Database, X } from "../../../ui/icons/interfaceIcons.jsx";
import { MobileConversationOverlay, MobileOverlayScroll, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';

const EMPTY_TIMELINE = { id: "", status: "idle", timeline: null, error: "" };
const subscribeEmptyTimeline = () => () => {};
const getEmptyTimeline = () => EMPTY_TIMELINE;

export function VariableViewerDialog({ conversationId, conversationModel, nativeAuthorRuntime, onClose: onRequestClose, onNotify }) {
  const mobile = isMobilePresentation();
  const [mode, setMode] = useState('history');
  const [showDetails, setShowDetails] = useState(false);
  const snapshotBack = useRef(null);
  const editorDirty = useRef(false);
  const onEditorDirtyChange = useCallback(dirty => { editorDirty.current = dirty; }, []);
  const canLeaveEditor = () => !editorDirty.current || window.confirm('当前变量尚未保存，放弃修改？');
  const onClose = useCallback(() => { if (!editorDirty.current || window.confirm('当前变量尚未保存，放弃修改？')) onRequestClose(); }, [onRequestClose]);
  const changeMode = next => { if (mode !== next && canLeaveEditor()) setMode(next); };
  const [selectedId, setSelectedId] = useState("");
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const timelineSnapshot = useSyncExternalStore(
    conversationModel?.subscribeTimeline || subscribeEmptyTimeline,
    conversationModel?.getTimelineSnapshot || getEmptyTimeline,
  );

  useEffect(() => {
    if (!conversationModel) {
      onNotify?.("error", "DSH 聊天服务尚未就绪");
      return undefined;
    }
    let active = true;
    conversationModel.openTimeline(conversationId).catch((cause) => {
      if (active) onNotify?.("error", cause?.message || "变量时间线读取失败");
    });
    return () => {
      active = false;
      conversationModel.closeTimeline(conversationId);
    };
  }, [conversationId, conversationModel, onNotify]);

  const visibleTimeline = timelineSnapshot.id === conversationId ? timelineSnapshot.timeline : null;
  const visibleLoading = timelineSnapshot.id !== conversationId || timelineSnapshot.status === "loading";
  const visibleError = timelineSnapshot.id === conversationId ? timelineSnapshot.error : "";

  useEffect(() => {
    if (!visibleTimeline) return;
    setSelectedId((current) => visibleTimeline.floors.some((floor) => floor.id === current)
      ? current : visibleTimeline.floors.at(-1)?.id || "");
  }, [visibleTimeline]);

  useEffect(() => {
    if (mobile) return undefined;
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
  }, [onClose, mobile]);

  const selectedFloor = visibleTimeline?.floors.find((floor) => floor.id === selectedId) || null;
  const latestId = visibleTimeline?.floors.at(-1)?.id || "";

  const modeSwitch = <div className="variable-editor-modes" role="tablist" aria-label="变量工具">
    <button type="button" role="tab" aria-selected={mode === 'history'} onClick={() => changeMode('history')}>楼层历史</button>
    <button type="button" role="tab" aria-selected={mode === 'editor'} onClick={() => changeMode('editor')}>编辑变量</button>
  </div>;
  const editorPane = <VariableEditorPane conversationId={conversationId} runtime={nativeAuthorRuntime} onNotify={onNotify} onDirtyChange={onEditorDirtyChange} />;

  if (mobile) return <MobileConversationOverlay kind="page" title="变量查看器" className="mobile-variable-viewer" onClose={onRequestClose} beforeClose={canLeaveEditor}
    onBack={mode === 'history' && showDetails ? () => { if (!snapshotBack.current?.()) setShowDetails(false); } : undefined}>
    {modeSwitch}
    {mode === 'editor' ? editorPane : <div className="variable-viewer-body" data-page-direction={showDetails ? 'forward' : 'back'}>
      <div className="mobile-variable-timeline" hidden={showDetails}><TimelinePane timeline={visibleTimeline} loading={visibleLoading} error={visibleError} selectedId={selectedId} onSelect={id => { setSelectedId(id); setShowDetails(true); }} /></div>
      {showDetails && <SnapshotPane timeline={visibleTimeline} floor={selectedFloor} latestId={latestId} loading={visibleLoading} error={visibleError} mobile onBackRef={snapshotBack} />}
    </div>}
  </MobileConversationOverlay>;

  return createPortal(
    <SystemBarOverlay className="variable-viewer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="variable-viewer-dialog has-editor-tabs"
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
        {modeSwitch}
        {mode === 'editor' ? editorPane : <div className="variable-viewer-body">
          <TimelinePane
            timeline={visibleTimeline}
            loading={visibleLoading}
            error={visibleError}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <SnapshotPane timeline={visibleTimeline} floor={selectedFloor} latestId={latestId} loading={visibleLoading} error={visibleError} />
        </div>}
      </section>
    </SystemBarOverlay>,
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

function SnapshotPane({ timeline, floor, latestId, loading, error, mobile = false, onBackRef }) {
  const [viewMode, setViewMode] = useState("changes");
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [focusStack, setFocusStack] = useState([]);
  const positions = useRef(new Map()).current;
  const previousDepth = useRef(0);
  const isOpening = floor?.id === "opening";
  const document = floor?.id === latestId ? timeline?.current : floor?.state;
  const changedPaths = useMemo(() => new Set(floor?.changedPaths || []), [floor]);
  if (onBackRef) onBackRef.current = () => { if (!focusStack.length) return false; setFocusStack(stack => stack.slice(0, -1)); return true; };

  useEffect(() => {
    setViewMode(floor?.id === "opening" ? "all" : "changes");
    setExpandedPaths(new Set());
    setFocusStack([]);
  }, [floor?.id]);
  useEffect(() => { previousDepth.current = focusStack.length; }, [focusStack.length]);

  if (loading || error) return <main className="variable-snapshot variable-snapshot-placeholder" />;
  if (!floor || !document) return <main className="variable-snapshot variable-snapshot-placeholder">
    <Database size={28} weight="duotone" aria-hidden="true" />
    <p>从时间线选择一个助手楼层</p>
  </main>;

  const focus = focusStack.at(-1) || null;
  const root = focus?.value || document.root;
  const visibleChanges = !isOpening && viewMode === "changes";
  const direction = focusStack.length < previousDepth.current ? 'back' : 'forward';
  const TreeScroll = mobile ? MobileOverlayScroll : 'div';
  const scrollKey = `${floor.id}:${focus?.path || ''}:${viewMode}`;
  const scrollProps = mobile ? { scrollKey, positions, direction } : {};

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
          {focus && !mobile ? <button type="button" onClick={() => setFocusStack((stack) => stack.slice(0, -1))} aria-label="返回上一级变量"><ArrowLeft /></button> : null}
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
    <TreeScroll key={mobile ? scrollKey : undefined} className="variable-viewer-tree-scroll" {...scrollProps}>
      {document.errorMessage ? <section className="variable-raw-state">
        <strong>{document.errorMessage}</strong>
        <pre>{document.rawJson}</pre>
      </section> : null}
      {!document.errorMessage && root ? <VariableTree
        mobile={mobile}
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
    </TreeScroll>
  </main>;
}

function VariableTree({ root, basePath, baseBreadcrumb, depth, expandedPaths, changedPaths, changesOnly, onToggle, onFocus, mobile = false }) {
  return <div className="variable-viewer-tree" role={depth === 0 ? "tree" : "group"}>{Object.entries(root).map(([name, value]) => {
    const path = pointerPath(basePath, name);
    if (changesOnly && !pathIsVisible(path, changedPaths)) return null;
    const container = isObject(value);
    const expanded = container && expandedPaths.has(path);
    const opensFocusedSubtree = container && (mobile || depth >= 2);
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
