import { PresetListPanel, PresetProvider, PresetOverview } from "../../../../../apps/web/src/modules/presets/index.js";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
export { PresetNavIcon as NavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function PresetsPage() {
  const view = useMainPageView();
  const { presets, presetNavigationGuardRef, presetRequestedTab, setPresetRequestedTab, renderLayout } = view;
  return <PresetProvider catalogModel={presets} navigationGuardRef={presetNavigationGuardRef}>
    {renderLayout({
      sidePanel: <PresetListPanel />,
      mainPanel: <PresetOverview
        requestedTab={presetRequestedTab}
        onRequestedTabHandled={() => setPresetRequestedTab("")}
      />,
    })}
  </PresetProvider>;
}
