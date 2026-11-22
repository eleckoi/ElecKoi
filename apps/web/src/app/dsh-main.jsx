import '@deepseek-ai/dsh-client-ui-sidebar/client';
import App from './windows/App.jsx';
import { OfficialFramePage } from './windows/shell/components/OfficialFramePage.jsx';
import { OfficialFrameSidebar } from './windows/shell/components/OfficialFrameSidebar.jsx';
import { SettingsPageLoader } from './windows/shell/components/SettingsPageLoader.jsx';
import { CreatorStudioNavIcon, CommunityNavIcon } from '../ui/icons/navIcons.jsx';
import { ElecKoiWordmark } from '../ui/icons/ElecKoiWordmark.jsx';
import logoIcon from '../assets/eleckoi-app-icon.png';
import { initRendererAssets } from './services/assets.js';
import { installResizePerformanceMode } from './services/windowControls.js';
import { initializeAppearanceMode } from '../modules/appearance/index.js';
import { installUnhandledFailureReporting } from '../utils/failureText.js';
import './windows/styles/index.css';

// 主窗口（DSH 页面）的未处理拒绝落点：`reportFailure` 只 console.error，由 mainWindowPlugin
// 的 console-message 桥转发进主进程日志；不需要新开 IPC 通道。
installUnhandledFailureReporting();
installResizePerformanceMode();

function SidebarBrandMark({ size = 24 }) {
  return <img src={logoIcon} width={size} height={size} alt="" draggable="false" />;
}

Promise.all([initRendererAssets(), initializeAppearanceMode()]).then(() => {
  globalThis.__ELECKOI_DSH_APP__ = Object.assign(App, {
    shell: {
      OfficialFramePage, OfficialFrameSidebar, SidebarBrandMark, SidebarBrandName: ElecKoiWordmark,
      CreatorStudioNavigationIcon: CreatorStudioNavIcon, CommunityNavigationIcon: CommunityNavIcon,
      SettingsPage: SettingsPageLoader,
    },
  });
  globalThis.dispatchEvent(new Event('eleckoi:dsh-app-ready'));
}).catch((error) => {
  globalThis.dispatchEvent(new CustomEvent('eleckoi:dsh-app-failed', {
    detail: error instanceof Error ? error.message : String(error)
  }));
});
