// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TrajectoryView } from '../../src/modules/chat/components/TrajectoryDialog.jsx';
import { OfficialTrajectoryView, officialTrajectoryFixture, officialTrajectoryZh } from '../../../../tests/helpers/officialTrajectory.js';

let root;
afterEach(() => { if (root) act(() => root.unmount()); root = undefined; document.body.innerHTML = ''; });
const hook = value => selector => selector(value);
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it('renders roleplay through the registered native trajectory with native result and fold capabilities', () => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const events = [
    { seq: 0, time: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, time: 1, type: 'step/start', data: { turn: 1, step: 1 } },
    { seq: 2, time: 2, type: 'tool/call', data: { turn: 1, step: 1, callId: 'synthetic-call', name: 'synthetic_tool', arguments: '{}' } },
    { seq: 3, time: 3, type: 'tool/result', data: { message: { id: 'synthetic-result', role: 'tool', content: [{ type: 'text', text: 'Synthetic completed result' }], source: { callId: 'synthetic-call' } } } },
    { seq: 4, time: 4, type: 'step/end', data: { turn: 1, step: 1 } },
    { seq: 5, time: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const snapshot = officialTrajectoryFixture().replace(events);
  const watchToolResult = vi.fn(() => () => {});
  const native = {
    useSession: hook({ openState: 'open', running: false, hasMore: false, loadingOlder: false }),
    useTrajectory: hook(snapshot), useDuration: hook(false), useProjection: key => key === 'eleckoiInputContinuations' ? { inputs: [], links: [] } : {},
    t: (key, params = {}) => (officialTrajectoryZh[key] || key).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? key)),
    loadOlder: vi.fn(async () => false), loadImage: vi.fn(), setActualDuration: vi.fn(),
    completeViewRequest: vi.fn(), viewRequest: null, watchToolResult,
  };
  let received;
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  act(() => root.render(<TrajectoryView renderSlot={(_name, owner) => React.createElement(owner.component, {
    ...native, renderNative: overrides => {
      received = { ...native, ...overrides };
      return <OfficialTrajectoryView {...received} renderSlot={() => null} />;
    },
  })} />));
  expect(received.watchToolResult).toBe(watchToolResult);
  expect(received.useTrajectory(value => value.requests)).toEqual(snapshot.requests);
  expect([...container.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === officialTrajectoryZh['toolbar.collapseSubCalls'])).toBe(true);
  expect(container.textContent).toContain('synthetic_tool');
});
