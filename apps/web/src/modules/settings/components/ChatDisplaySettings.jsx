import { useEffect, useState } from 'react';
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { DEFAULT_CHAT_TEXT_COLORS } from '@shared/contracts/settings/schemas';
import {
  ArrowsOutLineVertical, ArrowCounterClockwise, CaretRight,
  ChatCircleDots, Check, Palette, SlidersHorizontal,
  TextT, UserCircle, Browsers,
} from '../../../ui/icons/interfaceIcons.jsx';
import { TunerSliderRow } from '../../../ui/ui/TunerSliderRow.jsx';
import { MessageBubble } from '../../../ui/messages/MessageBubble.jsx';
import appIcon from '../../../assets/eleckoi-app-icon.png';
import { assetSrc } from '../../../app/services/assets.js';
import {
  chatDisplayCssVariables, chatTextColorCssVariables, resolveChatAvatar,
  resolveChatAvatarShape, resolveChatDisplayProfile,
} from '../../appearance/index.js';
import {
  chatDisplaySettings, chatDisplayTuners, chatLayouts, avatarShapes,
  textColorOptions, richMessageFloorTuner, richMessageLimitDescription,
} from '../model/chatDisplaySettings.js';
import '../styles/chat-display-settings.css';

function ResetParameter({ label, disabled, onClick }) {
  return <button type="button" className="ec-parameter-reset" aria-label={`恢复${label}默认值`}
    title={`恢复${label}默认值`} disabled={disabled} onClick={onClick}>
    <ArrowCounterClockwise aria-hidden="true" />
  </button>;
}

function DisplayTuner({ label, value, min, max, step, suffix = 'px', defaultValue, onChange }) {
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
      <input type="range" aria-label={`${label}滑杆`} min={min} max={max} step={step} value={value}
        style={{ '--ec-progress': `${(value - min) / (max - min) * 100}%` }}
        onChange={event => onChange(Number(event.target.value))} />
      <label className="ec-number">
        <input type="number" aria-label={`${label}数值`} min={min} max={max} step={step} value={draft}
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
  const { layout, profile } = resolveChatDisplayProfile(preferences);
  const avatarShape = resolveChatAvatarShape(layout, profile.avatar_shape);
  const style = { ...chatDisplayCssVariables(layout, profile), ...chatTextColorCssVariables(preferences.text_colors) };
  if (compact) {
    const scale = .94;
    for (const key of ['--chat-avatar-width', '--chat-avatar-height', '--chat-avatar-radius']) style[key] = `${parseFloat(style[key]) * .62}px`;
    for (const key of ['--chat-font-size', '--chat-line-height', '--chat-letter-spacing', '--chat-paragraph-gap']) style[key] = `${parseFloat(style[key]) * scale}px`;
    style['--chat-name-size'] = `${profile.name_font_size * .87}px`;
    style['--dsw-font-markdown-base'] = `${profile.message_font_weight} ${style['--chat-font-size']}/${style['--chat-line-height']} var(--dsw-font-family)`;
  }
  const userAvatar = resolveChatAvatar(persona, 'user', avatarShape);
  const assistantAvatar = resolveChatAvatar(persona, 'assistant', avatarShape);
  const previewTime = new Date().toISOString();
  const messages = <div className={`message-area layout-${layout}`}>
    <MessageBubble message={{ id: 'preview-user', role: 'user', content: '今晚从这里继续。', status: 'complete', created_at: previewTime }}
      avatar={userAvatar} avatarShape={avatarShape} name={persona?.user_name || '你'} layoutMode={layout} floorNumber={0}
      showRoleplayTimestamp={preferences.roleplay_timestamps_enabled} showRoleplayFloor={preferences.roleplay_message_floors_enabled}
      spacingAfter={layout === 'agent' ? profile.reply_spacing : profile.turn_spacing} />
    <MessageBubble message={{ id: 'preview-assistant', role: 'assistant', content: '夜色在窗外缓缓流淌，远处的灯火像落在城市里的星海。\n\n我们从这里继续。', status: 'complete', created_at: previewTime }}
      avatar={assistantAvatar} avatarShape={avatarShape} name={persona?.assistant_name || 'AI'} layoutMode={layout} floorNumber={1}
      showRoleplayTimestamp={preferences.roleplay_timestamps_enabled} showRoleplayFloor={preferences.roleplay_message_floors_enabled} spacingAfter={0} />
  </div>;
  return <div className={`chat-display-preview${profile.assistant_bubble_enabled ? ' assistant-bubble-enabled' : ''}${compact ? ' ec-chat-window' : ''}`} style={style}>
    {messages}
  </div>;
}

