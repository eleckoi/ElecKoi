import { localizeUiCopy, formatProductList } from "../../../app/i18n/productCopy.js";
import { useProductTranslation, useProductLanguageName } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useState } from 'react';
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { DEFAULT_CHAT_TEXT_COLORS, DEFAULT_ROLEPLAY_STYLE } from '@shared/contracts/settings/schemas';
import {
  ArrowsOutLineVertical, ArrowCounterClockwise, CaretRight,
  ChatCircleDots, Check, Palette, SlidersHorizontal,
  TextT, UserCircle, Browsers, Translate,
} from '../../../ui/icons/interfaceIcons.jsx';
import { TunerSliderRow } from '../../../ui/ui/TunerSliderRow.jsx';
import { MessageBubble } from '../../../ui/messages/MessageBubble.jsx';
import appIcon from '../../../assets/eleckoi-app-icon.png';
import { assetSrc } from '../../../app/services/assets.js';
import {
  chatDisplayCssVariables, chatTextColorCssVariables, resolveChatAvatar,
  resolveChatAvatarShape, resolveChatDisplayProfile,
  resolveRoleplayStyle, roleplayStyleCssVariables, roleplayStyleDefaultTint,
} from '../../appearance/index.js';
import {
  chatDisplaySettings, chatDisplayTuners, chatLayouts, avatarShapes,
  textColorOptions, richMessageFloorTuner, richMessageLimitDescription,
} from '../model/chatDisplaySettings.js';
import '../styles/chat-display-settings.css';
import '../../chat/styles/roleplay-style.css';

function ResetParameter({ label, disabled, onClick }) {
  const tUi = useProductTranslation();
  return <button type="button" className="ec-parameter-reset" aria-label={tUi("恢复{value0}默认值", {value0: label})}
    title={tUi("恢复{value0}默认值", {value0: label})} disabled={disabled} onClick={onClick}>
    <ArrowCounterClockwise aria-hidden="true" />
  </button>;
}

function DisplayTuner({ label, value, min, max, step, suffix = 'px', defaultValue, onChange }) {
  const tUi = useProductTranslation();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = draft.trim() === '' ? value : Number(draft);
    const bounded = Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : value;
    setDraft(String(bounded));
    if (bounded !== value) onChange(bounded);
  };
  return <div className="ec-field ec-tuner">
    <span>{label}</span>
    <div className="ec-range-control">
      <input type="range" aria-label={tUi("{value0}滑杆", {value0: label})} min={min} max={max} step={step} value={value}
        style={{ '--ec-progress': `${(value - min) / (max - min) * 100}%` }}
        onChange={event => onChange(Number(event.target.value))} />
      <label className="ec-number">
        <input type="number" aria-label={tUi("{value0}数值", {value0: label})} min={min} max={max} step={step} value={draft}
          onChange={event => {
            setDraft(event.target.value);
            const number = event.target.valueAsNumber;
            if (Number.isFinite(number) && number >= min && number <= max) onChange(number);
          }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        {suffix && <span>{suffix}</span>}
      </label>
      <ResetParameter label={label} disabled={value === defaultValue} onClick={() => { setDraft(String(defaultValue)); onChange(defaultValue); }} />
    </div>
  </div>;
}

function DisplayGroup({ id, icon: Icon, title, description, preview, children }) {
  return <MenuSurface className="ec-group-material"><details className="ec-group" data-group={id}>
    <summary><Icon aria-hidden="true" /><span className="ec-group-copy"><strong>{title}</strong><span>{description}</span></span>
      <span className="ec-group-sample" aria-hidden="true">{preview}</span><CaretRight className="ec-disclosure" aria-hidden="true" /></summary>
    <div className="ec-group-body">{children}</div>
  </details></MenuSurface>;
}

function DisplaySwitch({ label, checked, onChange }) {
  return <label className="ec-field"><span>{label}</span>
    <input className="ec-switch" type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>;
}

function StyleTintField({ label, value, defaultColor, onChange }) {
  const tUi = useProductTranslation();
  return <div className="ec-style-tint-row"><span>{label}</span><span className="ec-style-tint-value">{value ? value.toUpperCase() : tUi("跟随主题")}</span>
    <input type="color" aria-label={label} value={value || defaultColor} onChange={event => onChange(event.target.value)} />
    <ResetParameter label={label} disabled={value === null} onClick={() => onChange(null)} />
  </div>;
}

