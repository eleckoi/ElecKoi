import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DshCheckIcon, DshCloseIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { PictureFrameIcon } from "../../../ui/icons/openSourceIcons.jsx";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { AvatarCropModal } from "../../../ui/ui/AvatarCropModal.jsx";
import { TunerSliderRow } from "../../../ui/ui/TunerSliderRow.jsx";
import {
  APP_DEFAULT_CHAT_BACKGROUND,
  CHAT_WALLPAPER_DEFAULTS,
  CUSTOM_CHAT_BACKGROUND,
  GLOBAL_CHAT_BACKGROUND,
  characterArtwork,
  chatWallpaperMode,
  fileToDataUrl,
  normalizeGlobalChatWallpaper,
  normalizeNewCharacterBackground,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "../../appearance/index.js";

const MODES = [
  ["default", "纯色背景"],
  ["character", "角色立绘"],
  ["custom", "自定义图片"],
  ["global", "共享背景"],
];

const LAYOUT_NAMES = {
  social: "社交气泡",
  agent: "助手对话",
  roleplay: "角色扮演",
};

const clampPercent = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(Math.max(number, 0), 100)) : fallback;
};

const clampNumber = (value, minimum, maximum) => Math.min(Math.max(Number(value), minimum), maximum);

function SelectionIndicator({ selected }) {
  return (
    <span className={`chat-background-selection${selected ? " selected" : ""}`} aria-hidden="true">
      {selected ? <DshCheckIcon size={14} /> : null}
    </span>
  );
}

