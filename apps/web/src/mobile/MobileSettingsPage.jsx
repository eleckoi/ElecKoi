import { MobileSaveFeedback } from './MobileSaveFeedback.jsx';
import { useEffect, useRef, useState } from 'react';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { ArrowsOutLineVertical, BatteryFull, ChatCenteredText, ChatCircleDots, Check, Cpu, Image, Info, Palette, SlidersHorizontal, TextT, UserCircle } from '../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { TunerSliderRow } from '../ui/ui/TunerSliderRow.jsx';
import { UnsavedChangesDialog } from '../ui/ui/UnsavedChangesDialog.jsx';
import { ChatDisplayPreview, UserProfileSettings } from '../modules/settings/components/SettingsPanel.jsx';
import { AboutSettings } from '../modules/settings/components/AboutSettings.jsx';
import { chatDisplaySettings, chatDisplayTuners, chatLayouts, avatarShapes, textColorOptions, richMessageFloorTuner, richMessageLimitDescription } from '../modules/settings/model/chatDisplaySettings.js';
import { MobileHeader, useMobileBack, useMobileScroll } from './MobileChrome.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { MobileChevronRightIcon } from './MobileIcons.jsx';
import './mobile-settings.css';

function SettingsGroup({ title, children }) {
  return <section className="mobile-settings-group">{title && <h2>{title}</h2>}<div className="mobile-settings-card">{children}</div></section>;
}

function SettingsRow({ icon: Icon, label, value, onClick }) {
  const Row = onClick ? 'button' : 'div';
  return <Row type={onClick ? 'button' : undefined} className="mobile-settings-row" onClick={onClick}>
    {Icon && <Icon size={21} />}<span className="mobile-settings-label">{label}</span>
    {value != null && <span className="mobile-settings-value">{value}</span>}{onClick && <MobileChevronRightIcon size={18} />}
  </Row>;
}

function SettingsSwitch({ label, checked, onChange, disabled = false }) {
  return <button type="button" className="mobile-settings-switch" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
    <span>{label}</span><i aria-hidden="true" />
  </button>;
}

function SettingsChoices({ label, options, value, onChange }) {
  return <div className="mobile-settings-choices" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.id} type="button" role="radio" disabled={option.disabled} aria-checked={value === option.id} onClick={() => onChange(option.id)}>
      {option.shape && <i className={`mobile-settings-avatar-shape ${option.id}`} />}
      <span>{option.label}</span><Check size={19} aria-hidden="true" />
    </button>)}
  </div>;
}

function ProfileEditor({ owner, onBack }) {
  const view = useMainPageView();
  const [pending, setPending] = useState(null);
  const current = useRef();
  const dirty = owner.dirty;
  current.current = { owner, dirty };
  function navigate(action) {
    if (current.current.owner.saving) return;
    if (current.current.dirty) setPending(() => action);
    else action();
  }
  useEffect(() => {
    view.guardRef.current = navigate;
    return () => { if (view.guardRef.current === navigate) view.guardRef.current = null; };
  }, [view.guardRef]);
  useMobileBack(() => { navigate(onBack); return true; });
  return <>
    <MobileHeader title="编辑资料" back={() => navigate(onBack)}><MobileSaveFeedback error={owner.message === '已保存' ? '' : owner.message} notice={owner.message === '已保存' ? 'saved' : ''} onNotify={view.chat.notify} successMessage="用户资料已保存" /><button type="button" className="mobile-settings-save" disabled={owner.saving} onClick={() => owner.onSave()}>保存</button></MobileHeader>
    <div className="mobile-settings-scroll mobile-profile-editor">
      <button type="button" className="mobile-profile-avatar" aria-label="管理头像" disabled={owner.saving} onClick={owner.onManageAvatars}>
        <Avatar src={owner.profile.avatars.circle} name={owner.profile.name || '你'} />
      </button>
      <div className="mobile-settings-card mobile-settings-field"><label><span>名字</span><input aria-label="名字" disabled={owner.saving} value={owner.profile.name} onChange={event => owner.onChange({ name: event.target.value })} /></label></div>
    </div>
    <UnsavedChangesDialog open={Boolean(pending)} title="保存用户资料？" description="用户资料尚未保存。" saving={owner.saving} error={owner.message === '已保存' ? '' : owner.message}
      onCancel={() => setPending(null)} onDiscard={() => { const action = pending; setPending(null); action?.(); }}
      onSave={async () => { if (await owner.onSave()) { const action = pending; setPending(null); action?.(); } }} />
  </>;
}

