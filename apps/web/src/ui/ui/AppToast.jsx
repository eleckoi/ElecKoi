import React from 'react';
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { AppErrorDialog } from './AppErrorDialog.jsx';

export function AppToast({ notice, onDismiss, onReportProblem }) {
  if (!notice?.message) return null;
  if (notice.type === 'error') return <AppErrorDialog key={notice.id} notice={notice} onDismiss={onDismiss} onReportProblem={onReportProblem} />;
  return <Toast key={notice.id} text={notice.message} tone={notice.type === 'success' ? 'success' : undefined} onDone={() => onDismiss?.()} />;
}
