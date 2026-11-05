// NODE STUDIO: retained node/project development surface for future main-window integration.
import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  ArrowCounterClockwise,
  CaretRight,
  ClockCounterClockwise,
  CursorClick,
  FileText,
  FolderOpen,
  ImageSquare,
  MagnifyingGlass,
  Minus,
  Paperclip,
  PaperPlaneRight,
  PlayCircle,
  Plus,
  SidebarSimple,
  Sparkle,
  Trash,
  UploadSimple,
  VideoCamera,
  Waveform,
  X,
} from "../../../ui/icons/interfaceIcons.jsx";

export const CANVAS_NODE_TYPES = [
  { type: "text", label: "文本", emptyTitle: "未命名文本", subtitle: "书写、整理或生成文字", Icon: FileText },
  { type: "image", label: "图片", emptyTitle: "未命名图片", subtitle: "上传、引用或生成图片", Icon: ImageSquare },
  { type: "audio", label: "音频", emptyTitle: "未命名音频", subtitle: "上传、引用或生成声音", Icon: Waveform },
  { type: "video", label: "视频", emptyTitle: "未命名视频", subtitle: "上传、引用或生成视频", Icon: VideoCamera },
];

export const NODE_TYPE_BY_ID = Object.fromEntries(CANVAS_NODE_TYPES.map((item) => [item.type, item]));
export const NODE_SIZE = {
  text: { width: 420, height: 260 },
  image: { width: 320, height: 380 },
  audio: { width: 380, height: 168 },
  video: { width: 400, height: 270 },
  default: { width: 360, height: 220 },
};
const NODE_MIN_SIZE = {
  text: { width: 280, height: 160 },
  image: { width: 240, height: 260 },
  audio: { width: 300, height: 140 },
  video: { width: 300, height: 190 },
  default: { width: 260, height: 160 },
};

export function CanvasIconButton({ label, children, className = "", ...props }) {
  return <button
    className={`creator-canvas-icon-button ${className}`.trim()}
    type="button"
    aria-label={label}
    title={label}
    {...props}
  >{children}</button>;
}

export function CanvasViewportTools({ assetLibraryOpen, viewport, onOpenAssets, onReset, onZoom }) {
  return <div className={`creator-canvas-utility-dock${assetLibraryOpen ? " is-assets-open" : ""}`} role="toolbar" aria-label="画布视图工具">
    {!assetLibraryOpen ? <>
      <button className="creator-canvas-assets-trigger" type="button" onClick={onOpenAssets}><SidebarSimple size={16} aria-hidden="true" />资产库</button>
      <span className="creator-canvas-utility-divider" aria-hidden="true" />
    </> : null}
    <CanvasIconButton label="重置画布位置" onClick={onReset}><ArrowCounterClockwise size={16} /></CanvasIconButton>
    <CanvasIconButton label="缩小画布" onClick={() => onZoom(-0.1)} disabled={viewport.zoom <= 0.35}><Minus size={16} /></CanvasIconButton>
    <button className="creator-canvas-zoom-value" type="button" onClick={onReset} title="直接滚动鼠标滚轮缩放画布">{Math.round(viewport.zoom * 100)}%</button>
    <CanvasIconButton label="放大画布" onClick={() => onZoom(0.1)} disabled={viewport.zoom >= 2}><Plus size={16} /></CanvasIconButton>
  </div>;
}

export function CanvasCreationDock({ menuOpen, onToggleMenu, onCreate }) {
  return <div className="creator-canvas-dock" role="toolbar" aria-label="添加画布内容">
    <CanvasIconButton label={menuOpen ? "关闭添加菜单" : "添加创作对象"} className={menuOpen ? "is-active" : ""} aria-controls="creator-canvas-add-menu" aria-expanded={menuOpen} onClick={onToggleMenu}>
      <span className="creator-canvas-dock-swap" aria-hidden="true"><Plus size={20} /></span>
    </CanvasIconButton>
    <CanvasIconButton label="添加文本" onClick={() => onCreate("text")}><FileText size={18} /></CanvasIconButton>
    <CanvasIconButton label="添加图片" onClick={() => onCreate("image")}><ImageSquare size={18} /></CanvasIconButton>
    <CanvasIconButton label="添加音频" onClick={() => onCreate("audio")}><Waveform size={18} /></CanvasIconButton>
    <CanvasIconButton label="添加视频" onClick={() => onCreate("video")}><VideoCamera size={18} /></CanvasIconButton>
  </div>;
}

