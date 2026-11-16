import { PresetProvider } from "../../../../../apps/web/src/modules/presets/components/PresetContext.jsx";
import { PresetListPanel } from "../../../../../apps/web/src/modules/presets/components/PresetListPanel.jsx";
import { PresetOverview } from "../../../../../apps/web/src/modules/presets/components/PresetOverview.jsx";
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
