// @vitest-environment jsdom
import { renderNativeConversationContent } from '../helpers/NativeConversationPresentation.jsx';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';
import { WithOfficialMarkdown } from '../helpers/officialMarkdown.jsx';
import { ChatView, chatFixture, turnNode, userNode } from '../helpers/officialChatView.jsx';

globalThis.React = React;

async function renderMarkup(view) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  try {
    await act(async () => root.render(view));
    return node.innerHTML;
  } finally { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); }
}

describe('conversation switching', async () => {
  it('keeps the same official user node mounted through regeneration and editing', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    const fixture = chatFixture('session-a');
    const requestId = 'original-request-1';
    const existingUser = {
      id: 'message-a', conversationId: 'conversation-a', runtimeSessionId: 'session-a',
      sessionEventSeq: 7, requestId, role: 'user', content: '同一条输入', displayContent: '同一条输入',
      created_at: '2026-10-06T04:41:00.000Z',
    };
    const formal = userNode('node-7', 7, requestId, 1, '同一条输入');
    fixture.update({ order: [formal.key], nodes: new Map([[formal.key, formal]]) });
    const renderRoleplaySlot = (name, owner, options) => name === 'eleckoi.roleplay.chat'
      ? <ChatView {...fixture.props} runningStatusTarget={owner.runningStatusTarget} renderSlot={(child, childOwner, childOptions) => {
        if (child === 'conversation.chat.before') return owner.before;
        if (child === 'conversation.chat.node') return owner.renderChatNode(childOwner);
        return childOptions?.fallback ?? null;
      }} /> : options?.fallback ?? null;
    const props = {
      hasActiveChat: true,
      currentTitle: '角色乙',
      conversationId: 'conversation-a',
      runtimeSessionId: 'session-a',
      persona: { user_name: '用户', assistant_name: '角色甲' },
      messages: [existingUser],
      input: '',
      setInput: () => {},
      isSending: true,
      modelConfigs: [],
      scrollRef: { current: null },
      presetCatalog: { refresh: async () => ({ presets: [], activePresetIds: { roleplay: '', creator: 'synthetic-creator' } }) },
      renderRoleplaySlot,
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<WithOfficialMarkdown><ChatPanel renderConversationContent={renderNativeConversationContent} {...props} /></WithOfficialMarkdown>); });
      expect(container.textContent.match(/同一条输入/g)).toHaveLength(1);
      const originalRow = container.querySelector('[data-chat-node-key="node-7"]');
      expect(originalRow).not.toBeNull();
      const next = turnNode('turn-2', 2);
      await act(async () => { fixture.update({ order: [formal.key, next.key],
        nodes: new Map([[formal.key, formal], [next.key, next]]), session: { ...fixture.state.session, running: true } }); });
      expect(container.textContent.match(/同一条输入/g)).toHaveLength(1);
      expect(container.querySelector('[data-chat-node-key="node-7"]')).toBe(originalRow);
      expect(container.querySelector('[data-chat-running]')).toBeNull();
      expect(container.querySelector('[data-chat-flow] [data-chat-running]')).toBeNull();
      const scrollport = container.querySelector('[data-conversation-scroll]');
      const composerSeat = container.querySelector('[data-composer-seat]');
      expect(composerSeat.parentElement).toBe(scrollport.parentElement);
      expect(scrollport.contains(composerSeat)).toBe(false);
      expect(scrollport.querySelector('[data-composer-clearance]')).not.toBeNull();
      expect(scrollport.querySelector('.chat-transcript-region [data-chat-view]')).not.toBeNull();
      expect(scrollport.style.getPropertyValue('--dsh-conversation-viewport-height')).toBe('0px');
      expect(container.querySelector('[data-conversation-tabs] [role="tab"]').textContent).toBe('对话');
      await act(async () => {
        fixture.update({ nodes: new Map([[formal.key, userNode(formal.key, 7, requestId, 1, '修改后的输入')], [next.key, next]]) });
        root.render(<WithOfficialMarkdown><ChatPanel renderConversationContent={renderNativeConversationContent} {...props}
          chatDisplay={{ conversation_view_tabs_enabled: false }} messages={[{ ...existingUser,
          content: '修改后的输入', displayContent: '修改后的输入' }]} /></WithOfficialMarkdown>);
      });
      expect(container.querySelector('[data-conversation-tabs]')).toBeNull();
      expect(container.querySelector('.chat-header h1').textContent).toBe('角色乙');
      expect(container.querySelector('[data-conversation-scroll]')).toBe(scrollport);
      expect(container.querySelector('[data-composer-seat]')).toBe(composerSeat);
      expect(container.textContent).not.toContain('同一条输入');
      expect(container.textContent.match(/修改后的输入/g)).toHaveLength(1);
      expect(container.querySelector('[data-chat-node-key="node-7"]')).toBe(originalRow);
      expect(originalRow.textContent).toContain('#0');
      expect(originalRow.querySelector('time').dateTime).toBe(existingUser.created_at);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('docks the original roleplay process and renders speakers only after output arrives', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const sessionId = 'roleplay-live';
    const fixture = chatFixture(sessionId);
    const control = turnNode('reply', 2);
    const input = userNode('input', 12, 'request', 2, '来听录音');
    const tool = { key: 'tool', kind: 'tool-call', anchorSeq: 14, location: control.location,
      data: { turn: 2, step: 1 } };
    const spec = { turn: 2, processStartSeq: 13, answerAnchorSeq: null };
    const nodes = [input, tool, control];
    fixture.update({ order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])),
      session: { ...fixture.state.session, running: true } });
    const renderRoleplaySlot = (name, owner) => name === 'eleckoi.roleplay.chat'
      ? <ChatView {...fixture.props} runningStatusTarget={owner.runningStatusTarget}
        useStore={select => select({ turnProcesses: [] })}
        useChatNodeProcess={key => key === tool.key ? { spec, turn: 2, turnStarted: true, turnClosed: false } : undefined}
        renderSlot={(child, childOwner, options) => {
          if (child === 'conversation.chat.before') return owner.before;
          if (child === 'conversation.chat.node') return owner.renderChatNode(childOwner, () => <span>原工具过程节点</span>);
          return options?.fallback ?? null;
        }} /> : null;
    const props = {
      hasActiveChat: true, currentTitle: '录音室', conversationId: 'room', runtimeSessionId: sessionId,
      persona: { user_name: '你', assistant_name: '卡片封面名' }, input: '', setInput() {}, modelConfigs: [],
      scrollRef: { current: null }, renderRoleplaySlot, renderConversationContent: renderNativeConversationContent,
    };
    const pendingReply = { id: 'active-reply', runtimeSessionId: sessionId, dshTurn: 2,
      renderKey: 'dsh-reply-roleplay-live-2', role: 'assistant', pending: true, status: 'streaming',
      content: '还没公开的正文', displayContent: '' };
    const search = { id: 'read', kind: 'tool', status: 'running', toolName: 'eleckoi_read_setting_files',
      arguments: '{"path":"录音室"}' };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (message, chatDisplay) => act(async () => root.render(<WithOfficialMarkdown>
      <ChatPanel {...props} chatDisplay={chatDisplay} messages={[message]} isSending={message.pending} />
    </WithOfficialMarkdown>));
    try {
      await render(pendingReply);
      expect(container.querySelector('.message-roleplay.theirs')).toBeNull();
      expect(container.querySelector('[data-chat-running]')).toBeNull();
      expect(container.querySelector('[data-chat-running-seat]').childElementCount).toBe(0);

      await render({ ...pendingReply, process: [search] });
      const controlButton = container.querySelector('[data-chat-running-seat] .agent-process-inline');
      expect(controlButton.textContent).toBe('正在读取设定正文 · 录音室');
      expect(container.querySelector('.chat-transcript-region .agent-process-inline')).toBeNull();
      expect(container.textContent).not.toContain('卡片封面名');
      await act(async () => controlButton.click());
      const dialog = document.querySelector('[role="dialog"][aria-label="处理过程"]');
      expect(dialog.querySelector('[data-process-node-kind="tool-call"]').textContent).toBe('原工具过程节点');
      await act(async () => dialog.querySelector('.roleplay-process-close').click());

      const spoken = { ...pendingReply, content: '听到了', displayContent: '听到了', process: [search], createdAt: '2026-11-25T17:20:00+08:00',
        roleplayBlocks: [{ id: 'speech-a', kind: 'speech', speakerName: '发言角色', text: '听到了' }] };
      const bubbles = { roleplay_style: { bubbles_enabled: true } };
      await render({ ...spoken, content: '', displayContent: '',
        roleplayBlocks: [{ ...spoken.roleplayBlocks[0], text: '' }] }, bubbles);
      const firstRow = container.querySelector('.message-roleplay.theirs');
      expect(firstRow.querySelector('.avatar')).not.toBeNull();
      expect(firstRow.querySelector('.message-author').textContent).toBe('发言角色');
      expect(firstRow.querySelector('.message-floor').textContent).toBe('#0');
      expect(firstRow.querySelector('.message-timestamp')).not.toBeNull();
      expect(firstRow.querySelector('.markdown-message')).toBeNull();
      await render(spoken, bubbles);
      expect(container.querySelector('.message-roleplay.theirs')).toBe(firstRow);
      expect(firstRow.querySelector('.markdown-message').textContent).toBe('听到了');
      await render({ ...spoken, roleplayBlocks: [...spoken.roleplayBlocks,
        { id: 'speech-b', kind: 'speech', speakerName: '下一位角色', text: '' }] }, bubbles);
      const nextRow = container.querySelector('.roleplay-reply-followups .message-roleplay');
      expect(nextRow.querySelector('.message-author').textContent).toBe('下一位角色');
      expect(nextRow.querySelector('.message-floor').textContent).toBe('#1');
      expect(nextRow.querySelector('.markdown-message')).toBeNull();
      const nextTool = { ...search, id: 'read-again', arguments: '{"path":"采样备注"}' };
      await render({ ...spoken, process: [{ ...search, status: 'complete' }, nextTool] }, { roleplay_style: { bubbles_enabled: false } });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)); });
      expect(container.querySelector('.message-roleplay.theirs')).toBe(firstRow);
      expect(container.querySelector('[data-chat-running-seat] .agent-process-inline')).toBe(controlButton);
      expect(controlButton.textContent).toBe('正在读取设定正文 · 采样备注');
      expect(container.querySelector('[data-roleplay-bubbles]')).toBeNull();

      const finished = { ...spoken, pending: false, status: 'complete', process: [{ ...search, status: 'complete' }] };
      await act(async () => fixture.update({ session: { ...fixture.state.session, running: false } }));
      await render(finished);
      expect(container.querySelector('[data-chat-running-seat]').childElementCount).toBe(0);
      expect(container.querySelector('.message-roleplay.theirs')).toBe(firstRow);

      await act(async () => fixture.update({ session: { ...fixture.state.session, running: true } }));
      await render({ ...pendingReply, process: [search] }, { layout: 'agent' });
      expect(container.querySelector('[data-chat-running]')?.parentElement).toBe(container.querySelector('[data-chat-running-seat]'));
      expect(container.querySelector('.message-agent.theirs .agent-process-inline')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('uses a plugin editor for the exact message and keeps its draft when returning to the built-in editor', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const fixture = chatFixture('session-a');
    const message = {
      id: 'product-message', conversationId: 'conversation-a', runtimeSessionId: 'session-a',
      sessionEventSeq: 7, dshMessageId: 'dsh-message', requestId: 'request-1', role: 'user', content: '原来的正文',
    };
    const formal = userNode('node-7', 7, message.requestId, 1, message.content);
    fixture.update({ order: [formal.key], nodes: new Map([[formal.key, formal]]) });
    const editMessage = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const props = {
      hasActiveChat: true, conversationId: message.conversationId, runtimeSessionId: message.runtimeSessionId,
      persona: {}, messages: [message], input: '', scrollRef: { current: null }, onEditMessage: editMessage,
    };
    const renderEditor = vi.fn(owner => <div data-plugin-editor="">
      <textarea value={owner.draft} onChange={event => owner.onDraftChange(event.target.value)} />
      <button type="button" onClick={owner.onSave}>插件保存</button>
      <button type="button" onClick={owner.onCancel}>插件取消</button>
    </div>);
    const renderSlot = enabled => (name, owner, options) => {
      if (name === 'eleckoi.roleplay.message.editor' && enabled) return renderEditor(owner);
      if (name !== 'eleckoi.roleplay.chat') return options?.fallback ?? null;
      return <ChatView {...fixture.props} renderSlot={(child, childOwner, childOptions) => {
        if (child === 'conversation.chat.node') return owner.renderChatNode(childOwner);
        return childOptions?.fallback ?? null;
      }} />;
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = enabled => root.render(<WithOfficialMarkdown><ChatPanel {...props}
      renderConversationContent={renderNativeConversationContent} renderRoleplaySlot={renderSlot(enabled)} />
    </WithOfficialMarkdown>);
    const click = selector => act(() => container.querySelector(selector).click());
    try {
      await act(() => render(true));
      expect(renderEditor).not.toHaveBeenCalled();
      await click('button[aria-label="编辑"]');
      expect(renderEditor.mock.lastCall[0]).toMatchObject({
        draft: message.content, conversationId: message.conversationId, productMessageId: message.id,
        messageId: message.dshMessageId, role: message.role,
      });
      await act(() => renderEditor.mock.lastCall[0].onDraftChange('插件草稿'));
      await click('[data-plugin-editor] button');
      expect(editMessage).toHaveBeenCalledWith(expect.objectContaining(message), '插件草稿');
      expect(container.querySelector('[data-plugin-editor] textarea').value).toBe('插件草稿');

      await act(() => render(false));
      expect(container.querySelector('[data-plugin-editor]')).toBeNull();
      expect(container.querySelector('.message-inline-editor textarea').value).toBe('插件草稿');
      await click('.message-inline-editor button.primary');
      expect(editMessage).toHaveBeenCalledTimes(2);
      expect(container.querySelector('.message-inline-editor')).toBeNull();

      await act(() => render(true));
      await click('button[aria-label="编辑"]');
      await act(() => renderEditor.mock.lastCall[0].onDraftChange('丢弃这一份'));
      await click('[data-plugin-editor] button:last-child');
      expect(container.querySelector('[data-plugin-editor]')).toBeNull();
      expect(editMessage).toHaveBeenCalledTimes(2);
    } finally {
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('removes the previous conversation content while the new conversation loads', async () => {
    const fixture = chatFixture('session-a');
    const node = turnNode('turn-a', 1, 'closed');
    fixture.update({ order: [node.key], nodes: new Map([[node.key, node]]) });
    const props = {
      hasActiveChat: true,
      currentTitle: '角色乙',
      conversationId: 'conversation-a',
      runtimeSessionId: 'session-a',
      persona: { user_name: '用户', assistant_name: '角色甲' },
      messages: [{ id: 'message-a', conversationId: 'conversation-a', runtimeSessionId: 'session-a',
        renderKey: 'dsh-reply-session-a-1', role: 'assistant', content: '旧会话前端内容' }],
      input: '',
      setInput: () => {},
      isSending: false,
      modelConfigs: [],
      scrollRef: { current: null },
      renderRoleplaySlot: (name, owner, options) => name === 'eleckoi.roleplay.chat'
        ? <ChatView {...fixture.props} runningStatusTarget={owner.runningStatusTarget} renderSlot={(child, childOwner, childOptions) => {
          if (child === 'conversation.chat.before') return owner.before;
          if (child === 'conversation.chat.node') return owner.renderChatNode(childOwner);
          return childOptions?.fallback ?? null;
        }} /> : options?.fallback ?? null,
    };
    const previous = await renderMarkup(<WithOfficialMarkdown><ChatPanel renderConversationContent={renderNativeConversationContent} {...props} /></WithOfficialMarkdown>);
    const switching = await renderMarkup(<WithOfficialMarkdown><ChatPanel renderConversationContent={renderNativeConversationContent} {...props} isSwitchingChat /></WithOfficialMarkdown>);

    expect(previous).toContain('旧会话前端内容');
    expect(switching).not.toContain('旧会话前端内容');
    expect(switching).toContain('aria-busy="true"');
  });

  it('keeps the native DSH bar and injects the roleplay menu, model picker, and product dock', async () => {
    const props = {
      hasActiveChat: true,
      currentTitle: '角色乙',
      conversationId: 'conversation-a',
      persona: { user_name: '用户', assistant_name: '角色甲' },
      messages: [],
      input: '',
      setInput: () => {},
      isSending: false,
      modelConfigs: [],
      scrollRef: { current: null },
      dshComposerOwner: {
        sessionId: 'session-a',
        session: { id: 'session-a' },
        pendingInteraction: undefined,
      },
      dshInputZone: {
        session: { id: 'session-a' },
        input: { text: '' },
      },
    };
    const nativeSlot = vi.fn((name, owner, options) => {
      if (name === 'eleckoi.roleplay.conversation.composer.bar') {
        return <div data-dsh-input-bar="native">
          <button type="button" aria-label="DSH 命令">+</button>
          {owner.leadingAccessory}
          <textarea placeholder={owner.placeholder} />
          {owner.modelAccessory}
          {owner.dockAccessory !== undefined
            ? owner.dockAccessory
            : owner.renderBridgeSlot?.('eleckoi.roleplay.conversation.composer.dock', {})}
        </div>;
      }
      if (name === 'eleckoi.roleplay.conversation.composer.dock') {
        return <div data-input-dock-extension="active">下方扩展</div>;
      }
      return options?.fallback ?? null;
    });
    const fallbackChain = (_name, _owner, options) => options?.fallback ?? null;
    const nativeMarkup = await renderMarkup(
      <WithOfficialMarkdown>
        <ChatPanel renderConversationContent={renderNativeConversationContent}
          {...props}
          renderRoleplaySlot={nativeSlot}
          renderRoleplaySlotChain={fallbackChain}
        />
      </WithOfficialMarkdown>,
    );
    expect(nativeMarkup).toContain('data-dsh-input-bar="native"');
    expect(nativeMarkup).toContain('aria-label="DSH 命令"');
    expect(nativeMarkup).toContain('aria-label="扮演菜单"');
    expect(nativeMarkup).toContain('placeholder="输入消息"');
    expect(nativeMarkup.match(/data-input-dock-extension="active"/g)).toHaveLength(1);
    expect(nativeSlot).toHaveBeenCalledWith('eleckoi.roleplay.conversation.composer.dock', {});
    expect(nativeSlot.mock.calls.some(([name]) => name.startsWith('eleckoi.roleplay.input.')
      || name === 'eleckoi.roleplay.composer.dock')).toBe(false);

    const renderSlot = vi.fn((name, _owner, options) => {
      if (name === 'eleckoi.roleplay.conversation.composer.bar') {
        return <div data-dsh-input-skin="active">插件输入框</div>;
      }
      if (name === 'eleckoi.roleplay.conversation.input.dock') {
        return <div data-dsh-input-dock="active">插件输入区</div>;
      }
      return options?.fallback ?? null;
    });
    const renderSlotChain = vi.fn((_name, _owner, options) => options?.fallback ?? null);
    const skinMarkup = await renderMarkup(
      <WithOfficialMarkdown>
        <ChatPanel renderConversationContent={renderNativeConversationContent}
          {...props}
          renderRoleplaySlot={renderSlot}
          renderRoleplaySlotChain={renderSlotChain}
        />
      </WithOfficialMarkdown>,
    );
    expect(skinMarkup).toContain('data-dsh-input-skin="active"');
    expect(skinMarkup).toContain('data-dsh-input-dock="active"');
    expect(skinMarkup).not.toContain('aria-label="扮演菜单"');
    expect(renderSlotChain).toHaveBeenCalledWith(
      'eleckoi.roleplay.conversation.composer',
      expect.objectContaining({ sessionId: 'session-a', renderBridgeSlot: renderSlot }),
      expect.objectContaining({ overlay: true }),
    );
  });

  it('places the official right-sidebar affordance immediately after new chat', async () => {
    const markup = await renderMarkup(
      <WithOfficialMarkdown>
        <ChatPanel renderConversationContent={renderNativeConversationContent}
          hasActiveChat
          currentTitle="角色乙"
          conversationId="conversation-a"
          persona={{ user_name: '用户', assistant_name: '角色甲' }}
          messages={[]}
          input=""
          setInput={() => {}}
          isSending={false}
          modelConfigs={[]}
          scrollRef={{ current: null }}
          renderRoleplaySlot={(name) => name === 'eleckoi.roleplay.conversation.header.corner'
            ? <button type="button" data-sidebar-right-expand="">右栏</button>
            : null}
        />
      </WithOfficialMarkdown>,
    );
    expect(markup.indexOf('aria-label="新建对话"')).toBeLessThan(markup.indexOf('data-sidebar-right-expand'));
  });
});
