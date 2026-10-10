import { describe, expect, it, vi } from 'vitest';
import { CompatibilityGeneration } from '../packages/dsh-compatibility-host/src/generation-operations.js';

function harness() {
  const stream = vi.fn(async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'synthetic answer' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  });
  const generation = new CompatibilityGeneration({ data: { readConversationDetails: () => ({}), compatibilityStore: () => ({ list: () => ({}) }) },
    compatibility: vi.fn(), readModel: async () => ({ provider: 'native', model: 'model-a', reasoningEffort: 'high' }),
    readConnection: vi.fn(), llm: { stream }, callbacks: {}, hasWebCallbacks: () => false, worldbooks: () => null, publish: vi.fn() });
  return { generation, stream };
}

describe('SDK generation through the locked official LlmRuntime', () => {
  it('streams the official request rather than serializing HTTP independently', async () => {
    const { generation, stream } = harness();
    const result = await generation.invoke({ method: 'generation.invoke', params: { conversationId: 'chat', prompt: 'hello', temperature: 0.4, maxTokens: 123 } });
    expect(result.content).toBe('synthetic answer');
    expect(stream).toHaveBeenCalledOnce();
    expect(stream.mock.calls[0][0]).toMatchObject({ provider: 'native', model: 'model-a', reasoningEffort: 'high', temperature: 0.4, maxTokens: 123,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] });
    expect(generation.readConnection).not.toHaveBeenCalled();
  });

  it('does not inherit reasoning capabilities when the SDK explicitly switches model', async () => {
    const { generation, stream } = harness();
    await generation.generate({ conversationId: 'chat', prompt: 'hello', model: 'model-b' });
    expect(stream.mock.calls[0][0]).not.toHaveProperty('reasoningEffort');
  });

  it('preserves assistant tool calls and native tool results', async () => {
    const { generation } = harness();
    const request = await generation.prepareNativeRequest({ conversationId: 'chat', configId: 'native', model: 'model-a', messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call', function: { name: 'synthetic-tool', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call', content: 'result' },
    ] });
    expect(request.messages[0].content).toContainEqual({ type: 'tool-call', id: 'call', name: 'synthetic-tool', arguments: '{}' });
    expect(request.messages[1]).toMatchObject({ role: 'tool', toolCallId: 'call', source: { kind: 'tool', callId: 'call' }, content: [{ type: 'text', text: 'result' }] });
  });

  it.each([{ topP: 0.9 }, { parameters: { seed: 1 } }, { json_schema: {} }, { custom_api: { model: 'other' } }])
    ('rejects options outside the actual adapter contract before dispatch: %j', async extra => {
      const { generation, stream } = harness();
      await expect(generation.generateNative({ conversationId: 'chat', model: 'model-a', messages: [{ role: 'user', content: 'hello' }], ...extra }))
        .rejects.toMatchObject({ code: 'GENERATION_OPTION_NOT_SUPPORTED' });
      expect(stream).not.toHaveBeenCalled();
    });

  it('previews without dispatching and requires an explicit endpoint for a low-level network call', async () => {
    const { generation, stream } = harness();
    const preview = await generation.invoke({ method: 'generation.preview', params: { conversationId: 'chat', prompt: 'hello' } });
    expect(preview.nativeRequest).toMatchObject({ provider: 'native', model: 'model-a' });
    expect(stream).not.toHaveBeenCalled();
    await expect(generation.invoke({ method: 'generation.request', params: { conversationId: 'chat' } })).rejects.toThrow('explicit endpoint');
    expect(generation.readConnection).not.toHaveBeenCalled();
  });
});
