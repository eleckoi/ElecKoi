package com.eleckoi.android.feature.chat.ui.roleplay.web.document.runtime

internal val RoleplayTranscriptRichDocumentFrameRuntime = """    const mountRichDocumentFrame = (slot, scope) => {
      const root = slot.root;
      const frame = root.querySelector(':scope > .eleckoi-rich-frame');
      const template = root.querySelector(':scope > template[data-eleckoi-rich-document-source="true"]');
      if (!frame || !template) return false;
      const source = template.content?.textContent || '';
      let resizeObserver = null;
      let mutationObserver = null;
      let resizeFrame = 0;
      let resourceTimer = 0;
      let loadWatchdog = 0;
      let probeAttempts = 0;
      let documentInitialized = false;
      let resourcesSettled = false;
      let provisionalHeight = 0;
      let candidateHeight = 0;
      let stableSamples = 0;
      let settleAttempts = 0;
      const cacheKey = richHeightKey(slot.messageId, slot.rootIndex);
      const cachedHeight = Number(state.richHeights.get(cacheKey) || 0);
      let lockedHeight = Number.isFinite(cachedHeight) && cachedHeight > 0 ? cachedHeight : 0;
      if (lockedHeight > 0) {
        frame.style.height = lockedHeight + 'px';
        markRichLayoutReady(slot);
      }
      const stopGeometryObservers = () => {
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        resizeObserver = null;
        mutationObserver = null;
      };
      const commitFirstStableHeight = height => {
        if (!richScopeAlive(slot, scope)) return;
        lockedHeight = height;
        frame.style.height = lockedHeight + 'px';
        const measuredKey = richHeightKey(slot.messageId, slot.rootIndex);
        state.richHeights.set(measuredKey, lockedHeight);
        post({ type: 'richHeight', key: measuredKey, height: lockedHeight });
        noteInitialPresentationGeometryChange(root);
        const turn = root.closest('.turn');
        if (turn) virtualizer.measureElement(turn);
        requestGeometryCommit({
          renderRange: true,
          forceRender: initialPresentationActive(),
        });
        stopGeometryObservers();
        if (initialPresentationActive()) {
          state.forceTail = true;
          requestGeometryCommit({ renderRange: true, forceRender: true });
        }
        markRichLayoutReady(slot);
      };
      const scheduleHeight = () => {
        if (!resizeFrame && richScopeAlive(slot, scope)) {
          slot.layoutPending = true;
          resizeFrame = requestAnimationFrame(syncHeight);
        }
      };
      const syncHeight = () => {
        resizeFrame = 0;
        slot.layoutPending = false;
        if (!richScopeAlive(slot, scope)) return;
        if (lockedHeight > 0) {
          frame.style.height = lockedHeight + 'px';
          markRichLayoutReady(slot);
          return;
        }
        const embeddedDocument = frame.contentDocument;
        const body = embeddedDocument?.body;
        if (!body) return;
        const bodyStyle = embeddedDocument.defaultView?.getComputedStyle(body);
        const margins = (parseFloat(bodyStyle?.marginTop) || 0) + (parseFloat(bodyStyle?.marginBottom) || 0);
        const height = Math.max(
          1,
          Math.ceil(Math.max(body.scrollHeight, body.offsetHeight, body.getBoundingClientRect().height) + margins),
        );
        if (!resourcesSettled) {
          if (Math.abs(provisionalHeight - height) > 1) {
            provisionalHeight = height;
            frame.style.height = provisionalHeight + 'px';
            noteInitialPresentationGeometryChange(root);
            const turn = root.closest('.turn');
            if (turn) virtualizer.measureElement(turn);
            requestGeometryCommit({ renderRange: true });
          }
          return;
        }
        settleAttempts += 1;
        if (Math.abs(candidateHeight - height) <= 1) {
          stableSamples += 1;
        } else {
          candidateHeight = height;
          stableSamples = 1;
        }
        if (stableSamples >= 2 || settleAttempts >= 6) {
          commitFirstStableHeight(height);
        } else {
          scheduleHeight();
        }
      };
      const settleEmbeddedResources = embeddedDocument => {
        const blockers = [];
        const fontsReady = embeddedDocument.fonts?.ready;
        if (fontsReady && typeof fontsReady.then === 'function') blockers.push(fontsReady);
        Array.from(embeddedDocument.images || []).forEach(image => {
          if (image.complete) return;
          blockers.push(new Promise(resolve => {
            const settle = () => resolve();
            image.addEventListener('load', settle, { once: true, signal: scope.controller.signal });
            image.addEventListener('error', settle, { once: true, signal: scope.controller.signal });
            scope.controller.signal.addEventListener('abort', settle, { once: true });
          }));
        });
        const timeout = new Promise(resolve => {
          resourceTimer = setTimeout(resolve, 3000);
        });
        Promise.race([Promise.allSettled(blockers), timeout]).then(() => {
          if (resourceTimer) clearTimeout(resourceTimer);
          resourceTimer = 0;
          if (!richScopeAlive(slot, scope)) return;
          resourcesSettled = true;
          candidateHeight = 0;
          stableSamples = 0;
          settleAttempts = 0;
          scheduleHeight();
        }).catch(error => reportRichSlotError(slot, error, 'resource-settle'));
      };
      const initializeEmbeddedDocument = () => {
        if (!richScopeAlive(slot, scope) || documentInitialized) return documentInitialized;
        const embeddedDocument = frame.contentDocument;
        const embeddedLocation = embeddedDocument?.location?.href || embeddedDocument?.documentURI || '';
        if (
          embeddedLocation !== 'about:srcdoc' ||
          !embeddedDocument?.body ||
          embeddedDocument.readyState === 'loading'
        ) return false;
        documentInitialized = true;
        stopGeometryObservers();
        const embeddedScheme = state.style.dark ? 'dark' : 'light';
        embeddedDocument.documentElement.style.setProperty('color-scheme', embeddedScheme);
        embeddedDocument.documentElement.style.setProperty('background-color', 'transparent', 'important');
        embeddedDocument.body.style.setProperty('color-scheme', embeddedScheme);
        if (lockedHeight > 0) return true;
        if ('ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(scheduleHeight);
          resizeObserver.observe(embeddedDocument.body);
        }
        mutationObserver = new MutationObserver(scheduleHeight);
        mutationObserver.observe(embeddedDocument.body, {
          attributes: true, childList: true, characterData: true, subtree: true,
        });
        scheduleHeight();
        settleEmbeddedResources(embeddedDocument);
        return true;
      };
      const probeEmbeddedDocument = () => {
        loadWatchdog = 0;
        if (!richScopeAlive(slot, scope) || initializeEmbeddedDocument()) return;
        probeAttempts += 1;
        if (probeAttempts >= 40) {
          failRichSlot(slot, new Error('embedded document did not become ready'), 'iframe-ready', scope);
          return;
        }
        loadWatchdog = setTimeout(probeEmbeddedDocument, 100);
      };
      const onLoad = () => {
        try { initializeEmbeddedDocument(); } catch (error) { failRichSlot(slot, error, 'iframe-load', scope); }
      };
      frame.addEventListener('load', onLoad);
      frame.srcdoc = source;
      loadWatchdog = setTimeout(probeEmbeddedDocument, 50);
      scope.cleanups.add(() => {
        const preservedHeight = Math.max(
          1,
          lockedHeight,
          cachedHeight,
          Math.ceil(frame.getBoundingClientRect().height),
        );
        frame.removeEventListener('load', onLoad);
        stopGeometryObservers();
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        if (resourceTimer) clearTimeout(resourceTimer);
        if (loadWatchdog) clearTimeout(loadWatchdog);
        frame.removeAttribute('srcdoc');
        frame.src = 'about:blank';
        frame.style.height = preservedHeight + 'px';
      });
      return true;
    };
"""
