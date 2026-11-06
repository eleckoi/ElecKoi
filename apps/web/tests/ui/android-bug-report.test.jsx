// @vitest-environment jsdom
/**
 * Android 报告桥（ADR 0042 决定 8：字段、主题、脱敏规则一致，实现各自写）。
 *
 * 判据：Android 只给「原始事实」，报告在渲染层用共享契约拼——所以这里断言两件事：
 *
 * 1. 运行诊断里的失败记录被改写成契约能折叠的形状（`phase: 'failure'` + 码 + 诊断），
 *    其余记录只进日志尾、不冒充失败；
 * 2. 预览能把事实拼成一份合法 `BugReport`，且代发通道在 Android 上不存在（没配就不显示按钮）。
 */
import { describe, expect, it, vi } from "vitest";
import { buildBugReportFormUrl } from "@shared/contracts/bugReport/form";
import { isBugReport } from "@shared/contracts/bugReport/report";
import { buildBugReport } from "@shared/foundation/bugReport";
import { androidReportLines, bugReportBridge, isBugReportAvailable } from "../../src/app/windows/shell/components/bugReportBridge.js";

const ENVIRONMENT = {
  appVersion: "0.2.13",
  platform: "android",
  arch: "arm64-v8a",
  osVersion: "Android 15",
  runtime: "GeckoView / SDK 35",
};

const SESSION = { startedAt: "2026-10-27T09:00:00.000Z", ended: false };

function installPlatform(facts) {
  window.ElecKoiPlatform = {
    bugReport: { facts: async () => facts },
    saveText: async (name) => ({ result: name, cancelled: false }),
    openExternal: async () => undefined,
  };
}

describe("Android 诊断事件 → 报告日志行", () => {
  it("失败记录改写成契约形状，其余原样保留", () => {
    const lines = androidReportLines([
      JSON.stringify({ kind: "session", stage: "started" }),
      JSON.stringify({ kind: "java-uncaught", message: "空指针", stack: "at a\nat b" }),
      JSON.stringify({ kind: "memory", heapBytes: 1024 }),
      "not json",
    ]);
    const parsed = lines.map(line => JSON.parse(line));
    expect(parsed[0]).toEqual({ kind: "session", stage: "started" });
    expect(parsed[1]).toMatchObject({ phase: "failure", code: "eleckoi/android/java-uncaught", msg: "空指针" });
    expect(parsed[2]).toEqual({ kind: "memory", heapBytes: 1024 });
    expect(lines).toHaveLength(3);
  });

  it("没有 message 时退到栈顶或种类名", () => {
    const [line] = androidReportLines([JSON.stringify({ kind: "native-crash", stack: "fatal 第一行\n第二行" })]);
    expect(JSON.parse(line).msg).toBe("fatal 第一行");
    const [fallback] = androidReportLines([JSON.stringify({ kind: "bridge-timeout" })]);
    expect(JSON.parse(fallback).msg).toBe("bridge-timeout");
  });

  it("level 为 error 的普通记录也算失败", () => {
    const [line] = androidReportLines([JSON.stringify({ kind: "renderer-log", level: "error", message: "炸了" })]);
    expect(JSON.parse(line).phase).toBe("failure");
  });
});

