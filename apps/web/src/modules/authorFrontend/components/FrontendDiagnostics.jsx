import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
export function FrontendDiagnostics({ messages }) {
  const tUi = useProductTranslation();
  if (!messages.length) return null;
  return <details className="rich-message-diagnostics"><summary>{tUi("页面运行提示")}</summary>
    {messages.map(message => <pre key={message}>{message}</pre>)}
  </details>;
}
import './frontend-diagnostics.css';
