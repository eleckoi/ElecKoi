package com.eleckoi.android.compatibility.mvu.display

import org.json.JSONObject

/**
 * Presents an immutable ElecKoi message-variable snapshot through the small browser surface used by
 * imported MVU status boards. This is a display adapter: MVU never owns or persists variable state.
 */
internal fun String.injectMvuFrontendSnapshotBridge(variableStateJson: String): String {
    if (MvuFrontendBridgeMarker in this || !referencesMvuFrontendRuntime()) return this

    val bridge = mvuFrontendSnapshotBridge(variableStateJson)
    val head = HtmlHeadOpen.find(this)
    if (head == null) return bridge + this
    val insertionPoint = head.range.last + 1
    return substring(0, insertionPoint) + bridge + substring(insertionPoint)
}

private fun String.referencesMvuFrontendRuntime(): Boolean =
    (contains("waitGlobalInitialized") && contains("Mvu")) ||
        contains("Mvu.events.") ||
        contains("Mvu.getMvuData")

private fun mvuFrontendSnapshotBridge(variableStateJson: String): String {
    val stateLiteral = JSONObject.quote(variableStateJson.ifBlank { "{}" })
        .replace(ClosingScriptTag) { "<\\/script" }
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    return """
<script id="$MvuFrontendBridgeMarker">
((global) => {
  'use strict';

  if (global.__ElecKoiMvuSnapshotBridge) return;

  const nativeSnapshot = JSON.parse($stateLiteral);
  const snapshot = nativeSnapshot && typeof nativeSnapshot === 'object' &&
    nativeSnapshot.stat_data && typeof nativeSnapshot.stat_data === 'object'
      ? nativeSnapshot
      : { initialized_lorebooks: {}, stat_data: nativeSnapshot || {} };
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const deepGet = (source, path, fallback) => {
    if (path === undefined || path === null || path === '') return source;
    const segments = Array.isArray(path)
      ? path
      : String(path)
          .replace(/\[(['"]?)(.*?)\1\]/g, '.$2')
          .split('.')
          .filter(Boolean);
    let current = source;
    for (const segment of segments) {
      if (current === null || current === undefined || !(segment in Object(current))) {
        return fallback;
      }
      current = current[segment];
    }
    return current === undefined ? fallback : current;
  };

  if (!global._) {
    const decoder = document.createElement('textarea');
    global._ = Object.freeze({
      get: deepGet,
      escape(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      },
      unescape(value) {
        decoder.innerHTML = String(value ?? '');
        return decoder.value;
      },
    });
  }

  const eventBindings = new WeakMap();
  const baseEventName = (name) => String(name || '').split('.')[0];
  const isNativeInteractive = (node) =>
    /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName || '');

  class MiniQuery {
    constructor(nodes) {
      this.nodes = Array.from(nodes || []).filter(Boolean);
      this.length = this.nodes.length;
      this.nodes.forEach((node, index) => { this[index] = node; });
    }

    each(action) {
      this.nodes.forEach((node, index) => action.call(node, index, node));
      return this;
    }

    text(value) {
      if (value === undefined) return this.nodes[0]?.textContent ?? '';
      return this.each((_, node) => { node.textContent = String(value); });
    }

    html(value) {
      if (value === undefined) return this.nodes[0]?.innerHTML ?? '';
      return this.each((_, node) => { node.innerHTML = String(value); });
    }

    show() {
      return this.each((_, node) => {
        node.style.removeProperty('display');
        if (global.getComputedStyle(node).display === 'none') node.style.display = 'block';
      });
    }

    hide() {
      return this.each((_, node) => { node.style.display = 'none'; });
    }

    css(name, value) {
      if (value === undefined && typeof name === 'string') {
        return this.nodes[0] ? global.getComputedStyle(this.nodes[0])[name] : undefined;
      }
      return this.each((_, node) => {
        if (typeof name === 'object') {
          Object.entries(name).forEach(([key, next]) => { node.style[key] = next; });
        } else {
          node.style[name] = value;
        }
      });
    }

    addClass(names) {
      const values = String(names || '').split(/\s+/).filter(Boolean);
      return this.each((_, node) => node.classList.add(...values));
    }

    removeClass(names) {
      const values = String(names || '').split(/\s+/).filter(Boolean);
      return this.each((_, node) => node.classList.remove(...values));
    }

    attr(name, value) {
      if (value === undefined) return this.nodes[0]?.getAttribute(name);
      return this.each((_, node) => node.setAttribute(name, String(value)));
    }

    data(name, value) {
      const attribute = 'data-' + String(name).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
      if (value === undefined) return this.nodes[0]?.getAttribute(attribute);
      return this.attr(attribute, value);
    }

    on(eventNames, handler) {
      String(eventNames || '').split(/\s+/).filter(Boolean).forEach((eventName) => {
        const type = baseEventName(eventName);
        this.each((_, node) => {
          const wrapped = (event) => handler.call(node, event);
          node.addEventListener(type, wrapped);
          const records = eventBindings.get(node) || [];
          records.push({ eventName, type, wrapped });
          eventBindings.set(node, records);

          if (type === 'click' && !isNativeInteractive(node) && !node.hasAttribute('tabindex')) {
            node.tabIndex = 0;
            if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
            const keyboard = (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              node.click();
            };
            node.addEventListener('keydown', keyboard);
            records.push({ eventName: eventName + ':keyboard', type: 'keydown', wrapped: keyboard });
          }
        });
      });
      return this;
    }

    off(eventNames) {
      const requested = String(eventNames || '').split(/\s+/).filter(Boolean);
      return this.each((_, node) => {
        const records = eventBindings.get(node) || [];
        const kept = [];
        records.forEach((record) => {
          const remove = requested.length === 0 || requested.some((name) =>
            record.eventName === name ||
              (!name.includes('.') && record.type === baseEventName(name)) ||
              (name.startsWith('.') && record.eventName.endsWith(name)),
          );
          if (remove) node.removeEventListener(record.type, record.wrapped);
          else kept.push(record);
        });
        eventBindings.set(node, kept);
      });
    }
  }

  const miniQuery = (input) => {
    if (typeof input === 'function') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', input, { once: true });
      } else {
        queueMicrotask(input);
      }
      return new MiniQuery([]);
    }
    if (typeof input === 'string') return new MiniQuery(document.querySelectorAll(input));
    if (input instanceof MiniQuery) return input;
    if (input && typeof input.length === 'number' && !input.nodeType && input !== global) {
      return new MiniQuery(input);
    }
    return new MiniQuery(input ? [input] : []);
  };
  miniQuery.fn = MiniQuery.prototype;
  if (typeof global.jQuery !== 'function') global.jQuery = miniQuery;
  if (typeof global.${'$'} !== 'function') global.${'$'} = global.jQuery;

  const listeners = new Map();
  const eventOn = (name, listener) => {
    const current = listeners.get(name) || new Set();
    current.add(listener);
    listeners.set(name, current);
    return listener;
  };
  const eventOff = (name, listener) => listeners.get(name)?.delete(listener);
  const eventEmit = (name, ...args) => {
    (listeners.get(name) || []).forEach((listener) => listener(...args));
  };

  const events = Object.freeze({
    VARIABLE_INITIALIZED: 'mag_variable_initiailized',
    VARIABLE_UPDATE_STARTED: 'mag_variable_update_started',
    COMMAND_PARSED: 'mag_command_parsed',
    VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
    BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
  });
  const mvu = Object.freeze({
    events,
    getMvuData: () => clone(snapshot),
    isDuringExtraAnalysis: () => false,
  });

  global.getAllVariables = () => clone(snapshot);
  global.Mvu = mvu;
  global.eventOn = global.eventOn || eventOn;
  global.eventOff = global.eventOff || eventOff;
  global.eventEmit = global.eventEmit || eventEmit;
  global.initializeGlobal = global.initializeGlobal || ((name, value) => { global[name] = value; });
  global.waitGlobalInitialized = global.waitGlobalInitialized || (async (name) => {
    if (!(name in global)) throw new Error('Global is not available: ' + name);
  });
  global.errorCatched = global.errorCatched || ((action) => function(...args) {
    try {
      return Promise.resolve(action.apply(this, args)).catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
      return undefined;
    }
  });

  Object.defineProperty(global, '__ElecKoiMvuSnapshotBridge', {
    value: Object.freeze({ version: 1, readOnly: true }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
})(window);
</script>
""".trimIndent()
}

internal const val MvuFrontendBridgeMarker = "eleckoi-mvu-snapshot-bridge"

private val HtmlHeadOpen = Regex("""(?i)<head(?:\s[^>]*)?>""")
private val ClosingScriptTag = Regex("""(?i)</script""")