describe("Android 报告桥", () => {
  it("没有平台桥时不可用", () => {
    delete window.ElecKoiPlatform;
    expect(isBugReportAvailable()).toBe(false);
    expect(bugReportBridge()).toBeUndefined();
  });

  it("预览把事实拼成合法报告，且没有代发通道", async () => {
    installPlatform({
      available: true,
      environment: ENVIRONMENT,
      session: SESSION,
      events: [JSON.stringify({ kind: "java-uncaught", message: "空指针" })],
      delivery: { mailbox: "", repository: "" },
    });
    const bridge = bugReportBridge();
    expect(bridge).toBeDefined();
    const preview = await bridge.preview({ includeLogTail: false });
    expect(isBugReport(preview.report)).toBe(true);
    expect(preview.report.environment.platform).toBe("android");
    expect(preview.report.failures[0]?.code).toBe("eleckoi/android/java-uncaught");
    expect(preview.report.session.ended).toBe(false);
    expect(preview.delivery.relay).toBeUndefined();
  });

  it("诊断没开启时说清原因，不假装有报告", async () => {
    installPlatform({ available: false });
    await expect(bugReportBridge().preview({ includeLogTail: false })).rejects.toMatchObject({
      code: "eleckoi/lifecycle/not-ready",
    });
  });

  it("导出走平台的 saveText，返回是否保存", async () => {
    installPlatform({
      available: true,
      environment: ENVIRONMENT,
      session: SESSION,
      events: [],
      delivery: { mailbox: "", repository: "" },
    });
    const result = await bugReportBridge().export({});
    expect(result.saved).toBe(true);
    expect(result.path).toMatch(/^eleckoi-report-\d{8}-\d{6}\.json$/);
  });

  /**
   * Testing Decisions 第 5 条：Android 桥与桌面桥给出**同形**的预览结果。
   *
   * 桌面侧在这里是桩（真实收集在主进程，`apps/desktop/tests/bug-report-collection.test.ts`
   * 守着）：等价输入下两边都必须是 `{ report, delivery }`，`report` 过 `isBugReport`，
   * `delivery` 的键集合相同，且都能直接喂给 `buildBugReportFormUrl` 产出表单链接。
   * 用假时钟钉住 `generatedAt`，这样两边拼出来的链接必须逐字相同。
   */
  it("Android 桥与桌面桥给出同形的预览", async () => {
    const FORM = {
      shareUrl: "https://example.feishu.cn/share/base/form/shrcSyntheticForm",
      fields: { body: "report_body", meta: "report_meta", code: "report_code", file: "report_file" },
    };
    const DELIVERY = { mailbox: "reports@example.com", repository: "", form: FORM };
    const events = [
      JSON.stringify({ kind: "java-uncaught", message: "空指针" }),
      JSON.stringify({ kind: "session", stage: "started" }),
    ];
    installPlatform({ available: true, environment: ENVIRONMENT, session: SESSION, events, delivery: DELIVERY });

    vi.useFakeTimers({ now: new Date("2026-10-29T08:00:00.000Z") });
    try {
      const androidPreview = await bugReportBridge().preview({ includeLogTail: true });

      // 桌面桥的桩：主进程把已脱敏的报告与通道配置原样送过来。
      window.dshDesktop = {
        bugReport: {
          preview: async () => ({
            report: buildBugReport({
              lines: androidReportLines(events),
              environment: ENVIRONMENT,
              session: SESSION,
              includeLogTail: true,
            }),
            delivery: DELIVERY,
          }),
        },
      };
      const desktopPreview = await bugReportBridge().preview({ includeLogTail: true });

      expect(Object.keys(androidPreview).sort()).toEqual(["delivery", "report"]);
      expect(Object.keys(desktopPreview).sort()).toEqual(Object.keys(androidPreview).sort());
      expect(isBugReport(androidPreview.report)).toBe(true);
      expect(isBugReport(desktopPreview.report)).toBe(true);
      expect(Object.keys(androidPreview.delivery).sort()).toEqual(Object.keys(desktopPreview.delivery).sort());

      const androidUrl = buildBugReportFormUrl(androidPreview.report, FORM);
      const desktopUrl = buildBugReportFormUrl(desktopPreview.report, FORM);
      expect(androidUrl).toBeDefined();
      expect(desktopUrl?.url).toBe(androidUrl.url);
      expect(androidUrl.reasons).toEqual([]);
    } finally {
      vi.useRealTimers();
      delete window.dshDesktop;
      delete window.ElecKoiPlatform;
    }
  });
});
