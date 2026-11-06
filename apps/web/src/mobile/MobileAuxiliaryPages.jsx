import { useState } from 'react';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
export { MobileCreatorStudioPage as MobileCreatorPage } from './MobileCreatorStudioPage.jsx';
import { CommunityDialog } from '../app/windows/shell/components/CommunityDialog.jsx';
import { BugReportDialog } from '../app/windows/shell/components/BugReportDialog.jsx';
import { isBugReportAvailable } from '../app/windows/shell/components/bugReportBridge.js';
import { MobileHeader } from './MobileChrome.jsx';

export function MobileCommunityPage() {
  const view = useMainPageView();
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <div className="mobile-root-page">
      <MobileHeader title="社区" />
      <CommunityDialog
        open={!reportOpen}
        onClose={() => view.selectPanel('messages')}
        onNotify={view.chat.notify}
        onReportProblem={isBugReportAvailable() ? () => setReportOpen(true) : undefined}
      />
      <BugReportDialog open={reportOpen} onClose={() => setReportOpen(false)} onNotify={view.chat.notify} />
    </div>
  );
}
