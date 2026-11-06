// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileSettingsPage } from '../../src/mobile/MobileSettingsPage.jsx';
import { MobileMessageList } from '../../src/mobile/MobileMessagesPage.jsx';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '@shared/contracts/settings/schemas';
import { chatDisplayTuners } from '../../src/modules/settings/model/chatDisplaySettings.js';

vi.mock('../../src/ui/messages/OfficialMarkdown.jsx', () => ({ OfficialMarkdown: ({ children }) => <>{children}</> }));
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, view, sections, update, save, renderSection;
async function mount(initialPage = 'home') {
  sections = [{ id: 'extension-a', label: '扩展甲' }, { id: 'extension-b', label: '扩展乙' }];
  update = vi.fn(); save = vi.fn().mockResolvedValue(undefined);
  const notification = vi.fn();
  renderSection = vi.fn((section, close) => <button onClick={close}>{section.label}关闭设置</button>);
  function Harness() {
    const [page, open] = useState(initialPage);
    const [preferences, setPreferences] = useState(structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES));
    const [persona, setPersona] = useState({ user_name: '合成用户', user_avatar: '', user_square: '', user_portrait: '' });
    view = {
      settingsPage: page, setSettingsPage: open, settingsSections: sections, renderSettingsSection: renderSection,
      renderLanguageSettings: () => <button aria-haspopup="menu">官方语言选项</button>,
      appearance: { chatDisplay: preferences, changeChatDisplay: next => { update(next); setPreferences(next); }, appearanceMode: 'light', sidebarCharacterArtwork: 'cover', changeAppearanceMode: vi.fn(), changeSidebarCharacterArtwork: vi.fn() },
      chat: { persona, notify: notification, updateUserProfile: async next => {
        const saved = await save(next) || { ...persona, user_name: next.name, user_avatar: next.avatars.circle,
          user_square: next.avatars.square, user_portrait: next.avatars.portrait };
        setPersona(saved); return saved;
      } },
      goBack: vi.fn().mockReturnValue(false), selectPanel: vi.fn(), registerBackHandler: vi.fn(() => () => {}),
      guardRef: { current: null }, scrollPositions: new Map(),
    };
    return <MainPageContext.Provider value={view}><MobileSettingsPage /></MainPageContext.Provider>;
  }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />));
  return async () => act(async () => root.render(<Harness />));
}
async function click(label) {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  expect(button, `button ${label}`).toBeTruthy(); await act(async () => button.click());
}
async function input(node, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
}
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.replaceChildren(); delete window.ElecKoiPlatform; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function selectAvatar() {
  const BrowserURL = globalThis.URL;
  vi.stubGlobal('URL', class extends BrowserURL { static createObjectURL() { return 'blob:synthetic-avatar'; } static revokeObjectURL() {} });
  vi.stubGlobal('Image', class { naturalWidth = 640; naturalHeight = 480;
    set src(value) { queueMicrotask(() => this.onload()); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function () { return `data:image/png;base64,${btoa(`${this.width}:${this.height}`)}`; });
  await click('管理头像');
  const fileInput = container.querySelector('.avatar-manager-file-input');
  const choose = vi.spyOn(fileInput, 'click');
  await click('更换圆形头像');
  expect(choose).toHaveBeenCalledOnce();
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['synthetic-image'], 'avatar.png', { type: 'image/png' })] });
  await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  await click('返回');
}

