// NODE STUDIO: retained node/project development surface for future main-window integration.
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CanvasAddMenu,
  CanvasAssetLibrary,
  CanvasAssistant,
  CanvasContextMenu,
  CanvasCreationDock,
  CanvasViewportTools,
  NODE_SIZE,
  NODE_TYPE_BY_ID,
} from "./CreatorStudioCanvasParts.jsx";
import {
  CanvasDotGrid,
  CANVAS_DOT_RADIUS,
  CANVAS_GRID_PITCH,
  CANVAS_PORT_VISUAL_OFFSET,
  canvasScreenPointToWorld,
  clamp,
  createCanvasConnectionMenuState,
  CreatorCanvasFlowSurface,
  DEFAULT_CANVAS_VIEWPORT,
  EMPTY_CONNECTION,
  INITIAL_HISTORY,
  canvasHistoryReducer,
  normalizeCanvasConnection,
  placeCanvasNodeAtAnchor,
  zoomCanvasViewportAtPoint,
  zoomCanvasViewportWithWheel,
} from "./CreatorStudioCanvasFlow.jsx";

export {
  CanvasDotGrid,
  CANVAS_DOT_RADIUS,
  CANVAS_GRID_PITCH,
  DEFAULT_CANVAS_VIEWPORT,
  normalizeCanvasConnection,
  zoomCanvasViewportAtPoint,
  zoomCanvasViewportWithWheel,
};

