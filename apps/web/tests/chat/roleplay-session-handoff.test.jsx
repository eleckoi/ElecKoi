// @vitest-environment jsdom
import React, { act, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';

it('renders the supplied Session header action next to the roleplay title and keeps its navigation', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node), openChild = vi.fn(), refresh = vi.fn(async () => ({ presets: [] }));
  const dshConversation = { activeView: 'chat', tabs: [{ id: 'chat', label: '对话' }], renderView: () => null,
    renderHeaderActions: () => <><span data-official-preset="">合成正式预设</span><button aria-label="合成子智能体入口" onClick={openChild}>1 个子智能体</button></> };
  try {
    await act(async () => root.render(<ChatPanel hasActiveChat hasCharacters currentTitle="合成角色" conversationId="synthetic-parent"
      persona={{}} messages={[]} input="" modelConfigs={[]} scrollRef={{ current: null }} dshConversation={dshConversation}
      presetCatalog={{ refresh }} />));
    const action = node.querySelector('.chat-header-title-cluster [aria-label="合成子智能体入口"]');
    expect(action).toBeTruthy();
    expect(node.querySelectorAll('[data-official-preset]')).toHaveLength(1);
    expect(node.querySelector('.chat-header-preset')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => action.click());
    expect(openChild).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); }
});

it.each([
  { name: 'conversation switching', switching: true, ids: ['synthetic-first', 'synthetic-other', 'synthetic-first'] },
  { name: 'same-chat regeneration', switching: false, ids: ['synthetic-first', 'synthetic-first', 'synthetic-first'] },
])('keeps the conversation visible during $name and releases replaced references', async ({ switching, ids }) => {
  const source = readFileSync(resolve('packages/client/features/dsh-client-roleplay/src/client.js'), 'utf8');
  let registration, RoleplayView;
  runInNewContext(source, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  registration.factory(name => { if (name === 'react') return React; throw new Error(name); }).apply({ slots: {
    inject: (name, register) => { if (name === 'eleckoi.roleplay') register(); },
    register: (_options, component) => { RoleplayView = component; },
  } });
  const context = createContext(null);
  const SessionProvider = ({ session, children }) => <context.Provider value={session}>{children}</context.Provider>;
  const Input = () => <textarea key={useContext(context).sessionId} aria-label="输入消息" />;
  const ProductView = ({ renderRoleplaySlot }) => <main>{renderRoleplaySlot?.('composer')}</main>;
  const renderSlot = (_name, { matched }) => <matched.component {...matched.props} renderRoleplaySlot={() => <Input />} />;
  let reference = { sessionId: 'synthetic-first', binding: {} };
  const owned = [];
  const sessions = { retain: id => {
    const value = { sessionId: id, binding: reference.binding, release: vi.fn() };
    owned.push(value); return value;
  } };
  const details = {};
  const conversations = { subscribeDetails: () => () => {}, getDetailsSnapshot: () => details,
    getSessionReference: id => id === reference.sessionId ? reference : null };
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    let previous;
    for (const id of ids) {
      if (previous) {
        reference = null;
        const unavailable = { ...conversations, getSessionReference: () => null };
        await act(() => root.render(<RoleplayView conversations={unavailable} sessions={sessions} SessionProvider={SessionProvider} renderSlot={renderSlot}
          matched={{ component: ProductView, props: { conversationId: previous, runtimeSessionId: switching ? '' : previous, isSwitchingChat: switching } }} />));
        expect(container.querySelector('textarea[aria-label="输入消息"]')).not.toBeNull();
        expect(owned.at(-1).release).not.toHaveBeenCalled();
      }
      reference = { sessionId: id, binding: {} };
      await act(() => root.render(<RoleplayView conversations={conversations} sessions={sessions} SessionProvider={SessionProvider} renderSlot={renderSlot}
        matched={{ component: ProductView, props: { conversationId: id, runtimeSessionId: id } }} />));
      expect(container.querySelector('textarea[aria-label="输入消息"]')).not.toBeNull();
      for (const old of owned.slice(0, -1)) expect(old.release).toHaveBeenCalledOnce();
      previous = id;
    }
    reference = null;
    await act(() => root.render(<RoleplayView conversations={{ ...conversations, getSessionReference: () => null }} sessions={sessions}
      SessionProvider={SessionProvider} renderSlot={renderSlot}
      matched={{ component: ProductView, props: { conversationId: '', runtimeSessionId: '' } }} />));
    expect(container.querySelector('textarea[aria-label="输入消息"]')).toBeNull();
    for (const reference of owned) expect(reference.release).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount()); container.remove();
    for (const reference of owned) expect(reference.release).toHaveBeenCalledOnce();
  }
});
