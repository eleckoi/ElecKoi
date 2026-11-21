import { PresetProvider } from "../../../../../apps/web/src/modules/presets/components/PresetContext.jsx";
import { PresetHome } from "../../../../../apps/web/src/modules/presets/components/PresetHome.jsx";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
export { PresetNavIcon as NavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function PresetsPage() {
  const view = useMainPageView();
  const { presets, presetNavigationGuardRef, presetRequestedTab, setPresetRequestedTab, renderLayout } = view;
  return <PresetProvider catalogModel={presets} navigationGuardRef={presetNavigationGuardRef}>
    <PresetHome renderLayout={renderLayout} requestedTab={presetRequestedTab} onRequestedTabHandled={() => setPresetRequestedTab('')} />
  </PresetProvider>;
}