function previewText(message, fallback) {
  const source = String(message?.displayContent ?? message?.content ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_#>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return source ? `${source.slice(0, 62)}${source.length > 62 ? "…" : ""}` : fallback;
}

function ChatBackgroundPreview({ image, opacity, blur, scrim, persona, messages, chatDisplay }) {
  const { layout, profile } = resolveChatDisplayProfile(chatDisplay);
  const avatarShape = resolveChatAvatarShape(layout, profile?.avatar_shape || "portrait");
  const userMessage = [...(messages || [])].reverse().find((item) => item?.role === "user");
  const assistantMessage = [...(messages || [])].reverse().find((item) => item?.role === "assistant" && String(item?.displayContent ?? item?.content ?? "").trim());
  const rows = [
    {
      role: "user",
      name: persona?.user_name || "你",
      avatar: resolveChatAvatar(persona, "user", avatarShape),
      text: previewText(userMessage, "今天想从哪里开始？"),
    },
    {
      role: "assistant",
      name: persona?.assistant_name || "角色",
      avatar: resolveChatAvatar(persona, "assistant", avatarShape),
      text: previewText(assistantMessage, "从你最在意的那件事开始。"),
    },
  ];

  return (
    <div
      className={`chat-background-preview layout-${layout}${profile?.assistant_bubble_enabled ? " assistant-bubble-enabled" : ""}`}
      data-avatar-shape={avatarShape}
      data-has-image={image ? "true" : "false"}
      style={{ "--preview-bubble-radius": `${clampNumber(profile?.bubble_corner_radius ?? 10, 0, 24)}px` }}
    >
      {image ? <img className="chat-background-preview-image" src={image} alt="" draggable="false" style={{ opacity: opacity / 100, filter: `blur(${blur}px)` }} /> : null}
      <i className="chat-background-preview-scrim" style={{ opacity: image ? scrim / 100 : 0 }} />
      <div className="chat-background-preview-messages" aria-label={`${LAYOUT_NAMES[layout] || "聊天"}布局预览`}>
        {rows.map((row) => (
          <div className={`chat-background-preview-message ${row.role}`} key={row.role}>
            <Avatar className="chat-background-preview-avatar" src={row.avatar} name={row.name} />
            <div>
              <strong>{row.name}</strong>
              <p>{row.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatBackgroundModal({
  open,
  character,
  persona,
  messages,
  chatDisplay,
  globalWallpaper,
  newCharacterBackground,
  onClose,
  onSaveCharacter,
  onSaveGlobal,
  onSaveNewCharacterBackground,
  onNotify,
}) {
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState("character");
  const [customImage, setCustomImage] = useState("");
  const [globalDraft, setGlobalDraft] = useState(() => normalizeGlobalChatWallpaper(globalWallpaper));
  const [defaultBackground, setDefaultBackground] = useState(() => normalizeNewCharacterBackground(newCharacterBackground));
  const [opacity, setOpacity] = useState(72);
  const [blur, setBlur] = useState(2);
  const [scrim, setScrim] = useState(50);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [cropTarget, setCropTarget] = useState("custom");

  useEffect(() => {
    if (!open) return;
    const background = character?.chatBackground || "";
    setMode(chatWallpaperMode(background));
    setCustomImage(background && !background.startsWith("eleckoi://") ? background : "");
    setGlobalDraft(normalizeGlobalChatWallpaper(globalWallpaper));
    setDefaultBackground(normalizeNewCharacterBackground(newCharacterBackground));
    setOpacity(clampPercent(Number(character?.chatBackgroundOpacity ?? CHAT_WALLPAPER_DEFAULTS.opacity) * 100, 72));
    setBlur(Math.round(Number(character?.chatBackgroundBlur ?? CHAT_WALLPAPER_DEFAULTS.blur)));
    setScrim(clampPercent(Number(character?.chatBackgroundScrim ?? CHAT_WALLPAPER_DEFAULTS.scrim) * 100, 50));
    setCropFile(null);
    window.setTimeout(() => dialogRef.current?.focus(), 0);
  }, [character, globalWallpaper, newCharacterBackground, open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const cardImage = useMemo(() => characterArtwork(character, persona), [character, persona]);
  const previewImage = mode === "character"
    ? cardImage
    : mode === "custom"
      ? customImage
      : mode === "global"
        ? globalDraft.image
        : "";
  const selectedImage = mode === "global" ? globalDraft.image : customImage;
  const activeOpacity = mode === "global" ? clampPercent(globalDraft.opacity * 100, 72) : opacity;
  const activeBlur = mode === "global" ? Math.round(globalDraft.blur) : blur;
  const activeScrim = mode === "global" ? clampPercent(globalDraft.scrim * 100, 50) : scrim;

  if (!open) return null;

  function setActiveOpacity(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, opacity: value / 100 }));
    else setOpacity(value);
  }

  function setActiveBlur(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, blur: value }));
    else setBlur(value);
  }

  function setActiveScrim(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, scrim: value / 100 }));
    else setScrim(value);
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotify?.("error", "请选择图片文件。");
      return;
    }
    setCropTarget(mode === "global" ? "global" : "custom");
    setCropFile(file);
  }

  async function saveCroppedImage(file) {
    try {
      setBusy(true);
      const image = await fileToDataUrl(file);
      if (cropTarget === "global") setGlobalDraft((current) => ({ ...current, image }));
      else {
        setMode("custom");
        setCustomImage(image);
      }
    } catch (error) {
      onNotify?.("error", error?.message || "图片读取失败。");
    } finally {
      setBusy(false);
      setCropFile(null);
    }
  }

  async function save() {
    const background = mode === "default"
      ? APP_DEFAULT_CHAT_BACKGROUND
      : mode === "global"
        ? GLOBAL_CHAT_BACKGROUND
        : mode === "custom"
          ? customImage || CUSTOM_CHAT_BACKGROUND
          : "";
    const values = {
      chatBackground: background,
      chatBackgroundOpacity: activeOpacity / 100,
      chatBackgroundBlur: activeBlur,
      chatBackgroundScrim: activeScrim / 100,
    };
    try {
      setBusy(true);
      if (defaultBackground !== normalizeNewCharacterBackground(newCharacterBackground)) {
        await onSaveNewCharacterBackground?.(defaultBackground);
      }
      if (mode === "global") await onSaveGlobal?.(globalDraft);
      await onSaveCharacter?.(values);
      onNotify?.("success", "聊天背景已保存。");
      onClose?.();
    } catch (error) {
      onNotify?.("error", error?.message || "聊天背景保存失败。");
    } finally {
      setBusy(false);
    }
  }

  return createPortal((<>
    <div className="chat-background-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="chat-background-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-background-title"
        tabIndex={-1}
        ref={dialogRef}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id="chat-background-title">聊天背景</strong>
            <span>{character?.name || persona?.assistant_name || "当前角色"}</span>
          </div>
          <button type="button" aria-label="关闭" title="关闭" onClick={onClose}><DshCloseIcon /></button>
        </header>

        <div className="chat-background-body">
          <section className="chat-background-source">
            <h3>当前角色</h3>
            <div className="chat-background-modes" role="radiogroup" aria-label="当前角色背景来源">
              {MODES.map(([value, label]) => {
                const selected = mode === value;
                return (
                  <button key={value} type="button" role="radio" aria-checked={selected} className={selected ? "active" : ""} onClick={() => setMode(value)}>
                    <SelectionIndicator selected={selected} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="chat-background-preview-panel">
            <div className="chat-background-section-heading">
              <h3>预览</h3>
              <span>{LAYOUT_NAMES[resolveChatDisplayProfile(chatDisplay).layout] || "聊天布局"}</span>
            </div>
            <ChatBackgroundPreview
              image={previewImage}
              opacity={activeOpacity}
              blur={activeBlur}
              scrim={activeScrim}
              persona={persona}
              messages={messages}
              chatDisplay={chatDisplay}
            />

            {mode !== "default" ? (
              <div className="chat-background-controls">
                {mode === "custom" || mode === "global" ? (
                  <button className="chat-background-upload" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <PictureFrameIcon size={17} />
                    {busy ? "正在读取…" : selectedImage ? "更换图片" : "选择图片"}
                  </button>
                ) : null}
                <div className="chat-background-sliders">
                  <TunerSliderRow label="背景透明度" value={activeOpacity} min={12} max={100} suffix="%" defaultValue={72} onChange={setActiveOpacity} />
                  <TunerSliderRow label="背景模糊" value={activeBlur} min={0} max={24} suffix="px" defaultValue={2} onChange={setActiveBlur} />
                  <TunerSliderRow label="阅读遮罩" value={activeScrim} min={0} max={100} suffix="%" defaultValue={50} onChange={setActiveScrim} />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="chat-background-import-default" aria-labelledby="chat-background-import-title">
          <div>
            <h3 id="chat-background-import-title">新角色默认背景</h3>
            <span>应用于之后新建或导入的角色，可随时单独覆盖</span>
          </div>
          <div className="chat-background-segmented" role="radiogroup" aria-label="新角色默认背景">
            <button type="button" role="radio" aria-checked={defaultBackground === "app"} className={defaultBackground === "app" ? "active" : ""} onClick={() => setDefaultBackground("app")}>纯色背景</button>
            <button type="button" role="radio" aria-checked={defaultBackground === "character"} className={defaultBackground === "character" ? "active" : ""} onClick={() => setDefaultBackground("character")}>角色立绘</button>
          </div>
        </section>

        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="button" disabled={busy} onClick={save}>保存</button>
        </footer>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage} />
      </section>
    </div>
    <AvatarCropModal
      file={cropFile}
      title="裁剪聊天背景"
      cropWidth={400}
      cropHeight={225}
      cropRadius="12px"
      outputShape="rectangle"
      outputWidth={1920}
      onCancel={() => setCropFile(null)}
      onSave={saveCroppedImage}
    />
  </>), document.body);
}
