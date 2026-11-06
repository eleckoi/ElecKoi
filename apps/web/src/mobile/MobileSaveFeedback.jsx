import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useRef } from 'react';

export function MobileSaveFeedback({ error, notice, onNotify, successMessage: successMessageSource }) {
  const tUi = useProductTranslation();
  const successMessage = successMessageSource === undefined ? tUi("已保存") : successMessageSource;
  const notifyRef = useRef(onNotify);
  const previous = useRef(null);
  notifyRef.current = onNotify;
  useEffect(() => {
    const feedback = error ? { type: 'error', message: error }
      : notice === 'saved' ? { type: 'success', message: successMessage } : null;
    const key = feedback ? JSON.stringify(feedback) : null;
    if (key !== previous.current) {
      previous.current = key;
      if (feedback) notifyRef.current(feedback.type, feedback.message);
    }
  }, [error, notice, successMessage]);
  return null;
}
