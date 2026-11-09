// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { RequestPreviewDialog } from '../../src/modules/chat/components/RequestPreviewDialog.jsx';
import { VariableViewerDialog } from '../../src/modules/chat/components/VariableViewerDialog.jsx';
import { AgentToolsDialog } from '../../src/modules/chat/components/AgentToolsDialog.jsx';
import { HistoryModal } from '../../src/modules/chat/components/HistoryModal.jsx';
import { MobileConversationOverlay } from '../../src/mobile/MobileConversationOverlay.jsx';

let root, host, handlers;
const click = async (element) => {
  expect(element).toBeTruthy();
  await act(async () => element.click());
};
const button = (label) =>
  [...document.querySelectorAll('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label,
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function render(children) {
  await act(async () =>
    root.render(
      <MainPageContext.Provider
        value={{
          registerBackHandler: (handler) => {
            handlers.push(handler);
            return () => {
              handlers.splice(handlers.indexOf(handler), 1);
            };
          },
        }}
      >
        {children}
      </MainPageContext.Provider>,
    ),
  );
}
async function nativeBack() {
  await act(async () => {
    handlers.at(-1)();
    await flush();
  });
}
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.documentElement.dataset.eleckoiMobile = 'true';
  handlers = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete document.documentElement.dataset.eleckoiMobile;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Android conversation surfaces', () => {
  it('reads context only after entering a request and aborts it on Back while restoring list position', async () => {
    let pending;
    const onClose = vi.fn(),
      service = {
        observeRequestPreviews: vi.fn(async (_id, publish) =>
          publish([{ id: 'request-a', round: 1, request: 1, turn: 1, model: 'synthetic-model' }]),
        ),
        readRequestPreview: vi.fn(
          (_id, id, signal) =>
            new Promise((resolve) => {
              pending = { id, signal, resolve };
            }),
        ),
      };
    await render(
      <RequestPreviewDialog conversationId="conversation-a" conversationModel={service} onClose={onClose} />,
    );
    const list = document.querySelector('.request-preview-catalog');
    list.scrollTop = 140;
    expect(service.readRequestPreview).not.toHaveBeenCalled();
    await click(list.querySelector('button'));
    expect(list.hidden).toBe(true);
    expect(pending.id).toBe('request-a');
    await nativeBack();
    expect(pending.signal.aborted).toBe(true);
    expect(list.scrollTop).toBe(140);
    expect(list.hidden).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    await nativeBack();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('returns through variable objects, floor detail and the original timeline before closing', async () => {
    const state = { root: { group: { child: { value: '合成值' } } }, valueCount: 1 };
    const timeline = {
      floors: [
        {
          id: 'floor-a',
          label: '第 1 楼',
          changedPaths: ['/group/child/value'],
          changedValueCount: 1,
          state,
        },
      ],
      current: state,
    };
    const snapshot = { id: 'conversation-a', status: 'ready', timeline, error: '' };
    const service = {
        subscribeTimeline: () => () => {},
        getTimelineSnapshot: () => snapshot,
        openTimeline: vi.fn(async () => timeline),
        closeTimeline: vi.fn(),
      },
      onClose = vi.fn();
    await render(
      <VariableViewerDialog conversationId="conversation-a" conversationModel={service} onClose={onClose} />,
    );
    const list = document.querySelector('.variable-floor-list');
    list.scrollTop = 190;
    expect(document.querySelector('.variable-snapshot')).toBeNull();
    await click(document.querySelector('.variable-floor'));
    document.querySelector('.variable-viewer-tree-scroll').scrollTop = 120;
    await click(document.querySelector('.variable-viewer-tree-row.is-container'));
    document.querySelector('.variable-viewer-tree-scroll').scrollTop = 70;
    await click(document.querySelector('.variable-viewer-tree-row.is-container'));
    expect(document.querySelector('.variable-snapshot-titleline').textContent).toBe('child');
    await nativeBack();
    expect(document.querySelector('.variable-snapshot-titleline').textContent).toBe('group');
    expect(document.querySelector('.variable-viewer-tree-scroll').scrollTop).toBe(70);
    await nativeBack();
    expect(document.querySelector('.variable-snapshot-titleline').textContent).toBe('第 1 楼');
    expect(document.querySelector('.variable-viewer-tree-scroll').scrollTop).toBe(120);
    await nativeBack();
    expect(document.querySelector('.variable-snapshot')).toBeNull();
    expect(list.scrollTop).toBe(190);
    expect(onClose).not.toHaveBeenCalled();
    await nativeBack();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('keeps tool switching and list restoration on the existing preset save contract', async () => {
    const tool = {
      id: 'example-tool',
      name: '合成工具',
      included: true,
      enabled: false,
      source: 'built_in',
      members: [{ name: 'example_operation' }],
    };
    let preset = { id: 'example-preset', toolGroups: [tool], roleplayPlan: {} };
    const catalog = {
        refresh: vi.fn(async () => ({ activePresetIds: { roleplay: preset.id, creator: 'synthetic-creator' } })),
        read: vi.fn(async () => preset),
        save: vi.fn(async (value) => {
          preset = value;
          return value;
        }),
      },
      onClose = vi.fn();
    await render(<AgentToolsDialog presetCatalog={catalog} onClose={onClose} />);
    const list = document.querySelector('.mobile-overlay-scroll');
    list.scrollTop = 100;
    await click(document.querySelector('.agent-tool-switch'));
    expect(catalog.save).toHaveBeenCalledWith(
      expect.objectContaining({ toolGroups: [expect.objectContaining({ id: tool.id, enabled: true })] }),
      undefined,
    );
    await click(document.querySelector('.agent-tool-open'));
    expect(document.querySelector('.agent-tool-detail')).not.toBeNull();
    await nativeBack();
    expect(document.querySelector('.mobile-overlay-scroll').scrollTop).toBe(100);
    expect(onClose).not.toHaveBeenCalled();
    await nativeBack();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('cancels a history delete on native Back and preserves the shared load and delete actions', async () => {
    const onClose = vi.fn(),
      onLoadChat = vi.fn(),
      onDeleteChat = vi.fn();
    await render(
      <HistoryModal
        open
        sessions={[
          {
            id: 'session-a',
            character_id: 'character-a',
            character_name: '合成角色',
            summary: '合成记录',
            updated_at: '2026-10-09T01:00:00Z',
          },
        ]}
        sessionId="session-a"
        onClose={onClose}
        onLoadChat={onLoadChat}
        onDeleteChat={onDeleteChat}
      />,
    );
    expect(document.activeElement.tagName).not.toBe('INPUT');
    await click(button('删除这条记录'));
    await nativeBack();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleteChat).not.toHaveBeenCalled();
    await click(button('删除这条记录'));
    await click(button('确认删除'));
    expect(onDeleteChat).toHaveBeenCalledWith('session-a');
    await click(document.querySelector('.history-item-main'));
    expect(onLoadChat).toHaveBeenCalledWith('session-a');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('waits for the sheet and scrim exit, restores focus and does not wait for unrelated animations', async () => {
    const masks = [];
    const recordMask = (event) => masks.push(event.detail);
    document.addEventListener('eleckoi:system-bar-mask', recordMask);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    await render(
      <MobileConversationOverlay title="合成弹窗" onClose={onClose}>
        <p>合成内容</p>
      </MobileConversationOverlay>,
    );
    expect(masks).toEqual([expect.objectContaining({ pseudo: '::before', active: true })]);
    const overlay = document.querySelector('.mobile-conversation-overlay');
    let finishSheet, finishScrim;
    overlay.getAnimations = () => [
      {
        animationName: 'mobile-sheet-out',
        finished: new Promise((resolve) => {
          finishSheet = resolve;
        }),
      },
      {
        animationName: 'mobile-sheet-scrim-out',
        finished: new Promise((resolve) => {
          finishScrim = resolve;
        }),
      },
      { animationName: 'other-animation', finished: new Promise(() => {}) },
    ];
    await click(button('关闭'));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      finishScrim();
      await flush();
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      finishSheet();
      await flush();
    });
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(trigger);
    expect(masks.at(-1).active).toBe(false);
    trigger.remove();
    document.removeEventListener('eleckoi:system-bar-mask', recordMask);
  });
});
