// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { IconSlidersTwoOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives';
import { expect, it, vi } from 'vitest';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';
import { ChatWallpaper } from '../../../../packages/client/features/dsh-client-chat-background/src/page.jsx';
import { renderNativeConversationContent } from '../helpers/NativeConversationPresentation.jsx';

it('places first-level actions separately from More and unloads them without replacing the composer or its draft', async () => {
  let registration;
  runInNewContext(readFileSync('packages/client/features/dsh-client-chat-background/src/client.js', 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } } },
  });
  const slots = new SlotCore(), stops = [];
  const mainActions = 'eleckoi.roleplay.conversation.input.menu.actions';
  const release = slots.register({ name: 'root', children: {
    'eleckoi.roleplay.background': { kind: 'single', scope: 'session' },
    'eleckoi.roleplay.header.menu': { kind: 'list', scope: 'session' },
    [mainActions]: { kind: 'list', scope: 'session' },
  } }, () => null);
  const plugin = registration.factory(name => {
    if (name === 'react') return { ...React, lazy: () => ChatWallpaper };
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { IconSlidersTwoOutlineRegular };
    throw Error(name);
  });
  const install = () => plugin.apply({ slots: { register: slots.register.bind(slots), inject: (_name, run) => stops.push(run()) }, locale: { bind: () => key => key } });
  const wallpaper = Object.freeze({ image: 'data:image/png;base64,aGVsbG8=', opacity: .42, blur: 7, scrim: .18 });
  const onOpen = vi.fn();
  const onPluginAction = vi.fn();
  const addMainAction = () => slots.register({ name: mainActions, id: 'sample-action' }, ({ onDismiss }) =>
    <MenuItemButton icon={<IconSlidersTwoOutlineRegular />} onSelect={() => { onDismiss(); onPluginAction(); }}>合成插件操作</MenuItemButton>);
  const scrollRef = { current: null };
  const renderSlot = (name, owner) => name === 'eleckoi.roleplay.conversation.composer.bar'
    ? <>{owner.leadingAccessory}<textarea data-composer-input="" defaultValue="未发送草稿" /></>
    : slots.entriesOfSlot(name).map(entry => <entry.component key={entry.entryId} {...owner} {...entry.inject?.()} />);
  function Page() {
    useSyncExternalStore(listener => slots.subscribe('eleckoi.roleplay.header.menu', listener),
      () => slots.entriesOfSlot('eleckoi.roleplay.header.menu').length);
    useSyncExternalStore(listener => slots.subscribe(mainActions, listener), () => slots.entriesOfSlot(mainActions).length);
    return <ChatPanel hasActiveChat hasCharacters wallpaper={wallpaper}
      currentTitle="合成角色" conversationId="synthetic" runtimeSessionId="synthetic-runtime" persona={{}}
      scrollRef={scrollRef}
      messages={[]} input="" setInput={() => {}} renderConversationContent={renderNativeConversationContent}
      renderRoleplaySlot={renderSlot} onOpenChatBackground={onOpen} />;
  }
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  const menuItem = text => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === text);
  const trigger = () => node.querySelector('[aria-haspopup="menu"].roleplay-menu-trigger');
  const openMore = async () => {
    await act(() => trigger().click());
    expect(menuItem('自定义背景')).toBeUndefined();
    await act(() => menuItem('更多').click());
    expect(menuItem('合成插件操作')).toBeUndefined();
  };
  const releaseMain = addMainAction();
  try {
    install(); await act(() => root.render(<Page />));
    const composer = node.querySelector('[data-composer-input]');
    expect(node.querySelector('.chat-shell-backdrop img').getAttribute('src')).toBe(wallpaper.image);
    expect(node.querySelector('[aria-label="对话操作"]')).toBeNull();
    await act(() => trigger().click());
    expect([...document.querySelectorAll('[role="menuitem"]')].slice(-3).map(item => item.textContent))
      .toEqual(['重新生成', '合成插件操作', '更多']);
    expect(menuItem('合成插件操作').querySelector('svg')).not.toBeNull();
    await act(() => menuItem('合成插件操作').click());
    expect(onPluginAction).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await act(() => trigger().click());
    await act(() => releaseMain());
    expect(menuItem('合成插件操作')).toBeUndefined();
    expect(menuItem('更多')).toBeDefined();
    await act(() => trigger().click());
    await openMore();
    await act(() => menuItem('自定义背景').click());
    expect(onOpen).toHaveBeenCalledOnce();
    expect(menuItem('自定义背景')).toBeUndefined();
    await act(() => { for (const stop of stops.splice(0)) stop(); });
    expect(node.querySelector('.chat-shell-backdrop')).toBeNull();
    await openMore();
    expect(menuItem('自定义背景')).toBeUndefined();
    expect(node.querySelector('[data-composer-input]')).toBe(composer);
    expect(composer.value).toBe('未发送草稿');
    await act(() => install());
    expect(node.querySelector('.chat-shell-backdrop img').getAttribute('src')).toBe(wallpaper.image);
    expect(node.querySelector('[data-composer-input]')).toBe(composer);
    expect(wallpaper).toEqual({ image: wallpaper.image, opacity: .42, blur: 7, scrim: .18 });
  } finally {
    await act(() => root.unmount()); node.remove(); for (const stop of stops) stop(); releaseMain(); release(); vi.unstubAllGlobals();
  }
});
