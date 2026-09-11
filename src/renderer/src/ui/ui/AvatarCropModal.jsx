import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateLeftIcon, RotateRightIcon, XIcon } from "../icons/index.jsx";

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
  title = "编辑图片",
  cropWidth = DEFAULT_CROP_WIDTH,
  cropHeight = DEFAULT_CROP_HEIGHT,
  cropRadius = "999px",
  showCircleGuide = false,
  outputShape = "circle",
  outputWidth = 420,
  onCancel,
  onSave,
}) {
  const windowRef = useRef(null);
  const closeRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const savingRef = useRef(false);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

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
    setImageUrl(nextUrl);
    setNaturalSize({ width: 0, height: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setSaving(false);
    setError("");
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    if (!file || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusClose = window.requestAnimationFrame(() => closeRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) cancelRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !windowRef.current) return;
      const focusable = [...windowRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
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
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusClose);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [file]);

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
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  function zoomByWheel(event) {
    event.preventDefault();
    const nextZoom = clamp(zoom - event.deltaY * 0.0016, 1, 3);
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  function beginDrag(event) {
    event.preventDefault();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      offset,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function dragImage(event) {
    if (!dragRef.current) return;
    const nextOffset = {
      x: dragRef.current.offset.x + event.clientX - dragRef.current.x,
      y: dragRef.current.offset.y + event.clientY - dragRef.current.y,
    };
    setOffset(clampOffset(nextOffset));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function rotateBy(degrees) {
    setRotation((current) => current + degrees);
    setOffset({ x: 0, y: 0 });
  }

  async function saveCrop() {
    if (!file || !stageRef.current || !imageRef.current || !naturalSize.width || !naturalSize.height) return;
    setSaving(true);
    savingRef.current = true;
    setError("");

    try {
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

      const normalizedRotation = ((rotation % 360) + 360) % 360;
      const orientedCanvas = document.createElement("canvas");
      orientedCanvas.width = orientedSize.width;
      orientedCanvas.height = orientedSize.height;
      const orientedContext = orientedCanvas.getContext("2d");
      if (!orientedContext) throw new Error("当前设备无法处理图片");
      orientedContext.translate(orientedCanvas.width / 2, orientedCanvas.height / 2);
      orientedContext.rotate((normalizedRotation * Math.PI) / 180);
      orientedContext.drawImage(imageRef.current, -naturalSize.width / 2, -naturalSize.height / 2);

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = Math.round(outputWidth * cropHeight / cropWidth);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前设备无法处理图片");
      if (outputShape === "circle") {
        context.save();
        context.beginPath();
        context.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
        context.clip();
      }
      context.drawImage(orientedCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      if (outputShape === "circle") context.restore();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) throw new Error("图片处理失败");
      const croppedFile = new File([blob], `${fileBaseName(file)}-cropped.png`, { type: "image/png" });
      await onSave?.(croppedFile, file);
    } catch (nextError) {
      setError(nextError?.message || "图片保存失败，请稍后重试。");
    } finally {
      savingRef.current = false;
      setSaving(false);
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

  const modal = (
    <div className="avatar-crop-overlay" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel?.();
    }}>
      <div ref={windowRef} className="avatar-crop-window">
        <button ref={closeRef} className="avatar-crop-close" type="button" title="关闭" aria-label="关闭" disabled={saving} onClick={onCancel}>
          <XIcon />
        </button>
        <h2>{title}</h2>

        <div
          ref={stageRef}
          className="avatar-crop-stage"
          onPointerDown={beginDrag}
          onPointerMove={dragImage}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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
          <button type="button" title="向左旋转 90°" aria-label="向左旋转 90°" onClick={() => rotateBy(-90)}>
            <RotateLeftIcon />
          </button>
          <input className="avatar-crop-zoom" aria-label="缩放图片" type="range" min="1" max="3" step="0.01" value={zoom} onChange={handleZoomChange} />
          <button type="button" title="向右旋转 90°" aria-label="向右旋转 90°" onClick={() => rotateBy(90)}>
            <RotateRightIcon />
          </button>
        </div>
        <p className={error ? "avatar-crop-error" : "avatar-crop-hint"} role={error ? "alert" : undefined}>
          {error || "拖动图片调整位置，滚轮可缩放"}
        </p>

        <div className="avatar-crop-actions">
          <button type="button" className="avatar-crop-cancel" disabled={saving} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="avatar-crop-save" onClick={saveCrop} disabled={saving || !naturalSize.width}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;

  return portalTarget ? createPortal(modal, portalTarget) : modal;
}