/** Shared controls keep the desktop and mobile preference contract identical. */
export function RoleplayStyleControls({ model }) {
  const tUi = useProductTranslation();
  const { roleplayStyle: style, updateRoleplayStyle: update, profile, defaults, updateProfile } = model;
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const updateTheme = () => setDark(document.documentElement.dataset.theme === 'dark');
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    updateTheme();
    return () => observer.disconnect();
  }, []);
  const tune = (key, label, max = 100, suffix = '%') => <DisplayTuner key={key} label={label} min={0} max={max} step={1} suffix={suffix}
    value={style[key]} defaultValue={DEFAULT_ROLEPLAY_STYLE[key]} onChange={value => update({ [key]: value })} />;
  return <div className="ec-roleplay-style-controls">
    <DisplaySwitch label={tUi("对话底板")} checked={style.backdrop_enabled} onChange={value => update({ backdrop_enabled: value })} />
    {style.backdrop_enabled && <div className="ec-style-section">
      {tune('backdrop_blur', tUi("底板模糊程度"), 40, 'px')}
      <StyleTintField label={tUi("底板色调")} value={style.backdrop_tint} defaultColor={roleplayStyleDefaultTint('backdrop', dark)} onChange={value => update({ backdrop_tint: value })} />
      {tune('backdrop_opacity', tUi("底板不透明度"))}
    </div>}
    <DisplaySwitch label={tUi("消息气泡")} checked={style.bubbles_enabled} onChange={value => update({ bubbles_enabled: value })} />
    {style.bubbles_enabled && <>
      <div className="ec-style-section">{tune('bubble_blur', tUi("气泡模糊程度"), 40, 'px')}
        <DisplayTuner {...localizeUiCopy(chatDisplayTuners, tUi).bubble_corner_radius} value={profile.bubble_corner_radius} defaultValue={defaults.bubble_corner_radius} onChange={value => updateProfile({ bubble_corner_radius: value })} />
      </div>
      <div className="ec-style-section"><h3>{tUi("用户消息")}</h3>
        <StyleTintField label={tUi("用户气泡色调")} value={style.user_bubble_tint} defaultColor={roleplayStyleDefaultTint('bubble', dark)} onChange={value => update({ user_bubble_tint: value })} />
        {tune('user_bubble_opacity', tUi("用户气泡不透明度"))}
      </div>
      <div className="ec-style-section"><h3>{tUi("AI 消息")}</h3>
        <StyleTintField label={tUi("AI 气泡色调")} value={style.assistant_bubble_tint} defaultColor={roleplayStyleDefaultTint('bubble', dark)} onChange={value => update({ assistant_bubble_tint: value })} />
        {tune('assistant_bubble_opacity', tUi("AI 气泡不透明度"))}
      </div>
    </>}
  </div>;
}

function LayoutThumbnail({ layout }) {
  return <span className="ec-layout-picture" aria-hidden="true">
    <span className="ec-mini-titlebar"><span /><span /><span /></span>
    {layout === 'roleplay' ? <>{[false, true].map((blue, index) => <span className="ec-mini-post" key={index}>
      <span className={`ec-mini-face${blue ? ' ec-mini-face-blue' : ''}`} /><span className="ec-mini-copy"><span /><span /><span /></span>
    </span>)}</> : layout === 'agent' ? <>
      <span className="ec-mini-prompt" /><span className="ec-mini-answer"><span /><span /></span><span className="ec-mini-tool"><span /></span>
    </> : <><span className="ec-mini-chat-left" /><span className="ec-mini-chat-right" /><span className="ec-mini-chat-left ec-mini-chat-short" /></>}
    <span className="ec-selected-mark"><Check aria-hidden="true" /></span>
  </span>;
}