function ProfileAvatars({ owner, children }) {
  useMobileBack(() => { if (!owner.saving) owner.onBack(); return true; });
  return <><MobileHeader title="头像管理" back={() => { if (!owner.saving) owner.onBack(); }} /><div className="mobile-settings-scroll mobile-profile-avatars">{children}</div></>;
}

const detailTitles = {
  'chat:layout': '对话布局', 'chat:avatar': '头像与名字', 'chat:text': '正文文字',
  'chat:spacing': '间距与留白', 'chat:colors': '文本颜色', 'chat:bubble': '气泡样式',
  'chat:rich': '富消息',
};
/** 设置项已从设置列表消失时的失败（码给用户话，这里只写开发者诊断）。 */
const UNAVAILABLE_SETTING_FAILURE = new DesktopError(
  ELECKOI_FAILURE_CODES.statePrecondition,
  '设置项已不可用：该设置分区已从设置列表移除。',
  { what: '返回设置列表' },
);

const themeChoices = [{ id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }];
const artworkChoices = [{ id: 'cover', label: '封面立绘' }, { id: 'avatar', label: '头像' }];

function ReplyNotificationSettings({ platform }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => platform.status().then(value => {
      if (active) { setStatus(value); setError(''); }
    }).catch(() => { if (active) setError('通知设置读取失败，请返回后重试。'); });
    refresh();
    window.addEventListener('focus', refresh);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [platform]);
  async function change(enabled) {
    if (saving) return;
    setSaving(true);
    try { setStatus(await platform.setEnabled(enabled)); setError(''); }
    catch { setError('通知设置保存失败，请重试。'); }
    finally { setSaving(false); }
  }
  return <>
    {status && <SettingsGroup>
      <SettingsSwitch label="回复完成通知" checked={status.enabled} disabled={saving} onChange={change} />
      <SettingsRow icon={ChatCircleDots} label="系统通知权限" value={status.allowed ? '已开启' : '未开启'} onClick={() => platform.settings()} />
    </SettingsGroup>}
    <p className="mobile-settings-note">应用在后台时，回复完成会显示角色头像和回复内容。通知声音由系统设置控制。</p>
    {error && <p className="mobile-settings-error" role="alert">{error}</p>}
  </>;
}

function BackgroundRunPreferences({ platform }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => platform.status().then(value => {
      if (active) { setStatus(value); setError(''); }
    }).catch(() => { if (active) setError('后台运行设置读取失败，请返回后重试。'); });
    refresh(); window.addEventListener('focus', refresh);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [platform]);
  async function change(enabled) {
    if (saving) return;
    setSaving(true);
    try { setStatus(await platform.setEnhanced(enabled)); setError(''); }
    catch { setError('后台运行设置保存失败，请重试。'); }
    finally { setSaving(false); }
  }
  return <>
    {status && <>
      <SettingsGroup title="省电设置">
        <SettingsRow icon={BatteryFull} label="电池优化豁免" value={status.batteryExempt ? '已豁免' : '未豁免'} onClick={status.batteryExempt ? undefined : () => platform.settings('battery')} />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsSwitch label="悬浮窗保活" checked={status.enhancedEnabled} disabled={saving} onChange={change} />
        <SettingsRow icon={SlidersHorizontal} label="悬浮窗权限" value={status.overlayAllowed ? '已授权' : '未授权'} onClick={() => platform.settings('overlay')} />
      </SettingsGroup>
    </>}
    {error && <p className="mobile-settings-error" role="alert">{error}</p>}
  </>;
}

