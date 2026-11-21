import { CharacterHome } from "../../../../../apps/web/src/modules/persona/components/CharacterHome.jsx";
import { useMainPageView } from "../../../../../apps/web/src/app/windows/MainPageContext.jsx";
export { PersonNavIcon as NavigationIcon } from "../../../../../apps/web/src/ui/icons/navIcons.jsx";

export function CharacterPage() {
  return <CharacterHome view={useMainPageView()} />;
}
