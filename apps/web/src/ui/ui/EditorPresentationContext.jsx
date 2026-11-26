import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from 'react';

export const EDITOR_DIRECTORY_DEFAULT_WIDTH = 480;

// 只传递编辑器的界面呈现方式，数据与草稿仍归各编辑页维护。
export const EditorPresentationContext = createContext({ compact: false, registerSubpage: null });
export const useEditorPresentation = () => useContext(EditorPresentationContext);

export function useEditorFeedbackHost() {
  const entries = useRef(new Map());
  const [feedback, setFeedback] = useState(null);
  const registerSaveFeedback = useCallback((id, value) => {
    entries.current.set(id, value);
    const update = () => setFeedback([...entries.current.values()].reverse().find(item => item.error || item.notice === 'saved') || null);
    update();
    return () => { entries.current.delete(id); update(); };
  }, []);
  return { feedback, registerSaveFeedback };
}

export function useEditorSaveFeedback(error, notice) {
  const { compact, registerSaveFeedback } = useEditorPresentation();
  const id = useId();
  useLayoutEffect(() => {
    if (compact && registerSaveFeedback) return registerSaveFeedback(id, { error, notice });
    return undefined;
  }, [compact, registerSaveFeedback, id, error, notice]);
  return Boolean(compact && registerSaveFeedback);
}

export function useEditorSubpage(active, title, onBack, actions) {
  const { compact, registerSubpage } = useEditorPresentation();
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useLayoutEffect(() => {
    if (!compact || !active || !registerSubpage) return undefined;
    return registerSubpage({ title, back: () => backRef.current?.(), actions });
  }, [compact, active, title, registerSubpage, actions]);
}