export function CreatorStudioCanvas({
  project,
  assistantOpen,
  onAssistantOpenChange,
  onAssetLibraryOpenChange,
  onDirtyChange,
  viewport: controlledViewport,
  onViewportChange,
}) {
  const [{ past, present: nodes, future }, dispatchNodes] = useReducer(canvasHistoryReducer, INITIAL_HISTORY);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [addMenu, setAddMenu] = useState({ open: false, source: "dock", x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 });
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [nodePrompts, setNodePrompts] = useState({});
  const [internalViewport, setInternalViewport] = useState(DEFAULT_CANVAS_VIEWPORT);
  const [nodeCounter, setNodeCounter] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [connection, setConnection] = useState(EMPTY_CONNECTION);
  const [pendingConnectionVisual, setPendingConnectionVisual] = useState(null);
  const gridPatternId = useId().replace(/:/g, "");
  const viewportRef = useRef(null);
  const nodeDragStartRef = useRef(null);
  const pendingConnectionRef = useRef(null);
  const connectionRef = useRef(EMPTY_CONNECTION);
  const connectionCompletedRef = useRef(false);
  const edgeCounterRef = useRef(1);
  const viewport = controlledViewport ?? internalViewport;
  const viewportSnapshotRef = useRef(viewport);
  viewportSnapshotRef.current = viewport;
  const setViewport = onViewportChange ?? setInternalViewport;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  useEffect(() => {
    dispatchNodes({ type: "reset" });
    setEdges([]);
    setSelectedNodeId("");
    setAssetLibraryOpen(false);
    setAddMenu({ open: false, source: "dock", x: 0, y: 0 });
    setContextMenu({ open: false, x: 0, y: 0 });
    setAssistantPrompt("");
    setNodePrompts({});
    setViewport({ ...DEFAULT_CANVAS_VIEWPORT });
    setNodeCounter(1);
    setIsPanning(false);
    setConnection(EMPTY_CONNECTION);
    setPendingConnectionVisual(null);
    nodeDragStartRef.current = null;
    pendingConnectionRef.current = null;
    connectionRef.current = EMPTY_CONNECTION;
    connectionCompletedRef.current = false;
    edgeCounterRef.current = 1;
    onDirtyChange(false);
  }, [onDirtyChange, project.id, setViewport]);

  useEffect(() => {
    onAssetLibraryOpenChange?.(assetLibraryOpen);
  }, [assetLibraryOpen, onAssetLibraryOpenChange]);

  const markDirty = useCallback(() => onDirtyChange(true), [onDirtyChange]);

  const screenPointToWorld = useCallback((point) => canvasScreenPointToWorld(viewportSnapshotRef.current, point), []);

  const addCanvasConnection = useCallback((candidate) => {
    const normalized = normalizeCanvasConnection(candidate);
    if (!normalized) return false;
    setEdges((current) => {
      const duplicate = current.some((edge) => edge.source === normalized.source
        && edge.target === normalized.target
        && edge.sourceHandle === normalized.sourceHandle
        && edge.targetHandle === normalized.targetHandle);
      if (duplicate) return current;
      return [...current, {
        ...normalized,
        id: `canvas-edge-${edgeCounterRef.current++}`,
        type: "creatorCanvasEdge",
      }];
    });
    markDirty();
    return true;
  }, [markDirty]);

  const createNode = useCallback((nodeType, anchor) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const viewportWidth = rect?.width || 1000;
    const viewportHeight = rect?.height || 700;
    const meta = NODE_TYPE_BY_ID[nodeType] || NODE_TYPE_BY_ID.text;
    const size = NODE_SIZE[nodeType] || NODE_SIZE.default;
    const pendingConnection = pendingConnectionRef.current;
    const point = pendingConnection?.anchor || anchor || { x: viewportWidth / 2, y: viewportHeight / 2 };
    const worldPoint = screenPointToWorld(point);
    const position = placeCanvasNodeAtAnchor(
      worldPoint,
      size,
      pendingConnection?.sourceHandleId,
      (nodeCounter % 3) * 16,
    );
    const id = `canvas-node-${nodeCounter}`;
    dispatchNodes({
      type: "commit",
      next: (current) => [...current, {
        id,
        type: meta.type,
        title: meta.emptyTitle,
        content: "",
        assetName: "",
         assetUrl: "",
         x: position.x,
         y: position.y,
          ...size,
       }],
    });
    if (pendingConnection) {
      addCanvasConnection({
        source: pendingConnection.sourceNodeId,
        sourceHandle: pendingConnection.sourceHandleId,
        target: id,
        targetHandle: pendingConnection.sourceHandleId === "left" ? "right" : "left",
      });
    }
    pendingConnectionRef.current = null;
    connectionRef.current = EMPTY_CONNECTION;
    setConnection(EMPTY_CONNECTION);
    setPendingConnectionVisual(null);
    setSelectedNodeId(id);
    setNodeCounter((value) => value + 1);
    setAddMenu((current) => ({ ...current, open: false }));
    setContextMenu((current) => ({ ...current, open: false }));
    markDirty();
  }, [addCanvasConnection, markDirty, nodeCounter, screenPointToWorld]);

  const moveNode = useCallback((nodeId, x, y) => {
    dispatchNodes({ type: "move-live", nodeId, x, y });
    markDirty();
  }, [markDirty]);

  const updateNode = useCallback((nodeId, patch) => {
    dispatchNodes({ type: "patch-live", nodeId, patch });
    markDirty();
  }, [markDirty]);

  const commitNodeMove = useCallback((nodeId, fromX, fromY) => {
    dispatchNodes({ type: "commit-move", nodeId, fromX, fromY });
  }, []);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    dispatchNodes({ type: "commit", next: (current) => current.filter((node) => node.id !== selectedNodeId) });
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId("");
    setContextMenu((current) => ({ ...current, open: false }));
    markDirty();
  }, [markDirty, selectedNodeId]);

  const undo = useCallback(() => {
    if (!past.length) return;
    dispatchNodes({ type: "undo" });
    setSelectedNodeId("");
    setContextMenu((current) => ({ ...current, open: false }));
    markDirty();
  }, [markDirty, past.length]);

  const redo = useCallback(() => {
    if (!future.length) return;
    dispatchNodes({ type: "redo" });
    setSelectedNodeId("");
    setContextMenu((current) => ({ ...current, open: false }));
    markDirty();
  }, [future.length, markDirty]);

  const resetViewport = useCallback(() => {
    setViewport({ ...DEFAULT_CANVAS_VIEWPORT });
    setContextMenu((current) => ({ ...current, open: false }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof Element && event.target.closest("textarea, input, [contenteditable='true']")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLocaleLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (command && event.key.toLocaleLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (command && event.key === "0") {
        event.preventDefault();
        resetViewport();
      } else if (event.key === "Escape") {
        setContextMenu((current) => ({ ...current, open: false }));
        setAddMenu((current) => ({ ...current, open: false }));
        pendingConnectionRef.current = null;
        setPendingConnectionVisual(null);
        connectionRef.current = EMPTY_CONNECTION;
        setConnection(EMPTY_CONNECTION);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, resetViewport, undo]);

  const updateConnection = useCallback((next) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);

  const findConnectionTarget = useCallback((clientX, clientY) => {
    const root = viewportRef.current;
    if (!root || !connectionRef.current.active) return null;
    let closest = null;
    root.querySelectorAll("[data-node-id]").forEach((element) => {
      const nodeId = element.dataset.nodeId;
      if (!nodeId || nodeId === connectionRef.current.sourceNodeId) return;
      const rect = element.getBoundingClientRect();
      const outsideX = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const outsideY = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      const distance = Math.hypot(outsideX, outsideY);
      if (distance > 88 || (closest && closest.distance <= distance)) return;
      const vectorX = clamp((clientX - (rect.left + rect.width / 2)) / Math.max(rect.width / 2, 1), -1, 1);
      const vectorY = clamp((clientY - (rect.top + rect.height / 2)) / Math.max(rect.height / 2, 1), -1, 1);
      closest = {
        nodeId,
        side: clientX < rect.left + rect.width / 2 ? "left" : "right",
        vector: { x: vectorX, y: vectorY },
        distance,
      };
    });
    return closest;
  }, []);

  const movePointer = (event) => {
    if (event.pointerType !== "touch") {
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--canvas-glow-x", `${event.clientX - rect.left}px`);
      event.currentTarget.style.setProperty("--canvas-glow-y", `${event.clientY - rect.top}px`);
      event.currentTarget.style.setProperty("--canvas-glow-opacity", "1");
    }
    if (connectionRef.current.active) {
      const target = findConnectionTarget(event.clientX, event.clientY);
      const current = connectionRef.current;
      const next = {
        ...current,
        targetNodeId: target?.nodeId || "",
        targetSide: target?.side || "",
        targetVector: target?.vector || { x: 0, y: 0 },
      };
      const changed = current.targetNodeId !== next.targetNodeId
        || current.targetSide !== next.targetSide
        || Math.abs(current.targetVector.x - next.targetVector.x) > 0.03
        || Math.abs(current.targetVector.y - next.targetVector.y) > 0.03;
      if (changed) updateConnection(next);
    }
  };

  const hidePointerGlow = (event) => {
    event.currentTarget.style.setProperty("--canvas-glow-opacity", "0");
  };

  const changeZoom = (delta) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const point = { x: (rect?.width || 1000) / 2, y: (rect?.height || 700) / 2 };
    setViewport((current) => zoomCanvasViewportAtPoint(current, point, Number((current.zoom + delta).toFixed(2))));
  };

  const zoomWithWheel = (event) => {
    if (event.target instanceof Element && event.target.closest("textarea, input, audio, video, .nowheel, [contenteditable='true']")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setViewport((current) => zoomCanvasViewportWithWheel(current, point, event.deltaY));
    setContextMenu((current) => ({ ...current, open: false }));
  };

  const startConnection = useCallback((_, params) => {
    const next = {
      ...EMPTY_CONNECTION,
      active: true,
      sourceNodeId: params.nodeId || "",
      sourceHandleId: params.handleId || "right",
    };
    connectionCompletedRef.current = false;
    pendingConnectionRef.current = null;
    setPendingConnectionVisual(null);
    updateConnection(next);
    setAddMenu((current) => ({ ...current, open: false }));
    setContextMenu((current) => ({ ...current, open: false }));
  }, [updateConnection]);

  const connectNodes = useCallback((candidate) => {
    connectionCompletedRef.current = true;
    addCanvasConnection(candidate);
  }, [addCanvasConnection]);

  const endConnection = useCallback((event) => {
    const activeConnection = connectionRef.current;
    if (!activeConnection.active) return;
    const touch = "changedTouches" in event ? event.changedTouches?.[0] : null;
    const clientX = touch?.clientX ?? event.clientX;
    const clientY = touch?.clientY ?? event.clientY;
    const target = Number.isFinite(clientX) && Number.isFinite(clientY)
      ? findConnectionTarget(clientX, clientY)
      : null;

    if (!connectionCompletedRef.current && target) {
      connectNodes({
        source: activeConnection.sourceNodeId,
        sourceHandle: activeConnection.sourceHandleId,
        target: target.nodeId,
        targetHandle: target.side,
      });
      setPendingConnectionVisual(null);
      updateConnection(EMPTY_CONNECTION);
    } else if (!connectionCompletedRef.current && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        const menuState = createCanvasConnectionMenuState({ x: clientX - rect.left, y: clientY - rect.top }, rect);
        pendingConnectionRef.current = {
          sourceNodeId: activeConnection.sourceNodeId,
          sourceHandleId: activeConnection.sourceHandleId,
          anchor: { x: clientX - rect.left, y: clientY - rect.top },
        };
        const sourceHandle = Array.from(viewportRef.current.querySelectorAll("[data-creator-port-node]"))
          .find((element) => element.dataset.creatorPortNode === activeConnection.sourceNodeId
            && element.dataset.creatorPortSide === activeConnection.sourceHandleId);
        const sourceRect = sourceHandle?.getBoundingClientRect();
        if (sourceRect) {
          const visualOffset = activeConnection.sourceHandleId === "left" ? -CANVAS_PORT_VISUAL_OFFSET : CANVAS_PORT_VISUAL_OFFSET;
          setPendingConnectionVisual({
            start: {
              x: sourceRect.left + sourceRect.width / 2 - rect.left + visualOffset,
              y: sourceRect.top + sourceRect.height / 2 - rect.top,
            },
            end: { x: clientX - rect.left, y: clientY - rect.top },
            sourceSide: activeConnection.sourceHandleId,
          });
        }
        setAddMenu(menuState);
        updateConnection({
          ...EMPTY_CONNECTION,
          sourceNodeId: activeConnection.sourceNodeId,
          sourceHandleId: activeConnection.sourceHandleId,
        });
      }
    } else {
      setPendingConnectionVisual(null);
      updateConnection(EMPTY_CONNECTION);
    }
  }, [connectNodes, findConnectionTarget, updateConnection]);

  const openContextMenu = (event) => {
    if (event.target.closest("button, textarea, input, .creator-canvas-add-menu")) return;
    event.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nodeElement = event.target.closest("[data-node-id]");
    if (nodeElement) setSelectedNodeId(nodeElement.dataset.nodeId || "");
    const height = nodeElement ? 338 : 282;
    setContextMenu({
      open: true,
      x: clamp(event.clientX - rect.left, 12, rect.width - 232),
      y: clamp(event.clientY - rect.top, 12, rect.height - height - 12),
    });
    setAddMenu((current) => ({ ...current, open: false }));
  };

  const openDockMenu = () => {
    pendingConnectionRef.current = null;
    setPendingConnectionVisual(null);
    updateConnection(EMPTY_CONNECTION);
    setContextMenu((current) => ({ ...current, open: false }));
    setAddMenu((current) => ({ open: current.source === "dock" ? !current.open : true, source: "dock", x: 0, y: 0 }));
  };

  const openContextAddMenu = () => {
    pendingConnectionRef.current = null;
    setPendingConnectionVisual(null);
    updateConnection(EMPTY_CONNECTION);
    const rect = viewportRef.current?.getBoundingClientRect();
    setAddMenu({
      open: true,
      source: "context",
      x: clamp(contextMenu.x, 12, (rect?.width || 1000) - 312),
      y: clamp(contextMenu.y, 12, (rect?.height || 700) - 410),
    });
    setContextMenu((current) => ({ ...current, open: false }));
  };

  const openPortMenu = useCallback((event, nodeId, side) => {
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    pendingConnectionRef.current = { sourceNodeId: nodeId, sourceHandleId: side };
    setAddMenu(createCanvasConnectionMenuState({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect, 12));
    setContextMenu((current) => ({ ...current, open: false }));
  }, []);

  const sendNodePrompt = useCallback((value) => {
    setAssistantPrompt(value);
    onAssistantOpenChange(true);
  }, [onAssistantOpenChange]);

  const flowNodeBlueprints = useMemo(() => nodes.map((node) => {
    const size = NODE_SIZE[node.type] || NODE_SIZE.default;
    return {
      id: node.id,
      type: "creatorCanvasNode",
      position: { x: node.x, y: node.y },
      selected: selectedNodeId === node.id,
      draggable: true,
      style: { width: node.width || size.width, height: node.height || size.height },
      data: {
        node,
        prompt: nodePrompts[node.id] || "",
        connection,
        onPromptChange: (value) => setNodePrompts((current) => ({ ...current, [node.id]: value })),
        onOpenAssets: () => setAssetLibraryOpen(true),
        onOpenAssistant: (value) => value ? sendNodePrompt(value) : onAssistantOpenChange(true),
        onCreateRelated: (type) => {
          const currentViewport = viewportSnapshotRef.current;
          pendingConnectionRef.current = { sourceNodeId: node.id, sourceHandleId: "right" };
          createNode(type, {
            x: (node.x + (node.width || size.width) + 190) * currentViewport.zoom + currentViewport.x,
            y: (node.y + Math.min((node.height || size.height) / 2, 150)) * currentViewport.zoom + currentViewport.y,
          });
        },
        onOpenPortMenu: openPortMenu,
         onRemove: removeSelectedNode,
         onNodeChange: (patch) => updateNode(node.id, patch),
          onResizeEnd: ({ x, y, width, height }) => updateNode(node.id, { x, y, width, height }),
       },
    };
  }), [
    connection,
    createNode,
    nodePrompts,
    nodes,
    onAssistantOpenChange,
    openPortMenu,
    removeSelectedNode,
    sendNodePrompt,
    selectedNodeId,
    updateNode,
  ]);

  useEffect(() => {
    setFlowNodes((current) => {
      const liveNodes = new Map(current.map((node) => [node.id, node]));
      const draggingNodeId = nodeDragStartRef.current?.id;
      return flowNodeBlueprints.map((blueprint) => {
        const liveNode = liveNodes.get(blueprint.id);
        if (liveNode && draggingNodeId === blueprint.id) {
          return { ...blueprint, position: liveNode.position, dragging: liveNode.dragging };
        }
        return blueprint;
      });
    });
  }, [flowNodeBlueprints, setFlowNodes]);

  const startNodeDrag = useCallback((_, flowNode) => {
    nodeDragStartRef.current = { id: flowNode.id, x: flowNode.position.x, y: flowNode.position.y };
    setAddMenu((current) => ({ ...current, open: false }));
    setContextMenu((current) => ({ ...current, open: false }));
  }, []);

  const finishNodeDrag = useCallback((_, flowNode) => {
    const start = nodeDragStartRef.current;
    moveNode(flowNode.id, flowNode.position.x, flowNode.position.y);
    if (start?.id === flowNode.id) commitNodeMove(flowNode.id, start.x, start.y);
    nodeDragStartRef.current = null;
  }, [commitNodeMove, moveNode]);

  return <section className={`creator-studio-canvas${assetLibraryOpen ? " has-assets" : ""}${assistantOpen ? " has-assistant" : ""}`} aria-label={`${project.name}项目画布`}>
    <div
      className={`creator-canvas-viewport${isPanning ? " is-panning" : ""}`}
      ref={viewportRef}
      style={{
        "--canvas-pan-x": `${viewport.x}px`,
        "--canvas-pan-y": `${viewport.y}px`,
        "--canvas-zoom": viewport.zoom,
        "--canvas-grid-size": `${CANVAS_GRID_PITCH * viewport.zoom}px`,
        "--canvas-dot-size": `${CANVAS_DOT_RADIUS * viewport.zoom}px`,
        "--canvas-glow-x": "50%",
        "--canvas-glow-y": "50%",
        "--canvas-glow-opacity": 0,
      }}
      onPointerMoveCapture={movePointer}
      onPointerLeave={hidePointerGlow}
      onContextMenu={openContextMenu}
      onWheelCapture={zoomWithWheel}
    >
      <CanvasDotGrid id={`${gridPatternId}-base`} viewport={viewport} />
      <CanvasDotGrid id={`${gridPatternId}-glow`} viewport={viewport} glow />
      <CreatorCanvasFlowSurface
        nodes={flowNodes}
        edges={edges}
        viewport={viewport}
        onViewportChange={setViewport}
        onNodesChange={onFlowNodesChange}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDragStart={startNodeDrag}
        onNodeDragStop={finishNodeDrag}
        onPaneClick={() => {
          setSelectedNodeId("");
          setAddMenu((current) => ({ ...current, open: false }));
          setContextMenu((current) => ({ ...current, open: false }));
          pendingConnectionRef.current = null;
          setPendingConnectionVisual(null);
          updateConnection(EMPTY_CONNECTION);
        }}
        onMoveStart={(event) => { if (event) setIsPanning(true); }}
        onMoveEnd={() => setIsPanning(false)}
        onConnectStart={startConnection}
        onConnect={connectNodes}
        onConnectEnd={endConnection}
        pendingConnectionVisual={pendingConnectionVisual}
        selectedNodeId={selectedNodeId}
        onCreate={createNode}
      />

      <CanvasViewportTools
        assetLibraryOpen={assetLibraryOpen}
        viewport={viewport}
        onOpenAssets={() => setAssetLibraryOpen(true)}
        onReset={resetViewport}
        onZoom={changeZoom}
      />

      <CanvasContextMenu
        state={contextMenu}
        canUndo={Boolean(past.length)}
        canRedo={Boolean(future.length)}
        hasSelectedNode={Boolean(selectedNode)}
        onOpenAssets={() => { setAssetLibraryOpen(true); setContextMenu((current) => ({ ...current, open: false })); }}
        onOpenAddMenu={openContextAddMenu}
        onUndo={undo}
        onRedo={redo}
        onReset={resetViewport}
        onRemove={removeSelectedNode}
      />
      <CanvasAddMenu id="creator-canvas-add-menu" state={addMenu} onCreate={createNode} />

      <CanvasCreationDock
        menuOpen={addMenu.open && addMenu.source === "dock"}
        onToggleMenu={openDockMenu}
        onCreate={createNode}
      />
    </div>

    {assetLibraryOpen ? <CanvasAssetLibrary nodes={nodes} onClose={() => setAssetLibraryOpen(false)} onSelectNode={setSelectedNodeId} /> : null}
    {assistantOpen ? <CanvasAssistant value={assistantPrompt} onChange={setAssistantPrompt} onClose={() => onAssistantOpenChange(false)} /> : null}
  </section>;
}
