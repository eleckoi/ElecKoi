/** A background chat uses the existing official Session projector, without selecting it in the UI. */
export async function readBackgroundPresentation(remote, unwrapRemote, conversationId, { signal } = {}) {
  if (typeof conversationId !== 'string' || !conversationId) throw new TypeError('Background presentation requires conversationId');
  if (signal?.aborted) throw signal.reason;
  const invoke = async (service, method) => {
    if (signal?.aborted) throw signal.reason;
    try {
      return unwrapRemote(await service.invoke({ method, params: { conversationId } }));
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      // A historical owner can outlive deletion and application restart. Verify
      // absence against the existing native catalog, never an error's wording.
      if (typeof remote.eleckoiConversations?.list === 'function') {
        let catalog;
        try { catalog = unwrapRemote(await remote.eleckoiConversations.list()); }
        catch { if (signal?.aborted) throw signal.reason; throw error; }
        if (signal?.aborted) throw signal.reason;
        if (Array.isArray(catalog) && !catalog.some(value => value.id === conversationId)) {
          throw Object.assign(new Error(`Conversation context is unavailable: ${conversationId}`, { cause: error }), {
            code: 'CONTEXT_UNAVAILABLE', conversationId, deletedConversation: true,
          });
        }
      }
      throw error;
    }
  };
  const messages = await invoke(remote.eleckoiCompatibility, 'messages.read');
  if (!Array.isArray(messages)) throw new TypeError('Official Session message projection did not return an array');
  const generation = await invoke(remote.eleckoiAuthorPlugins, 'chat.getGenerationState');
  if (generation?.conversationId !== conversationId || typeof generation.active !== 'boolean') {
    throw new TypeError('Official Session generation state does not match the requested background chat');
  }
  if (signal?.aborted) throw signal.reason;
  return { conversationId, messages, isGenerating: generation.active,
    ...(generation.active ? { generation: { runId: generation.runId, messageId: generation.messageId,
      content: generation.accumulated, sequence: generation.sequence } } : {}) };
}
