import { useEffect, useState } from "react";
import {
  ArrowsOutLineVertical,
  ChartBar,
  ChatCenteredText,
  ChatCircleDots,
  Eye,
  Info,
  Palette,
  PaintBrush,
  SlidersHorizontal,
  TextT,
  UserCircle,
} from "@phosphor-icons/react";
import { DEFAULT_CHAT_DISPLAY_PREFERENCES, DEFAULT_CHAT_TEXT_COLORS } from "@shared/contracts/settings/schemas";
import { BotIcon, PaletteIcon, PencilIcon, ProfileIcon } from "../../../ui/icons/index.jsx";
import { avatarSetFromPersona, AvatarManagerEditor } from "../../../ui/ui/AvatarSlotsEditor.jsx";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { TunerSliderRow } from "../../../ui/ui/TunerSliderRow.jsx";
import { MessageBubble } from "../../../ui/messages/MessageBubble.jsx";
import { AboutSettings } from "./AboutSettings.jsx";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "../../appearance/index.js";

const pages = [
  { id: "profile", label: "用户资料", icon: ProfileIcon },
  { id: "theme", label: "主题风格", icon: PaletteIcon },
  { id: "chat", label: "聊天显示", icon: BotIcon },
  { id: "about", label: "关于 ElecKoi", icon: Info },
];

const appearanceModes = [
  { id: "light", label: "浅色", description: "始终使用明亮界面" },
  { id: "dark", label: "深色", description: "始终使用深色界面" },
  { id: "system", label: "跟随系统", description: "随 Windows 外观自动切换" },
];

const sidebarArtworkModes = [
  { id: "cover", label: "封面立绘" },
  { id: "avatar", label: "头像" },
];

const composerStyles = [
  { id: "glass", label: "玻璃态", description: "透出壁纸并增加模糊和高光边缘" },
  { id: "standard", label: "原版", description: "使用 DSH 基线的纯色输入框" },
];

const chatLayouts = [
  { id: "roleplay", label: "角色扮演", disabled: false },
  { id: "agent", label: "Agent", disabled: true },
  { id: "social", label: "社交软件", disabled: true },
];

const avatarShapes = [
  { id: "circle", label: "圆形" },
  { id: "rounded_square", label: "圆角正方形" },
  { id: "portrait", label: "圆角矩形" },
];

const reasoningDisplayModes = [
  { id: "collapsed", label: "适当收起" },
  { id: "expanded", label: "全量展开" },
];

function ChatDisplayPreview({ preferences, persona }) {
  const { layout, profile } = resolveChatDisplayProfile(preferences);
  const avatarShape = resolveChatAvatarShape(layout, profile.avatar_shape);
  const style = {
    ...chatDisplayCssVariables(layout, profile),
    ...chatTextColorCssVariables(preferences.text_colors),
  };
  const userAvatar = resolveChatAvatar(persona, "user", avatarShape);
  const assistantAvatar = resolveChatAvatar(persona, "assistant", avatarShape);

  return (
    <div className={`chat-display-preview${profile.assistant_bubble_enabled ? " assistant-bubble-enabled" : ""}`} style={style}>
      <div className="chat-display-preview-bar"><strong>万界旅行手册</strong></div>
      <div className={`message-area layout-${layout}`}>
        <MessageBubble
          message={{ id: "preview-user", role: "user", content: "今晚从这里继续。", status: "complete" }}
          avatar={userAvatar}
          avatarShape={avatarShape}
          name={persona?.user_name || "你"}
          layoutMode={layout}
          spacingAfter={layout === "agent" ? profile.reply_spacing : profile.turn_spacing}
        />
        <MessageBubble
          message={{ id: "preview-assistant", role: "assistant", content: "夜色在窗外缓缓流淌，远处的灯火像落在城市里的星海。\n\n我们从这里继续。", status: "complete" }}
          avatar={assistantAvatar}
          avatarShape={avatarShape}
          name={persona?.assistant_name || "AI"}
          layoutMode={layout}
          spacingAfter={0}
        />
      </div>
      <div className="chat-display-preview-composer">输入消息</div>
    </div>
  );
}

