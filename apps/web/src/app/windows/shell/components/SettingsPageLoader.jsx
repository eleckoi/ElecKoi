import { useEffect, useState } from 'react';
import { useProductTranslation } from '../../../i18n/ProductLocaleContext.jsx';
import { FailureAlert } from '../../../../ui/ui/FailureAlert.jsx';

let retryNumber = 0;

async function loadSettingsPage(getUrl, attempt) {
  const url = new URL(getUrl());
  // The module cache can retain a failed import for the life of the document.
  if (attempt) url.searchParams.set('retry', String(attempt));
  return (await import(/* @vite-ignore */ url.href)).SettingsPage;
}

export function SettingsPageLoader({ getUrl }) {
  const tUi = useProductTranslation();
  const [attempt, setAttempt] = useState(0);
  const [Page, setPage] = useState(null);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    let disposed = false;
    loadSettingsPage(getUrl, attempt).then(page => {
      if (!disposed) setPage(() => page);
    }, error => {
      if (!disposed) setFailure(error);
    });
    return () => { disposed = true; };
  }, [getUrl, attempt]);

  if (Page) return <Page />;
  if (failure) return <FailureAlert failure={failure} context={tUi("页面加载失败")} onRetry={() => {
    setFailure(null);
    setAttempt(++retryNumber);
  }} />;
  return <div role="status">{tUi("正在加载…")}</div>;
}
