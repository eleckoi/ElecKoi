// NODE STUDIO: retained node/project development surface for future main-window integration.
import { BaseEdge, ConnectionMode, getBezierPath, ReactFlow } from "@xyflow/react";
import { CanvasNode, CanvasQuickCreate } from "./CreatorStudioCanvasParts.jsx";

export const INITIAL_HISTORY = { past: [], present: [], future: [] };
export const EMPTY_CONNECTION = Object.freeze({
  active: false,
  sourceNodeId: "",
  sourceHandleId: "",
  targetNodeId: "",
  targetSide: "",
  targetVector: { x: 0, y: 0 },
});
export const CANVAS_GRID_PITCH = 12.06;
export const CANVAS_DOT_RADIUS = 0.75375;
export const DEFAULT_CANVAS_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 });
export const CANVAS_HANDLE_RADIUS = 12;
export const CANVAS_PORT_VISUAL_OFFSET = 26;
export const CANVAS_ADD_MENU_HEIGHT = 288;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampCanvasOverlayCenter(anchor, overlaySize, viewportSize, margin = 12) {
  const safeViewportSize = Math.max(0, viewportSize);
  const safeMargin = clamp(margin, 0, safeViewportSize / 2);
  const halfOverlay = Math.min(Math.max(0, overlaySize) / 2, safeViewportSize / 2 - safeMargin);
  return clamp(anchor, safeMargin + halfOverlay, safeViewportSize - safeMargin - halfOverlay);
}

export function createCanvasConnectionMenuState(point, viewportSize, xOffset = 0) {
  return {
    open: true,
    source: "connection",
    x: clamp(point.x + xOffset, 12, viewportSize.width - 312),
    y: clampCanvasOverlayCenter(point.y, CANVAS_ADD_MENU_HEIGHT, viewportSize.height),
  };
}

export function canvasScreenPointToWorld(viewport, point) {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function placeCanvasNodeAtAnchor(anchor, size, sourceHandleId = "", stagger = 0) {
  if (sourceHandleId === "right") {
    return { x: anchor.x, y: anchor.y - size.height / 2 };
  }
  if (sourceHandleId === "left") {
    return { x: anchor.x - size.width, y: anchor.y - size.height / 2 };
  }
  return {
    x: anchor.x - size.width / 2 + stagger,
    y: anchor.y - size.height / 2 + stagger,
  };
}

export function normalizeCanvasConnection(connection) {
  if (!connection?.source || !connection?.target || connection.source === connection.target) return null;
  if (connection.sourceHandle === "left") {
    return {
      source: connection.target,
      sourceHandle: connection.targetHandle || "right",
      target: connection.source,
      targetHandle: "left",
    };
  }
  return {
    source: connection.source,
    sourceHandle: connection.sourceHandle || "right",
    target: connection.target,
    targetHandle: connection.targetHandle || "left",
  };
}

export function CreatorCanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }) {
  const cardSourceX = sourceX + (sourcePosition === "left" ? CANVAS_HANDLE_RADIUS : -CANVAS_HANDLE_RADIUS);
  const cardTargetX = targetX + (targetPosition === "left" ? CANVAS_HANDLE_RADIUS : -CANVAS_HANDLE_RADIUS);
  const [path] = getBezierPath({
    sourceX: cardSourceX,
    sourceY,
    targetX: cardTargetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.34,
  });
  return <BaseEdge
    id={id}
    path={path}
    interactionWidth={26}
    className={`creator-canvas-edge${selected ? " is-selected" : ""}`}
  />;
}

export function CreatorCanvasConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }) {
  const sourcePortX = fromX + (fromPosition === "left" ? -CANVAS_PORT_VISUAL_OFFSET : CANVAS_PORT_VISUAL_OFFSET);
  const [path] = getBezierPath({
    sourceX: sourcePortX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    curvature: 0.34,
  });
  return <g className="creator-canvas-pending-edge" aria-hidden="true">
    <path d={path} />
  </g>;
}

export function CreatorCanvasPendingStub({ start, end, sourceSide }) {
  const [path] = getBezierPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
    sourcePosition: sourceSide,
    targetPosition: sourceSide === "left" ? "right" : "left",
    curvature: 0.34,
  });
  return <svg className="creator-canvas-pending-stub" aria-hidden="true">
    <path d={path} />
  </svg>;
}