export function ChatDisplayPreview({ preferences, persona, compact = false }) {
  const tUi = useProductTranslation();
  const { layout, profile } = resolveChatDisplayProfile(preferences);
  const roleplayStyle = resolveRoleplayStyle(preferences);
  const avatarShape = resolveChatAvatarShape(layout, profile.avatar_shape);
  const style = { ...chatDisplayCssVariables(layout, profile), ...chatTextColorCssVariables(preferences.text_colors),
    ...(layout === 'roleplay' ? roleplayStyleCssVariables(roleplayStyle) : {}) };
  if (compact) {
    const scale = .94;
    for (const key of ['--chat-avatar-width', '--chat-avatar-height', '--chat-avatar-radius']) style[key] = `${parseFloat(style[key]) * .62}px`;
    for (const key of ['--chat-font-size', '--chat-line-height', '--chat-letter-spacing', '--chat-paragraph-gap']) style[key] = `${parseFloat(style[key]) * scale}px`;
    style['--chat-name-size'] = `${profile.name_font_size * .87}px`;
    style['--dsw-font-markdown-base'] = `${profile.message_font_weight} ${style['--chat-font-size']}/${style['--chat-line-height']} var(--dsw-font-family)`;
  }
  const userAvatar = resolveChatAvatar(persona, 'user', avatarShape);
  const assistantAvatar = resolveChatAvatar(persona, 'assistant', avatarShape);
  if (layout === 'roleplay' && (roleplayStyle.backdrop_enabled || roleplayStyle.bubbles_enabled) && assistantAvatar) {
    style.backgroundImage = `url(${JSON.stringify(assetSrc(assistantAvatar))})`;
  }
  const previewTime = new Date().toISOString();
  const messages = <div className={`message-area layout-${layout}`}>
    <MessageBubble message={{ id: 'preview-user', role: 'user', content: tUi("今晚从这里继续。"), status: 'complete', created_at: previewTime }}
      avatar={userAvatar} avatarShape={avatarShape} name={persona?.user_name || tUi("你")} layoutMode={layout} floorNumber={0}
      showRoleplayTimestamp={preferences.roleplay_timestamps_enabled} showRoleplayFloor={preferences.roleplay_message_floors_enabled}
      spacingAfter={layout === 'agent' ? profile.reply_spacing : profile.turn_spacing} />
    <MessageBubble message={{ id: 'preview-assistant', role: 'assistant', content: tUi("夜色在窗外缓缓流淌，远处的灯火像落在城市里的星海。\n\n我们从这里继续。"), status: 'complete', created_at: previewTime }}
      avatar={assistantAvatar} avatarShape={avatarShape} name={persona?.assistant_name || 'AI'} layoutMode={layout} floorNumber={1}
      showRoleplayTimestamp={preferences.roleplay_timestamps_enabled} showRoleplayFloor={preferences.roleplay_message_floors_enabled} spacingAfter={0} />
  </div>;
  return <div className={`chat-display-preview${profile.assistant_bubble_enabled ? ' assistant-bubble-enabled' : ''}${compact ? ' ec-chat-window' : ''}`} style={style}
    data-roleplay-backdrop={layout === 'roleplay' && roleplayStyle.backdrop_enabled || undefined}
    data-roleplay-bubbles={layout === 'roleplay' && roleplayStyle.bubbles_enabled || undefined}>
    {messages}
  </div>;
}

/** Keep the official locale row and its persistence under the product display page. */
export function LanguageSettings({ renderLanguageSettings }) {
  const tUi = useProductTranslation();
  if (!renderLanguageSettings) return null;
  return <section className="settings-language-row" aria-label={tUi("界面语言")}>
    <Translate aria-hidden="true" />
    <div className="settings-language-control">{renderLanguageSettings()}</div>
  </section>;
}

