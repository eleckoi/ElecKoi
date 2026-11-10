/**
 * 功能内失败面 `FailureAlert`：失败面**同时**给文案与码。
 *
 * 这条用例守四件设计约束（对应 `apps/web/src/utils/failureText.js` 与 ADR 0040 决定 4/8）：
 * 1. 用户话来自码表，码本身**可见**（不藏进 title），详情逐条给出；
 * 2. 认不出的码落通用句，但**原码仍可见**（不吞证据）；
 * 3. 通道默认由码给，调用点**只能上调**，没有下调的位置；
 * 4. 调用点可以把失败对象直接存进状态（不转成字符串），渲染时交给组件。
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { FailureAlert } from '../../src/ui/ui/FailureAlert.jsx';
import { FAILURE_CHANNELS, GENERIC_FAILURE_TEXT, resolveFailure } from '../../src/utils/failureText.js';

function render(props) {
  return renderToStaticMarkup(<FailureAlert {...props} />);
}

describe('失败面同时给出文案与码', () => {
  it('网关原始诊断和端点直接可见，通用句不覆盖原始信息', () => {
    const html = render({ failure: { isDSHRemoteError: true, code: 'gateway/service-unavailable',
      message: 'active Service "synthetic-studio" is unavailable', details: { endpoint: 'creatorStudio.open' } } });
    expect(html).toContain(GENERIC_FAILURE_TEXT);
    expect(html).toContain('gateway/service-unavailable');
    expect(html).toContain('active Service &quot;synthetic-studio&quot; is unavailable');
    expect(html).toContain('creatorStudio.open');
    expect(html).toContain('failure-alert-diagnostic');
  });

  it('用户话与错误码一起出现在同一个 alert 里', () => {
    const html = render({
      failure: new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, '写文件失败：/tmp/卡.json', { operation: 'write', path: '/tmp/卡.json' }),
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('保存失败：/tmp/卡.json。');
    expect(html).toContain(ELECKOI_FAILURE_CODES.ioFailed);
    expect(html).toContain('data-failure-code="eleckoi/io/failed"');
    // 码在正文里、可选中复制，不是 title 里的提示。
    expect(html).toContain('class="failure-alert-code"');
    expect(html).not.toContain('title="eleckoi/io/failed"');
    // 参数化详情逐条给出（与 AppErrorDialog 同一口径）。
    expect(html).toContain('<dt>operation</dt><dd>write</dd>');
    expect(html).toContain('<dt>path</dt><dd>/tmp/卡.json</dd>');
  });

  it('已经是 resolveFailure 结果时原样呈现（调用点把失败对象存进状态即可）', () => {
    const stored = resolveFailure(new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这个角色卡：character-a', { what: '角色卡' }));
    const html = render({ failure: stored });

    expect(html).toContain('找不到角色卡。');
    expect(html).toContain(ELECKOI_FAILURE_CODES.lookupNotFound);
    expect(html).toContain('data-failure-channel="inline"');
  });

  it('认不出的码落通用句，原码仍可见', () => {
    const html = render({
      failure: { isDSHRemoteError: true, code: 'eleckoi/未来才有的码', message: '开发者诊断：这里写技术细节', details: {} },
    });

    expect(html).toContain(GENERIC_FAILURE_TEXT);
    // 折叠后的兜底码与原码都在：一个给用户定位，一个给维护者回查。
    expect(html).toContain(ELECKOI_FAILURE_CODES.internal);
    expect(html).toContain('eleckoi/未来才有的码');
  });

  it('裸字符串失败也给出一句话与兜底码，不吞原句', () => {
    const html = render({ failure: '网络断了' });

    expect(html).toContain('网络断了');
    expect(html).toContain(ELECKOI_FAILURE_CODES.internal);
  });

  it('context 只在失败本身给不出说法时兜底（不替代码表文案）', () => {
    expect(render({ failure: null, context: '保存失败' })).toBe('');
    expect(render({ failure: '磁盘满了', context: '保存失败' })).toContain('磁盘满了');
    expect(render({ failure: '磁盘满了', context: '保存失败' })).not.toContain('保存失败');
  });
});

describe('通道只上不下', () => {
  it('按码给默认通道：普通码功能内，应用级码应用级', () => {
    expect(render({ failure: new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, '读取失败', {}) }))
      .toContain('data-failure-channel="inline"');
    expect(render({ failure: new DesktopError(ELECKOI_FAILURE_CODES.pluginLoadFailed, '插件没起来', {}) }))
      .toContain('data-failure-channel="app"');
  });

  it('调用点可以上调到应用级', () => {
    const html = render({ failure: new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, '读取失败', {}), upgradeTo: FAILURE_CHANNELS.app });

    expect(html).toContain('data-failure-channel="app"');
    expect(html).toContain('failure-alert is-app-level');
  });

  it('不接受下调：应用级码传 inline 仍是应用级', () => {
    const html = render({ failure: new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '库坏了', {}), upgradeTo: FAILURE_CHANNELS.inline });

    expect(html).toContain('data-failure-channel="app"');
  });
});

describe('重试与空值', () => {
  it('给了 onRetry 才出重试按钮', () => {
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed, '网络失败', { what: '模型列表' });

    expect(render({ failure })).not.toContain('重试</button>');
    expect(render({ failure, onRetry: vi.fn() })).toContain('重试</button>');
  });

  it('没有失败时什么都不渲染（调用点可以不写条件）', () => {
    for (const value of [null, undefined, '  ']) {
      expect(render({ failure: value })).toBe('');
    }
  });

  it('调用点的版式类原样保留', () => {
    const html = render({ failure: '打开文件失败', className: 'chat-file-error' });

    expect(html).toContain('failure-alert chat-file-error');
  });
});