export function CanvasQuickCreate({ onCreate }) {
  return <section className="creator-canvas-quick-create" aria-label="快速添加创作对象">
    <div className="creator-canvas-quick-grid">
      {CANVAS_NODE_TYPES.map(({ type, label, Icon }) => <button
        type="button"
        key={type}
        aria-label={`快速添加${label}节点`}
        onClick={() => onCreate(type)}
      >
        <span><Icon size={20} weight="regular" aria-hidden="true" /></span>
        <strong>{label}</strong>
      </button>)}
    </div>
    <p><CursorClick size={14} aria-hidden="true" />点击快速添加</p>
  </section>;
}

function NodeOperationComposer({ node, meta, prompt, onPromptChange, onOpenAssets, onSendPrompt }) {
  const submitPrompt = (event) => {
    event.preventDefault();
    if (prompt.trim()) onSendPrompt(prompt.trim());
  };

  return <form className="creator-canvas-node-composer nodrag nowheel" aria-label={`${node.title}节点AI操作输入`} onSubmit={submitPrompt}>
    <textarea
      value={prompt}
      onChange={(event) => onPromptChange(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      placeholder={`描述要让 AI 如何处理这份${meta.label}，支持 @ 引用项目素材`}
      aria-label={`${meta.label}AI操作描述`}
    />
    <footer>
      <div>
        <CanvasIconButton label="引用项目素材" type="button" onClick={onOpenAssets}><Paperclip size={18} /></CanvasIconButton>
        <span>{meta.label}</span>
      </div>
      <button type="submit" className="creator-canvas-node-submit" disabled={!prompt.trim()} aria-label="交给AI创作助手">
        <Sparkle size={15} weight="fill" aria-hidden="true" />交给 AI 助手
      </button>
    </footer>
  </form>;
}

function TextNodeBody({ node, selected, dragging, onNodeChange }) {
  const [editing, setEditing] = useState(false);
  const content = node.content || "";

  useEffect(() => {
    if (dragging) setEditing(false);
  }, [dragging]);

  const beginEditing = (event) => {
    event.stopPropagation();
    setEditing(true);
  };

  return <div className="creator-canvas-content-card is-text">
    {editing && !dragging ? <textarea
      className="nodrag nowheel creator-canvas-text-editor"
      value={content}
      onChange={(event) => onNodeChange({ content: event.target.value })}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.blur();
      }}
      placeholder="在这里写下内容…"
      aria-label="文本内容"
      spellCheck="false"
      autoFocus
    /> : <div
      className={`creator-canvas-text-preview nowheel${content ? "" : " is-empty"}`}
      role="textbox"
      aria-label="文本内容"
      aria-readonly="true"
      tabIndex={0}
      onClick={selected ? beginEditing : undefined}
      onDoubleClick={beginEditing}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "F2") beginEditing(event);
      }}
    >{content || "在这里写下内容…"}</div>}
  </div>;
}

function MediaNodeBody({ node, meta, onNodeChange, onOpenAssets }) {
  const inputRef = useRef(null);
  const Icon = meta.Icon;
  const accept = `${node.type}/*`;
  const pickFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => onNodeChange({
      assetName: file.name,
      assetUrl: typeof reader.result === "string" ? reader.result : "",
    }), { once: true });
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const preview = node.assetUrl && node.type === "image"
    ? <img src={node.assetUrl} alt={node.assetName || node.title} draggable="false" />
    : node.assetUrl && node.type === "audio"
      ? <audio className="nodrag nowheel" src={node.assetUrl} controls preload="metadata" aria-label={node.assetName || node.title} />
      : node.assetUrl && node.type === "video"
        ? <video className="nodrag nowheel" src={node.assetUrl} controls preload="metadata" aria-label={node.assetName || node.title} />
        : null;

  return <div className={`creator-canvas-content-card is-${node.type}${node.assetUrl ? " has-asset" : ""}`}>
    <input className="nodrag nowheel" ref={inputRef} type="file" accept={accept} onChange={pickFile} tabIndex={-1} aria-hidden="true" />
    {preview || <div className="creator-canvas-media-empty">
      {node.type === "video" ? <PlayCircle size={42} weight="thin" aria-hidden="true" /> : <Icon size={42} weight="thin" aria-hidden="true" />}
      <div>
        <button className="nodrag" type="button" onClick={() => inputRef.current?.click()}><UploadSimple size={16} aria-hidden="true" />上传</button>
        <button className="nodrag" type="button" onClick={onOpenAssets}><FolderOpen size={16} aria-hidden="true" />资产库</button>
      </div>
    </div>}
    {node.assetUrl ? <footer className="creator-canvas-media-footer">
      <span title={node.assetName}>{node.assetName}</span>
      <button className="nodrag" type="button" onClick={() => inputRef.current?.click()}>替换</button>
    </footer> : null}
  </div>;
}

