// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OfficialAssistantNodeView, OfficialReasoningContent, OfficialCompactionNodeView, OfficialTurnErrorNodeView, officialChatFixture } from '../../../../tests/helpers/officialTrajectory.js';
import { AgentProcessDialog } from '../../src/modules/chat/components/AgentProcessDialog.jsx';
import { OfficialProcessNode } from '../../src/modules/chat/components/OfficialProcessNode.jsx';
import { officialProcessPart, officialProcessTurn } from '../../src/modules/chat/model/officialProcessNodes.js';

beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
const t = key => key;
const spec = { turn: 1, processStartSeq: 2, answerAnchorSeq: 8, answerStep: 2 };
const owner = (key, step, anchorSeq, text, reasoning = '') => ({
  node: { key, kind: 'assistant-step', anchorSeq, location: { kind: 'step', turn: { turn: 1, status: 'closed' } },
    data: { step, turn: 1, status: 'settled', blocks: [
      ...(reasoning ? [{ kind: 'reasoning', text: reasoning }] : []), { kind: 'text', text },
    ] } }, turnProcess: { spec, open: true, foldable: false },
});
function useDisclosure() { const [expanded, setExpanded] = useState(false); return { expanded, setExpanded, toggle: () => setExpanded(value => !value) }; }
function NativeAssistant({ owner, ...overrides }) {
  return <OfficialAssistantNodeView {...owner} {...overrides} useDisclosure={useDisclosure}
    useContextMenu={() => ({ open: false })} useGroupAction={() => useRef(null)} useTurnData={() => undefined} t={t}
    usePresentation={select => select({ reasoning: 'collapsed', settledReasoningPreview: true })}
    renderSlot={(_name, body) => <OfficialReasoningContent {...body} t={t} />} />;
}
it('keeps earlier replies and original reasoning in official renderers while excluding the final answer', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const earlier = owner('earlier', 1, 3, 'Synthetic earlier reply', 'Synthetic earlier reasoning');
  const final = owner('final', 2, 8, 'Synthetic final answer', 'Synthetic final reasoning');
  function Harness({ nodes }) {
    const [target, setTarget] = useState(null);
    return <><AgentProcessDialog message={{ status: 'complete' }} onClose={() => {}} onContentTarget={setTarget} />
      {target && nodes.map((node, index) => {
        const part = officialProcessPart(node);
        return part && <OfficialProcessNode key={node.node.key} target={target} owner={node}
          renderOfficial={overrides => <NativeAssistant owner={node} {...overrides} />} part={part} index={index} />;
      })}</>;
  }
  try {
    await act(async () => root.render(<Harness nodes={[earlier, final]} />));
    const dialog = document.querySelector('[aria-label="处理过程"]');
    expect(dialog.textContent).toContain('Synthetic earlier reply');
    expect(dialog.textContent).toContain('Synthetic final reasoning');
    expect(dialog.textContent).not.toContain('Synthetic final answer');
    expect(dialog.querySelectorAll('[data-variant="think"]')).toHaveLength(2);
    await act(async () => dialog.querySelector('[data-variant="think"] [aria-expanded]').click());
    expect(dialog.querySelector('[data-variant="think"][data-expanded]').textContent).toContain('Synthetic earlier reasoning');
    expect(earlier.node.data.blocks[1].text).toBe('Synthetic earlier reply');
    expect(final.node.data.blocks[1].text).toBe('Synthetic final answer');
    const updated = { ...earlier, node: { ...earlier.node, data: { ...earlier.node.data, blocks: [{ kind: 'text', text: 'Synthetic updated reply' }] } } };
    await act(async () => root.render(<Harness nodes={[updated, final]} />));
    expect(dialog.textContent).toContain('Synthetic updated reply');
    expect(dialog.textContent).not.toContain('Synthetic earlier reply');
  } finally { await act(async () => root.unmount()); }
});
it('uses the official answer boundary and group position for running, empty and plugin content', () => {
  const live = owner('live', 3, 9, 'Synthetic partial', 'Synthetic thinking');
  live.turnProcess = { spec: { ...spec, answerAnchorSeq: null, answerStep: null } };
  expect(officialProcessPart(live, { dshNodeKey: 'live', displayContent: 'Synthetic partial' })).toBe('reasoning');
  expect(officialProcessPart(live, { dshNodeKey: 'other' })).toBe('all');
  expect(officialProcessPart({ ...live, node: { ...live.node, groupTree: 'turn' } })).toBeNull();
  expect(officialProcessPart({ ...live, node: { ...live.node, kind: 'synthetic-plugin-process' } })).toBe('all');
  expect(officialProcessPart(owner('empty-final', 2, 8, 'Synthetic answer'))).toBeNull();
  expect(officialProcessPart({ ...live, turnProcess: undefined })).toBeNull();
});
it('renders reasoning once when DSH routes the final node through reasoning and response seats', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const final = owner('final', 2, 8, 'Synthetic final answer', 'Synthetic shared reasoning');
  const previous = owner('previous', 1, 3, 'Synthetic earlier reply', 'Synthetic shared reasoning');
  const renderSeats = answer => [previous, final].flatMap(node => ['reasoning', 'response'].map(groupPart => ({ ...node, groupPart })))
    .map(seat => {
      const part = officialProcessPart(seat, answer);
      return part && <OfficialProcessNode key={`${seat.node.key}:${seat.groupPart}`} target={host} owner={seat}
        renderOfficial={overrides => <NativeAssistant owner={seat} {...overrides} />} part={part} />;
    });
  try {
    await act(async () => root.render(<>{renderSeats()}</>));
    // Identical text in distinct steps is valid; only duplicate seats are excluded.
    expect(host.querySelectorAll('[data-variant="think"]')).toHaveLength(2);
    expect(host.textContent.match(/Synthetic earlier reply/g)).toHaveLength(1);
    expect(host.textContent).not.toContain('Synthetic final answer');
    const live = { ...final, turnProcess: { spec: { ...spec, answerStep: null, answerAnchorSeq: null } } };
    expect(officialProcessPart({ ...live, groupPart: 'response' }, { dshNodeKey: 'final', displayContent: 'Partial answer' })).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
it('uses the native call inspection action with the exact call identity after closing the process', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const events = [];
  const inspectCall = vi.fn(callId => events.push(callId));
  try {
    await act(async () => root.render(<OfficialProcessNode target={host} owner={{ node: { key: 'tool', kind: 'tool-call' }, inspectCall }}
      onInspect={() => events.push('close')} renderOfficial={overrides => <button onClick={() => overrides.inspectCall('nested-call')}>查看</button>} />));
    await act(async () => host.querySelector('button').click());
    expect(events).toEqual(['close', 'nested-call']);
    expect(inspectCall).toHaveBeenCalledExactlyOnceWith('nested-call');
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  } finally { await act(async () => root.unmount()); }
});
it('renders the native landed compaction checkpoint and its complete summary', async () => {
  const fixture = officialChatFixture();
  const event = (type, seq, data) => ({ type, seq, time: seq * 100, data });
  const prefix = [event('turn/start', 1, { turn: 1 }), event('step/start', 2, { turn: 1, step: 1 }),
    { ...event('user/message', 3, { id: 'synthetic-input', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic input' }] }), surfaceOp: 'append' },
    event('compaction/start', 4, { turn: 1, compactionId: 'synthetic-compaction' }),
    event('compaction/summary', 5, { turn: 1, compactionId: 'synthetic-compaction', summary: [{ type: 'text', text: 'Synthetic complete compaction summary' }], shadowedSeqs: [3], shadowedTokenCount: 8000 }),
    { ...event('user/message', 6, { id: 'checkpoint', role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'synthetic-compaction' }, content: [{ type: 'text', text: 'Synthetic complete compaction summary' }] }), surfaceOp: { op: 'replace', startSeq: 3, endSeq: 3 } },
  ];
  const snapshot = fixture.replace(prefix);
  const node = snapshot.nodes.values().find(node => node.kind === 'compaction');
  expect(node).toBeDefined();
  const process = snapshot.nodes.processSource(node.key).getSnapshot();
  expect(officialProcessPart({ node, turnProcess: { spec: process.spec } })).toBe('all');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<OfficialCompactionNodeView node={node} t={t} />));
    expect(host.textContent).toContain('message.compaction');
    await act(async () => host.querySelector('button[aria-expanded]').click());
    expect(host.textContent).toContain('Synthetic complete compaction summary');
  } finally { await act(async () => root.unmount()); }
});
it('keeps the official terminal failure readable even when no assistant step was produced', async () => {
  const snapshot = officialChatFixture().replace([
    { type: 'turn/start', seq: 1, time: 100, data: { turn: 1 } },
    { type: 'turn/end', seq: 2, time: 200, data: { turn: 1, reason: { kind: 'error', error: { message: 'Synthetic provider failure', code: 'UNKNOWN' } } } },
  ]);
  const node = snapshot.nodes.values().find(node => node.kind === 'turn-error');
  expect(node.groupTree).toBe('turn');
  expect(officialProcessTurn({ node })).toBe(1);
  expect(officialProcessPart({ node })).toBe('all');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<OfficialTurnErrorNodeView node={node} t={t} />));
    expect(host.textContent).toContain('Synthetic provider failure');
  } finally { await act(async () => root.unmount()); }
});
