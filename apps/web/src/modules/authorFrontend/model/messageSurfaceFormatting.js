/** Terminal HTML formatting after the shared SDK has expanded macros and regexes. */
export function createMessageSurfaceFormatter(view) {
  if (!view.showdown?.Converter) throw new Error('消息显示 Markdown 渲染库尚未就绪');
  const converter = new view.showdown.Converter();
  return text => converter.makeHtml(String(text ?? ''));
}