export function ChatDisplaySettings({ persona, chatDisplay, onChatDisplayChange, renderLanguageSettings }) {
  const tUi = useProductTranslation();
  const languageName = useProductLanguageName();
  const model = chatDisplaySettings(chatDisplay, onChatDisplayChange);
  const { preferences, layout, profile, defaults, selectLayout, updateProfile, updatePreferences, updateTextColor } = model;
  const tune = (key, label = localizeUiCopy(chatDisplayTuners, tUi)[key].label) => <DisplayTuner key={key} {...localizeUiCopy(chatDisplayTuners, tUi)[key]} label={label}
    value={profile[key]} defaultValue={defaults[key]} onChange={value => updateProfile({ [key]: value })} />;
  const colors = { ...DEFAULT_CHAT_TEXT_COLORS, ...preferences.text_colors };
  const avatarSource = shape => assetSrc(resolveChatAvatar(persona, 'assistant', shape) || appIcon);
  const visibleMessageInfo = layout === 'roleplay' ? [preferences.roleplay_timestamps_enabled && tUi("时间"), preferences.roleplay_message_floors_enabled && tUi("楼层")].filter(Boolean) : [];
  return <div className="chat-display-settings-page chat-display-design">
    <div className="ec-panel">
      <header className="app-settings-heading ec-page-header"><h1>{tUi("聊天显示")}</h1></header>
      <div className="ec-workspace">
        <div className="ec-editor">
          <section className="ec-layout-section" aria-label={tUi("对话布局")}>
            <h2>{tUi("对话布局")}</h2>
            <div className="ec-layout-options" role="radiogroup" aria-label={tUi("对话布局")}>
              {localizeUiCopy(chatLayouts, tUi).map(item => <button key={item.id} type="button" role="radio" aria-checked={layout === item.id}
                className={`ec-layout-choice${item.disabled ? ' ec-layout-unavailable' : ''}`} disabled={item.disabled} onClick={() => selectLayout(item.id)}>
                <LayoutThumbnail layout={item.id} />
                <span className="ec-layout-caption">{item.label}{item.disabled && <span>{tUi("开发中")}</span>}</span>
              </button>)}
            </div>
          </section>
          <div className="ec-settings-list">
            <DisplayGroup id="behavior" icon={SlidersHorizontal} title={tUi("显示行为")}
              description={tUi("生成统计{value0}", {value0: visibleMessageInfo.length ? tUi(" · 显示{value0}", {value0: formatProductList(visibleMessageInfo, tUi)}) : ''})}
              preview={<span className="ec-behavior-sample">{tUi("统计")}{preferences.generation_stats_enabled ? tUi("已开启") : tUi("已关闭")}</span>}>
              <DisplaySwitch label={tUi("生成统计")} checked={preferences.generation_stats_enabled} onChange={value => updatePreferences({ generation_stats_enabled: value })} />
              {layout === 'roleplay' && <>
                <DisplaySwitch label={tUi("聊天时间戳")} checked={preferences.roleplay_timestamps_enabled} onChange={value => updatePreferences({ roleplay_timestamps_enabled: value })} />
                <DisplaySwitch label={tUi("显示消息楼层")} checked={preferences.roleplay_message_floors_enabled} onChange={value => updatePreferences({ roleplay_message_floors_enabled: value })} />
              </>}
            </DisplayGroup>
            <DisplayGroup id="avatar" icon={UserCircle} title={layout === 'social' ? tUi("头像与气泡") : tUi("头像与名字")}
              description={`${localizeUiCopy(avatarShapes, tUi).find(shape => shape.id === profile.avatar_shape)?.label} · ${profile.avatar_size} px`}
              preview={<span className="ec-avatar-samples">{localizeUiCopy(avatarShapes, tUi).map(shape => <img key={shape.id} src={avatarSource(shape.id)} alt="" className={`ec-avatar-${shape.id}`} />)}</span>}>
              <div className="ec-avatar-choice-row">
              <div className="ec-avatar-options" role="radiogroup" aria-label={tUi("头像形状")}>
                {localizeUiCopy(avatarShapes, tUi).map(shape => <button key={shape.id} type="button" role="radio" aria-checked={profile.avatar_shape === shape.id}
                  disabled={shape.id === 'portrait' && layout !== 'roleplay'} onClick={() => updateProfile({ avatar_shape: shape.id })}>
                  <img src={avatarSource(shape.id)} alt="" className={`ec-avatar-${shape.id}`} />
                  {shape.id === 'rounded_square' ? tUi("圆角方形") : shape.label}
                </button>)}
              </div>
              <ResetParameter label={tUi("头像形状")} disabled={profile.avatar_shape === defaults.avatar_shape}
                onClick={() => updateProfile({ avatar_shape: defaults.avatar_shape })} />
              </div>
              {tune('avatar_size')}{layout !== 'social' && tune('name_font_size')}{tune('name_avatar_spacing', layout === 'social' ? tUi("头像与气泡间距") : tUi("头像与名字间距"))}
            </DisplayGroup>
            <DisplayGroup id="typography" icon={TextT} title={tUi("正文文字")}
              description={tUi("{value0} px · 字重 {value1} · 行距 {value2}", {value0: profile.message_font_size, value1: profile.message_font_weight, value2: profile.line_height_multiplier})}
              preview={<span className="ec-aa">Aa<span>{tUi("字")}</span></span>}>
              <p className="ec-type-sample" style={{ fontSize: profile.message_font_size, fontWeight: profile.message_font_weight, lineHeight: 1.6 * profile.line_height_multiplier, letterSpacing: profile.letter_spacing }}>{tUi("夜色在窗外缓缓流淌。")}</p>
              {tune('message_font_size')}{tune('message_font_weight')}{tune('line_height_multiplier')}{tune('letter_spacing')}
            </DisplayGroup>
            <DisplayGroup id="spacing" icon={ArrowsOutLineVertical} title={tUi("间距与留白")}
              description={tUi("段距 {value0} · 回复 {value1} · {value2} {value3}", {value0: profile.paragraph_spacing, value1: profile.reply_spacing, value2: layout === 'agent' ? tUi("轮次") : tUi("消息"), value3: profile.turn_spacing})}
              preview={<span className="ec-spacing-glyph"><span /><span /><span /><span /></span>}>
              {tune('paragraph_spacing')}{layout !== 'social' && tune('reply_spacing')}{tune('turn_spacing', layout === 'agent' ? tUi("轮次间距") : tUi("消息间距"))}
            </DisplayGroup>
            <DisplayGroup id="colors" icon={Palette} title={tUi("文字配色")} description={tUi("斜体、下划线与引号内文本")}
              preview={<span className="ec-palette-samples">{localizeUiCopy(textColorOptions, tUi).map(option => <span key={option.key} style={{ background: colors[option.key] }} />)}</span>}>
              {localizeUiCopy(textColorOptions, tUi).map(option => <div className="ec-color-row" key={option.key}>
                <span>{option.label}</span><span className={`ec-color-example ec-${option.key}`} style={option.key === 'underline' ? { textDecorationColor: colors.underline } : { color: colors[option.key] }}>
                  {option.key === 'italics' ? tUi("夜色缓缓流淌") : option.key === 'underline' ? tUi("今晚从这里继续") : tUi("“我们继续吧。”")}</span>
                <input type="color" aria-label={option.label} value={colors[option.key]} onChange={event => updateTextColor(option.key, event.target.value)} />
                <ResetParameter label={option.label} disabled={colors[option.key].toLowerCase() === DEFAULT_CHAT_TEXT_COLORS[option.key]} onClick={() => updateTextColor(option.key, DEFAULT_CHAT_TEXT_COLORS[option.key])} />
              </div>)}
            </DisplayGroup>
            <DisplayGroup id="rich" icon={Browsers} title={tUi("富消息")}
              description={preferences.rich_message_limit_enabled ? tUi("自动运行最近 {value0} 个 AI 消息楼层", {value0: preferences.rich_message_floor_limit}) : tUi("不限制富消息运行楼层")}
              preview={<span className="ec-rich-sample"><span /><span /><span /></span>}>
              <DisplaySwitch label={tUi("限制富消息运行楼层")} checked={preferences.rich_message_limit_enabled} onChange={value => updatePreferences({ rich_message_limit_enabled: value })} />
              {preferences.rich_message_limit_enabled && <div className="ec-rich-tuner"><TunerSliderRow {...localizeUiCopy(richMessageFloorTuner, tUi)} value={preferences.rich_message_floor_limit}
                onChange={value => updatePreferences({ rich_message_floor_limit: Math.round(value) })} /></div>}
              <p className="ec-help">{localizeUiCopy(richMessageLimitDescription, tUi)}</p>
            </DisplayGroup>
            {layout === 'roleplay' && <DisplayGroup id="layout-style" icon={ChatCircleDots} title={tUi("布局独有风格")}
              description={`${model.roleplayStyle.backdrop_enabled ? tUi("底板模糊 {value0} px", {value0: model.roleplayStyle.backdrop_blur}) : tUi("底板已关闭")} · ${model.roleplayStyle.bubbles_enabled ? tUi("有气泡") : tUi("无气泡")}`}
              preview={<span className={`ec-style-sample${model.roleplayStyle.bubbles_enabled ? ' has-bubbles' : ''}`}><span /><span /></span>}>
              <RoleplayStyleControls model={model} />
            </DisplayGroup>}
            {layout !== 'roleplay' && <DisplayGroup id="bubble" icon={ChatCircleDots} title={tUi("布局独有风格")}
              description={tUi("圆角 {value0} px{value1}", {value0: profile.bubble_corner_radius, value1: profile.assistant_bubble_enabled ? tUi(" · 角色气泡已开启") : ''})}
              preview={<ChatCircleDots className="ec-bubble-sample" />}>
              {layout === 'agent' && <DisplaySwitch label={tUi("角色气泡")} checked={profile.assistant_bubble_enabled} onChange={value => updateProfile({ assistant_bubble_enabled: value })} />}
              {tune('bubble_corner_radius')}
            </DisplayGroup>}
            {renderLanguageSettings && <DisplayGroup id="language" icon={Translate} title={tUi("语言")}
              description={tUi("界面显示语言")} preview={<span className="ec-behavior-sample">{languageName}</span>}>
              <div className="settings-language-control" aria-label={tUi("界面语言")}>{renderLanguageSettings()}</div>
            </DisplayGroup>}
          </div>
        </div>
        <aside className="ec-preview" aria-label={tUi("实时预览")}><header><h2>{tUi("实时预览")}</h2><span>{localizeUiCopy(chatLayouts, tUi).find(item => item.id === layout)?.label}</span></header>
          <ChatDisplayPreview preferences={preferences} persona={persona} compact />
        </aside>
      </div>
    </div>
  </div>;
}