function NodeSelectionToolbar({ nodeType, onOpenAssistant, onCreateRelated, onRemove }) {
  const relatedTypes = {
    text: ["image", "audio"],
    image: ["video", "text"],
    audio: ["video", "text"],
    video: ["image", "audio"],
  }[nodeType] || ["text", "image"];

  return <div className="creator-canvas-selection-toolbar nodrag nowheel" role="toolbar" aria-label="节点操作">
    <button type="button" onClick={() => onOpenAssistant()}><Sparkle size={16} weight="fill" aria-hidden="true" />AI 辅助</button>
    {relatedTypes.map((type) => {
      const meta = NODE_TYPE_BY_ID[type];
      const Icon = meta.Icon;
      return <button type="button" key={type} onClick={() => onCreateRelated(type)}>
        <Icon size={16} aria-hidden="true" />添加{meta.label}
      </button>;
    })}
    <CanvasIconButton label="删除画布节点" onClick={onRemove}><Trash size={17} /></CanvasIconButton>
  </div>;
}

export function getMagneticHandleOffset(pointerX, pointerY, centerX, centerY, maxDistance = 24) {
  const deltaX = pointerX - centerX;
  const deltaY = pointerY - centerY;
  const distance = Math.hypot(deltaX, deltaY);
  if (!distance || distance <= maxDistance) return { x: deltaX, y: deltaY };
  const scale = maxDistance / distance;
  return { x: deltaX * scale, y: deltaY * scale };
}

function CanvasConnectionHandle({ node, side, active, target, onOpenMenu }) {
  const handleRef = useRef(null);
  const pointerRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const position = side === "left" ? Position.Left : Position.Right;

  const moveTowardPointer = (event) => {
    const rect = handleRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (pointerRef.current) {
      const movement = Math.hypot(event.clientX - pointerRef.current.x, event.clientY - pointerRef.current.y);
      if (movement > 4) pointerRef.current.moved = true;
    }
    const restingCenterX = rect.left + rect.width / 2 + (side === "left" ? -26 : 26);
    setOffset(getMagneticHandleOffset(event.clientX, event.clientY, restingCenterX, rect.top + rect.height / 2));
  };

  const resetOffset = () => setOffset({ x: 0, y: 0 });

  return <Handle
    ref={handleRef}
    id={side}
    type="source"
    position={position}
    className={`creator-canvas-node-port is-${side}${active ? " is-active" : ""}${target ? " is-target" : ""}`}
    data-creator-port-node={node.id}
    data-creator-port-side={side}
    aria-label={`从${node.title}${side === "left" ? "左" : "右"}侧连接节点`}
    onPointerDown={(event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY, moved: false };
    }}
    onPointerMove={moveTowardPointer}
    onPointerEnter={moveTowardPointer}
    onPointerLeave={resetOffset}
    onPointerCancel={resetOffset}
    onClick={(event) => {
      if (pointerRef.current?.moved) return;
      onOpenMenu(event, node.id, side);
    }}
  >
    <span
      className="creator-canvas-node-port-visual"
      style={{ "--port-offset-x": `${offset.x}px`, "--port-offset-y": `${offset.y}px` }}
      aria-hidden="true"
    >
      <Plus size={17} />
    </span>
  </Handle>;
}

