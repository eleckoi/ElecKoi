/** ST-shaped streaming state backed by native Agent events or an actual request iterator. */
export function createStreamingProcessor(context, bridge, { type = 'normal', native = false, conversationId } = {}) {
  const started = new Date();
  let duration = 0, reasoning = '';
  const processor = {
    result: '', messageId: -1, messageDom: null, messageTextDom: null, messageTimerDom: null, messageTokenCounterDom: null,
    sendTextarea: bridge.document().querySelector('#send_textarea'), type, force_name2: false,
    isStopped: false, isFinished: false, abortController: new AbortController(), firstMessageText: '...',
    timeStarted: started, timeToFirstToken: null, createdAt: started, continueMessage: '',
    swipes: [], messageLogprobs: [], toolCalls: [], images: [], reasoningSignature: null, stoppingStrings: [],
    reasoningHandler: {
      get reasoning() { return reasoning; },
      set reasoning(value) { reasoning = String(value || ''); },
      updateReasoning(messageId, value) { if (value !== undefined) reasoning = String(value || ''); this.updateDom(messageId); },
      initContinue(prompt) { reasoning = prompt?.reasoning || ''; },
      getDuration: () => duration,
      updateDom(messageId) { const message = context.chat[messageId]; if (!message) return;
        message.extra ||= {}; message.extra.reasoning = reasoning;
        const node = bridge.retrieve(messageId)?.querySelector('.mes_reasoning');
        const content = node?.querySelector('.mes_reasoning_content'); if (content) content.innerHTML = context.messageFormatting(reasoning, message.name, false, false, messageId, {}, true);
      },
      async process(messageId) { duration = (Date.now() - started.getTime()) / 1000; this.updateDom(messageId); },
      async finish(messageId) { await this.process(messageId); const message = context.chat[messageId]; if (message) message.extra.reasoning_duration = duration; },
    },
    promptReasoning: null,
    markUIGenStarted: () => context.deactivateSendButtons(),
    markUIGenStopped: () => context.activateSendButtons(),
    bindDom(messageId) {
      const root = bridge.retrieve(messageId);
      this.messageDom = root || null; this.messageTextDom = root?.querySelector('.mes_text') || root || null;
      this.messageTimerDom = root?.querySelector('.mes_timer') || null; this.messageTokenCounterDom = root?.querySelector('.tokenCounterDisplay') || null;
    },
    async onStartStreaming(text) {
      if (native) return this.messageId;
      if (this.type === 'impersonate') { if (!this.sendTextarea) throw new Error('Composer DOM is not mounted'); this.sendTextarea.value = ''; this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true })); return -1; }
      await context.saveReply({ type: this.type, getMessage: text }); this.messageId = context.chat.length - 1;
      this.bindDom(this.messageId); this.markUIGenStarted(); context.swipe.hide(); return this.messageId;
    },
    async onProgressStreaming(messageId, text, isFinal = false) {
      this.result = text; this.messageId = messageId; this.bindDom(messageId);
      if (this.type === 'impersonate') { if (!this.sendTextarea) throw new Error('Composer DOM is not mounted'); this.sendTextarea.value = text; this.sendTextarea.dispatchEvent(new Event('input', { bubbles: true })); return; }
      const message = context.chat[messageId]; if (!message) throw new RangeError(`Streaming message does not exist: ${messageId}`);
      message.mes = text; message.gen_started = this.timeStarted; message.gen_finished = new Date(); message.extra ||= {};
      message.extra.time_to_first_token = this.timeToFirstToken;
      await this.reasoningHandler.process(messageId); this.setFirstSwipe(messageId);
      if (this.messageTextDom) this.messageTextDom.innerHTML = context.messageFormatting(text, message.name, message.is_system, message.is_user, messageId);
      if (isFinal) { message.extra.token_count = await context.getTokenCountAsync(reasoning + text);
        if (this.messageTokenCounterDom) this.messageTokenCounterDom.textContent = `${message.extra.token_count}t`; }
    },
    async finalizeIntermediaryMessage(messageId, text, { unlockUI = true } = {}) {
      await this.onProgressStreaming(messageId, text, true); await this.reasoningHandler.finish(messageId);
      const message = context.chat[messageId];
      if (this.reasoningSignature) message.extra.reasoning_signature = this.reasoningSignature;
      if (this.images.length) { message.extra.media ||= []; message.extra.media.push(...this.images.map(url => ({ url, type: 'image' }))); }
      if (this.swipes.length) { message.swipes ||= [message.mes]; message.swipe_info ||= [{ extra: { ...message.extra } }];
        message.swipes.push(...this.swipes); message.swipe_info.push(...this.swipes.map(() => ({ extra: { ...message.extra } }))); }
      if (unlockUI) this.markUIGenStopped();
      await context.eventSource.emit(context.eventTypes.MESSAGE_RECEIVED, messageId, this.type);
      await context.eventSource.emit(context.eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, this.type);
    },
    async onFinishStreaming(messageId, text) { await this.finalizeIntermediaryMessage(messageId, text); if (!native) await context.saveChat(); this.isFinished = true; },
    onErrorStreaming(error) { this.abortController.abort(error); this.isStopped = true; this.markUIGenStopped(); },
    setFirstSwipe(messageId) { const message = context.chat[messageId]; if (!message) return;
      if (this.type !== 'swipe' && this.type !== 'impersonate' && message.swipes?.length === 1 && !message.swipe_id) {
        message.swipes[0] = message.mes; message.swipe_info ||= []; message.swipe_info[0] = { send_date: message.send_date, gen_started: message.gen_started,
          gen_finished: message.gen_finished, extra: structuredClone(message.extra || {}) };
      }
    },
    onStopStreaming() { this.abortController.abort(); this.isStopped = true; this.isFinished = true;
      if (native) return bridge.stop(conversationId); },
    async* nullStreamingGeneration() { throw new Error('Generation function for streaming is not hooked up'); },
    async generate() {
      if (native) { for await (const packet of this.generator()) this.result = packet.text; this.isFinished = true; return this.result; }
      if (this.messageId === -1) this.messageId = await this.onStartStreaming(this.firstMessageText);
      try {
        for await (const packet of this.generator()) {
          if (this.isStopped || this.abortController.signal.aborted) break;
          this.timeToFirstToken ??= Date.now() - this.createdAt.getTime();
          this.result = packet.text; this.swipes = packet.swipes || []; this.toolCalls = packet.toolCalls || [];
          if (packet.logprobs) this.messageLogprobs.push(...Array.isArray(packet.logprobs) ? packet.logprobs : [packet.logprobs]);
          this.images = packet.state?.images || []; this.reasoningSignature = packet.state?.signature || null;
          this.reasoningHandler.updateReasoning(this.messageId, packet.state?.reasoning);
          await context.eventSource.emit(context.eventTypes.STREAM_TOKEN_RECEIVED, packet.text);
          await this.onProgressStreaming(this.messageId, this.continueMessage + packet.text);
        }
        this.isFinished = true; return this.result;
      } catch (error) { this.onErrorStreaming(error); throw error; }
    },
    observe(record) {
      if (!record) return;
      this.result = record.text; this.messageId = context.chat.findIndex(message => message.native_id === record.messageId);
      this.timeToFirstToken = record.firstTokenAt == null ? null : record.firstTokenAt - record.startedAt;
      this.timeStarted = new Date(record.startedAt); this.createdAt = this.timeStarted;
      this.isFinished = record.finished; this.isStopped = record.stopped; this.toolCalls = record.toolCalls || [];
      if (record.stopped && !this.abortController.signal.aborted) this.abortController.abort(record.error);
      reasoning = record.reasoning || ''; this.images = record.images || []; this.reasoningSignature = record.signature || null;
      this.bindDom(this.messageId);
    },
  };
  processor.generator = native ? () => bridge.stream(conversationId, processor.abortController.signal) : processor.nullStreamingGeneration;
  return processor;
}
