package com.eleckoi.android.feature.chat.ui.roleplay.web.document.runtime

internal val RoleplayTranscriptRichLifecycleRuntime = """    const closeRichScope = (slot, reason, nextPhase) => {
      const scope = slot?.scope;
      if (!scope || scope.closed) {
        if (slot) slot.phase = nextPhase;
        return;
      }
      scope.closed = true;
      try {
        slot.root.dispatchEvent(new CustomEvent('eleckoi:suspend', {
          detail: { signal: scope.controller.signal, runtime: scope.runtime, reason },
        }));
      } catch (error) { reportRichSlotError(slot, error, 'suspend'); }
      scope.controller.abort(reason);
      try {
        slot.root.dispatchEvent(new CustomEvent('eleckoi:dispose', {
          detail: { signal: scope.controller.signal, runtime: scope.runtime, reason },
        }));
      } catch (error) { reportRichSlotError(slot, error, 'dispose'); }
      Array.from(scope.cleanups).reverse().forEach(cleanup => {
        try {
          const result = cleanup();
          if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(error => reportRichSlotError(slot, error, 'async-cleanup'));
          }
        } catch (error) { reportRichSlotError(slot, error, 'cleanup'); }
      });
      scope.cleanups.clear();
      state.richViewport.activeCost = Math.max(0, state.richViewport.activeCost - scope.cost);
      if (state.activeRichScope === scope) state.activeRichScope = null;
      slot.scope = null;
      slot.layoutPending = false;
      slot.phase = nextPhase;
      delete slot.root.__eleckoiRuntime;
    };
    const failRichSlot = (slot, error, stage, expectedScope = slot?.scope) => {
      if (!slot || slot.phase === RichSlotPhase.DISPOSED || slot.scope !== expectedScope) return;
      reportRichSlotError(slot, error, stage);
      closeRichScope(slot, 'failed', RichSlotPhase.FAILED);
      markRichLayoutReady(slot);
    };
    const createRichScope = slot => {
      const scope = {
        slot,
        generation: slot.generation + 1,
        controller: new AbortController(),
        cleanups: new Set(),
        cost: slot.cost,
        closed: false,
      };
      slot.generation = scope.generation;
      scope.runtime = Object.freeze({
        signal: scope.controller.signal,
        onCleanup(callback) {
          if (typeof callback !== 'function' || scope.closed) return false;
          scope.cleanups.add(callback);
          return true;
        },
        restore(key, fallback = null) {
          if (typeof key !== 'string') return fallback;
          return Object.prototype.hasOwnProperty.call(slot.snapshot, key) ? slot.snapshot[key] : fallback;
        },
      });
      return scope;
    };
    const wakeRichSlot = slot => {
      if (!slot || !slot.root.isConnected || slot.phase === RichSlotPhase.DISPOSED) return false;
      if (slot.phase === RichSlotPhase.RUNNING && slot.scope && !slot.scope.closed) return true;
      if (slot.phase === RichSlotPhase.FAILED) return false;
      slot.snapshot = state.snapshots.get(slot.messageId)?.rich?.[slot.rootIndex] || slot.snapshot || {};
      slot.layoutReady = false;
      slot.layoutPending = false;
      slot.failure = null;
      slot.everStarted = true;
      const scope = createRichScope(slot);
      slot.scope = scope;
      slot.phase = RichSlotPhase.RUNNING;
      state.richViewport.activeCost += slot.cost;
      state.activeRichScope = scope;
      state.activeAuthorMessageId = slot.messageId || '';
      slot.root.__eleckoiRuntime = scope.runtime;
      try {
        const hasDocumentFrame = mountRichDocumentFrame(slot, scope);
        slot.root.querySelectorAll('script:not([data-eleckoi-runtime-source="true"])').forEach(source => {
          source.dataset.eleckoiRuntimeSource = 'true';
        });
        slot.root.querySelectorAll('script[data-eleckoi-runtime-source="true"]').forEach(source => {
          const script = document.createElement('script');
          Array.from(source.attributes).forEach(attribute => script.setAttribute(attribute.name, attribute.value));
          script.dataset.eleckoiActivated = 'true';
          script.textContent = source.textContent;
          script.addEventListener('error', () => {
            failRichSlot(slot, new Error('rich script failed to load'), 'script-load', scope);
          }, { once: true });
          let synchronousError = null;
          const captureError = event => {
            synchronousError ||= event.error || new Error(event.message || 'rich script failed');
          };
          addEventListener('error', captureError, true);
          try { source.replaceWith(script); } finally { removeEventListener('error', captureError, true); }
          if (synchronousError) throw synchronousError;
        });
        dispatchRichLifecycle(slot, 'mount', { snapshot: slot.snapshot });
        if (!hasDocumentFrame) markRichLayoutReady(slot);
        return true;
      } catch (error) {
        failRichSlot(slot, error, 'activate', scope);
        return false;
      } finally {
        if (state.activeRichScope === scope) state.activeRichScope = null;
      }
    };
    window.ElecKoiRichRuntime = Object.freeze({
      get signal() { return state.activeRichScope?.controller.signal || null; },
      onCleanup(callback) {
        const scope = state.activeRichScope;
        if (typeof callback !== 'function' || !scope || scope.closed) return false;
        scope.cleanups.add(callback);
        return true;
      },
      restore(key, fallback = null) {
        const slot = state.activeRichScope?.slot;
        if (typeof key !== 'string' || !slot) return fallback;
        return Object.prototype.hasOwnProperty.call(slot.snapshot, key) ? slot.snapshot[key] : fallback;
      },
    });
"""
