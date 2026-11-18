(() => {
  // Embedded author documents keep WebView's own select handling.
  if (window !== window.top || window.ElecKoiStandardChoices) return;
  window.ElecKoiStandardChoices = true;
  const markBrowser = () => document.documentElement.setAttribute('data-eleckoi-browser', 'standard');
  if (document.documentElement) markBrowser();
  else document.addEventListener('DOMContentLoaded', markBrowser, { once: true });
  const identities = new WeakMap();
  let active = null;
  const identity = element => {
    if (!identities.has(element)) identities.set(element, crypto.randomUUID());
    return identities.get(element);
  };
  const native = async (action, state, payload = {}) => {
    const raw = await window.ElecKoiAndroidTransport.invoke('nativeChoice', JSON.stringify([action, state.id, payload]));
    const reply = JSON.parse(raw);
    if (!reply.success) throw new Error(reply.error || 'Native choice operation failed');
    return reply.result;
  };
  const report = error => window.ElecKoiAndroid.reportError(String(error));
  const snapshot = state => {
    const choices = [], groups = new Map();
    state.options = new Map();
    for (const option of state.select.options) {
      const id = identity(option);
      state.options.set(id, option);
      const item = { id, label: option.label, disabled: option.matches(':disabled'), selected: option.selected, items: null };
      const parent = option.parentElement;
      if (parent instanceof HTMLOptGroupElement) {
        if (!groups.has(parent)) {
          const group = { id: identity(parent), label: parent.label, disabled: parent.disabled, selected: false, items: [] };
          groups.set(parent, group); choices.push(group);
        }
        groups.get(parent).items.push(item);
      } else choices.push(item);
    }
    const payload = { multiple: state.select.multiple, choices };
    state.serialized = JSON.stringify(payload);
    return payload;
  };
  const dismiss = state => {
    state.observer?.disconnect();
    if (active === state) active = null;
    if (state.id) native('dismiss', state).catch(report);
  };
  const open = select => {
    if (!select.isConnected || select.matches(':disabled')) return;
    if (active?.select === select) return;
    if (active) dismiss(active);
    const state = { select, id: '', options: new Map(), serialized: '', observer: null };
    active = state;
    select.focus({ preventScroll: true });
    state.observer = new MutationObserver(mutations => {
      if (active !== state || !state.id) return;
      if (!select.isConnected || select.matches(':disabled')) { dismiss(state); return; }
      if (!mutations.some(mutation => mutation.target === select || select.contains(mutation.target)
        || mutation.type === 'attributes' && mutation.attributeName === 'disabled' && mutation.target.contains(select))) return;
      const previous = state.serialized;
      const payload = snapshot(state);
      if (state.serialized !== previous) native('update', state, payload).catch(report);
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['disabled', 'label', 'selected', 'multiple'] });
    window.ElecKoiPlatform.choiceRequest(id => {
      state.id = id;
      return native('show', state, snapshot(state));
    }).then(reply => {
      state.observer.disconnect();
      if (reply.cancelled || active !== state || !select.isConnected) return;
      const ids = JSON.parse(reply.result);
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length
        || !select.multiple && ids.length !== 1) throw new Error('Invalid native choice response');
      for (const id of ids) {
        const option = state.options.get(id);
        if (!option || !select.contains(option) || option.matches(':disabled') && !option.selected)
          throw new Error('Native choice references an unavailable option');
      }
      const selected = new Set(ids), before = [...select.selectedOptions];
      for (const option of select.options) option.selected = selected.has(identity(option));
      const after = [...select.selectedOptions];
      if (before.length !== after.length || before.some((option, index) => option !== after[index])) {
        select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      }
    }).catch(report).finally(() => {
      state.observer.disconnect();
      if (active === state) {
        active = null;
        if (select.isConnected) select.focus({ preventScroll: true });
      }
    });
  };
  const target = event => event.target instanceof Element ? event.target.closest('select') : null;
  document.addEventListener('pointerdown', event => {
    const select = target(event);
    if (!select || select.matches(':disabled') || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); open(select);
  }, true);
  document.addEventListener('click', event => {
    const select = target(event);
    if (!select || select.matches(':disabled')) return;
    event.preventDefault(); open(select);
  }, true);
  document.addEventListener('keydown', event => {
    const select = target(event);
    if (!select || select.matches(':disabled') || ![' ', 'Enter', 'F4'].includes(event.key) && !(event.altKey && event.key === 'ArrowDown')) return;
    event.preventDefault(); open(select);
  }, true);
  window.addEventListener('pagehide', () => { if (active) dismiss(active); });
})();
