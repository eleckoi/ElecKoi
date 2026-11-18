// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileMessagesPage } from '../../src/mobile/MobileMessagesPage.jsx';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';
import { ChatWallpaper } from '../../../../packages/client/features/dsh-client-chat-background/src/page.jsx';
import { MessagesPage } from '../../../../packages/client/features/dsh-client-conversations/src/page.jsx';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';
import { APP_DEFAULT_CHAT_BACKGROUND, CUSTOM_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND } from '../../src/modules/appearance/preferences/chatWallpaper.js';
import { keepOfficialDraftFocus } from '../../../../tests/helpers/officialTrajectory.js';
import { renderNativeConversationContent } from '../helpers/NativeConversationPresentation.jsx';

class TestResizeObserver { observe() {} unobserve() {} disconnect() {} }

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function conversationView() {
  const goBack = vi.fn();
  const selectView = vi.fn();
  const renderComposer = vi.fn((name, owner) => name === 'eleckoi.roleplay.background' && owner.activeView === 'chat'
    ? <ChatWallpaper wallpaper={owner.wallpaper} /> : name === 'eleckoi.roleplay.header.menu'
      ? <button role="menuitem" onClick={owner.onOpen}>自定义背景</button> : null);
  return {
    route: { kind: 'conversation' }, goBack, scrollPositions: new Map(),
    appearance: {}, conversations: {},
    presets: { refresh: async () => ({ presets: [], activePresetIds: { roleplay: '', creator: 'synthetic-creator' } }) },
    renderLayout: ({ mainPanel }) => mainPanel,
    renderRoleplay: ({ component: Component, props }) => <Component {...props} renderConversationContent={renderNativeConversationContent} renderRoleplaySlot={renderComposer} dshConversation={{
      activeView: 'chat', tabs: [{ id: 'chat', label: '对话' }, { id: 'trajectory', label: '轨迹' }, { id: 'plugin-view', label: '扩展视图' }], selectView,
    }} />,
    selectView,
    renderComposer,
    chat: { sessionId: 'chat-a', characters: { items: [] }, currentTitle: '角色甲', messages: [],
      chatPersona: { user_name: '用户', assistant_name: '角色甲' }, input: '', inputImages: [], inputFiles: [],
      chatModelConfigs: [], scrollRef: { current: null }, filteredSessions: [], pinnedIds: [], keyword: '' },
  };
}

describe('Android conversation header', () => {
  it('opens the character picker, selects the requested character and retains the empty creation route', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const view = { ...conversationView(), route: { kind: 'root' }, routeBusy: false,
      openCharacterConversation: vi.fn(), selectPanel: vi.fn() };
    view.chat.characters.items = [{ id: 'picker-a', name: '合成角色甲', persona: {} }, { id: 'picker-b', name: '合成角色乙', persona: {} }];
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const render = () => root.render(<MainPageContext.Provider value={view}><MobileMessagesPage /></MainPageContext.Provider>);
    const open = () => container.querySelector('[aria-label="新建对话"]').click();
    try {
      await act(render); await act(open);
      const rows = [...document.querySelectorAll('.mobile-character-picker-option')];
      expect(rows.map(row => row.querySelector('.mobile-character-picker-name').textContent)).toEqual(['合成角色甲', '合成角色乙']);
      expect(rows.every(row => row.querySelector('.sidebar-character-artwork') && row.querySelector('.mobile-character-picker-name'))).toBe(true);
      await act(async () => rows[1].click());
      expect(view.openCharacterConversation).toHaveBeenCalledWith('picker-b');
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      view.routeBusy = true; await act(render); await act(open);
      expect([...document.querySelectorAll('.mobile-character-picker-option')].every(row => row.disabled)).toBe(true);
      await act(() => document.querySelector('[aria-label="关闭"]').click());
      view.routeBusy = false; view.chat.characters.items = []; await act(render); await act(open);
      const create = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === '创建角色');
      await act(() => create.click());
      expect(view.selectPanel).toHaveBeenCalledWith('character');
    } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it('uses one title, returns through the mobile route, and keeps official view actions', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const view = conversationView();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<MainPageContext.Provider value={view}><MobileMessagesPage /></MainPageContext.Provider>));
      expect(container.querySelector('.mobile-header')).toBeNull();
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      expect(view.renderComposer).toHaveBeenCalledWith('eleckoi.roleplay.conversation.composer.bar', expect.objectContaining({ submitOnEnter: false }));
      const row = container.querySelector('.chat-header-title-row');
      expect(row.firstElementChild.getAttribute('aria-label')).toBe('返回');
      expect(row.querySelector('h1').textContent).toBe('角色甲');
      await act(async () => row.firstElementChild.click());
      expect(view.goBack).toHaveBeenCalledTimes(1);
      await act(async () => [...container.querySelectorAll('[role="tab"]')].find(button => button.textContent === '扩展视图').click());
      expect(view.selectView).toHaveBeenCalledWith('plugin-view');
    } finally {
      await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
    }
  });

  it('leaves the shared PC header without an Android back button', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const view = conversationView();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() => root.render(<MainPageContext.Provider value={view}><MessagesPage /></MainPageContext.Provider>));
      expect(view.renderComposer).toHaveBeenCalledWith('eleckoi.roleplay.conversation.composer.bar', expect.objectContaining({ submitOnEnter: true }));
      expect(container.querySelector('.mobile-conversation-back')).toBeNull();
      expect(container.querySelector('[aria-label="返回"]')).toBeNull();
      expect(container.querySelector('[aria-label="对话操作"]')).toBeNull();
    } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});

