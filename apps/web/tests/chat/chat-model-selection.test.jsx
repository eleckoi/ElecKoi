// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useActiveChatModel } from '../../src/modules/chat/hooks/useActiveChatModel.js';

describe('chat model selection authority', () => {
  it('releases the previous model subscription while the catalog switches before the selected view rerenders', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(document.createElement('div'));
    const detailsListeners = new Set(), modelListeners = new Set();
    let id = 'chat-a';
    const selections = { 'chat-a': { provider: 'synthetic', model: 'model-a' }, 'chat-b': { provider: 'synthetic', model: 'model-b' } };
    const face = { getSnapshot: () => ({ next: selections[id] }), subscribe: fn => { modelListeners.add(fn); return () => modelListeners.delete(fn); } };
    const conversations = { readModelSelection: vi.fn(async id => selections[id]),
      getDetailsSnapshot: () => ({ id, details: { runtimeSessionId: `session-${id}` } }),
      subscribeDetails: fn => { detailsListeners.add(fn); return () => detailsListeners.delete(fn); },
      getSessionReference: () => ({ binding: { session: { projections: { faceOf: () => face } } } }) };
    let current;
    const setStatus = vi.fn(), configs = [];
    function Probe({ id }) { current = useActiveChatModel({ conversations, conversationId: id, modelConfigs: configs, setStatus }); return null; }
    try {
      await act(async () => root.render(<Probe id="chat-a" />));
      expect(modelListeners.size).toBe(1);
      await act(async () => { id = 'chat-b'; for (const listener of detailsListeners) listener(); });
      expect(modelListeners.size).toBe(0);
      await act(async () => root.render(<Probe id="chat-b" />));
      expect(current.modelSelection.model).toBe('model-b');
      expect(modelListeners.size).toBe(1);
    } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
    expect(detailsListeners.size).toBe(0);
    expect(modelListeners.size).toBe(0);
  });

  it('reads the selected Session without silently replacing its unavailable route or writing another chat', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const conversations = { readModelSelection: vi.fn(async () => ({ provider: 'removed', model: 'old-model' })),
      selectModel: vi.fn(async (_id, selection) => selection) };
    let current;
    const setStatus = vi.fn();
    const configs = [{ id: 'config-current', model: 'example-model', credentialConfigured: true }];
    function Probe({ id }) {
      current = useActiveChatModel({ conversations, conversationId: id, modelConfigs: configs, setStatus });
      return null;
    }
    try {
      await act(async () => root.render(<Probe id="same-chat" />));
      expect(conversations.selectModel).not.toHaveBeenCalled();
      expect(current.modelSelection).toMatchObject({configId:'removed',model:'old-model'});
      expect(conversations.readModelSelection).toHaveBeenCalledWith('same-chat');
      await act(async () => root.render(<Probe id="" />));
      await act(async () => current.selectChatModel({ configId: 'config-current', model: 'another-model' }));
      expect(current.modelConfig.model).toBe('another-model');
      expect(conversations.selectModel).toHaveBeenCalledTimes(1);
      expect(conversations.selectModel).toHaveBeenLastCalledWith('', { provider: 'config-current', model: 'another-model' });
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
