import { IconFlatListOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { MobileBackIcon } from './MobileIcons.jsx';

/** Navigation shares the native Workspace header's leading slot. */
export function MobileWorkspaceControls() {
  const view = useMainPageView();
  return <div className="mobile-workspace-controls">
    <button type="button" aria-label="返回" onClick={() => { if (!view.goBack()) view.selectPanel('messages'); }}><MobileBackIcon /></button>
    <button type="button" aria-label="打开工作区侧边栏" onClick={view.openWorkspaceDrawer}><IconFlatListOutlineRegular size={20} /></button>
  </div>;
}
