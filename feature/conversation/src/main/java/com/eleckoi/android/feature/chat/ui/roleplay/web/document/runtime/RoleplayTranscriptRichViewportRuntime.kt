package com.eleckoi.android.feature.chat.ui.roleplay.web.document.runtime

internal val RoleplayTranscriptRichViewportRuntime = """    let richVisibleObserver = null;
    let richNearObserver = null;
    const requestRichViewportRefresh = () => {
      if (state.richViewport.stopped || state.richViewport.refreshQueued) return;
      const epoch = state.richViewport.epoch;
      state.richViewport.refreshQueued = true;
      queueMicrotask(() => {
        if (epoch !== state.richViewport.epoch || state.richViewport.stopped) return;
        state.richViewport.refreshQueued = false;
        refreshRichViewport();
      });
    };
    const ensureRichObservers = () => {
      if (!('IntersectionObserver' in window) || richVisibleObserver) return;
      richVisibleObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const slot = richSlotForRoot(entry.target);
          if (slot) slot.visible = entry.isIntersecting;
        });
        requestRichViewportRefresh();
      }, { root: null, rootMargin: '0px', threshold: 0 });
      richNearObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const slot = richSlotForRoot(entry.target);
          if (slot) slot.near = entry.isIntersecting;
        });
        requestRichViewportRefresh();
      }, { root: null, rootMargin: '1000px 0px', threshold: 0 });
    };
    const sampleRichPosition = slot => {
      const rect = slot.root.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      slot.visible = rect.bottom > 0 && rect.top < viewportHeight;
      slot.near = rect.bottom > -1000 && rect.top < viewportHeight + 1000;
      slot.distance = Math.abs(((rect.top + rect.bottom) / 2) - (viewportHeight / 2));
    };
    const registerRichSlot = (root, messageId, rootIndex) => {
      const current = richSlotForRoot(root);
      if (current && current.messageId === messageId && current.rootIndex === rootIndex) return current;
      if (current) releaseRichSlot(current);
      const slot = {
        root, messageId, rootIndex,
        phase: RichSlotPhase.COLD,
        cost: measureRichWeight(root),
        snapshot: state.snapshots.get(messageId)?.rich?.[rootIndex] || {},
        scope: null,
        generation: 0,
        everStarted: false,
        visible: false,
        near: false,
        wanted: false,
        distance: Infinity,
        layoutReady: false,
        layoutPending: false,
        failure: null,
      };
      state.richSlotByRoot.set(root, slot);
      state.richSlots.add(slot);
      sampleRichPosition(slot);
      ensureRichObservers();
      richVisibleObserver?.observe(root);
      richNearObserver?.observe(root);
      return slot;
    };
    const sleepRichSlot = slot => {
      if (!slot || slot.phase !== RichSlotPhase.RUNNING) return;
      captureRichSlotSnapshot(slot);
      closeRichScope(slot, 'offscreen', RichSlotPhase.SLEEPING);
    };
    const releaseRichSlot = slot => {
      if (!slot || slot.phase === RichSlotPhase.DISPOSED) return;
      if (slot.scope && !slot.scope.closed) captureRichSlotSnapshot(slot);
      closeRichScope(slot, 'removed', RichSlotPhase.DISPOSED);
      richVisibleObserver?.unobserve(slot.root);
      richNearObserver?.unobserve(slot.root);
      state.richSlots.delete(slot);
      state.richSlotByRoot.delete(slot.root);
      slot.wanted = false;
    };
    const releaseRichWithin = root => richRootsWithin(root).forEach(candidate => {
      const slot = richSlotForRoot(candidate);
      if (slot) releaseRichSlot(slot);
    });
    const discoverRichSlots = () => {
      turns.querySelectorAll(':scope > .turn').forEach(turn => {
        richRootsWithin(turn).forEach((root, rootIndex) => {
          registerRichSlot(root, turn.dataset.id || '', rootIndex);
        });
      });
      if (initialPresentationActive()) {
        state.initialPresentation.required.forEach(root => {
          if (!root.isConnected || richSlotForRoot(root)) return;
          const turn = root.closest('.turn');
          const roots = turn ? richRootsWithin(turn) : [];
          registerRichSlot(root, turn?.dataset?.id || '', Math.max(0, roots.indexOf(root)));
        });
      }
      Array.from(state.richSlots).forEach(slot => {
        if (!slot.root.isConnected) releaseRichSlot(slot);
      });
    };
    const richViewportCapacity = () => {
      const viewportShare = Math.max(3, Math.ceil(window.innerHeight / 300) + 2);
      const memory = Number(navigator.deviceMemory);
      const memoryShare = Number.isFinite(memory) ? Math.max(1, Math.min(8, Math.round(memory))) : 4;
      const cpuShare = Math.max(1, Math.min(6, Math.ceil(Number(navigator.hardwareConcurrency || 4) / 2)));
      const pressurePenalty = performance.now() - state.metrics.lastLongTaskAt < 5000 ? 3 : 0;
      return Math.max(2, viewportShare + memoryShare + cpuShare - pressurePenalty);
    };
    const cancelRichStart = () => {
      if (!state.richViewport.handle) return;
      if (state.richViewport.scheduler === 'idle' && 'cancelIdleCallback' in window) {
        cancelIdleCallback(state.richViewport.handle);
      } else {
        cancelAnimationFrame(state.richViewport.handle);
      }
      state.richViewport.handle = 0;
      state.richViewport.scheduler = '';
    };
    const scheduleNextRichStart = () => {
      if (state.fault || state.richViewport.stopped || state.richViewport.paused || state.richViewport.handle) return;
      while (state.richViewport.pending.length) {
        const first = state.richViewport.pending[0];
        if (
          first?.root?.isConnected && first.wanted &&
          (first.phase === RichSlotPhase.COLD || first.phase === RichSlotPhase.SLEEPING || first.phase === RichSlotPhase.QUEUED)
        ) break;
        state.richViewport.pending.shift();
      }
      if (!state.richViewport.pending.length) return;
      const startOne = () => {
        state.richViewport.handle = 0;
        state.richViewport.scheduler = '';
        const slot = state.richViewport.pending.shift();
        if (slot?.wanted && slot.root.isConnected && slot.phase === RichSlotPhase.QUEUED) {
          wakeRichSlot(slot);
        }
        scheduleNextRichStart();
      };
      if (!initialPresentationActive() && 'requestIdleCallback' in window) {
        state.richViewport.scheduler = 'idle';
        state.richViewport.handle = requestIdleCallback(startOne, { timeout: 250 });
      } else {
        state.richViewport.scheduler = 'frame';
        state.richViewport.handle = requestAnimationFrame(startOne);
      }
    };
    const refreshRichViewport = () => {
      if (state.fault || state.richViewport.stopped) return;
      discoverRichSlots();
      const candidates = Array.from(state.richSlots).filter(slot => slot.root.isConnected);
      candidates.forEach(slot => {
        sampleRichPosition(slot);
        slot.cost = measureRichWeight(slot.root);
        slot.bootstrap = initialPresentationActive() && state.initialPresentation.required.has(slot.root);
      });
      candidates.sort((left, right) =>
        Number(right.bootstrap) - Number(left.bootstrap) ||
        Number(right.visible) - Number(left.visible) ||
        Number(right.near) - Number(left.near) ||
        left.distance - right.distance,
      );
      const capacity = richViewportCapacity();
      let selectedCost = 0;
      let selectedCount = 0;
      candidates.forEach(slot => {
        const required = slot.bootstrap || slot.visible;
        const fitsNearby = slot.near && (selectedCount === 0 || selectedCost + slot.cost <= capacity);
        slot.wanted = required || fitsNearby;
        if (slot.wanted) {
          selectedCost += slot.cost;
          selectedCount += 1;
        }
      });
      candidates.forEach(slot => {
        if (!slot.wanted && slot.phase === RichSlotPhase.RUNNING) sleepRichSlot(slot);
        if (!slot.wanted && slot.phase === RichSlotPhase.QUEUED) {
          slot.phase = slot.everStarted ? RichSlotPhase.SLEEPING : RichSlotPhase.COLD;
        }
      });
      const pending = candidates.filter(slot => {
        if (!slot.wanted || slot.phase === RichSlotPhase.RUNNING || slot.phase === RichSlotPhase.FAILED) return false;
        slot.phase = RichSlotPhase.QUEUED;
        return true;
      });
      state.richViewport.capacity = capacity;
      state.richViewport.demandCost = selectedCost;
      state.richViewport.pending = pending;
      scheduleNextRichStart();
    };
    const activateRichRootNow = (root, messageId, rootIndex) => {
      const slot = registerRichSlot(root, messageId, rootIndex);
      slot.visible = true;
      slot.near = true;
      slot.wanted = true;
      cancelRichStart();
      const activated = wakeRichSlot(slot);
      requestRichViewportRefresh();
      return activated;
    };
    const resetRichViewport = () => {
      cancelRichStart();
      state.richViewport.epoch += 1;
      state.richViewport.stopped = false;
      state.richViewport.pending = [];
      state.richViewport.paused = false;
      state.richViewport.refreshQueued = false;
      state.richViewport.demandCost = 0;
      state.richViewport.capacity = 0;
    };
    const syncRichViewportToScroll = () => {
      const paused = state.initialPresentation.phase === 'committed' && state.scroll.virtualScrolling;
      if (state.richViewport.paused === paused) return;
      state.richViewport.paused = paused;
      if (paused) cancelRichStart(); else requestRichViewportRefresh();
    };
    const shutdownRichViewport = () => {
      resetRichViewport();
      state.richViewport.stopped = true;
      Array.from(state.richSlots).forEach(releaseRichSlot);
      richVisibleObserver?.disconnect();
      richNearObserver?.disconnect();
      richVisibleObserver = null;
      richNearObserver = null;
    };
"""
