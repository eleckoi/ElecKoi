package com.eleckoi.android.feature.chat.ui.roleplay.web.document.runtime

internal val RoleplayTranscriptRichStateRuntime = """    const safeCss = value => String(value || '').replace(/[;{}<>]/g, '');
    const RichSlotPhase = Object.freeze({
      COLD: 'cold', QUEUED: 'queued', RUNNING: 'running',
      SLEEPING: 'sleeping', FAILED: 'failed', DISPOSED: 'disposed',
    });
    const richRootsWithin = root => {
      const roots = [];
      if (root?.matches?.('.eleckoi-rich-replacement')) roots.push(root);
      root?.querySelectorAll?.('.eleckoi-rich-replacement').forEach(candidate => roots.push(candidate));
      return roots;
    };
    const measureRichWeight = root => {
      const embeddedFrames = root.querySelectorAll('iframe, object, embed').length;
      const activeMedia = root.querySelectorAll('video, audio, canvas').length;
      const scriptCharacters = Array.from(root.querySelectorAll('script'))
        .reduce((total, script) => total + (script.textContent?.length || 0), 0);
      return Math.max(1, 1 + (embeddedFrames * 3) + activeMedia + Math.ceil(scriptCharacters / 8192));
    };
    const richSlotForRoot = root => root ? state.richSlotByRoot.get(root) || null : null;
    const reportRichSlotError = (slot, error, stage) => {
      const message = String(error?.message || error || 'rich content failed');
      state.metrics.richSlotFailures += 1;
      if (slot) slot.failure = { stage, message, at: performance.now() };
      console.error('[ElecKoi rich content]', stage, message, error);
    };
    const dispatchRichLifecycle = (slot, phase, extra = {}) => {
      const scope = slot?.scope;
      if (!scope || scope.closed) return;
      slot.root.dispatchEvent(new CustomEvent('eleckoi:' + phase, {
        detail: { signal: scope.controller.signal, runtime: scope.runtime, ...extra },
      }));
    };
    const rememberTurnSnapshot = (messageId, snapshot) => {
      if (!messageId) return;
      state.snapshots.delete(messageId);
      state.snapshots.set(messageId, snapshot);
      while (state.snapshots.size > 128) state.snapshots.delete(state.snapshots.keys().next().value);
    };
    const collectRichSnapshotValues = slot => {
      if (!slot?.scope || slot.scope.closed) return null;
      const values = {};
      try {
        dispatchRichLifecycle(slot, 'checkpoint', {
          save(key, value) {
            if (typeof key !== 'string' || !key) return;
            try {
              const encoded = JSON.stringify(value);
              if (typeof encoded === 'string' && encoded.length <= 65536) {
                values[key] = JSON.parse(encoded);
              }
            } catch (_) {}
          },
        });
      } catch (error) {
        reportRichSlotError(slot, error, 'checkpoint');
      }
      return values;
    };
    const captureRichSlotSnapshot = slot => {
      if (!slot?.messageId || !slot.scope || slot.scope.closed) return;
      const values = collectRichSnapshotValues(slot);
      if (!values || !Object.keys(values).length) return;
      const previous = state.snapshots.get(slot.messageId) || {};
      const rich = { ...(previous.rich || {}), [slot.rootIndex]: values };
      rememberTurnSnapshot(slot.messageId, { details: previous.details || [], rich });
      slot.snapshot = values;
    };
    const captureTurnSnapshot = turn => {
      const messageId = turn?.dataset?.id;
      if (!messageId) return;
      const previous = state.snapshots.get(messageId) || {};
      const rich = { ...(previous.rich || {}) };
      richRootsWithin(turn).forEach((root, index) => {
        const slot = richSlotForRoot(root);
        const values = collectRichSnapshotValues(slot);
        if (values && Object.keys(values).length) rich[index] = values;
      });
      rememberTurnSnapshot(messageId, {
        details: Array.from(turn.querySelectorAll('details')).map(details => details.open),
        rich,
      });
    };
    const restoreTurnSnapshot = turn => {
      const snapshot = state.snapshots.get(turn?.dataset?.id);
      if (!snapshot) return;
      turn.querySelectorAll('details').forEach((details, index) => {
        details.open = !!snapshot.details?.[index];
      });
    };
    const richFrameWidth = () => Math.max(1, Math.round(
      window.innerWidth - (2 * Number(state.style.horizontalPaddingPx || 0)) -
      Number(state.style.avatarWidthPx || 0) - Number(state.style.avatarGapPx || 0),
    ));
    const richHeightKey = (messageId, rootIndex) => {
      const message = state.byId.get(messageId);
      return [state.sessionId, messageId, message?.contentRevision || '', rootIndex, richFrameWidth()].join('\u001f');
    };
    const applyCachedRichHeights = (turn, message) => {
      richRootsWithin(turn).forEach((root, rootIndex) => {
        const frame = root.querySelector(':scope > .eleckoi-rich-frame');
        const cached = Number(state.richHeights.get(richHeightKey(message.id, rootIndex)) || 0);
        if (frame && Number.isFinite(cached) && cached > 0) frame.style.height = cached + 'px';
      });
    };
    const markRichLayoutReady = slot => {
      if (!slot || slot.phase === RichSlotPhase.DISPOSED) return;
      slot.layoutReady = true;
      slot.layoutPending = false;
      requestInitialPresentationCheck();
    };
    const richScopeAlive = (slot, scope) =>
      slot.scope === scope && !scope.closed && slot.root.isConnected;
"""