export function CanvasNode({
  data,
  selected,
  dragging,
}) {
  const [pointerResting, setPointerResting] = useState(false);
  const wasDraggingRef = useRef(false);
  const {
    node,
    prompt,
    connection,
    onPromptChange,
    onOpenAssets,
    onOpenAssistant,
    onCreateRelated,
    onOpenPortMenu,
    onRemove,
    onNodeChange,
    onResizeEnd,
  } = data;
  const meta = NODE_TYPE_BY_ID[node.type] || NODE_TYPE_BY_ID.text;
  const minSize = NODE_MIN_SIZE[node.type] || NODE_MIN_SIZE.default;
  const Icon = meta.Icon;
  const isCatchTarget = connection.targetNodeId === node.id;
  const catchX = isCatchTarget ? connection.targetVector.x : 0;
  const catchY = isCatchTarget ? connection.targetVector.y : 0;

  useEffect(() => {
    const wasDragging = wasDraggingRef.current;
    wasDraggingRef.current = dragging;
    if (dragging) setPointerResting(false);
    else if (wasDragging) setPointerResting(true);
  }, [dragging]);

  return <article
    className={`creator-canvas-node is-${node.type}${selected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}${pointerResting ? " is-pointer-resting" : ""}${connection.active ? " is-connecting" : ""}${isCatchTarget ? " is-catching" : ""}`}
    data-node-id={node.id}
    style={{
      "--catch-shift-x": `${catchX * 3}px`,
      "--catch-shift-y": `${catchY * 1.5}px`,
      "--catch-rotate-x": `${catchY * -1.8}deg`,
      "--catch-rotate-y": `${catchX * 3.1}deg`,
    }}
    aria-label={`${meta.label}节点`}
    onPointerEnter={() => setPointerResting(true)}
    onPointerLeave={() => setPointerResting(false)}
  >
    <NodeResizer
      isVisible={selected && !dragging}
      minWidth={minSize.width}
      minHeight={minSize.height}
      maxWidth={960}
      maxHeight={760}
      handleClassName="creator-canvas-node-resize-handle"
      lineClassName="creator-canvas-node-resize-line"
      onResizeEnd={(_, params) => onResizeEnd(params)}
    />
    <div className="creator-canvas-node-title"><Icon size={16} aria-hidden="true" /><span>{node.title}</span></div>
    {selected && !dragging ? <NodeSelectionToolbar
      nodeType={node.type}
      onOpenAssistant={onOpenAssistant}
      onCreateRelated={onCreateRelated}
      onRemove={onRemove}
    /> : null}

    {node.type === "text"
      ? <TextNodeBody node={node} selected={selected} dragging={dragging} onNodeChange={onNodeChange} />
      : <MediaNodeBody node={node} meta={meta} onNodeChange={onNodeChange} onOpenAssets={onOpenAssets} />}

    {selected && !dragging ? <NodeOperationComposer
      node={node}
      meta={meta}
      prompt={prompt}
      onPromptChange={onPromptChange}
      onOpenAssets={onOpenAssets}
      onSendPrompt={onOpenAssistant}
    /> : null}

    <CanvasConnectionHandle
      node={node}
      side="left"
      active={connection.sourceNodeId === node.id && connection.sourceHandleId === "left"}
      target={isCatchTarget && connection.targetSide === "left"}
      onOpenMenu={onOpenPortMenu}
    />
    <CanvasConnectionHandle
      node={node}
      side="right"
      active={connection.sourceNodeId === node.id && connection.sourceHandleId === "right"}
      target={isCatchTarget && connection.targetSide === "right"}
      onOpenMenu={onOpenPortMenu}
    />
  </article>;
}

export function CanvasAssetLibrary({ nodes, onClose, onSelectNode }) {
  const [query, setQuery] = useState("");
  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return nodes;
    return nodes.filter((node) => node.title.toLocaleLowerCase().includes(normalized));
  }, [nodes, query]);

  return <aside className="creator-canvas-assets" aria-label="项目资产库">
    <header>
      <h2>资产库</h2>
      <CanvasIconButton label="收起资产库" onClick={onClose}><X size={17} /></CanvasIconButton>
    </header>
    <div className="creator-canvas-asset-tabs" role="tablist" aria-label="资产来源">
      <button className="is-active" type="button" role="tab" aria-selected="true">画布对象</button>
      <button type="button" role="tab" aria-selected="false">项目资产</button>
    </div>
    <label className="creator-canvas-asset-search">
      <MagnifyingGlass size={16} aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产" aria-label="搜索资产" />
    </label>
    <div className="creator-canvas-asset-list">
      {visibleNodes.map((node) => {
        const meta = NODE_TYPE_BY_ID[node.type] || NODE_TYPE_BY_ID.text;
        const Icon = meta.Icon;
        return <button type="button" key={node.id} onClick={() => onSelectNode(node.id)}>
          <span><Icon size={18} weight="duotone" aria-hidden="true" /></span>
          <strong>{node.title}</strong>
          <small>{meta.label}</small>
        </button>;
      })}
      {!visibleNodes.length ? <div className="creator-canvas-asset-empty">
        <FolderOpen size={24} aria-hidden="true" />
        <span>暂无画布对象</span>
      </div> : null}
    </div>
    <footer className="creator-canvas-assets-footer">
      <button type="button" onClick={onClose}>
        <SidebarSimple size={16} aria-hidden="true" />
        收起资产库
      </button>
    </footer>
  </aside>;
}