export function MobileSettingsPage() {
  const view = useMainPageView();
  const { appearance, chat, settingsPage: page, setSettingsPage: open, settingsSections = [] } = view;
  const model = chatDisplaySettings(appearance.chatDisplay, appearance.changeChatDisplay);
  const { preferences, layout, profile, defaults, updateProfile, updatePreferences } = model;
  const plugin = page.startsWith('dsh:') ? settingsSections.find(section => `dsh:${section.id}` === page) : null;
  const scroll = useMobileScroll(`settings:${page}`);
  const replyNotifications = window.ElecKoiPlatform?.replyNotifications;
  const backgroundRun = window.ElecKoiPlatform?.backgroundRun;
  function back() {
    if (page.startsWith('chat:')) open('chat');
    else if (page !== 'home') open('home');
    else if (!view.goBack()) view.selectPanel('messages');
    return true;
  }
  useMobileBack(back, page !== 'home');
  const tune = (key, label) => {
    const config = chatDisplayTuners[key];
    return <TunerSliderRow key={key} {...config} label={label || config.label} suffix={config.suffix || ''}
      value={profile[key]} defaultValue={defaults[key]} onChange={value => updateProfile({ [key]: value })} />;
  };
  const title = page === 'home' ? '设置' : page === 'theme' ? '主题风格' : page === 'artwork' ? '列表角色图' : page === 'chat' ? '聊天显示' : page === 'about' ? '关于 ElecKoi' : page === 'notifications' ? '回复完成通知' : page === 'background' ? '后台运行' : plugin?.label || detailTitles[page] || '设置';
  let content;
  if (page === 'home') {
    content = <>
      <SettingsGroup title="个性化">
        <SettingsRow icon={UserCircle} label="用户资料" onClick={() => open('profile')} />
        <SettingsRow icon={Palette} label="主题风格" value={themeChoices.find(item => item.id === appearance.appearanceMode)?.label || (appearance.appearanceMode === 'system' ? '跟随系统' : '')} onClick={() => open('theme')} />
        <SettingsRow icon={ChatCircleDots} label="聊天显示" onClick={() => open('chat')} />
        <SettingsRow icon={Image} label="列表角色图" value={artworkChoices.find(item => item.id === appearance.sidebarCharacterArtwork)?.label} onClick={() => open('artwork')} />
      </SettingsGroup>
      {(settingsSections.length > 0 || replyNotifications || backgroundRun) && <SettingsGroup title="应用">
        {settingsSections.map(section => <SettingsRow key={section.id} icon={SlidersHorizontal} label={section.label} onClick={() => open(`dsh:${section.id}`)} />)}
        {replyNotifications && <SettingsRow icon={ChatCircleDots} label="回复完成通知" onClick={() => open('notifications')} />}
        {backgroundRun && <SettingsRow icon={Cpu} label="后台运行" onClick={() => open('background')} />}
      </SettingsGroup>}
      <SettingsGroup title="关于"><SettingsRow icon={Info} label="关于 ElecKoi" onClick={() => open('about')} /></SettingsGroup>
    </>;
  } else if (page === 'profile') {
    return <div className="mobile-settings-page"><UserProfileSettings persona={chat.persona} onUpdateUserProfile={chat.updateUserProfile} renderUserProfileEditor={view.renderUserProfileEditor}
      renderProfile={owner => <ProfileEditor owner={owner} onBack={back} />}
      renderAvatarManager={(owner, editor) => <ProfileAvatars owner={owner}>{editor}</ProfileAvatars>} /></div>;
  } else if (page === 'theme' || page === 'artwork') {
    content = <SettingsGroup><SettingsChoices label={title} options={page === 'theme' ? themeChoices : artworkChoices}
      value={page === 'theme' ? appearance.appearanceMode : appearance.sidebarCharacterArtwork}
      onChange={page === 'theme' ? appearance.changeAppearanceMode : appearance.changeSidebarCharacterArtwork} /></SettingsGroup>;
  } else if (page === 'chat') {
    content = <>
      <SettingsGroup>
        <SettingsRow icon={ChatCenteredText} label="对话布局" value={chatLayouts.find(item => item.id === layout)?.label} onClick={() => open('chat:layout')} />
        <SettingsRow icon={UserCircle} label="头像与名字" value={`${avatarShapes.find(item => item.id === profile.avatar_shape)?.label || ''} · ${profile.avatar_size}`} onClick={() => open('chat:avatar')} />
        <SettingsRow icon={TextT} label="正文文字" value={`${profile.message_font_size} · ${profile.message_font_weight}`} onClick={() => open('chat:text')} />
        <SettingsRow icon={ArrowsOutLineVertical} label="间距与留白" value={`${profile.reply_spacing} / ${profile.turn_spacing}`} onClick={() => open('chat:spacing')} />
        <SettingsRow icon={Palette} label="文本颜色" onClick={() => open('chat:colors')} />
        <SettingsRow icon={ChatCircleDots} label="富消息" onClick={() => open('chat:rich')} />
        {layout === 'agent' && <SettingsRow icon={ChatCircleDots} label="气泡样式" onClick={() => open('chat:bubble')} />}
      </SettingsGroup>
      <SettingsGroup><SettingsSwitch label="生成统计" checked={preferences.generation_stats_enabled} onChange={value => updatePreferences({ generation_stats_enabled: value })} /></SettingsGroup>
      {layout === 'roleplay' && <SettingsGroup><SettingsSwitch label="聊天时间戳" checked={preferences.roleplay_timestamps_enabled} onChange={value => updatePreferences({ roleplay_timestamps_enabled: value })} />
        <SettingsSwitch label="显示消息楼层" checked={preferences.roleplay_message_floors_enabled} onChange={value => updatePreferences({ roleplay_message_floors_enabled: value })} /></SettingsGroup>}
      <button type="button" className="mobile-settings-reset" onClick={model.resetProfile}>恢复当前布局</button>
    </>;
  } else if (page === 'chat:layout') {
    content = <SettingsGroup><SettingsChoices label={title} options={chatLayouts.filter(item => !item.disabled)} value={layout} onChange={model.selectLayout} /></SettingsGroup>;
  } else if (page === 'chat:avatar') {
    content = <><SettingsGroup title="头像形状"><SettingsChoices label="头像形状" options={avatarShapes.map(shape => ({ ...shape, shape: true, disabled: shape.id === 'portrait' && layout !== 'roleplay' }))} value={profile.avatar_shape} onChange={value => updateProfile({ avatar_shape: value })} /></SettingsGroup>
      <SettingsGroup><div className="mobile-settings-tuners">{tune('avatar_size')}{tune('name_font_size')}{tune('name_avatar_spacing')}</div></SettingsGroup></>;
  } else if (page === 'chat:text') {
    content = <SettingsGroup><div className="mobile-settings-tuners">{['message_font_size', 'message_font_weight', 'line_height_multiplier', 'letter_spacing', 'paragraph_spacing'].map(key => tune(key))}</div></SettingsGroup>;
  } else if (page === 'chat:spacing') {
    content = <SettingsGroup><div className="mobile-settings-tuners">{tune('reply_spacing')}{tune('turn_spacing', layout === 'agent' ? '轮次间距' : '消息间距')}</div></SettingsGroup>;
  } else if (page === 'chat:rich') {
    content = <>
      <SettingsGroup><SettingsSwitch label="限制富消息运行楼层" checked={preferences.rich_message_limit_enabled}
        onChange={value => updatePreferences({ rich_message_limit_enabled: value })} />
        {preferences.rich_message_limit_enabled && <div className="mobile-settings-tuners">
          <TunerSliderRow {...richMessageFloorTuner} value={preferences.rich_message_floor_limit}
            onChange={value => updatePreferences({ rich_message_floor_limit: Math.round(value) })} />
        </div>}
      </SettingsGroup>
      <p className="mobile-settings-note">{richMessageLimitDescription}</p>
    </>;
  } else if (page === 'chat:colors') {
    content = <><SettingsGroup>{textColorOptions.map(option => <label key={option.key} className="mobile-settings-color"><span>{option.label}</span><input type="color" aria-label={option.label} value={preferences.text_colors[option.key]} onChange={event => model.updateTextColor(option.key, event.target.value)} /></label>)}</SettingsGroup>
      <button type="button" className="mobile-settings-reset" onClick={model.resetTextColors}>恢复默认</button></>;
  } else if (page === 'chat:bubble' && layout === 'agent') {
    content = <SettingsGroup><SettingsSwitch label="角色气泡" checked={profile.assistant_bubble_enabled} onChange={value => updateProfile({ assistant_bubble_enabled: value })} /><div className="mobile-settings-tuners">{tune('bubble_corner_radius')}</div></SettingsGroup>;
  } else if (page === 'notifications' && replyNotifications) {
    content = <ReplyNotificationSettings platform={replyNotifications} />;
  } else if (page === 'background' && backgroundRun) {
    content = <BackgroundRunPreferences platform={backgroundRun} />;
  } else if (page === 'about') {
    content = <AboutSettings updates={view.appUpdates} />;
  } else if (plugin) {
    content = <div className="mobile-settings-plugin" data-plugin-panel>{view.renderSettingsSection(plugin, () => view.selectPanel('messages'))}</div>;
  } else {
    content = <FailureAlert failure={UNAVAILABLE_SETTING_FAILURE} className="mobile-settings-error" />;
  }
  return <div className="mobile-settings-page" data-settings-page={page}>
    <MobileHeader title={title} back={back} />
    <div ref={scroll} className="mobile-settings-scroll" key={page}>
      {content}
      {['chat:layout', 'chat:avatar', 'chat:text', 'chat:spacing', 'chat:bubble'].includes(page) && <section className="mobile-settings-preview" aria-label="实时预览"><h2>实时预览</h2><ChatDisplayPreview preferences={preferences} persona={chat.persona} /></section>}
    </div>
  </div>;
}
