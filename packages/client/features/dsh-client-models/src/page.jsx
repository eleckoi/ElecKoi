import { useProductTranslation } from '../../../../../apps/web/src/app/i18n/ProductLocaleContext.jsx';
import { useRef, useSyncExternalStore } from "react";
import { ModelConfigPanel, initialConfigForProvider } from "../../../../../apps/web/src/modules/models/index.js";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
export { ModelNavIcon as NavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function ModelPage() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { chat, models, modelNavigationGuardRef, renderLayout } = view;
  const snapshot = useSyncExternalStore(models.subscribe, models.getSnapshot);
  const panelRef = useRef(null);
  const initialConfig = useRef(null);
  const fallbackConfig = useRef({
    ...initialConfigForProvider("deepseek"),
  });
  if (!initialConfig.current && snapshot.status === "ready") initialConfig.current = snapshot.configs[0] || fallbackConfig.current;
  if (!initialConfig.current) return renderLayout({
    sidePanel: null,
    mainPanel: <div role={snapshot.status === "error" ? "alert" : "status"}>{snapshot.error || tUi("正在加载模型配置…")}</div>,
  });
  const config = initialConfig.current || fallbackConfig.current;
  return <ModelConfigPanel
    ref={panelRef}
    navigationGuardRef={modelNavigationGuardRef}
    config={config}
    configs={snapshot.configs}
    providers={snapshot.providers || []}
    modelOptionsByKey={chat.modelOptionsByKey}
    onSave={draft => models.save(draft)}
    onRevealApiKey={id => models.revealApiKey(id)}
    onDeleteConfig={id => models.deleteConfig(id)}
    onFetchModels={draft => models.discover(draft)}
    onNotify={chat.notify}
    renderLayout={renderLayout}
  />;
}
