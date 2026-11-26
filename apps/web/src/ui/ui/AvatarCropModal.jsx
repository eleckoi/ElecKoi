import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../styles/product-dialogs.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateLeftIcon, RotateRightIcon } from "../icons/index.jsx";
import { resolveFailure } from "../../utils/failureText.js";
import { encodeCropPng } from './encodeCropPng.js';

const STAGE_WIDTH = 440;
const STAGE_HEIGHT = 320;
const DEFAULT_CROP_WIDTH = 250;
const DEFAULT_CROP_HEIGHT = 250;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fileBaseName(file) {
  const name = file?.name || "avatar";
  return name.replace(/\.[^.]+$/, "") || "avatar";
}

export function AvatarCropModal({
  file,
  title: titleSource,
  cropWidth = DEFAULT_CROP_WIDTH,
  cropHeight = DEFAULT_CROP_HEIGHT,
  cropRadius = "999px",
  showCircleGuide = false,
  outputShape = "circle",
  outputWidth = 420,
  initialTransform,
  onCancel,
  onSave,
  onSaveTransform,
}) {
  const tUi = useProductTranslation();
  const title = titleSource === undefined ? tUi("编辑图片") : titleSource;
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const transformRef = useRef({ zoom: 1, offset: { x: 0, y: 0 } });
  const encodingRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  transformRef.current = { zoom, offset };

  const quarterTurn = Math.abs(rotation % 180) === 90;
  const orientedSize = useMemo(
    () => ({
      width: quarterTurn ? naturalSize.height : naturalSize.width,
      height: quarterTurn ? naturalSize.width : naturalSize.height,
    }),
    [naturalSize.height, naturalSize.width, quarterTurn],
  );

  const baseScale = useMemo(() => {
    if (!orientedSize.width || !orientedSize.height) return 1;
    return Math.max(cropWidth / orientedSize.width, cropHeight / orientedSize.height);
  }, [cropHeight, cropWidth, orientedSize]);

  const displaySize = useMemo(
    () => ({
      width: orientedSize.width * baseScale * zoom,
      height: orientedSize.height * baseScale * zoom,
    }),
    [baseScale, orientedSize, zoom],
  );

  useEffect(() => {
    if (!file) return undefined;
    const nextUrl = URL.createObjectURL(file);
    const initialZoom = initialTransform?.zoom ?? 1;
    const initialOffset = initialTransform?.offset ?? { x: 0, y: 0 };
    setImageUrl(nextUrl);
    setNaturalSize({ width: 0, height: 0 });
    setZoom(initialZoom);
    setOffset(initialOffset);
    setRotation(initialTransform?.rotation ?? 0);
    setSaving(false);
    setError("");
    pointersRef.current.clear();
    gestureRef.current = null;
    transformRef.current = { zoom: initialZoom, offset: initialOffset };
    return () => { encodingRef.current?.abort(); URL.revokeObjectURL(nextUrl); };
  }, [file, initialTransform]);

  function clampOffset(nextOffset, nextZoom = zoom) {
    const width = orientedSize.width * baseScale * nextZoom;
    const height = orientedSize.height * baseScale * nextZoom;
    const maxX = Math.max(0, (width - cropWidth) / 2);
    const maxY = Math.max(0, (height - cropHeight) / 2);
    return {
      x: clamp(nextOffset.x, -maxX, maxX),
      y: clamp(nextOffset.y, -maxY, maxY),
    };
  }

  function handleImageLoad(event) {
    setNaturalSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
  }

  function handleZoomChange(event) {
    const nextZoom = Number(event.target.value);
    updateTransform(nextZoom, transformRef.current.offset);
  }

  function zoomByWheel(event) {
    if (saving) return;
    event.preventDefault();
    const nextZoom = clamp(transformRef.current.zoom - event.deltaY * 0.0016, 1, 3);
    updateTransform(nextZoom, transformRef.current.offset);
  }

  function updateTransform(nextZoom, nextOffset) {
    const bounded = clampOffset(nextOffset, nextZoom);
    transformRef.current = { zoom: nextZoom, offset: bounded };
    setZoom(nextZoom);
    setOffset(bounded);
  }

  function pointerPosition(event) {
    const stage = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - stage.left - stage.width / 2, y: event.clientY - stage.top - stage.height / 2 };
  }

  function startGesture() {
    const [first, second] = pointersRef.current.values();
    const current = transformRef.current;
    gestureRef.current = second ? {
      kind: 'pinch', zoom: current.zoom, offset: current.offset,
      x: (first.x + second.x) / 2, y: (first.y + second.y) / 2,
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    } : first ? { kind: 'drag', ...first, offset: current.offset } : null;
  }

  function beginDrag(event) {
    if (saving || !naturalSize.width || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startGesture();
  }

  function dragImage(event) {
    if (saving) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    const [first, second] = pointersRef.current.values(), gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === 'pinch') {
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (!gesture.distance) { startGesture(); return; }
      const nextZoom = clamp(gesture.zoom * distance / gesture.distance, 1, 3);
      const ratio = nextZoom / gesture.zoom;
      updateTransform(nextZoom, {
        x: (first.x + second.x) / 2 - (gesture.x - gesture.offset.x) * ratio,
        y: (first.y + second.y) / 2 - (gesture.y - gesture.offset.y) * ratio,
      });
    } else {
      updateTransform(transformRef.current.zoom, {
        x: gesture.offset.x + first.x - gesture.x,
        y: gesture.offset.y + first.y - gesture.y,
      });
    }
  }

  function endDrag(event) {
    if (!pointersRef.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    startGesture();
  }

  function rotateBy(degrees) {
    setRotation((current) => current + degrees);
    updateTransform(transformRef.current.zoom, { x: 0, y: 0 });
    pointersRef.current.clear();
    gestureRef.current = null;
  }

  async function saveCrop() {
    if (!file || !stageRef.current || !imageRef.current || !naturalSize.width || !naturalSize.height || encodingRef.current) return;
    const encoding = new AbortController();
    encodingRef.current = encoding;
    pointersRef.current.clear();
    gestureRef.current = null;
    let orientedCanvas, canvas;
    setSaving(true);
    setError("");

    try {
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      if (onSaveTransform) {
        await onSaveTransform({ zoom, offset, rotation: normalizedRotation });
        return;
      }
      const scale = baseScale * zoom;
      const stage = stageRef.current.getBoundingClientRect();
      const stageWidth = stage.width || STAGE_WIDTH;
      const stageHeight = stage.height || STAGE_HEIGHT;
      const cropLeft = stageWidth / 2 - cropWidth / 2;
      const cropTop = stageHeight / 2 - cropHeight / 2;
      const imageLeft = stageWidth / 2 + offset.x - displaySize.width / 2;
      const imageTop = stageHeight / 2 + offset.y - displaySize.height / 2;
      const sourceX = clamp((cropLeft - imageLeft) / scale, 0, orientedSize.width);
      const sourceY = clamp((cropTop - imageTop) / scale, 0, orientedSize.height);
      const sourceWidth = cropWidth / scale;
      const sourceHeight = cropHeight / scale;

      orientedCanvas = document.createElement("canvas");
      orientedCanvas.width = orientedSize.width;
      orientedCanvas.height = orientedSize.height;
      const orientedContext = orientedCanvas.getContext("2d");
      if (!orientedContext) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, "当前设备无法处理图片", { what: "设备上的图片处理能力" });
      orientedContext.translate(orientedCanvas.width / 2, orientedCanvas.height / 2);
      orientedContext.rotate((normalizedRotation * Math.PI) / 180);
      orientedContext.drawImage(imageRef.current, -naturalSize.width / 2, -naturalSize.height / 2);

      canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = Math.round(outputWidth * cropHeight / cropWidth);
      const context = canvas.getContext("2d");
      if (!context) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, "当前设备无法处理图片", { what: "设备上的图片处理能力" });
      if (outputShape === "circle") {
        context.save();
        context.beginPath();
        context.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
        context.clip();
      }
      context.drawImage(orientedCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      if (outputShape === "circle") context.restore();

      const blob = await encodeCropPng(canvas, encoding.signal);
      encoding.signal.throwIfAborted();
      if (!blob) throw new DesktopError(ELECKOI_FAILURE_CODES.mediaInvalid, "图片处理失败", { what: "裁剪后的图片" });
      const croppedFile = new File([blob], `${fileBaseName(file)}-cropped.png`, { type: "image/png" });
      await onSave?.(croppedFile, file);
    } catch (nextError) {
      if (!encoding.signal.aborted) setError(resolveFailure(nextError, { fallback: tUi("图片保存失败，请稍后重试。") }).text);
    } finally {
      if (orientedCanvas) orientedCanvas.width = orientedCanvas.height = 0;
      if (canvas) canvas.width = canvas.height = 0;
      if (encodingRef.current === encoding) encodingRef.current = null;
      if (!encoding.signal.aborted) setSaving(false);
    }
  }

  if (!file) return null;

  const frameStyle = {
    width: `${cropWidth}px`,
    height: `${cropHeight}px`,
    top: `calc(50% - ${cropHeight / 2}px)`,
    left: `calc(50% - ${cropWidth / 2}px)`,
    borderRadius: cropRadius,
  };

  return <Modal open title={title} closeLabel={tUi('关闭')} onClose={() => { if (!saving) onCancel(); }}
    className="product-dialog avatar-crop-modal" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions"><Button variant="outline" disabled={saving} onClick={onCancel}>{tUi('取消')}</Button><Button variant="primary" onClick={saveCrop} disabled={saving || !naturalSize.width}>{saving ? tUi('保存中') : tUi('保存')}</Button></div>}>
        <div
          ref={stageRef}
          className="avatar-crop-stage"
          onPointerDown={beginDrag}
          onPointerMove={dragImage}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onWheel={zoomByWheel}
        >
          {imageUrl ? (
            <div
              className="avatar-crop-image-transform"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)` }}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                draggable="false"
                onLoad={handleImageLoad}
                style={{
                  width: `${naturalSize.width * baseScale * zoom || cropWidth}px`,
                  height: `${naturalSize.height * baseScale * zoom || cropHeight}px`,
                }}
              />
            </div>
          ) : null}
          <div
            className={`avatar-crop-frame${showCircleGuide ? " has-circle-guide" : ""}`}
            aria-hidden="true"
            style={frameStyle}
          >
            {showCircleGuide ? <span className="avatar-crop-circle-guide" /> : null}
          </div>
        </div>

        <div className="avatar-crop-controls">
          <Button size="sm" variant="ghost" title={tUi("向左旋转 90°")} aria-label={tUi("向左旋转 90°")} disabled={saving} icon={<RotateLeftIcon />} onClick={() => rotateBy(-90)} />
          <input className="avatar-crop-zoom" aria-label={tUi("缩放图片")} type="range" min="1" max="3" step="0.01" value={zoom} disabled={saving}
            style={{ '--crop-zoom-progress': `${(zoom - 1) * 50}%` }} onChange={handleZoomChange} />
          <Button size="sm" variant="ghost" title={tUi("向右旋转 90°")} aria-label={tUi("向右旋转 90°")} disabled={saving} icon={<RotateRightIcon />} onClick={() => rotateBy(90)} />
        </div>
        <p className={error ? "avatar-crop-error" : "avatar-crop-hint"} role={error ? "alert" : undefined}>
          {error || tUi("拖动调整位置，双指或滚轮缩放")}
        </p>

  </Modal>;
}
