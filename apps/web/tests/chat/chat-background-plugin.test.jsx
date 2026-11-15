// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { expect, it, vi } from 'vitest';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';
import { ChatWallpaper } from '../../../../packages/client/features/dsh-client-chat-background/src/page.jsx';
import { renderNativeConversationContent } from '../helpers/NativeConversationPresentation.jsx';

it('unloads both background and menu without replacing the native composer or saved settings', async () => {
  let registration;
  runInNewContext(readFileSync('packages/client/features/dsh-client-chat-background/src/client.js', 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } } },
  });
  const slots = new SlotCore(), stops = [];
  const release = slots.register({ name: 'root', children: {
    'eleckoi.roleplay.background': { kind: 'single', scope: 'session' },
    'eleckoi.roleplay.header.menu': { kind: 'list', scope: 'session' },
  } }, () => null);
  const plugin = registration.factory(name => {
    if (name === 'react') return { ...React, lazy: () => ChatWallpaper };
    throw Error(name);
  });
  const install = () => plugin.apply({ slots: { register: slots.register.bind(slots), inject: (_name, run) => stops.push(run()) }, locale: { bind: () => key => key } });
  const wallpaper = Object.freeze({ image: 'data:image/png;base64,aGVsbG8=', opacity: .42, blur: 7, scrim: .18 });
  const onOpen = vi.fn();
  const scrollRef = { current: null };
  const renderSlot = (name, owner) => name === 'eleckoi.roleplay.conversation.composer.bar'
    ? <textarea data-composer-input="" defaultValue="未发送草稿" />
    : slots.entriesOfSlot(name).map(entry => <entry.component key={entry.entryId} {...owner} {...entry.inject?.()} />);
  function Page() {
    const entries = useSyncExternalStore(listener => slots.subscribe('eleckoi.roleplay.header.menu', listener),
      () => slots.entriesOfSlot('eleckoi.roleplay.header.menu').length);
    return <ChatPanel hasActiveChat hasCharacters hasHeaderMenu={entries > 0} wallpaper={wallpaper}
      currentTitle="合成角色" conversationId="synthetic" runtimeSessionId="synthetic-runtime" persona={{}}
      scrollRef={scrollRef}
      messages={[]} input="" setInput={() => {}} renderConversationContent={renderNativeConversationContent}
      renderRoleplaySlot={renderSlot} onOpenChatBackground={onOpen} />;
  }
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  try {
    install(); await act(() => root.render(<Page />));
    const composer = node.querySelector('[data-composer-input]');
    expect(node.querySelector('.chat-shell-backdrop img').getAttribute('src')).toBe(wallpaper.image);
    await act(() => node.querySelector('[aria-label="对话操作"]').click());
    await act(() => node.querySelector('[role="menuitem"]').click());
    expect(onOpen).toHaveBeenCalledOnce();
    await act(() => { for (const stop of stops.splice(0)) stop(); });
    expect(node.querySelector('.chat-shell-backdrop')).toBeNull();
    expect(node.querySelector('[aria-label="对话操作"]')).toBeNull();
    expect(node.querySelector('[data-composer-input]')).toBe(composer);
    expect(composer.value).toBe('未发送草稿');
    await act(() => install());
    expect(node.querySelector('.chat-shell-backdrop img').getAttribute('src')).toBe(wallpaper.image);
    expect(node.querySelector('[data-composer-input]')).toBe(composer);
    expect(wallpaper).toEqual({ image: wallpaper.image, opacity: .42, blur: 7, scrim: .18 });
  } finally {
    await act(() => root.unmount()); node.remove(); for (const stop of stops) stop(); release(); vi.unstubAllGlobals();
  }
});
