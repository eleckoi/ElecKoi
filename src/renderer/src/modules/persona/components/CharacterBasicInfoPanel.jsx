import { useEffect, useRef, useState } from "react";
import Avatar from "@douyinfe/semi-ui-19/lib/es/avatar";
import Input from "@douyinfe/semi-ui-19/lib/es/input";
import TextArea from "@douyinfe/semi-ui-19/lib/es/input/textarea";
import { Camera, CheckCircle, CircleNotch, ImageSquare, WarningCircle } from "@phosphor-icons/react";
import { assetSrc } from "../../../app/services/assets.js";
import { AvatarCropModal } from "../../../ui/ui/AvatarCropModal.jsx";

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function LocalImageUpload({ className, label, crop, disabled = false, onSelect, children }) {
  const inputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  const [saving, setSaving] = useState(false);

  function receiveFile(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (file) setCropFile(file);
  }

  async function saveCrop(croppedFile) {
    setSaving(true);
    try {
      const value = await readImage(croppedFile);
      if (!value) throw new Error("Image data is empty");
      await onSelect(value);
      setCropFile(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="character-basic-upload-button"
        aria-label={label}
        disabled={disabled || saving}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        className="character-basic-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={receiveFile}
      />
      <AvatarCropModal
        file={cropFile}
        title={crop.title}
        cropWidth={crop.width}
        cropHeight={crop.height}
        cropRadius={crop.radius}
        outputShape={crop.outputShape}
        outputWidth={crop.outputWidth}
        onCancel={() => setCropFile(null)}
        onSave={saveCrop}
      />
    </div>
  );
}

export function CharacterBasicInfoPanel({ character, dirty, saving, error, saveNotice, onChange, onCancel, onSave }) {
  const persona = character?.persona || {};
  const name = persona.assistant_name || character?.name || "";
  const avatar = persona.assistant_avatar || character?.avatar || "";
  const cover = persona.assistant_cover || character?.coverImage || "";
  const profile = character?.profileLike || "";

  useEffect(() => {
    function handleSaveShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      if (dirty && !saving) void onSave();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [dirty, onSave, saving]);

  let status = null;
  if (error) status = { kind: "error", label: error, Icon: WarningCircle };
  else if (saving) status = { kind: "saving", label: "正在保存…", Icon: CircleNotch };
  else if (dirty) status = { kind: "dirty", label: "有未保存的更改" };
  else if (saveNotice === "saved") status = { kind: "saved", label: "已保存", Icon: CheckCircle };
  else if (saveNotice === "discarded") status = { kind: "discarded", label: "已放弃更改", Icon: CheckCircle };

  return (
    <section className="character-basic-content" aria-label="基础资料">
      <div className="character-basic-sheet">
        <div className="character-basic-avatar-cell">
          <LocalImageUpload
            className="character-basic-avatar-upload"
            label="选择头像"
            crop={{
              title: "裁剪头像",
              width: 250,
              height: 250,
              radius: "999px",
              outputShape: "circle",
              outputWidth: 420,
            }}
            disabled={saving}
            onSelect={(value) => onChange({ persona: { assistant_avatar: value } })}
          >
            <span className="character-basic-avatar-trigger">
              <Avatar
                alt="角色头像"
                shape="circle"
                src={assetSrc(avatar)}
                className="character-basic-avatar"
              >
                <ImageSquare size={30} weight="thin" aria-hidden="true" />
              </Avatar>
              <span className="character-basic-camera-badge" aria-hidden="true">
                <Camera size={19} weight="fill" />
              </span>
            </span>
          </LocalImageUpload>
        </div>

        <label className="character-basic-field character-basic-name-field">
          <span id="character-name-label">角色名字</span>
          <Input
            aria-labelledby="character-name-label"
            value={name}
            maxLength={80}
            showClear
            size="large"
            disabled={saving}
            onChange={(value) => onChange({ name: value, persona: { assistant_name: value } })}
          />
        </label>

        <div className="character-basic-field character-basic-cover-field">
          <span id="character-cover-label">封面立绘</span>
          <LocalImageUpload
            className="character-basic-cover-upload"
            label="选择封面立绘"
            crop={{
              title: "裁剪封面立绘",
              width: 210,
              height: 280,
              radius: "12px",
              outputShape: "portrait",
              outputWidth: 900,
            }}
            disabled={saving}
            onSelect={(value) => onChange({ persona: { assistant_cover: value } })}
          >
            <span className="character-basic-cover-trigger" aria-labelledby="character-cover-label">
              {cover ? (
                <img src={assetSrc(cover)} alt="封面立绘" />
              ) : (
                <ImageSquare size={34} weight="thin" aria-hidden="true" />
              )}
              <span className="character-basic-cover-action" aria-hidden="true">
                <Camera size={17} weight="fill" />
                <span>点击上传图片</span>
              </span>
            </span>
          </LocalImageUpload>
        </div>

        <label className="character-basic-field character-basic-intro-field">
          <span id="character-profile-label">简介</span>
          <TextArea
            aria-labelledby="character-profile-label"
            value={profile}
            maxCount={2000}
            placeholder="请输入内容..."
            resize="none"
            showCounter
            disabled={saving}
            onChange={(value) => onChange({ profileLike: value })}
          />
        </label>
      </div>

      <footer className="character-basic-actions">
        <span
          className={`character-basic-save-status${status ? ` is-${status.kind}` : ""}`}
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
        >
          {status?.Icon ? <status.Icon size={15} weight="bold" aria-hidden="true" /> : null}
          {status?.label || ""}
        </span>
        {dirty ? (
          <button type="button" title="放弃所有未保存的更改" disabled={saving} onClick={onCancel}>放弃更改</button>
        ) : null}
        <button
          type="button"
          className="is-primary"
          title="保存（Ctrl/Command + S）"
          aria-keyshortcuts="Control+S Meta+S"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? "保存中…" : "保存更改"}
        </button>
      </footer>
    </section>
  );
}
