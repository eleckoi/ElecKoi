// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileSaveFeedback } from '../../src/mobile/MobileSaveFeedback.jsx';
import { AppToast } from '../../src/ui/ui/AppToast.jsx';

vi.mock('../../src/ui/icons/index.jsx', async () => {
  const { createElement } = await import('react');
  const Icon = () => createElement('svg', { 'aria-hidden': true });
  return { CopyIcon: Icon, XIcon: Icon };
});

let root, container, notifications;
function Harness(props) {
  const [notice, setNotice] = useState(null);
  const notify = (type, message) => {
    notifications(type, message);
    setNotice({ id: notifications.mock.calls.length, type, message });
  };
  return <><header><MobileSaveFeedback {...props} onNotify={notify} /><button>保存</button></header>
    <AppToast notice={notice} onDismiss={() => setNotice(null)} /></>;
}
const render = async props => act(async () => root.render(<Harness {...props} />));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  notifications = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Android unified save notifications', () => {
  it('uses the existing success toast without adding anything next to the save button', async () => {
    await render({ notice: 'saved', successMessage: '角色配置已保存' });
    expect(container.querySelector('header').textContent).toBe('保存');
    expect(document.querySelector('[role=alert] [aria-hidden=true]')).not.toBeNull();
    expect(document.querySelector('[role=alert]').textContent).toBe('角色配置已保存');
    expect(notifications).toHaveBeenCalledExactlyOnceWith('success', '角色配置已保存');
  });

  it('does not repeat a saved notification on unrelated rerenders but notifies for the next save', async () => {
    await render({ notice: 'saved' });
    await render({ notice: 'saved' });
    expect(notifications).toHaveBeenCalledTimes(1);
    await render({ notice: '' });
    await render({ notice: 'saved' });
    expect(notifications).toHaveBeenCalledTimes(2);
  });

  it('preserves the complete error through the same notification path and respects dismissal', async () => {
    const error = '合成保存失败\nHTTP 503：合成服务不可用';
    await render({ error, notice: 'saved' });
    expect(notifications).toHaveBeenCalledExactlyOnceWith('error', error);
    expect(container.querySelector('header').textContent).toBe('保存');
    expect(document.querySelector('.app-error-detail').textContent).toBe(error);
    expect(document.querySelector('[role=alert]')).toBeNull();
    await act(async () => document.querySelector('[aria-label="关闭错误详情"]').click());
    await render({ error, notice: 'saved' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(notifications).toHaveBeenCalledTimes(1);
  });
});
