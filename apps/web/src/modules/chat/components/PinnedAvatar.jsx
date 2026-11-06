import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowsInSimple, ArrowsOutSimple, DotsSixVertical, X } from "../../../ui/icons/interfaceIcons.jsx";
import { assetSrc } from "../../../app/services/assets.js";

const EDGE = 12;
const TOP = 64;
const BAR_HEIGHT = 32;
const COMPACT_WIDTH = 176;
const LARGE_WIDTH = 248;
const MAX_WIDTH = 560;
const MIN_WIDTH = 96;
const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function imageHeight(width) {
  return width * 4 / 3;
}

function maxWidth(container) {
  return Math.max(MIN_WIDTH, Math.min(
    MAX_WIDTH,
    container.clientWidth - EDGE * 2,
    (container.clientHeight - TOP - EDGE - BAR_HEIGHT) * 3 / 4,
  ));
}

function fitFrame(frame, container, width = frame.width) {
  const fittedWidth = clamp(width, MIN_WIDTH, maxWidth(container));
  return {
    width: fittedWidth,
    x: clamp(frame.x, EDGE, container.clientWidth - fittedWidth - EDGE),
    y: clamp(frame.y, TOP, container.clientHeight - BAR_HEIGHT - imageHeight(fittedWidth) - EDGE),
  };
}

function resizedFrame(start, edge, deltaX, deltaY, container) {
  const horizontal = edge.includes("e") ? deltaX : edge.includes("w") ? -deltaX : null;
  const vertical = edge.includes("s") ? deltaY * 3 / 4 : edge.includes("n") ? -deltaY * 3 / 4 : null;
  const delta = horizontal === null ? vertical
    : vertical === null || Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
  const width = clamp(start.width + delta, MIN_WIDTH, maxWidth(container));
  return fitFrame({
    width,
    x: edge.includes("w") ? start.x + start.width - width : start.x,
    y: edge.includes("n") ? start.y + imageHeight(start.width) - imageHeight(width) : start.y,
  }, container);
}

export function PinnedAvatar({ src, name, containerRef, onClose }) {
  const tUi = useProductTranslation();
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState({ x: EDGE, y: TOP, width: COMPACT_WIDTH });
  const movedRef = useRef(false);
  const dragRef = useRef(null);

  useEffect(() => setFailed(false), [src]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const fit = () => {
      setFrame((previous) => {
        const fitted = fitFrame(previous, container);
        return movedRef.current ? fitted : { ...fitted, x: Math.max(EDGE, container.clientWidth - fitted.width - EDGE) };
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    movedRef.current = true;
    dragRef.current = { kind: "move", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, frame };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startResize(event, edge) {
    if (event.button !== 0) return;
    movedRef.current = true;
    dragRef.current = { kind: "resize", edge, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, frame };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePointer(event) {
    const start = dragRef.current;
    const container = containerRef.current;
    if (!start || !container || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    if (start.kind === "resize") {
      setFrame(resizedFrame(start.frame, start.edge, deltaX, deltaY, container));
    } else {
      setFrame(fitFrame({ ...start.frame, x: start.frame.x + deltaX, y: start.frame.y + deltaY }, container));
    }
  }

  function toggleSize() {
    const container = containerRef.current;
    if (!container) return;
    movedRef.current = true;
    setFrame((previous) => {
      const width = previous.width > COMPACT_WIDTH + 1 ? COMPACT_WIDTH : LARGE_WIDTH;
      return fitFrame({ ...previous, width }, container);
    });
  }

  function moveWithKeyboard(event) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const container = containerRef.current;
    if (!direction || !container) return;
    event.preventDefault();
    movedRef.current = true;
    setFrame((previous) => ({
      ...previous,
      x: clamp(previous.x + direction[0] * 12, EDGE, container.clientWidth - previous.width - EDGE),
      y: clamp(previous.y + direction[1] * 12, TOP, container.clientHeight - BAR_HEIGHT - imageHeight(previous.width) - EDGE),
    }));
  }

  const isLarge = frame.width > COMPACT_WIDTH + 1;
  const canEnlarge = !containerRef.current || maxWidth(containerRef.current) > frame.width + 1;

  return <aside
    className="pinned-avatar"
    style={{ left: frame.x, top: frame.y, width: frame.width }}
    aria-label={tUi("已固定的{value0}头像", {value0: name || tUi("角色")})}
  >
    <div
      className="pinned-avatar-bar"
      tabIndex={0}
      role="group"
      aria-label={tUi("拖动头像，或用方向键移动")}
      onPointerDown={startDrag}
      onPointerMove={movePointer}
      onPointerUp={() => { dragRef.current = null; }}
      onLostPointerCapture={() => { dragRef.current = null; }}
      onKeyDown={moveWithKeyboard}
    >
      <DotsSixVertical size={15} aria-hidden="true" />
      <span title={name}>{name || tUi("角色")}</span>
      <button type="button" title={isLarge ? tUi("缩小头像") : canEnlarge ? tUi("放大头像") : tUi("窗口空间不足")} aria-label={isLarge ? tUi("缩小头像") : tUi("放大头像")} disabled={!isLarge && !canEnlarge} onClick={toggleSize}>{isLarge ? <ArrowsInSimple size={15} /> : <ArrowsOutSimple size={15} />}</button>
      <button type="button" title={tUi("取消固定")} aria-label={tUi("取消固定头像")} onClick={onClose}><X size={15} /></button>
    </div>
    {failed ? <div className="pinned-avatar-error">{tUi("头像无法加载")}</div>
      : <img src={assetSrc(src)} alt={tUi("{value0}的头像", {value0: name || tUi("角色")})} onError={() => setFailed(true)} draggable="false" />}
    {RESIZE_EDGES.map((edge) => <div
      key={edge}
      className={`pinned-avatar-resize pinned-avatar-resize-${edge}`}
      aria-hidden="true"
      onPointerDown={(event) => startResize(event, edge)}
      onPointerMove={movePointer}
      onPointerUp={() => { dragRef.current = null; }}
      onLostPointerCapture={() => { dragRef.current = null; }}
    />)}
  </aside>;
}