describe('Android settings presentation with shared PC contracts', () => {
  it('keeps the official language control in chat display and leaves application settings to extensions', async () => {
    await mount();
    expect(container.querySelector('[aria-label="界面语言"]')).toBeNull();
    expect(container.textContent).not.toContain('官方语言选项');
    await click('聊天显示');
    const row = container.querySelector('[aria-label="界面语言"]');
    expect(row?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(row?.textContent).toBe('官方语言选项');
    expect(container.textContent).toContain('正文文字');
    expect(renderSection).not.toHaveBeenCalled();
  });

  it('opens shared roleplay style controls and retains independent tints across returning to the page', async () => {
    await mount('chat');
    expect([...container.querySelectorAll('.mobile-settings-row')].findIndex(n=>n.textContent.includes('布局独有风格')))
      .toBeGreaterThan([...container.querySelectorAll('.mobile-settings-row')].findIndex(n=>n.textContent.includes('富消息')));
    await click('布局独有风格无气泡');
    expect(view.settingsPage).toBe('chat:style');
    expect(container.querySelector('[aria-label="对话底板"]').checked).toBe(false);
    await act(async () => container.querySelector('[aria-label="消息气泡"]').click());
    await input(container.querySelector('[aria-label="用户气泡色调"]'), '#987654');
    expect(view.appearance.chatDisplay.roleplay_style).toMatchObject({ bubbles_enabled: true, user_bubble_tint: '#987654', assistant_bubble_tint: null });
    await click('返回'); await click('布局独有风格有气泡');
    expect(container.querySelector('[aria-label="用户气泡色调"]').value).toBe('#987654');
    await click('恢复用户气泡色调默认值');
    expect(view.appearance.chatDisplay.roleplay_style.user_bubble_tint).toBeNull();
  });
  it('does not interpret Android battery exemption as a vendor unrestricted battery policy', async () => {
    window.ElecKoiPlatform = { backgroundRun: {
      status: vi.fn().mockResolvedValue({ batteryExempt: true, backgroundRestricted: false, enhancedEnabled: false, overlayAllowed: false }),
      setEnhanced: vi.fn(), settings: vi.fn(),
    } };
    await mount(); await click('后台运行');
    expect(container.textContent).toContain('电池优化豁免已豁免');
    expect([...container.querySelectorAll('button')].some(button => button.textContent.includes('电池优化豁免'))).toBe(false);
    expect(container.textContent).not.toContain('应用省电策略');
    expect(container.querySelector('.mobile-settings-note')).toBeNull();
    expect(container.textContent).not.toContain('已放行');
    expect(container.textContent).not.toContain('未限制');
  });
  it('exposes battery and overlay settings without granting permissions or forcing protection on', async () => {
    window.ElecKoiPlatform = { backgroundRun: {
      status: vi.fn().mockResolvedValue({ batteryExempt: false, backgroundRestricted: false, enhancedEnabled: false, overlayAllowed: false }),
      setEnhanced: vi.fn().mockImplementation(async enhancedEnabled => ({ batteryExempt: false, backgroundRestricted: false, enhancedEnabled, overlayAllowed: false })),
      settings: vi.fn(),
    } };
    await mount(); await click('后台运行');
    expect(container.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('false');
    await click('电池优化豁免未豁免');
    expect(window.ElecKoiPlatform.backgroundRun.settings).toHaveBeenLastCalledWith('battery');
    expect(container.textContent).not.toContain('已放行');
    expect(container.textContent).not.toContain('未限制');
    await click('悬浮窗保活');
    expect(window.ElecKoiPlatform.backgroundRun.setEnhanced).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('悬浮窗权限未授权');
    await click('悬浮窗权限未授权');
    expect(window.ElecKoiPlatform.backgroundRun.settings).toHaveBeenLastCalledWith('overlay');
    await click('悬浮窗保活');
    expect(window.ElecKoiPlatform.backgroundRun.setEnhanced).toHaveBeenLastCalledWith(false);
  });
  it('places native reply notifications below plugins and saves directly without an outer save', async () => {
    window.ElecKoiPlatform = { replyNotifications: {
      status: vi.fn().mockResolvedValue({ enabled: true, allowed: false }),
      setEnabled: vi.fn().mockImplementation(async enabled => ({ enabled, allowed: false })), settings: vi.fn(),
    } };
    await mount();
    const application = [...container.querySelectorAll('.mobile-settings-group')].find(group => group.textContent.includes('扩展甲'));
    expect(application.textContent.indexOf('回复完成通知')).toBeGreaterThan(application.textContent.indexOf('扩展乙'));
    await click('回复完成通知');
    expect(container.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true');
    await click('回复完成通知');
    expect(window.ElecKoiPlatform.replyNotifications.setEnabled).toHaveBeenCalledWith(false);
    expect(container.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('false');
    await click('系统通知权限未开启');
    expect(window.ElecKoiPlatform.replyNotifications.settings).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('悬浮窗保活');
    expect([...container.querySelectorAll('button')].some(button => button.textContent==='保存')).toBe(false);
  });
  it('edits rich message limits on their own screen and retains the count when switched off', async () => {
    await mount('chat');
    await click('富消息');
    expect(view.settingsPage).toBe('chat:rich');
    expect(container.querySelector('.mobile-settings-preview')).toBeNull();
    expect(container.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[aria-label="自动运行楼层数数值"]')).toBeNull();
    await click('限制富消息运行楼层');
    expect(container.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[aria-label="自动运行楼层数数值"]').value).toBe('10');
    await click('自动运行楼层数增加');
    expect(update.mock.lastCall[0]).toMatchObject({ rich_message_limit_enabled: true, rich_message_floor_limit: 11 });
    await click('限制富消息运行楼层');
    expect(update.mock.lastCall[0]).toMatchObject({ rich_message_limit_enabled: false, rich_message_floor_limit: 11 });
    expect(container.querySelector('.tuner-slider-row')).toBeNull();
    await click('返回'); await click('富消息'); await click('限制富消息运行楼层');
    expect(container.querySelector('[aria-label="自动运行楼层数数值"]').value).toBe('11');
  });
  it('renders the selected list artwork instead of forcing a cover image', async () => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const characters = new Map([['character-a', { id: 'character-a', name: '合成角色', persona: { assistant_avatar: 'avatar.png', assistant_cover: 'cover.png' } }]]);
    const render = artworkMode => <MainPageContext.Provider value={{ scrollPositions: new Map() }}><MobileMessageList sessions={[{ id: 'chat-a', character_id: 'character-a', character_avatar: 'avatar.png' }]} characters={characters} pinnedIds={[]} artworkMode={artworkMode} /></MainPageContext.Provider>;
    await act(async () => root.render(render('avatar')));
    expect(container.querySelector('.sidebar-character-artwork').classList.contains('is-avatar')).toBe(true);
    expect(container.querySelector('.sidebar-character-artwork img').getAttribute('src')).toBe('avatar.png');
    await act(async () => root.render(render('cover')));
    expect(container.querySelector('.sidebar-character-artwork').classList.contains('is-cover')).toBe(true);
  });
  it('opens grouped rows as independent screens and keeps only current supported appearance options', async () => {
    await mount();
    expect(container.querySelector('.app-settings-sidebar')).toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/主页背景|资料背景|代码块样式|字体/);
    await click('主题风格浅色');
    expect([...container.querySelectorAll('[role="radio"]')].map(item => item.textContent)).toEqual(['浅色', '深色']);
    await click('返回'); expect(view.settingsPage).toBe('home');
    await click('聊天显示');
    expect(container.textContent).not.toMatch(/思维链|适当收起|全量展开/);
    expect(container.textContent).toContain('生成统计');
    expect(container.querySelectorAll('.tuner-slider-row')).toHaveLength(0);
    await click('正文文字15 · 400');
    expect(container.querySelectorAll('.tuner-slider-row')).toHaveLength(5);
    await click('返回'); expect(view.settingsPage).toBe('chat');
  });
  it('uses the PC field bounds, updates weight, and retains other layouts and preferences', async () => {
    await mount('chat:text');
    for (const key of ['message_font_size', 'message_font_weight', 'line_height_multiplier', 'letter_spacing', 'paragraph_spacing']) {
      const config = chatDisplayTuners[key];
      const range = container.querySelector(`[aria-label="${config.label}滑杆"]`);
      expect([range.min, range.max, range.step]).toEqual([String(config.min), String(config.max), String(config.step)]);
    }
    const before = structuredClone(view.appearance.chatDisplay);
    await click('字重增加');
    expect(update.mock.lastCall[0].profiles.roleplay.message_font_weight).toBe(500);
    expect(update.mock.lastCall[0].profiles.agent).toEqual(before.profiles.agent);
    expect(update.mock.lastCall[0].reasoning_display_mode).toBe(before.reasoning_display_mode);
    await click('恢复字重默认值'); expect(update.mock.lastCall[0].profiles.roleplay.message_font_weight).toBe(400);
    expect(container.querySelector('[aria-label="行距数值"]').value).toBe('1.00');
  });
  it('keeps plugin ownership and close semantics, with exact IDs after an extension unloads', async () => {
    const rerender = await mount();
    await click('扩展甲');
    expect(renderSection.mock.lastCall[0].id).toBe('extension-a');
    sections = sections.filter(item => item.id !== 'extension-a');
    renderSection.mockClear(); await rerender();
    // 设置分区消失后给的是带码的失败面：用户话由码表给（「请先返回设置列表。」），码本身可见。
    const unavailable = container.querySelector('[role="alert"]');
    expect(unavailable.textContent).toContain('请先返回设置列表');
    expect(unavailable.textContent).toContain('eleckoi/state/precondition');
    expect(renderSection).not.toHaveBeenCalled();
    await click('返回'); expect(container.textContent).not.toContain('扩展甲');
    sections = [...sections, { id: 'extension-c', label: '扩展丙' }]; await rerender();
    await click('扩展丙'); await click('扩展丙关闭设置');
    expect(view.selectPanel).toHaveBeenCalledWith('messages');
  });
  it('uses the real profile extension and keeps a failed save editable', async () => {
    await mount('profile');
    await input(container.querySelector('[aria-label="名字"]'), '合成新名字');
    save.mockRejectedValueOnce(new Error('合成保存失败'));
    await click('保存');
    expect(save.mock.lastCall[0].name).toBe('合成新名字');
    expect(view.chat.notify).toHaveBeenCalledWith('error', '合成保存失败');
    expect(container.querySelector('.mobile-header [role="alert"]')).toBeNull();
    expect(container.querySelector('.mobile-profile-editor [role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-label="名字"]').value).toBe('合成新名字');
    await click('保存'); expect(view.chat.notify).toHaveBeenCalledWith('success', '用户资料已保存');
    expect(container.querySelector('.mobile-header [role="status"]')).toBeNull();
    await click('返回'); expect(view.settingsPage).toBe('home');
  });
  it('protects a profile draft on return and returns from avatar management before leaving settings', async () => {
    await mount('profile');
    await input(container.querySelector('[aria-label="名字"]'), '尚未保存的合成名字');
    await click('返回'); expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => [...document.querySelectorAll('[role="alertdialog"] button')].find(item => item.textContent === '取消').click());
    await click('管理头像'); expect(container.querySelectorAll('.mobile-header h1')).toHaveLength(1);
    await click('返回'); expect(container.querySelector('[aria-label="名字"]').value).toBe('尚未保存的合成名字');
  });

  it('keeps avatar and name edits in one draft and adopts the stored media references only after Save', async () => {
    await mount('profile');
    const persisted = { ...view.chat.persona };
    await input(container.querySelector('[aria-label="名字"]'), '合成新名字');
    await selectAvatar();
    expect(save).not.toHaveBeenCalled();
    expect(view.chat.persona).toEqual(persisted);
    expect(container.querySelector('[aria-label="名字"]').value).toBe('合成新名字');
    expect(container.querySelector('.mobile-profile-avatar > span')).toBeNull();
    const avatar = container.querySelector('.mobile-profile-avatar img').getAttribute('src');
    expect(avatar).toMatch(/^data:image\/png;base64,/);
    save.mockRejectedValueOnce(new Error('合成保存失败'));
    await click('保存');
    expect(save.mock.lastCall[0]).toMatchObject({ name: '合成新名字', avatars: { circle: avatar, square: avatar } });
    expect(view.chat.persona).toEqual(persisted);
    expect(container.querySelector('.mobile-profile-avatar img').getAttribute('src')).toBe(avatar);
    const reference = slot => `eleckoi-media://asset/v1/${'a'.repeat(64)}/${slot}/${'b'.repeat(64)}.png`;
    const stored = { user_name: '合成新名字', user_avatar: reference('user-avatar'),
      user_square: reference('user-square'), user_portrait: reference('user-portrait') };
    save.mockResolvedValueOnce(stored);
    await click('保存');
    expect(view.chat.persona).toEqual(stored);
    expect(container.querySelector('.mobile-profile-avatar img').getAttribute('src')).toBe(stored.user_avatar);
    await click('返回');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(view.settingsPage).toBe('home');
  });

  it('guards an avatar-only draft and leaves the stored profile untouched when discarded', async () => {
    await mount('profile');
    const persisted = { ...view.chat.persona };
    await selectAvatar();
    await click('返回');
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    await act(async () => [...dialog.querySelectorAll('button')].find(item => item.textContent === '不保存').click());
    expect(save).not.toHaveBeenCalled();
    expect(view.chat.persona).toEqual(persisted);
    expect(view.settingsPage).toBe('home');
  });
});