export function CanvasAssistant({ value, onChange, onClose }) {
  return <aside className="creator-canvas-assistant" aria-label="AI创作助手">
    <header>
      <span><Sparkle size={15} weight="fill" aria-hidden="true" />AI创作助手</span>
      <div>
        <CanvasIconButton label="对话历史"><ClockCounterClockwise size={17} /></CanvasIconButton>
        <CanvasIconButton label="关闭AI创作助手" onClick={onClose}><X size={17} /></CanvasIconButton>
      </div>
    </header>
    <div className="creator-canvas-assistant-empty">
      <span><Sparkle size={21} weight="duotone" aria-hidden="true" /></span>
      <strong>从项目里的任何对象开始</strong>
    </div>
    <div className="creator-canvas-assistant-composer">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="描述要创作或修改的内容，支持 @ 引用"
        aria-label="与AI创作助手对话"
      />
      <footer>
        <CanvasIconButton label="添加附件"><Paperclip size={18} /></CanvasIconButton>
        <CanvasIconButton label="发送消息" className="is-send" disabled={!value.trim()}><PaperPlaneRight size={17} weight="fill" /></CanvasIconButton>
      </footer>
    </div>
  </aside>;
}

export function CanvasAddMenu({ id, state, onCreate }) {
  const isOpen = state.open;
  const isFloating = state.source !== "dock";
  const isConnection = state.source === "connection";
  return <div
    id={id}
    className={`creator-canvas-add-menu${isOpen ? " is-open" : ""}${isFloating ? " is-context" : ""}${isConnection ? " is-connection" : ""}`}
    role="menu"
    aria-label="添加创作对象"
    aria-hidden={!isOpen}
    inert={isOpen ? undefined : true}
    style={isFloating ? { "--add-menu-x": `${state.x}px`, "--add-menu-y": `${state.y}px` } : undefined}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <div className="creator-canvas-add-menu-title">添加节点</div>
    <div className="creator-canvas-add-menu-list">
      {CANVAS_NODE_TYPES.map(({ type, label, subtitle, Icon }, index) => <button
        type="button"
        role="menuitem"
        key={type}
        className={index === 0 ? "is-featured" : ""}
        tabIndex={isOpen ? 0 : -1}
        onClick={() => onCreate(type, isFloating ? { x: state.x, y: state.y } : undefined)}
      >
        <span className="creator-canvas-add-menu-icon"><Icon size={20} weight="regular" aria-hidden="true" /></span>
        <span className="creator-canvas-add-menu-copy">
          <strong>{label}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
      </button>)}
    </div>
  </div>;
}

export function CanvasContextMenu({ state, canUndo, canRedo, hasSelectedNode, onOpenAssets, onOpenAddMenu, onUndo, onRedo, onReset, onRemove }) {
  const isOpen = state.open;
  return <div
    className={`creator-canvas-context-menu${isOpen ? " is-open" : ""}`}
    role="menu"
    aria-label="画布右键菜单"
    aria-hidden={!isOpen}
    inert={isOpen ? undefined : true}
    style={{ "--context-menu-x": `${state.x}px`, "--context-menu-y": `${state.y}px` }}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <button type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} onClick={onOpenAssets}><span>打开资产库</span></button>
    <button type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} onClick={onOpenAddMenu}><span>添加节点</span><CaretRight size={16} aria-hidden="true" /></button>
    <div className="creator-canvas-context-separator" role="separator" />
    <button type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} disabled={!canUndo} onClick={onUndo}><span>撤销</span><kbd>Ctrl+Z</kbd></button>
    <button type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} disabled={!canRedo} onClick={onRedo}><span>重做</span><kbd>Ctrl+Y</kbd></button>
    <button type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} onClick={onReset}><span>重置视图</span><kbd>Ctrl+0</kbd></button>
    {hasSelectedNode ? <>
      <div className="creator-canvas-context-separator" role="separator" />
      <button className="is-danger" type="button" role="menuitem" tabIndex={isOpen ? 0 : -1} onClick={onRemove}><span>删除节点</span><Trash size={16} aria-hidden="true" /></button>
    </> : null}
  </div>;
}