function ChatDisplaySettings({
  persona,
  chatDisplay,
  onChatDisplayChange,
  composerStyle,
  onComposerStyleChange,
}) {
  const preferences = chatDisplay || DEFAULT_CHAT_DISPLAY_PREFERENCES;
  const { layout, profile } = resolveChatDisplayProfile(preferences);
  const defaults = DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles[layout];

  function selectLayout(nextLayout) {
    if (chatLayouts.find((item) => item.id === nextLayout)?.disabled) return;
    onChatDisplayChange({ ...preferences, layout: nextLayout });
  }

  function updateProfile(patch) {
    onChatDisplayChange({
      ...preferences,
      profiles: {
        ...preferences.profiles,
        [layout]: { ...profile, ...patch },
      },
    });
  }

  function resetProfile() {
    onChatDisplayChange({
      ...preferences,
      profiles: {
        ...preferences.profiles,
        [layout]: { ...defaults },
      },
    });
  }

  function updateTextColor(key, value) {
    onChatDisplayChange({
      ...preferences,
      text_colors: { ...preferences.text_colors, [key]: value },
    });
  }

  const textColorOptions = [
    { key: "italics", label: "斜体文本" },
    { key: "underline", label: "下划线文本" },
    { key: "quote", label: "引用文本" },
  ];

  const slider = (label, key, min, max, step = 1, suffix = "px") => (
    <TunerSliderRow
      label={label}
      value={profile[key]}
      min={min}
      max={max}
      step={step}
      suffix={suffix}
      defaultValue={defaults[key]}
      onChange={(value) => updateProfile({ [key]: value })}
    />
  );

  return (
    <div className="chat-display-settings-page">
      <div className="chat-display-controls">
        <header className="app-settings-heading chat-display-heading">
          <h1>聊天显示</h1>
          <button type="button" className="chat-display-reset" onClick={resetProfile}>恢复当前布局</button>
        </header>

        <section className="chat-settings-group chat-display-section">
          <div className="setting-row-copy setting-row-title"><ChatCenteredText /><strong>对话布局</strong></div>
          <div className="layout-choice-grid" role="radiogroup" aria-label="对话布局">
            {chatLayouts.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                disabled={item.disabled}
                aria-checked={layout === item.id}
                className={layout === item.id ? "active" : ""}
                onClick={() => selectLayout(item.id)}
              >
                <span className={`layout-choice-preview ${item.id}`}><i /><b /><em /></span>
                <strong>{item.label}</strong>
                {item.disabled ? <small>开发中</small> : null}
              </button>
            ))}
          </div>
        </section>

        <div className="chat-settings-inline-grid">
          <section className="chat-settings-group composer-style-card">
            <div className="setting-row-copy setting-row-title"><PaintBrush /><strong>输入框材质</strong></div>
            <div className="appearance-mode-control composer-style-control" role="radiogroup" aria-label="输入框材质">
              {composerStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  role="radio"
                  aria-checked={composerStyle === style.id}
                  className={composerStyle === style.id ? "active" : ""}
                  title={style.description}
                  onClick={() => onComposerStyleChange(style.id)}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </section>

          <section className="chat-settings-group reasoning-display-card">
            <div className="setting-row-copy setting-row-title"><SlidersHorizontal /><strong>思维链显示</strong></div>
            <div className="appearance-mode-control reasoning-display-control" role="radiogroup" aria-label="思维链显示">
              {reasoningDisplayModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={preferences.reasoning_display_mode === mode.id}
                  className={preferences.reasoning_display_mode === mode.id ? "active" : ""}
                  onClick={() => onChatDisplayChange({ ...preferences, reasoning_display_mode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="chat-settings-group chat-compact-setting-card">
          <div className="setting-row-copy setting-row-title"><ChartBar /><strong>生成统计</strong></div>
          <div className="appearance-mode-control compact-setting-control" role="radiogroup" aria-label="生成统计">
            <button
              type="button"
              role="radio"
              aria-checked={preferences.generation_stats_enabled}
              className={preferences.generation_stats_enabled ? "active" : ""}
              onClick={() => onChatDisplayChange({ ...preferences, generation_stats_enabled: true })}
            >显示</button>
            <button
              type="button"
              role="radio"
              aria-checked={!preferences.generation_stats_enabled}
              className={!preferences.generation_stats_enabled ? "active" : ""}
              onClick={() => onChatDisplayChange({ ...preferences, generation_stats_enabled: false })}
            >隐藏</button>
          </div>
        </section>

        <section className="chat-settings-group chat-display-section chat-text-colors-section">
          <div className="setting-row-copy setting-row-title">
            <Palette />
            <strong>文本颜色</strong>
            <button
              type="button"
              className="chat-text-colors-reset"
              onClick={() => onChatDisplayChange({ ...preferences, text_colors: { ...DEFAULT_CHAT_TEXT_COLORS } })}
            >恢复默认</button>
          </div>
          <div className="chat-text-color-grid">
            {textColorOptions.map((option) => {
              const value = preferences.text_colors?.[option.key] || DEFAULT_CHAT_TEXT_COLORS[option.key];
              return (
                <label key={option.key} className="chat-text-color-field">
                  <input
                    type="color"
                    value={value}
                    onChange={(event) => updateTextColor(option.key, event.target.value)}
                    aria-label={option.label}
                  />
                  <span>{option.label}</span>
                  <code>{value.toUpperCase()}</code>
                </label>
              );
            })}
          </div>
        </section>

        <section className="chat-settings-group chat-display-section">
          <div className="setting-row-copy setting-row-title"><UserCircle /><strong>{layout === "social" ? "头像与气泡" : "头像与名字"}</strong></div>
          <div className="chat-avatar-shape-control" role="radiogroup" aria-label="头像形状">
            {avatarShapes.map((shape) => {
              const disabled = shape.id === "portrait" && layout !== "roleplay";
              return (
                <button
                  key={shape.id}
                  type="button"
                  role="radio"
                  disabled={disabled}
                  aria-checked={profile.avatar_shape === shape.id}
                  className={profile.avatar_shape === shape.id ? "active" : ""}
                  onClick={() => updateProfile({ avatar_shape: shape.id })}
                >
                  <i className={`chat-avatar-shape-sample ${shape.id}`} />
                  {shape.label}
                </button>
              );
            })}
          </div>
          <div className="chat-display-tuners">
            {slider("头像大小", "avatar_size", 24, 96, 0.5)}
            {layout !== "social" ? slider("名字大小", "name_font_size", 10, 18, 0.5) : null}
            {slider(layout === "social" ? "头像与气泡间距" : "头像与名字间距", "name_avatar_spacing", 0, 20)}
          </div>
        </section>

        <section className="chat-settings-group chat-display-section">
          <div className="setting-row-copy setting-row-title"><TextT /><strong>正文文字</strong></div>
          <div className="chat-display-tuners">
            {slider("字号", "message_font_size", 9, 20, 0.5)}
            {slider("行距", "line_height_multiplier", 0.8, 1.6, 0.05, "×")}
            {slider("字距", "letter_spacing", -1, 4, 0.5)}
            {slider("段距", "paragraph_spacing", 0, 24)}
          </div>
        </section>

        <section className="chat-settings-group chat-display-section">
          <div className="setting-row-copy setting-row-title"><ArrowsOutLineVertical /><strong>间距与留白</strong></div>
          <div className="chat-display-tuners">
            {slider("左右边距", "horizontal_padding", 0, 32)}
            {layout !== "social" ? slider("回复间距", "reply_spacing", 0, 32) : null}
            {slider(layout === "agent" ? "轮次间距" : "消息间距", "turn_spacing", 0, 32)}
          </div>
        </section>

        {layout !== "roleplay" ? (
          <section className="chat-settings-group chat-display-section">
            <div className="setting-row-copy setting-row-title"><ChatCircleDots /><strong>气泡样式</strong></div>
            {layout === "agent" ? (
              <button
                type="button"
                role="switch"
                aria-checked={profile.assistant_bubble_enabled}
                className={`chat-setting-toggle${profile.assistant_bubble_enabled ? " active" : ""}`}
                onClick={() => updateProfile({ assistant_bubble_enabled: !profile.assistant_bubble_enabled })}
              >
                <span>角色气泡</span><i />
              </button>
            ) : null}
            <div className="chat-display-tuners">
              {slider("圆角", "bubble_corner_radius", 0, 24)}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="chat-display-preview-column" aria-label="实时预览">
        <header><strong><Eye />实时预览</strong><span>角色扮演</span></header>
        <ChatDisplayPreview preferences={preferences} persona={persona} />
      </aside>
    </div>
  );
}

function UserProfileSettings({ persona, onUpdateUserProfile }) {
  const displayName = persona?.user_name || "你";
  const [name, setName] = useState(displayName);
  const [avatars, setAvatars] = useState(() => avatarSetFromPersona(persona, "user"));
  const [editingAvatars, setEditingAvatars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(persona?.user_name || "你");
    setAvatars(avatarSetFromPersona(persona, "user"));
  }, [persona?.user_avatar, persona?.user_name, persona?.user_portrait, persona?.user_square]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onUpdateUserProfile?.({ name: name.trim() || "你", avatars });
      setMessage("已保存");
    } catch (error) {
      setMessage(error?.message || "保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  async function saveAvatars(nextAvatars) {
    setSaving(true);
    setMessage("");
    try {
      await onUpdateUserProfile?.({ name: name.trim() || "你", avatars: nextAvatars });
      setAvatars(nextAvatars);
    } finally {
      setSaving(false);
    }
  }

  if (editingAvatars) {
    return (
      <AvatarManagerEditor
        value={avatars}
        name={name || displayName}
        saving={saving}
        onBack={() => setEditingAvatars(false)}
        onSave={saveAvatars}
      />
    );
  }

  return (
    <form className="profile-settings-page" onSubmit={saveProfile}>
      <header className="app-settings-heading">
        <h1>用户资料</h1>
      </header>
      <div className="profile-settings-body">
        <div className="profile-settings-avatar-control">
          <button className="profile-settings-avatar-button" type="button" title="管理头像" onClick={() => setEditingAvatars(true)}>
            <Avatar src={avatars.circle} name={name || displayName} />
            <span><PencilIcon /></span>
          </button>
          <button className="settings-secondary-button" type="button" onClick={() => setEditingAvatars(true)}>管理头像</button>
        </div>
        <div className="profile-settings-fields">
          <label className="profile-settings-name">
            <span>名字</span>
            <input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="profile-settings-actions">
            {message ? <span className={message === "已保存" ? "success" : "error"}>{message}</span> : null}
            <button className="settings-primary-button" type="submit" disabled={saving}>{saving ? "正在保存" : "保存"}</button>
          </div>
        </div>
      </div>
    </form>
  );
}

export function SettingsPanel({
  activePage,
  onPageChange,
  persona,
  onUpdateUserProfile,
  chatDisplay,
  onChatDisplayChange,
  appearanceMode,
  onAppearanceModeChange,
  composerStyle,
  onComposerStyleChange,
  sidebarCharacterArtwork,
  onSidebarCharacterArtworkChange,
  appUpdates,
  renderLayout,
}) {
  const page = activePage;

  const sidePanel = (
    <aside className="app-settings-sidebar">
      <header><h2>设置</h2></header>
      <nav aria-label="设置分类">
        {pages.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={page === item.id ? "active" : ""} onClick={() => onPageChange(item.id)}>
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );

  const mainPanel = (
    <section className="app-settings-content">
      {page === "profile" ? (
        <UserProfileSettings persona={persona} onUpdateUserProfile={onUpdateUserProfile} />
      ) : page === "chat" ? (
        <ChatDisplaySettings
          persona={persona}
          chatDisplay={chatDisplay}
          onChatDisplayChange={onChatDisplayChange}
          composerStyle={composerStyle}
          onComposerStyleChange={onComposerStyleChange}
        />
      ) : page === "about" ? (
        <AboutSettings updates={appUpdates} />
      ) : (
        <>
          <header className="app-settings-heading">
            <h1>主题风格</h1>
          </header>
          <div className="app-settings-card appearance-mode-card">
            <div className="setting-row-copy">
              <strong>外观模式</strong>
            </div>
            <div className="appearance-mode-control" role="radiogroup" aria-label="外观模式">
              {appearanceModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={appearanceMode === mode.id}
                  className={appearanceMode === mode.id ? "active" : ""}
                  title={mode.description}
                  onClick={() => onAppearanceModeChange(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="app-settings-card sidebar-artwork-card">
            <div className="setting-row-copy">
              <strong>侧栏角色图</strong>
            </div>
            <div className="appearance-mode-control sidebar-artwork-control" role="radiogroup" aria-label="侧栏角色图">
              {sidebarArtworkModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={sidebarCharacterArtwork === mode.id}
                  className={sidebarCharacterArtwork === mode.id ? "active" : ""}
                  onClick={() => onSidebarCharacterArtworkChange(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="app-settings-card theme-setting-card">
            <div className="theme-setting-icon"><PaletteIcon /></div>
            <div className="setting-row-copy">
              <strong>超级调色盘</strong>
            </div>
            <button className="settings-secondary-button" type="button" disabled title="超级调色盘正在开发中">开发中</button>
          </div>
        </>
      )}
    </section>
  );

  return renderLayout({ sidePanel, mainPanel });
}
