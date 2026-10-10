/** Carries actual native turns, including controller.prompt and default UI sends. */
export class SessionGenerationEvents {
  constructor({ ctx, publish, claimManagedTurn = (_session, _event) => false }) {
    Object.assign(this, { ctx, publish, claimManagedTurn });
    this.closed = false; this.turns = new WeakMap(); this.pending = new Map();
    this.stop = ctx.on('session/event', (session, event) => this.observe(session, event));
  }
  observe(session, event) {
    if (this.closed) return;
    if (event.type === 'turn/start') {
      let turns = this.turns.get(session);
      if (!turns) this.turns.set(session, turns = new Map());
      if (turns.has(event.data.turn)) return;
      // Capture the native mapping and Agent now, never the currently viewed chat.
      const conversation = this.ctx.eleckoiProductData.readConversationCatalog()
        .find(item => item.runtimeSessionId === session.id);
      if (!conversation) return; // Background/subagent sessions are not main chat.
      const task = { conversationId: conversation.id, session, beforeSeq: event.seq,
        runId: `${session.id}:${event.seq}`, agent: this.ctx.get('agents', false)?.get(session.id),
        managed: this.claimManagedTurn(session, event) };
      turns.set(event.data.turn, task);
      if (!task.managed) this.emit(task, 'agent.state.changed', { state: 'starting', type: 'normal' });
      return;
    }
    if (event.type !== 'turn/end') return;
    const turns = this.turns.get(session), task = turns?.get(event.data.turn);
    if (!task) return; // No historical replay or duplicate terminal delivery.
    turns.delete(event.data.turn);
    if (task.managed) return; // MainAgentGeneration publishes after its presentation edits.
    task.end = event;
    // The append listener returns immediately: plugin callbacks cannot block the Agent.
    const previous = this.pending.get(session);
    const done = Promise.resolve(previous).then(() => this.finish(task)).catch(error => {
      if (!this.closed) this.emit(task, 'agent.run.failed', { message: error.message || String(error) });
    }).finally(() => { if (this.pending.get(session) === done) this.pending.delete(session); });
    this.pending.set(session, done);
  }
  emit(task, event, payload) {
    if (!this.closed) this.publish({ event, payload: { conversationId: task.conversationId,
      runId: task.runId, nativeMain: true, ...payload } });
  }
  async finish(task) {
    if (this.closed) return;
    if (!task.agent) throw new Error('Native turn has no original Agent');
    await task.agent.whenIdle();
    if (this.closed) return;
    // Session append is committed in memory; explicitly complete its durability checkpoint.
    const sessions = this.ctx.get('sessions', false);
    if (!sessions || !await sessions.flush(task.session)) throw new Error('Native turn Session could not be flushed');
    if (this.closed) return;
    const reason = task.end.data.reason;
    if (reason?.kind === 'error') {
      this.emit(task, 'agent.run.failed', { message: reason.error?.message || 'Native Agent generation failed', reason }); return;
    }
    if (['aborted', 'interrupted'].includes(reason?.kind)) {
      this.emit(task, 'agent.state.changed', { state: 'idle', detail: 'stopped', reason }); return;
    }
    if (!['completed', 'max-tokens'].includes(reason?.kind)) {
      this.emit(task, 'agent.state.changed', { state: 'idle', detail: reason?.kind || 'no-reply', reason }); return;
    }
    const messages = this.ctx.get('eleckoiCompatibilityMessages', false);
    if (!messages) throw new Error('Native message projection is not mounted');
    const history = await messages.read(task.conversationId);
    const reply = history.findLast(message => message.role === 'assistant' && message.id
      && message.sessionEventSeq > task.beforeSeq && message.sessionEventSeq < task.end.seq);
    if (!reply || typeof reply.content !== 'string' || !reply.content.trim()) {
      this.emit(task, 'agent.state.changed', { state: 'idle', detail: 'no-reply', reason }); return;
    }
    this.emit(task, 'agent.run.finished', { message: reply, messageCount: history.length, reason });
  }
  close() {
    this.closed = true; this.stop(); this.turns = new WeakMap(); this.pending.clear();
  }
}
