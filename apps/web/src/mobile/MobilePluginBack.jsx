import { Button, IconChevronLeftOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../app/i18n/ProductLocaleContext.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';

/** Return from the official Plugins overview through the mobile route owner. */
export function MobilePluginBack() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  return <Button variant="ghost" size="sm" className="mobile-plugin-back" aria-label={tUi('返回')}
    onClick={() => { if (!view.goBack()) view.selectPanel('messages'); }}>
    <IconChevronLeftOutlineMedium size={20} aria-hidden="true" />
  </Button>;
}
