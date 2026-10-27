(() => {
  if (window.ElecKoiPlatform) return;
  // Android composers resize with the layout viewport when the IME opens.
  const viewportPolicy = () => {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport && document.readyState === 'loading') return;
    if (!viewport) {
      viewport = document.createElement('meta'); viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1'; document.head.append(viewport);
    }
    const options = viewport.content.split(/[,;]/).map(value => value.trim()).filter(Boolean)
      .filter(value => value.split('=')[0].trim().toLowerCase() !== 'interactive-widget');
    viewport.content = [...options, 'interactive-widget=resizes-content'].join(', ');
  };
  if (document.readyState === 'loading') {
    const viewportObserver = new MutationObserver(viewportPolicy);
    viewportObserver.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => { viewportObserver.disconnect(); viewportPolicy(); }, { once: true });
  }
  viewportPolicy();
  if (window.ElecKoiAndroidTransport) {
    const decode = json => {
      const reply = JSON.parse(json);
      if (!reply.success) throw new Error(reply.error || 'Android platform operation failed');
      return reply.result;
    };
    const methods = ['clientReady', 'clientFailed', 'tts', 'readTtsAudio', 'releaseTtsAudio', 'saveText',
      'beginFile', 'writeFile', 'finishFile', 'abortFile', 'reportError', 'openExternal',
      'notificationSettings', 'updateStatus', 'checkUpdates', 'downloadUpdate', 'appearance', 'version',
      'bugReportFacts'];
    window.ElecKoiAndroid = Object.fromEntries(methods.map(method => [method, (...args) => {
      const reply = window.ElecKoiAndroidTransport.invoke(method, JSON.stringify(args));
      return reply && typeof reply.then === 'function' ? reply.then(decode) : decode(reply);
    }]));
  }
  const pending = new Map();
  window.addEventListener('eleckoi:platform-result', event => {
    for (let index = 0; index < window.frames.length; index++)
      window.frames[index].postMessage({ type: 'eleckoi:platform-result', detail: event.detail }, window.location.origin);
    const request = pending.get(event.detail.id);
    if (!request) return;
    pending.delete(event.detail.id);
    if (event.detail.success) request.resolve({ result: event.detail.result, cancelled: event.detail.result === 'cancelled' });
    else request.reject(new Error(event.detail.result));
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'eleckoi:platform-result') return;
    window.dispatchEvent(new CustomEvent('eleckoi:platform-result', { detail: event.data.detail }));
  });
  const result = json => {
    if (json && typeof json.then === 'function') return json.then(result);
    const response = JSON.parse(json);
    if (!response.success) throw new Error(response.result);
    return response.result;
  };
  const request = operation => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pending.set(id, { resolve, reject });
    Promise.resolve().then(() => operation(id)).catch(error => {
      pending.delete(id);
      reject(error);
    });
  });
  const encode = bytes => {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  };
  const saveBlob = (name, blob, mime = blob.type || 'application/octet-stream') => request(async id => {
    const token = await result(ElecKoiAndroid.beginFile(id, name, mime));
    try {
      const reader = blob.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.length; offset += 64 * 1024)
            await result(ElecKoiAndroid.writeFile(token, encode(value.subarray(offset, offset + 64 * 1024))));
        }
      } finally { reader.releaseLock(); }
      await result(ElecKoiAndroid.finishFile(token));
    } catch (error) {
      const cleanup = JSON.parse(await ElecKoiAndroid.abortFile(token));
      if (!cleanup.success) throw new Error(`${error.message}; ${cleanup.result}`);
      throw error;
    }
  });
  window.ElecKoiPlatform = {
    version: 1,
    choiceRequest: operation => request(operation),
    browserCommand: ({ type, payload }) => {
      if (type === 'back') return !window.dispatchEvent(new CustomEvent('eleckoi:platform-back', { cancelable: true }));
      if (type === 'attribute' && ['data-eleckoi-ime-visible', 'data-eleckoi-button-navigation'].includes(payload.name)) {
        document.documentElement?.toggleAttribute(payload.name, payload.value === true); return null;
      }
      if (type === 'emit' && ['eleckoi:platform-result', 'eleckoi:updates-changed'].includes(payload.event)) {
        window.dispatchEvent(new CustomEvent(payload.event, { detail: payload.detail })); return null;
      }
      if (type === 'download') {
        window.ElecKoiPlatform.saveUrl(payload.name, payload.url, payload.mime).catch(error => ElecKoiAndroid.reportError(String(error))); return null;
      }
      throw new Error(`Unsupported browser command: ${type}`);
    },
    saveText: (name, text, mime = 'text/plain') => request(id => ElecKoiAndroid.saveText(id, name, mime, String(text))),
    saveBlob,
    saveBytes: (name, bytes, mime = 'application/octet-stream') => saveBlob(name, new Blob([bytes], { type: mime }), mime),
    saveUrl: async (name, url, mime) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Export HTTP ${response.status}`);
      return saveBlob(name, await response.blob(), mime);
    },
    openExternal: url => ElecKoiAndroid.openExternal(url),
    bugReport: {
      // 只给原始事实（环境 / 上次会话 / 最近事件）。报告在渲染层用共享契约拼，
      // 脱敏与折叠只有一份实现。
      facts: () => Promise.resolve(ElecKoiAndroid.bugReportFacts()).then(text => JSON.parse(text)),
    },
    notificationSettings: () => ElecKoiAndroid.notificationSettings(),
    updates: {
      status: async () => JSON.parse(await ElecKoiAndroid.updateStatus()),
      check: () => request(id => ElecKoiAndroid.checkUpdates(id)).then(reply => reply.result),
      download: () => request(id => ElecKoiAndroid.downloadUpdate(id)).then(reply => reply.result),
      subscribe: listener => {
        const changed = event => listener(event.detail);
        window.addEventListener('eleckoi:updates-changed', changed);
        return () => window.removeEventListener('eleckoi:updates-changed', changed);
      }
    },
    tts: {
      voices: () => request(id => ElecKoiAndroid.tts(id, 'voices', '{}')).then(reply => reply.result),
      synthesize: options => request(id => ElecKoiAndroid.tts(id, 'synthesize', JSON.stringify(options))).then(reply => reply.result),
      state: id => request(requestId => ElecKoiAndroid.tts(requestId, 'state', JSON.stringify({ id }))).then(reply => reply.result),
      cancel: id => request(requestId => ElecKoiAndroid.tts(requestId, 'cancel', JSON.stringify({ id }))).then(reply => reply.result),
      readAudio: (token, offset = 0, count = 65536) => result(ElecKoiAndroid.readTtsAudio(token, offset, count)),
      releaseAudio: token => result(ElecKoiAndroid.releaseTtsAudio(token))
    }
  };
  window.dispatchEvent(new Event('eleckoi:platform-ready'));
  if (window === window.top && typeof ElecKoiAndroid.clientReady === 'function') {
    const observeClient = () => {
      const observer = new MutationObserver(check);
      let settled = false;
      function check() {
        if (settled) return;
        const boot = document.querySelector('[data-dsh-boot]');
        // The locked BootPage replaces its marked spinner with its failure report.
        const bootFailure = boot && !boot.querySelector('[data-dsh-boot-spinner]') ? boot : null;
        const failure = document.querySelector('[data-slot-error="root"]') || bootFailure;
        if (failure) {
          settled = true; observer.disconnect();
          ElecKoiAndroid.clientFailed(location.href, failure.textContent.trim() || '应用界面加载失败');
        } else if (document.querySelector('#eleckoi-root main.main-window-shell')) {
          settled = true; observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => ElecKoiAndroid.clientReady(location.href)));
        }
      }
      observer.observe(document.documentElement, { childList: true, subtree: true });
      check();
    };
    if (document.documentElement) observeClient();
    else document.addEventListener('DOMContentLoaded', observeClient, { once: true });
  }
  // The native container consumes system-bar insets; Web styles own the content palette.
  if (window === window.top && typeof ElecKoiAndroid.appearance === 'function') {
    let lastAppearance = '';
    let observedSurface = null;
    let observedWindow = null;
    let animationFrame = 0;
    const masks = new Map();
    const portalMasks = new Set();
    const pixel = document.createElement('canvas');
    pixel.width = pixel.height = 1;
    const painter = pixel.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    const maskLayers = () => [...masks.values()].filter(({ mask }) => mask.isConnected);
    const stackingOrder = element => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        const index = getComputedStyle(node).zIndex;
        if (index && index !== 'auto') return Number(index);
      }
      return 0;
    };
    const updateAppearance = () => {
      const root = document.documentElement;
      const mode = root.dataset.theme;
      if (mode !== 'light' && mode !== 'dark') return false;
      const appRoot = document.getElementById('eleckoi-root');
      if (!appRoot) return false;
      if (observedSurface !== appRoot) {
        observer.observe(appRoot, { attributes: true, attributeFilter: ['style'] });
        observedSurface = appRoot;
      }
      const mobileWindow = appRoot.querySelector('.mobile-shell');
      if (!mobileWindow) return false;
      if (observedWindow !== mobileWindow) {
        observer.observe(mobileWindow, { attributes: true, attributeFilter: ['data-mobile-panel', 'data-mobile-route', 'data-drawer-present', 'data-mobile-rightbar', 'style'] });
        observedWindow = mobileWindow;
      }
      const background = getComputedStyle(mobileWindow).getPropertyValue('--mobile-system-bar-bg').trim();
      if (!background) return false;
      painter.clearRect(0, 0, 1, 1);
      painter.globalAlpha = 1;
      painter.fillStyle = background;
      painter.fillRect(0, 0, 1, 1);
      const layers = maskLayers().sort((a, b) => stackingOrder(a.mask) - stackingOrder(b.mask)
        || (a.mask.compareDocumentPosition(b.mask) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      for (const { mask, pseudo, surface } of layers) {
        const paint = surface || mask;
        const style = getComputedStyle(paint, surface ? null : pseudo || null);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        let opacity = Number(style.opacity || 1);
        for (let node = surface ? surface.parentElement : pseudo ? mask : mask.parentElement; node && node !== document.body; node = node.parentElement)
          opacity *= Number(getComputedStyle(node).opacity || 1);
        painter.globalAlpha = opacity;
        painter.fillStyle = style.backgroundColor;
        painter.fillRect(0, 0, 1, 1);
      }
      // Canvas serializes CSS Color 4 as color(...); the native contract requires #RRGGBB.
      const bytes = painter.getImageData(0, 0, 1, 1).data;
      const surface = '#' + [...bytes.slice(0, 3)].map(value => value.toString(16).padStart(2, '0')).join('');
      const signature = `${mode}:${surface}`;
      if (signature === lastAppearance) return true;
      lastAppearance = signature;
      ElecKoiAndroid.appearance(mode, surface);
      return true;
    };
    const syncAppearance = () => { if (updateAppearance()) mountObserver.disconnect(); };
    const observer = new MutationObserver(syncAppearance);
    const mountObserver = new MutationObserver(syncAppearance);
    const animateAppearance = () => {
      animationFrame = 0;
      syncAppearance();
      const animating = maskLayers().some(({ mask }) => {
        for (let node = mask; node && node !== document.body; node = node.parentElement)
          if (node.getAnimations?.({ subtree: true }).some(animation => animation.playState === 'running'
            && animation.effect?.target === node)) return true;
        return false;
      });
      if (animating) animationFrame = requestAnimationFrame(animateAppearance);
    };
    const syncMasks = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animateAppearance();
    };
    const maskObserver = new MutationObserver(syncMasks);
    const watchMasks = () => {
      maskObserver.disconnect();
      for (const { mask, surface } of maskLayers()) {
        maskObserver.observe(mask, { attributes: true, attributeFilter: ['style', 'class', 'data-sheet-closing'] });
        if (surface) maskObserver.observe(surface, { attributes: true, attributeFilter: ['style', 'class'] });
      }
      syncMasks();
    };
    document.addEventListener('eleckoi:system-bar-mask', event => {
      const { mask, pseudo, surface, active } = event.detail || {};
      if (!(mask instanceof HTMLElement) || mask.ownerDocument !== document
        || !['', '::after', '::before'].includes(pseudo) || typeof active !== 'boolean'
        || surface !== undefined && (!(surface instanceof HTMLElement) || !mask.contains(surface))) return;
      if (active) masks.set(mask, { mask, pseudo, surface });
      else masks.delete(mask);
      watchMasks();
    });
    // Locked DSH Modal and ImageLightbox portal directly to body. Their declared
    // dialog/presentation and aria-hidden mask structure identifies the surface;
    // observing body children never observes streamed chat descendants.
    const fillsBox = style => style.inset === '0px' || style.inset === '0'
      || ['top', 'right', 'bottom', 'left'].every(side => style[side] === '0px');
    const syncPortals = () => {
      const current = new Map();
      for (const layer of document.body.children) {
        const role = layer.getAttribute('role');
        const modal = role === 'presentation' && layer.querySelector(':scope > [role="dialog"][aria-modal="true"]');
        const image = role === 'dialog' && layer.getAttribute('aria-modal') === 'true';
        if (!modal && !image) continue;
        const style = getComputedStyle(layer);
        if (style.position !== 'fixed' || !fillsBox(style)) continue;
        // ImageLightbox paints its mask inside the caption-aware stage.
        for (const mask of layer.querySelectorAll(image ? ':scope > div > [aria-hidden="true"]' : ':scope > [aria-hidden="true"]')) {
          const maskStyle = getComputedStyle(mask);
          if (!['absolute', 'fixed'].includes(maskStyle.position) || !fillsBox(maskStyle)) continue;
          current.set(mask, { mask, pseudo: modal ? '::after' : '' });
        }
      }
      for (const mask of portalMasks) if (!current.has(mask)) masks.delete(mask);
      portalMasks.clear();
      for (const [mask, layer] of current) { portalMasks.add(mask); masks.set(mask, layer); }
      watchMasks();
    };
    const portalObserver = new MutationObserver(syncPortals);
    const watchPortals = () => { portalObserver.observe(document.body, { childList: true }); syncPortals(); };
    if (document.body) watchPortals();
    else document.addEventListener('DOMContentLoaded', watchPortals, { once: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    if (!updateAppearance()) mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  // Preserve download names before WebView reduces blob downloads to a URL callback.
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[download]');
    if (!anchor || !/^(blob:|data:)/.test(anchor.href)) return;
    event.preventDefault();
    window.ElecKoiPlatform.saveUrl(anchor.download || 'export', anchor.href)
      .catch(error => ElecKoiAndroid.reportError(String(error)));
  }, true);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob:|data:)/.test(this.href)) {
      window.ElecKoiPlatform.saveUrl(this.download || 'export', this.href)
        .catch(error => ElecKoiAndroid.reportError(String(error)));
      return;
    }
    return click.call(this);
  };
})();
