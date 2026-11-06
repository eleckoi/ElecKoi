import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { assetSrc } from '../../../app/services/assets.js';
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
  customChatBackgroundFromCharacter,
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
  const tUi = useProductTranslation();
  const { layout, profile } = resolveChatDisplayProfile(chatDisplay);
  const avatarShape = resolveChatAvatarShape(layout, profile?.avatar_shape || "portrait");
  const userMessage = [...(messages || [])].reverse().find((item) => item?.role === "user");
  const assistantMessage = [...(messages || [])].reverse().find((item) => item?.role === "assistant" && String(item?.displayContent ?? item?.content ?? "").trim());
  const rows = [
    {
      role: "user",
      name: persona?.user_name || tUi("你"),
      avatar: resolveChatAvatar(persona, "user", avatarShape),
      text: previewText(userMessage, tUi("今天想从哪里开始？")),
    },
    {
      role: "assistant",
      name: persona?.assistant_name || tUi("角色"),
      avatar: resolveChatAvatar(persona, "assistant", avatarShape),
      text: previewText(assistantMessage, tUi("从你最在意的那件事开始。")),
    },
  ];

  return (
    <div
      className={`chat-background-preview layout-${layout}${profile?.assistant_bubble_enabled ? " assistant-bubble-enabled" : ""}`}
      data-avatar-shape={avatarShape}
      data-has-image={image ? "true" : "false"}
      style={{ "--preview-bubble-radius": `${clampNumber(profile?.bubble_corner_radius ?? 10, 0, 24)}px` }}
    >
      {image ? <img className="chat-background-preview-image" src={assetSrc(image)} alt="" draggable="false" style={{ opacity: opacity / 100, filter: `blur(${blur}px)` }} /> : null}
      <i className="chat-background-preview-scrim" style={{ opacity: image ? scrim / 100 : 0 }} />
      <div className="chat-background-preview-messages" aria-label={tUi("{value0}布局预览", {value0: localizeUiCopy(LAYOUT_NAMES, tUi)[layout] || tUi("聊天")})}>
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
  const tUi = useProductTranslation();
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState("character");
  const [customImage, setCustomImage] = useState("");
  const [customTuning, setCustomTuning] = useState(CHAT_WALLPAPER_DEFAULTS);
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
    const custom = customChatBackgroundFromCharacter(character);
    setCustomImage(custom.image);
    setCustomTuning({ opacity: custom.opacity, blur: custom.blur, scrim: custom.scrim });
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
  const activeOpacity = mode === "global" ? clampPercent(globalDraft.opacity * 100, 72) : mode === 'custom' ? clampPercent(customTuning.opacity * 100, 72) : opacity;
  const activeBlur = mode === "global" ? Math.round(globalDraft.blur) : mode === 'custom' ? customTuning.blur : blur;
  const activeScrim = mode === "global" ? clampPercent(globalDraft.scrim * 100, 50) : mode === 'custom' ? clampPercent(customTuning.scrim * 100, 50) : scrim;

  if (!open) return null;

  function setActiveOpacity(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, opacity: value / 100 }));
    else if (mode === 'custom') setCustomTuning(current => ({ ...current, opacity: value / 100 }));
    else setOpacity(value);
  }

  function setActiveBlur(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, blur: value }));
    else if (mode === 'custom') setCustomTuning(current => ({ ...current, blur: value }));
    else setBlur(value);
  }

  function setActiveScrim(value) {
    if (mode === "global") setGlobalDraft((current) => ({ ...current, scrim: value / 100 }));
    else if (mode === 'custom') setCustomTuning(current => ({ ...current, scrim: value / 100 }));
    else setScrim(value);
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotify?.("error", tUi("请选择图片文件。"));
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
      onNotify?.("error", error?.message || tUi("图片读取失败。"));
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
      chatBackgroundCustom: { ...customTuning, image: customImage },
    };
    try {
      setBusy(true);
      if (defaultBackground !== normalizeNewCharacterBackground(newCharacterBackground)) {
        await onSaveNewCharacterBackground?.(defaultBackground);
      }
      if (mode === "global") await onSaveGlobal?.(globalDraft);
      await onSaveCharacter?.(values);
      onNotify?.("success", tUi("聊天背景已保存。"));
      onClose?.();
    } catch (error) {
      onNotify?.("error", error?.message || tUi("聊天背景保存失败。"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal((<>
    <SystemBarOverlay className="chat-background-backdrop" role="presentation" onPointerDown={onClose}>
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
            <strong id="chat-background-title">{tUi("聊天背景")}</strong>
            <span>{character?.name || persona?.assistant_name || tUi("当前角色")}</span>
          </div>
          <button type="button" aria-label={tUi("关闭")} title={tUi("关闭")} onClick={onClose}><DshCloseIcon /></button>
        </header>

        <div className="chat-background-body">
          <section className="chat-background-source">
            <h3>{tUi("当前角色")}</h3>
            <div className="chat-background-modes" role="radiogroup" aria-label={tUi("当前角色背景来源")}>
              {localizeUiCopy(MODES, tUi).map(([value, label]) => {
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
              <h3>{tUi("预览")}</h3>
              <span>{localizeUiCopy(LAYOUT_NAMES, tUi)[resolveChatDisplayProfile(chatDisplay).layout] || tUi("聊天布局")}</span>
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
                    {busy ? tUi("正在读取…") : selectedImage ? tUi("更换图片") : tUi("选择图片")}
                  </button>
                ) : null}
                <div className="chat-background-sliders">
                  <TunerSliderRow label={tUi("背景透明度")} value={activeOpacity} min={12} max={100} suffix="%" defaultValue={72} onChange={setActiveOpacity} />
                  <TunerSliderRow label={tUi("背景模糊")} value={activeBlur} min={0} max={24} suffix="px" defaultValue={2} onChange={setActiveBlur} />
                  <TunerSliderRow label={tUi("阅读遮罩")} value={activeScrim} min={0} max={100} suffix="%" defaultValue={50} onChange={setActiveScrim} />
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="chat-background-import-default" aria-labelledby="chat-background-import-title">
          <div>
            <h3 id="chat-background-import-title">{tUi("新角色默认背景")}</h3>
            <span>{tUi("应用于之后新建或导入的角色，可随时单独覆盖")}</span>
          </div>
          <div className="chat-background-segmented" role="radiogroup" aria-label={tUi("新角色默认背景")}>
            <button type="button" role="radio" aria-checked={defaultBackground === "app"} className={defaultBackground === "app" ? "active" : ""} onClick={() => setDefaultBackground("app")}>{tUi("纯色背景")}</button>
            <button type="button" role="radio" aria-checked={defaultBackground === "character"} className={defaultBackground === "character" ? "active" : ""} onClick={() => setDefaultBackground("character")}>{tUi("角色立绘")}</button>
          </div>
        </section>

        <footer>
          <button type="button" onClick={onClose}>{tUi("取消")}</button>
          <button className="primary" type="button" disabled={busy} onClick={save}>{tUi("保存")}</button>
        </footer>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage} />
      </section>
    </SystemBarOverlay>
    <AvatarCropModal
      file={cropFile}
      title={tUi("裁剪聊天背景")}
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
