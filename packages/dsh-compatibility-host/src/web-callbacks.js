/** Keeps the old proven Web hook contracts, carried by the generated Author Remote. */
export class CompatibilityCallbacks {
  constructor(broker) { this.broker = broker; }
  hasClients() { return this.broker.clients.size > 0; }
  callback(method, payload, options = {}) { return this.broker.request(method, payload, options); }
  async expand(text, { conversationId, readOnly = false, signal } = {}) {
    if (!text.includes('{{')) return text;
    const result = await this.expandMany([text], { conversationId, readOnly, signal });
    return result[0];
  }
  async expandMany(texts, { conversationId, readOnly = false, signal } = {}) {
    if (!Array.isArray(texts) || texts.some(text => typeof text !== 'string')) throw new TypeError('Macro input batch must be a string array');
    if (!texts.some(text => text.includes('{{'))) return [...texts];
    const result = await this.callback('__ElecKoiResolveMacros', { conversationId, texts, readOnly }, { conversationId, signal });
    if (!Array.isArray(result) || result.length !== texts.length || result.some(text => typeof text !== 'string')) throw new TypeError('Macro runtime returned an invalid result');
    return result;
  }
  worldbookScanLoop(payload, conversationId) { return this.callback('__ElecKoiWorldbookScanLoop', { ...payload, conversationId }, { conversationId }); }
  worldbookMatchEntries(payload, conversationId) { return this.callback('__ElecKoiMatchWorldbookEntries', { ...payload, conversationId }, { conversationId }); }
  worldbookFormatEntries(payload, conversationId) { return this.callback('__ElecKoiFormatWorldbookEntries', { ...payload, conversationId }, { conversationId }); }
  worldbookPrepareBooks(payload) { return this.callback('__ElecKoiPrepareWorldbooks', payload, { conversationId: payload.conversationId }); }
  async worldbookCompleteScan(payload) { await this.callback('__ElecKoiCompleteWorldbookScan', payload, { conversationId: payload.conversationId }); }
  async toolSnapshot(conversationId, signal) {
    const result = await this.callback('__ElecKoiToolSnapshot', { conversationId }, { conversationId, signal });
    if (!Array.isArray(result)) throw new TypeError('ToolManager snapshot must be an array');
    const names = new Set();
    for (const descriptor of result) {
      const tool = descriptor?.function;
      if (descriptor?.type !== 'function' || typeof tool?.name !== 'string' || !tool.name
        || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)
        || typeof descriptor.__eleckoiVersion !== 'string' || !descriptor.__eleckoiVersion) {
        throw new TypeError('ToolManager returned an invalid or unfrozen function descriptor');
      }
      if (names.has(tool.name)) throw new Error(`ToolManager returned duplicate tool ${tool.name}`);
      names.add(tool.name);
    }
    return result;
  }
  invokeTool(payload, options) { return this.callback('__ElecKoiInvokeTool', payload, { ...options, drainOnAbort: true }); }
}