export function ChatDisplaySettings({ persona, chatDisplay, onChatDisplayChange }) {
  const model = chatDisplaySettings(chatDisplay, onChatDisplayChange);
  const { preferences, layout, profile, defaults, selectLayout, updateProfile, updatePreferences, updateTextColor } = model;
  const tune = (key, label = chatDisplayTuners[key].label) => <DisplayTuner key={key} {...chatDisplayTuners[key]} label={label}
    value={profile[key]} defaultValue={defaults[key]} onChange={value => updateProfile({ [key]: value })} />;
  const colors = { ...DEFAULT_CHAT_TEXT_COLORS, ...preferences.text_colors };
  const avatarSource = shape => assetSrc(resolveChatAvatar(persona, 'assistant', shape) || appIcon);
  const visibleMessageInfo = layout === 'roleplay' ? [preferences.roleplay_timestamps_enabled && '时间', preferences.roleplay_message_floors_enabled && '楼层'].filter(Boolean) : [];
  return <div className="chat-display-settings-page chat-display-design">
    <div className="ec-panel">
      <header className="app-settings-heading ec-page-header"><h1>聊天显示</h1></header>
      <div className="ec-workspace">
        <div className="ec-editor">
          <section className="ec-layout-section" aria-label="对话布局">
            <h2>对话布局</h2>
            <div className="ec-layout-options" role="radiogroup" aria-label="对话布局">
              {chatLayouts.map(item => <button key={item.id} type="button" role="radio" aria-checked={layout === item.id}
                className={`ec-layout-choice${item.disabled ? ' ec-layout-unavailable' : ''}`} disabled={item.disabled} onClick={() => selectLayout(item.id)}>
                <LayoutThumbnail layout={item.id} />
                <span className="ec-layout-caption">{item.label}{item.disabled && <span>开发中</span>}</span>
              </button>)}
            </div>
          </section>
          <div className="ec-settings-list">
            <DisplayGroup id="behavior" icon={SlidersHorizontal} title="显示行为"
              description={`生成统计${visibleMessageInfo.length ? ` · 显示${visibleMessageInfo.join('与')}` : ''}`}
              preview={<span className="ec-behavior-sample">统计{preferences.generation_stats_enabled ? '已开启' : '已关闭'}</span>}>
              <DisplaySwitch label="生成统计" checked={preferences.generation_stats_enabled} onChange={value => updatePreferences({ generation_stats_enabled: value })} />
              {layout === 'roleplay' && <>
                <DisplaySwitch label="聊天时间戳" checked={preferences.roleplay_timestamps_enabled} onChange={value => updatePreferences({ roleplay_timestamps_enabled: value })} />
                <DisplaySwitch label="显示消息楼层" checked={preferences.roleplay_message_floors_enabled} onChange={value => updatePreferences({ roleplay_message_floors_enabled: value })} />
              </>}
            </DisplayGroup>
            <DisplayGroup id="avatar" icon={UserCircle} title={layout === 'social' ? '头像与气泡' : '头像与名字'}
              description={`${avatarShapes.find(shape => shape.id === profile.avatar_shape)?.label} · ${profile.avatar_size} px`}
              preview={<span className="ec-avatar-samples">{avatarShapes.map(shape => <img key={shape.id} src={avatarSource(shape.id)} alt="" className={`ec-avatar-${shape.id}`} />)}</span>}>
              <div className="ec-avatar-choice-row">
              <div className="ec-avatar-options" role="radiogroup" aria-label="头像形状">
                {avatarShapes.map(shape => <button key={shape.id} type="button" role="radio" aria-checked={profile.avatar_shape === shape.id}
                  disabled={shape.id === 'portrait' && layout !== 'roleplay'} onClick={() => updateProfile({ avatar_shape: shape.id })}>
                  <img src={avatarSource(shape.id)} alt="" className={`ec-avatar-${shape.id}`} />
                  {shape.id === 'rounded_square' ? '圆角方形' : shape.label}
                </button>)}
              </div>
              <ResetParameter label="头像形状" disabled={profile.avatar_shape === defaults.avatar_shape}
                onClick={() => updateProfile({ avatar_shape: defaults.avatar_shape })} />
              </div>
              {tune('avatar_size')}{layout !== 'social' && tune('name_font_size')}{tune('name_avatar_spacing', layout === 'social' ? '头像与气泡间距' : '头像与名字间距')}
            </DisplayGroup>
            <DisplayGroup id="typography" icon={TextT} title="正文文字"
              description={`${profile.message_font_size} px · 字重 ${profile.message_font_weight} · 行距 ${profile.line_height_multiplier}`}
              preview={<span className="ec-aa">Aa<span>字</span></span>}>
              <p className="ec-type-sample" style={{ fontSize: profile.message_font_size, fontWeight: profile.message_font_weight, lineHeight: 1.6 * profile.line_height_multiplier, letterSpacing: profile.letter_spacing }}>夜色在窗外缓缓流淌。</p>
              {tune('message_font_size')}{tune('message_font_weight')}{tune('line_height_multiplier')}{tune('letter_spacing')}
            </DisplayGroup>
            <DisplayGroup id="spacing" icon={ArrowsOutLineVertical} title="间距与留白"
              description={`段距 ${profile.paragraph_spacing} · 回复 ${profile.reply_spacing} · ${layout === 'agent' ? '轮次' : '消息'} ${profile.turn_spacing}`}
              preview={<span className="ec-spacing-glyph"><span /><span /><span /><span /></span>}>
              {tune('paragraph_spacing')}{layout !== 'social' && tune('reply_spacing')}{tune('turn_spacing', layout === 'agent' ? '轮次间距' : '消息间距')}
            </DisplayGroup>
            <DisplayGroup id="colors" icon={Palette} title="文字配色" description="斜体、下划线与引号内文本"
              preview={<span className="ec-palette-samples">{textColorOptions.map(option => <span key={option.key} style={{ background: colors[option.key] }} />)}</span>}>
              {textColorOptions.map(option => <div className="ec-color-row" key={option.key}>
                <span>{option.label}</span><span className={`ec-color-example ec-${option.key}`} style={option.key === 'underline' ? { textDecorationColor: colors.underline } : { color: colors[option.key] }}>
                  {option.key === 'italics' ? '夜色缓缓流淌' : option.key === 'underline' ? '今晚从这里继续' : '“我们继续吧。”'}</span>
                <input type="color" aria-label={option.label} value={colors[option.key]} onChange={event => updateTextColor(option.key, event.target.value)} />
                <ResetParameter label={option.label} disabled={colors[option.key].toLowerCase() === DEFAULT_CHAT_TEXT_COLORS[option.key]} onClick={() => updateTextColor(option.key, DEFAULT_CHAT_TEXT_COLORS[option.key])} />
              </div>)}
            </DisplayGroup>
            <DisplayGroup id="rich" icon={Browsers} title="富消息"
              description={preferences.rich_message_limit_enabled ? `自动运行最近 ${preferences.rich_message_floor_limit} 个 AI 消息楼层` : '不限制富消息运行楼层'}
              preview={<span className="ec-rich-sample"><span /><span /><span /></span>}>
              <DisplaySwitch label="限制富消息运行楼层" checked={preferences.rich_message_limit_enabled} onChange={value => updatePreferences({ rich_message_limit_enabled: value })} />
              {preferences.rich_message_limit_enabled && <div className="ec-rich-tuner"><TunerSliderRow {...richMessageFloorTuner} value={preferences.rich_message_floor_limit}
                onChange={value => updatePreferences({ rich_message_floor_limit: Math.round(value) })} /></div>}
              <p className="ec-help">{richMessageLimitDescription}</p>
            </DisplayGroup>
            {layout !== 'roleplay' && <DisplayGroup id="bubble" icon={ChatCircleDots} title="气泡样式"
              description={`圆角 ${profile.bubble_corner_radius} px${profile.assistant_bubble_enabled ? ' · 角色气泡已开启' : ''}`}
              preview={<ChatCircleDots className="ec-bubble-sample" />}>
              {layout === 'agent' && <DisplaySwitch label="角色气泡" checked={profile.assistant_bubble_enabled} onChange={value => updateProfile({ assistant_bubble_enabled: value })} />}
              {tune('bubble_corner_radius')}
            </DisplayGroup>}
          </div>
        </div>
        <aside className="ec-preview" aria-label="实时预览"><header><h2>实时预览</h2><span>{chatLayouts.find(item => item.id === layout)?.label}</span></header>
          <ChatDisplayPreview preferences={preferences} persona={persona} compact />
        </aside>
      </div>
    </div>
  </div>;
}