export function zoomCanvasViewportAtPoint(viewport, point, requestedZoom) {
  const zoom = clamp(requestedZoom, 0.35, 2);
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  return { x: point.x - worldX * zoom, y: point.y - worldY * zoom, zoom };
}

export function zoomCanvasViewportWithWheel(viewport, point, deltaY) {
  return zoomCanvasViewportAtPoint(viewport, point, viewport.zoom * Math.exp(-deltaY * 0.0015));
}

export function CanvasDotGrid({ id, viewport, glow = false, className = "" }) {
  const gridSize = CANVAS_GRID_PITCH * viewport.zoom;
  const dotRadius = CANVAS_DOT_RADIUS * viewport.zoom;
  return <svg
    className={`creator-canvas-dot-grid${glow ? " is-glow" : ""}${className ? ` ${className}` : ""}`}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <pattern
        id={id}
        x={viewport.x}
        y={viewport.y}
        width={gridSize}
        height={gridSize}
        patternUnits="userSpaceOnUse"
      >
        <circle cx={dotRadius} cy={dotRadius} r={dotRadius} />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}

export function canvasHistoryReducer(state, action) {
  if (action.type === "reset") return INITIAL_HISTORY;
  if (action.type === "commit") {
    const next = typeof action.next === "function" ? action.next(state.present) : action.next;
    if (next === state.present) return state;
    return { past: [...state.past, state.present], present: next, future: [] };
  }
  if (action.type === "move-live") {
    return {
      ...state,
      present: state.present.map((node) => node.id === action.nodeId
        ? { ...node, x: action.x, y: action.y }
        : node),
    };
  }
  if (action.type === "patch-live") {
    return {
      ...state,
      present: state.present.map((node) => node.id === action.nodeId
        ? { ...node, ...action.patch }
        : node),
    };
  }
  if (action.type === "commit-move") {
    const movedNode = state.present.find((node) => node.id === action.nodeId);
    if (!movedNode || (movedNode.x === action.fromX && movedNode.y === action.fromY)) return state;
    const previous = state.present.map((node) => node.id === action.nodeId
      ? { ...node, x: action.fromX, y: action.fromY }
      : node);
    return { past: [...state.past, previous], present: state.present, future: [] };
  }
  if (action.type === "undo" && state.past.length) {
    const previous = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
  }
  if (action.type === "redo" && state.future.length) {
    const next = state.future[0];
    return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
  }
  return state;
}

export const FLOW_NODE_TYPES = { creatorCanvasNode: CanvasNode };
export const FLOW_EDGE_TYPES = { creatorCanvasEdge: CreatorCanvasEdge };

export function CreatorCanvasFlowSurface({
  nodes,
  edges,
  viewport,
  onViewportChange,
  onNodesChange,
  onNodeClick,
  onNodeDragStart,
  onNodeDragStop,
  onPaneClick,
  onMoveStart,
  onMoveEnd,
  onConnectStart,
  onConnect,
  onConnectEnd,
  pendingConnectionVisual,
  selectedNodeId,
  onCreate,
}) {
  const displayEdges = edges.map((edge) => ({
    ...edge,
    selected: Boolean(selectedNodeId) && (edge.source === selectedNodeId || edge.target === selectedNodeId),
  }));
  return <>
    {pendingConnectionVisual ? <CreatorCanvasPendingStub {...pendingConnectionVisual} /> : null}
    <ReactFlow
      className="creator-canvas-flow"
      nodes={nodes}
      edges={displayEdges}
      nodeTypes={FLOW_NODE_TYPES}
      edgeTypes={FLOW_EDGE_TYPES}
      viewport={viewport}
      onViewportChange={onViewportChange}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onPaneClick}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      onConnectStart={onConnectStart}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      isValidConnection={(candidate) => Boolean(normalizeCanvasConnection(candidate))}
      connectionLineComponent={CreatorCanvasConnectionLine}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={88}
      connectionDragThreshold={4}
      connectOnClick={false}
      panOnDrag
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      zoomOnPinch
      minZoom={0.35}
      maxZoom={2}
      elementsSelectable
      selectNodesOnDrag={false}
      selectionOnDrag={false}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    />
    {!nodes.length ? <CanvasQuickCreate onCreate={onCreate} /> : null}
  </>;
}
