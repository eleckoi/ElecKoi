/** Caption commands share the public metadata/transcript service and native HTTP transport. */
export function youtubeCommands(_context, api) {
  return { 'yt-script': async (args, value) => {
    const source = args._abortController, controller = new AbortController();
    const abort = () => controller.abort(new Error(String(source.signal.reason || 'YouTube command cancelled.')));
    const bridge = source?.addEventListener && !source.signal?.addEventListener;
    if (bridge) { source.addEventListener('abort', abort); if (source.signal.aborted) abort(); }
    try { return (await api.youtube.transcript(value, { lang: args.lang, signal: bridge ? controller.signal : source?.signal })).text; }
    finally { if (bridge) source.removeEventListener('abort', abort); }
  } };
}
