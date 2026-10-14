export const iframeEvents = Object.freeze({ MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started', MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended',
  GENERATION_REQUESTED: 'js_generation_requested', GENERATION_STARTED: 'js_generation_started', GENERATION_ENDED: 'js_generation_ended',
  STREAM_TOKEN_RECEIVED_FULLY: 'js_stream_token_received_fully', STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'js_stream_token_received_incrementally',
  REASONING_TOKEN_RECEIVED_FULLY: 'js_reasoning_token_received_fully', REASONING_TOKEN_RECEIVED_INCREMENTALLY: 'js_reasoning_token_received_incrementally' });

export function createIframeApi(rt) {
  const macros = rt.shared.macroLikes ??= new Map();
  const key = regex => `${regex.source}/${regex.flags}`;
  return {
    reloadIframe: () => rt.window.location.reload(),
    getMessageId: name => {
      if (name === rt.window.name) return rt.snapshot.messages.findIndex(item=>item.id===rt.snapshot.context.messageId);
      const frame = [...rt.window.parent.document.querySelectorAll('iframe')].find(frame=>frame.name===name);
      const node=frame?.closest('[data-message-id],.mes[mesid]');
      return node ? node.hasAttribute('mesid') ? Number(node.getAttribute('mesid')) : rt.snapshot.messages.findIndex(item=>item.id===node.getAttribute('data-message-id')) : -1;
    },
    errorCatched: fn => function (...args) {
      const report = error => { rt.emit('eleckoi:script-error',error); throw error; };
      try { const result=fn.apply(this,args); return result?.then ? result.catch(report) : result; } catch(error) { return report(error); }
    },
    registerMacroLike: (regex,replace) => {
      if (!(regex instanceof rt.window.RegExp) && !(regex instanceof RegExp)) throw new TypeError('Macro-like registration needs a regular expression.');
      if (typeof replace!=='function') throw new TypeError('Macro-like replacement needs a function.');
      const id=key(regex), entry={regex,replace}; macros.set(id,entry);
      const unregister=()=>{ if(macros.get(id)===entry) macros.delete(id); };
      rt.addCleanup(unregister); return {unregister};
    },
    unregisterMacroLike: regex => { macros.delete(key(regex)); },
  };
}
