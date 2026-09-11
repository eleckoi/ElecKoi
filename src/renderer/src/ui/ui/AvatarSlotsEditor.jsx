import { useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Avatar } from "./Avatar.jsx";
import { AvatarCropModal } from "./AvatarCropModal.jsx";

const PORTRAIT_OUTPUT_WIDTH = 900;
const SQUARE_OUTPUT_WIDTH = 420;

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片解码失败"));
    };
    image.src = url;
  });
}

async function centerCrop(file, outputWidth, outputHeight) {
  const image = await loadImage(file);
  const targetAspect = outputWidth / outputHeight;
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceAspect > targetAspect) {
    sourceWidth = image.naturalHeight * targetAspect;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetAspect;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法处理图片");
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL("image/png", 0.95);
}

async function sourceToFile(source, name) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("头像图片读取失败");
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

export function avatarSetFromPersona(persona, owner = "assistant") {
  if (owner === "user") {
    return {
      circle: persona?.user_avatar || "",
      square: persona?.user_square || "",
      portrait: persona?.user_portrait || "",
    };
  }
  return {
    circle: persona?.assistant_avatar || "",
    square: persona?.assistant_square || "",
    portrait: persona?.assistant_cover || "",
  };
}

function PreviewButton({ className, src, name, label, disabled = false, onClick }) {
  return (
    <button type="button" className={`avatar-manager-preview-button ${className}`} aria-label={`调整${label}裁剪`} disabled={disabled} onClick={onClick}>
      <Avatar src={src} name={name} className="avatar-manager-result-avatar" />
      <span>{label}</span>
    </button>
  );
}

export function AvatarManagerEditor({ value, name, saving = false, onBack, onSave }) {
  const inputRef = useRef(null);
  const [avatars, setAvatars] = useState(() => ({ circle: "", square: "", portrait: "", ...(value || {}) }));
  const [sourceFile, setSourceFile] = useState(null);
  const [cropRequest, setCropRequest] = useState(null);
  const [reading, setReading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const busy = saving || reading || preparing;

  async function persist(nextAvatars) {
    await onSave?.(nextAvatars);
    setAvatars(nextAvatars);
  }

  function chooseImage() {
    if (!busy) inputRef.current?.click();
  }

  async function receiveImage(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const [portrait, square] = await Promise.all([
        centerCrop(file, PORTRAIT_OUTPUT_WIDTH, Math.round(PORTRAIT_OUTPUT_WIDTH * 4 / 3)),
        centerCrop(file, SQUARE_OUTPUT_WIDTH, SQUARE_OUTPUT_WIDTH),
      ]);
      const nextAvatars = { portrait, square, circle: square };
      await persist(nextAvatars);
      setSourceFile(file);
    } catch (nextError) {
      setError(nextError?.message || "图片处理失败，请稍后重试。");
    } finally {
      setReading(false);
    }
  }

  async function openCrop(kind) {
    if (busy) return;
    const existing = kind === "portrait" ? avatars.portrait : avatars.square || avatars.circle;
    if (!sourceFile && !existing) {
      chooseImage();
      return;
    }

    setPreparing(true);
    setError("");
    try {
      const file = sourceFile || await sourceToFile(existing, kind === "portrait" ? "rectangle-avatar.png" : "square-avatar.png");
      setCropRequest({ kind, file });
    } catch (nextError) {
      setError(nextError?.message || "头像图片读取失败");
    } finally {
      setPreparing(false);
    }
  }

  async function saveCrop(croppedFile) {
    setError("");
    try {
      const cropped = await readBlob(croppedFile);
      if (!cropped) throw new Error("图片处理失败");
      const nextAvatars = cropRequest?.kind === "portrait"
        ? { ...avatars, portrait: cropped }
        : { ...avatars, circle: cropped, square: cropped };
      await persist(nextAvatars);
      setCropRequest(null);
    } catch (nextError) {
      setError(nextError?.message || "头像保存失败，请稍后重试。");
      throw nextError;
    }
  }

  return (
    <section className="profile-avatar-manager-page">
      <header className="avatar-manager-header">
        <div className="avatar-manager-heading">
          <button type="button" className="avatar-manager-back" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            <span>返回用户资料</span>
          </button>
          <h1>头像管理</h1>
        </div>
        <div className="avatar-manager-header-actions">
          {error ? <span className="error" role="alert">{error}</span> : null}
          <button type="button" className="settings-primary-button" disabled={busy} onClick={chooseImage}>
            {reading ? "正在处理" : saving ? "正在保存" : preparing ? "正在载入" : "更换图片"}
          </button>
        </div>
      </header>

      <div className="avatar-manager-results">
        <section className="avatar-manager-result-group is-portrait" aria-labelledby="rectangle-avatar-heading">
          <header>
            <h2 id="rectangle-avatar-heading">矩形头像</h2>
            <button type="button" disabled={busy} onClick={() => openCrop("portrait")}>调整裁剪</button>
          </header>
          <PreviewButton
            className="is-portrait"
            src={avatars.portrait}
            name={name}
            label="矩形头像"
            disabled={busy}
            onClick={() => openCrop("portrait")}
          />
        </section>

        <section className="avatar-manager-result-group is-shared" aria-labelledby="shared-avatar-heading">
          <header>
            <h2 id="shared-avatar-heading">圆形与方形</h2>
            <button type="button" disabled={busy} onClick={() => openCrop("shared")}>调整裁剪</button>
          </header>
          <div className="avatar-manager-shared-previews">
            <PreviewButton
              className="is-circle"
              src={avatars.circle || avatars.square}
              name={name}
              label="圆形头像"
              disabled={busy}
              onClick={() => openCrop("shared")}
            />
            <PreviewButton
              className="is-square"
              src={avatars.square || avatars.circle}
              name={name}
              label="方形头像"
              disabled={busy}
              onClick={() => openCrop("shared")}
            />
          </div>
        </section>
      </div>

      <input
        ref={inputRef}
        className="avatar-manager-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={receiveImage}
      />

      <AvatarCropModal
        file={cropRequest?.file || null}
        title={cropRequest?.kind === "portrait" ? "调整矩形头像" : "调整圆形与方形头像"}
        cropWidth={cropRequest?.kind === "portrait" ? 210 : 250}
        cropHeight={cropRequest?.kind === "portrait" ? 280 : 250}
        cropRadius={cropRequest?.kind === "portrait" ? "12px" : "8px"}
        showCircleGuide={cropRequest?.kind === "shared"}
        outputShape={cropRequest?.kind === "portrait" ? "portrait" : "square"}
        outputWidth={cropRequest?.kind === "portrait" ? PORTRAIT_OUTPUT_WIDTH : SQUARE_OUTPUT_WIDTH}
        onCancel={() => setCropRequest(null)}
        onSave={saveCrop}
      />
    </section>
  );
}