describe('Android conversation wallpaper', () => {
  const imageA = 'data:image/png;base64,aGVsbG8=';
  const imageB = 'data:image/png;base64,d29ybGQ=';
  async function mountWallpaper(view, run) {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const render = () => act(async () => root.render(<MainPageContext.Provider value={view}><MobileMessagesPage /></MainPageContext.Provider>));
    try { await render(); await run(container, render); }
    finally { await act(async () => root.unmount()); container.remove(); }
  }

  it('keeps artwork visible through the actual display-contents slot boundaries and restores an opaque plain panel', async () => {
    const view = conversationView();
    const renderRoleplay = view.renderRoleplay;
    view.renderRoleplay = props => ['eleckoi.roleplay', 'eleckoi.roleplay.session', 'eleckoi.roleplay.session.header', 'eleckoi.roleplay.session.body']
      .reduceRight((child, slot) => <div data-slot={slot} style={{ display: 'contents' }}>{child}</div>, renderRoleplay(props));
    view.chat.chatBackgroundCharacter = { chatBackground: '' };
    view.chat.chatPersona.assistant_cover = imageA;
    const style = document.createElement('style');
    style.textContent = '[data-eleckoi-native-frame] > [data-phase] { background: white; }' + readFileSync('packages/client/features/dsh-client-chat-background/src/wallpaper.css', 'utf8');
    document.head.append(style);
    try {
      await mountWallpaper(view, async (container, render) => {
        const panel = container.querySelector('.chat-panel');
        expect(panel.parentElement.dataset.slot).toBe('eleckoi.roleplay.session.body');
        const native = panel.querySelector('[data-eleckoi-native-frame] > [data-phase]');
        const wallpaperRule = [...style.sheet.cssRules].find(rule => rule.selectorText?.includes(':has(.chat-shell-backdrop)') && rule.style?.background === 'transparent');
        expect(wallpaperRule).toBeDefined();
        expect(native.matches(wallpaperRule.selectorText)).toBe(true);
        expect(wallpaperRule.style.zIndex).toBe('1');
        expect(getComputedStyle(native).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        view.chat.chatBackgroundCharacter = { chatBackground: APP_DEFAULT_CHAT_BACKGROUND };
        await render();
        expect(container.querySelector('.chat-shell-backdrop')).toBeNull();
        expect(native.matches(wallpaperRule.selectorText)).toBe(false);
        expect(getComputedStyle(native).backgroundColor).toBe('rgb(255, 255, 255)');
      });
    } finally { style.remove(); }
  });

  it('loads persisted character and custom media through the shared authenticated Android image route', async () => {
    document.documentElement.dataset.eleckoiMobile = 'true';
    const reference = `eleckoi-media://asset/v1/${'a'.repeat(64)}/portrait/${'b'.repeat(64)}.png`;
    const view = conversationView();
    view.chat.chatBackgroundCharacter = { chatBackground: '' };
    view.chat.chatPersona.assistant_cover = reference;
    try {
      await mountWallpaper(view, async (container, render) => {
        const verify = () => {
          const url = new URL(container.querySelector('.chat-shell-backdrop img').src);
          expect(url.origin).toBe(window.location.origin);
          expect(url.pathname).toBe('/eleckoi/media/asset');
          expect(url.searchParams.get('reference')).toBe(reference);
        };
        verify();
        view.chat.chatBackgroundCharacter = { chatBackground: reference };
        await render(); verify();
      });
    } finally { delete document.documentElement.dataset.eleckoiMobile; }
  });

  it('displays the current character artwork and applies saved custom images without retaining another character background', async () => {
    const view = conversationView();
    view.chat.chatBackgroundCharacter = { id: 'character-a', chatBackground: '', chatBackgroundOpacity: 0.42, chatBackgroundBlur: 7, chatBackgroundScrim: 0.18 };
    view.chat.chatPersona.assistant_cover = imageA;
    await mountWallpaper(view, async (container, render) => {
      const backdrop = () => container.querySelector('.native-roleplay-content .chat-shell-backdrop');
      expect(backdrop().querySelector('img').getAttribute('src')).toBe(imageA);
      expect(backdrop().style.getPropertyValue('--wallpaper-opacity')).toBe('0.42');
      expect(backdrop().style.getPropertyValue('--wallpaper-blur')).toBe('7px');
      expect(backdrop().style.getPropertyValue('--wallpaper-scrim')).toBe('0.18');
      expect(backdrop().getAttribute('aria-hidden')).toBe('true');
      expect(backdrop().parentElement.classList.contains('native-roleplay-content')).toBe(true);
      view.chat.chatBackgroundCharacter = { ...view.chat.chatBackgroundCharacter, chatBackground: imageB };
      await render();
      expect(backdrop().querySelector('img').getAttribute('src')).toBe(imageB);
      view.chat.chatBackgroundCharacter = { id: 'character-b', chatBackground: '' };
      view.chat.chatPersona = { ...view.chat.chatPersona, assistant_cover: imageA };
      await render();
      expect(backdrop().querySelector('img').getAttribute('src')).toBe(imageA);
      expect(backdrop().style.getPropertyValue('--wallpaper-opacity')).toBe('0.72');
      expect(backdrop().style.getPropertyValue('--wallpaper-blur')).toBe('2px');
    });
  });

  it('uses shared wallpaper settings and removes the image in plain or unconfigured modes', async () => {
    const view = conversationView();
    view.chat.chatPersona.assistant_cover = imageA;
    view.chat.chatBackgroundCharacter = { chatBackground: GLOBAL_CHAT_BACKGROUND, chatBackgroundOpacity: 0.8 };
    view.appearance.globalChatWallpaper = { image: imageB, opacity: 0.34, blur: 5, scrim: 0.63 };
    await mountWallpaper(view, async (container, render) => {
      const backdrop = container.querySelector('.chat-shell-backdrop');
      expect(backdrop.querySelector('img').getAttribute('src')).toBe(imageB);
      expect(backdrop.style.getPropertyValue('--wallpaper-opacity')).toBe('0.34');
      expect(backdrop.style.getPropertyValue('--wallpaper-blur')).toBe('5px');
      expect(backdrop.style.getPropertyValue('--wallpaper-scrim')).toBe('0.63');
      view.appearance.globalChatWallpaper = { image: '' };
      await render();
      expect(container.querySelector('.chat-shell-backdrop')).toBeNull();
      for (const chatBackground of [APP_DEFAULT_CHAT_BACKGROUND, CUSTOM_CHAT_BACKGROUND]) {
        view.chat.chatBackgroundCharacter = { chatBackground };
        await render();
        expect(container.querySelector('.chat-shell-backdrop')).toBeNull();
        expect(container.querySelector('.has-chat-wallpaper')).toBeNull();
      }
    });
  });

  it('keeps wallpaper inside the character conversation and restores it when returning from the list', async () => {
    const view = conversationView();
    view.chat.chatBackgroundCharacter = { chatBackground: imageA };
    await mountWallpaper(view, async (container, render) => {
      expect(container.querySelector('.chat-shell-backdrop')).not.toBeNull();
      view.route = { kind: 'root' };
      await render();
      expect(container.querySelector('.chat-shell-backdrop')).toBeNull();
      view.route = { kind: 'conversation' };
      await render();
      expect(container.querySelector('.chat-shell-backdrop img').getAttribute('src')).toBe(imageA);
      view.chat.sessionId = '';
      view.chat.chatCharacter = { character_id: '' };
      await render();
      expect(container.querySelector('.chat-shell-backdrop')).toBeNull();
    });
  });
});

describe('Android composer toolbar focus', () => {
  it.each(['blur', 'focus', 'pagehide'])('leaves input mode and selection untouched on window %s', async eventName => {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<MobileConversationPage><div data-composer-card><div data-input-scroll>
        <div data-composer-input contentEditable suppressContentEditableWarning>合成草稿</div>
      </div></div></MobileConversationPage>));
      const input = container.querySelector('[data-composer-input]');
      await act(async () => { input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); input.focus(); });
      const range = document.createRange(); range.setStart(input.firstChild, 2); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      expect(input.getAttribute('inputmode')).toBeNull();
      await act(async () => window.dispatchEvent(new Event(eventName)));
      expect(input.getAttribute('inputmode')).toBeNull();
      expect(document.activeElement).toBe(input);
      expect(selection.anchorOffset).toBe(2);
      expect(input.textContent).toBe('合成草稿');
      await act(async () => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(input.getAttribute('inputmode')).toBeNull();
    } finally {
      await act(async () => root.unmount()); container.remove();
    }
  });

  it.each([true, false])('opens message editing with mobile=%s and preserves save behavior', async mobile => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    document.documentElement.dataset.eleckoiMobile = String(mobile);
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const onEdit = vi.fn(async () => true);
    const message = { id: 'message-a', role: 'assistant', content: '合成正文' };
    try {
      const bubble = <MessageBubble message={message} name="角色甲" onEdit={onEdit} />;
      await act(async () => root.render(mobile ? <MobileConversationPage>{bubble}</MobileConversationPage> : bubble));
      await act(async () => container.querySelector('[aria-label="编辑"]').click());
      const input = container.querySelector('.message-inline-editor textarea');
      expect(input.value).toBe('合成正文');
      expect(document.activeElement === input).toBe(!mobile);
      if (mobile) {
        await act(async () => { input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); input.focus(); });
        expect(input.getAttribute('inputmode')).toBeNull();
        input.setSelectionRange(2, 2);
        await act(async () => window.dispatchEvent(new Event('blur')));
        expect(input.getAttribute('inputmode')).toBeNull();
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(2);
        await act(async () => window.dispatchEvent(new Event('focus')));
        expect(input.getAttribute('inputmode')).toBeNull();
        await act(async () => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
        expect(input.getAttribute('inputmode')).toBeNull();
      }
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '修改正文');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => [...container.querySelectorAll('.message-inline-editor button')].find(button => button.textContent === '保存').click());
      expect(onEdit).toHaveBeenCalledWith(message, '修改正文');
      expect(container.querySelector('.message-inline-editor')).toBeNull();
    } finally {
      await act(async () => root.unmount()); container.remove(); delete document.documentElement.dataset.eleckoiMobile; vi.unstubAllGlobals();
    }
  });

  it('leaves the input mode and draft selection intact through background and foreground transitions', async () => {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      await act(async () => root.render(<MobileConversationPage><div data-composer-card><div data-input-scroll>
        <div data-composer-input contentEditable suppressContentEditableWarning>合成草稿</div>
      </div></div></MobileConversationPage>));
      const input = container.querySelector('[data-composer-input]');
      await act(async () => {
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.focus();
      });
      const range = document.createRange(); range.setStart(input.firstChild, 2); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      expect(input.getAttribute('inputmode')).toBeNull();
      await act(async () => {
        visibility.mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(input.getAttribute('inputmode')).toBeNull();
      expect(input.textContent).toBe('合成草稿');
      expect(document.activeElement).toBe(input);
      expect(selection.anchorNode).toBe(input.firstChild);
      expect(selection.anchorOffset).toBe(2);
      await act(async () => {
        visibility.mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        input.blur(); input.focus();
      });
      expect(input.getAttribute('inputmode')).toBeNull();
      await act(async () => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(input.getAttribute('inputmode')).toBeNull();
    } finally {
      await act(async () => root.unmount()); container.remove(); visibility.mockRestore();
    }
  });

  it.each([null, 'text'])('leaves input mode %s to the official toolbar focus helper', async mode => {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const toggleMenu = vi.fn();
    try {
      await act(async () => root.render(<MobileConversationPage><div data-composer-card>
        <div data-input-scroll><div data-composer-input contentEditable suppressContentEditableWarning inputMode={mode ?? undefined} /></div>
        <button type="button" onMouseDown={event => {
          const input = container.querySelector('[data-composer-input]');
          expect(input.getAttribute('inputmode')).toBe(mode);
          keepOfficialDraftFocus(event, { getRootElement: () => input });
        }} onClick={toggleMenu}><span>添加</span></button>
      </div></MobileConversationPage>));
      const input = container.querySelector('[data-composer-input]');
      const icon = container.querySelector('button span');
      await act(async () => {
        icon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        icon.click();
      });
      expect(document.activeElement).toBe(input);
      expect(toggleMenu).toHaveBeenCalledOnce();
      await act(async () => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(input.getAttribute('inputmode')).toBe(mode);
      await act(async () => icon.click());
      expect(input.getAttribute('inputmode')).toBe(mode);
      await act(async () => root.unmount());
      expect(input.getAttribute('inputmode')).toBe(mode);
    } finally {
      await act(async () => root.unmount()); container.remove();
    }
  });
});
