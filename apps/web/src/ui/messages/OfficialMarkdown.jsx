import { createContext, useCallback, useContext } from "react";
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { normalizeMarkdownForRendering } from './normalizeMarkdownForRendering.js';
import { prepareMarkdownTextTones } from './markdownTextTones.js';
import { resolveMarkdownMedia } from '../../app/services/assets.js';

const MarkdownComponentContext = createContext(null);
const markdownLabels = Object.freeze({
  code: Object.freeze({
    copyLabel: "复制",
    copiedLabel: "已复制",
    toolbarLabels: Object.freeze({
      codeLabel: "代码",
      wrapLabel: "自动换行",
      unwrapLabel: "不换行",
    }),
  }),
  footnotes: "脚注",
});

export function OfficialMarkdownProvider({ component, children }) {
  return <MarkdownComponentContext.Provider value={component || null}>{children}</MarkdownComponentContext.Provider>;
}

export function OfficialMarkdown({ content, streaming = false }) {
  const MarkdownText = useContext(MarkdownComponentContext);
  if (!MarkdownText) throw new Error("DSH 官方文字渲染组件未接入。");
  return <div className="eleckoi-dsh-markdown">
    <MarkdownText text={resolveMarkdownMedia(content || "")} streaming={streaming} labels={markdownLabels} />
  </div>;
}

/** Formatting uses the very same injected Markdown component as chat bubbles. */
export function useOfficialMarkdownFormatter() {
  const component = useContext(MarkdownComponentContext);
  return useCallback(text => {
    if (!component) throw new Error('DSH 官方文字渲染组件未接入。');
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      const content = normalizeMarkdownForRendering(prepareMarkdownTextTones(text).markdown);
      flushSync(() => root.render(<OfficialMarkdownProvider component={component}><OfficialMarkdown content={content} /></OfficialMarkdownProvider>));
      return container.querySelector('.eleckoi-dsh-markdown').innerHTML;
    } finally { flushSync(() => root.unmount()); }
  }, [component]);
}
