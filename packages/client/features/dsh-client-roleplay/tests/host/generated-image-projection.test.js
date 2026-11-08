import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createAssistantMessage } from '@deepseek-ai/dsh-llm';
import { describe, it, expect } from 'vitest';
import { officialChatFixture } from '../../../../../../tests/helpers/officialTrajectory.js';
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin';
import { illustrationProjection } from '../../src/host/illustration-projection.mjs';

const source = readFileSync(new URL('../../../dsh-client-conversations/src/client.js', import.meta.url), 'utf8');
const boundary = 'return { inject:';
if (source.split(boundary).length !== 2) throw new Error('Unexpected conversation Client export boundary');
let registration;
runInNewContext(source.replace(boundary, 'return { officialMessages, officialProcess, inject:'), {
  window: { __ModuleLoader__: { load: value => { registration = value; } } },
});
const client = registration.factory(dshClientRequire);
const attachment = { attachmentId: `sha256:${'a'.repeat(64)}`, bytes: 32, width: 1, height: 1, mediaType: 'image/png', name: 'synthetic.png' };
const event = (type, seq, data, intent = {}) => ({ type, seq, time: seq * 100, data, ...intent });
function fixture(status = 'ready', image = attachment) {
  const prompts = { frames: [{ id: 1, prompt: 'synthetic scene', negative_prompt: 'synthetic avoid' }] };
  const text = `<ACTION_CALL name="generate_image">${JSON.stringify(prompts)}</ACTION_CALL>\n<FINAL>合成回复\n[[IMAGE:1]]\n</FINAL>`;
  return [
    event('turn/start', 1, { turn: 1 }), event('step/start', 2, { turn: 1, step: 1 }),
    event('user/message', 3, { id: 'synthetic-input', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '合成输入' }] }, { surfaceOp: 'append' }),
    event('eleckoi/illustration', 4, { batchId: 'synthetic-batch', turn: 1, step: 1, status: 'generating', frames: [{ id: 1, width: 832, height: 1216, status: 'generating' }] }, { ignorable: true }),
    event('eleckoi/illustration', 5, { batchId: 'synthetic-batch', turn: 1, step: 1, status: status === 'ready' ? 'complete' : 'failed',
      frames: [{ id: 1, width: 832, height: 1216, status, ...(status === 'ready' ? { attachment: image } : { error: '合成错误' }) }] }, { ignorable: true }),
    event('assistant/message', 6, { turn: 1, step: 1, stream: [], message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }) }, { surfaceOp: 'append' }),
    event('step/end', 7, { turn: 1, step: 1 }), event('turn/end', 8, { turn: 1, reason: { kind: 'completed' } }),
  ];
}
const details = { conversation: { id: 'synthetic-chat' }, runtimeSessionId: 'synthetic-session', messages: [], hasMore: false };
function project(values, running = false, messages = []) {
  const chat = officialChatFixture().replace(values);
  const illustrations = values.reduce((state, event) => illustrationProjection.apply(state, event), []);
  const process = client.officialProcess(chat, { illustrations });
  return client.officialMessages(chat, { ...details, messages }, 'synthetic-session', process, [], running, [], [], undefined, illustrations);
}
describe('generated images and prompt capture in the current Session', () => {
  it('keeps live narrative instead of an early product regex result until the official turn ends', () => {
    const values = fixture().filter(value => value.type !== 'turn/end');
    const finalEvent = values.find(value => value.type === 'assistant/message');
    const reply = project(values, true, [{ id: 'synthetic-product-reply', role: 'assistant',
      sessionEventSeq: finalEvent.seq, dshMessageId: finalEvent.data.message.id,
      content: finalEvent.data.message.content[0].text, displayContent: '<section>Early panel</section>'
    }]).find(message => message.role === 'assistant');
    expect(reply.status).toBe('streaming');
    expect(reply.displayContent).toBe('合成回复\n[[IMAGE:1]]');
    expect(reply.displayContent).not.toContain('Early panel');
  });

  it('updates an already completed reply when the image finishes after turn/end', () => {
    const values = fixture(), completed = values.find(value => value.type === 'eleckoi/illustration' && value.data.status === 'complete');
    const waiting = values.filter(value => value !== completed);
    const before = project(waiting).find(message => message.role === 'assistant');
    expect(before.generatedImageAttachments[0].status).toBe('generating');
    const after = project([...waiting, { ...completed, seq: 9 }]).find(message => message.role === 'assistant');
    expect(after.id).toBe(before.id);
    expect(after.displayContent).toBe(before.displayContent);
    expect(after.generatedImageAttachments[0]).toMatchObject({ status: 'ready', attachmentId: attachment.attachmentId });
    expect(after.process.find(item => item.toolName === 'generate_image').status).toBe('complete');
  });
  it('restores image status and identity beside its reply without exposing the prompt in the body', () => {
    const reply = project(fixture()).find(message => message.role === 'assistant');
    expect(reply.displayContent).toBe('合成回复\n[[IMAGE:1]]');
    expect(reply.generatedImageAttachments).toMatchObject([{ attachmentId: attachment.attachmentId, batchId: 'synthetic-batch', frameId: 1, status: 'ready' }]);
    expect(project(fixture()).find(message => message.role === 'assistant').generatedImageAttachments).toEqual(reply.generatedImageAttachments);
  });
  it('shows the original AI image prompts in the processing history', () => {
    const reply = project(fixture()).find(message => message.role === 'assistant');
    const action = reply.process.find(item => item.toolName === 'generate_image');
    expect(action.kind).toBe('action'); expect(action.status).toBe('complete');
    expect(JSON.parse(action.arguments).frames[0].prompt).toBe('synthetic scene');
    expect(reply.displayContent).not.toContain('synthetic scene');
    expect(JSON.stringify(fixture().filter(event => event.type === 'eleckoi/illustration'))).not.toContain('synthetic scene');
  });
  it('keeps failed frames so a single image can be retried after reload', () => {
    const reply = project(fixture('failed')).find(message => message.role === 'assistant');
    expect(reply.generatedImageAttachments).toMatchObject([{ frameId: 1, status: 'failed', error: '合成错误' }]);
    expect(reply.generatedImageAttachments[0].attachmentId).toBeUndefined();
    expect(reply.process.find(item => item.toolName === 'generate_image').status).toBe('error');
  });
  it('removes images with their reply and displays the replacement image', () => {
    expect(project(fixture().slice(0, 3)).every(message => !message.generatedImageAttachments)).toBe(true);
    const replacement = { ...attachment, attachmentId: `sha256:${'b'.repeat(64)}` };
    expect(project(fixture('ready', replacement)).find(message => message.role === 'assistant').generatedImageAttachments[0].attachmentId).toBe(replacement.attachmentId);
    expect(project([])).toEqual([]);
  });
});
