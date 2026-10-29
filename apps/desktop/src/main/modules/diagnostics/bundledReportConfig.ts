/**
 * 找到并读取随应用打包的投递配置文件——胶水层，不单测（由主进程接线间接覆盖）。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 12 / 16）：内置配置**永不抛**，
 * 读不到就是「未配置」，报告功能照常起来（只是没有表单按钮）。
 *
 * 两个候选路径，第一个能读到的赢：
 *
 * 1. `app.getAppPath()/resources/bug-report.json`——开发态即 `apps/desktop/resources/…`；打包态这张
 *    路径在 asar 里，Electron 的 `fs` 能透读。
 * 2. `process.resourcesPath/bug-report.json`——将来若改用 `extraResources` 部署，文件在这里。
 *
 * **不用** `appPaths.resolveResource()`：它找不到会抛 `lookupNotFound`，与「永不抛」直接冲突，
 * 所以这里自己探存在性。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { BugReportDeliveryConfig } from '@shared/contracts/bugReport/delivery'
import { BUG_REPORT_CONFIG_FILE_NAME, parseBugReportConfig } from './reportConfig'

/**
 * 读内置配置文件的原文。
 *
 * @returns 文件内容；两个候选都读不到（或读失败）时 `undefined`。**永不抛。**
 */
export function readBundledReportConfigText(): string | undefined {
  for (const candidate of candidatePaths()) {
    const text = readText(candidate)
    if (text !== undefined) return text
  }
  return undefined
}

/**
 * 内置配置 + 环境变量 → 投递配置。
 *
 * @param environment - 环境变量（缺省 `process.env`；用例可传固定值）。
 * @returns 投递配置。**永不抛**：配置坏了就按「未配置」降级。
 */
export function readReportConfig(
  environment: NodeJS.ProcessEnv = process.env
): BugReportDeliveryConfig {
  return parseBugReportConfig({ fileText: readBundledReportConfigText(), environment })
}

/** 候选路径，按优先级。 */
function candidatePaths(): readonly string[] {
  return [
    join(app.getAppPath(), 'resources', BUG_REPORT_CONFIG_FILE_NAME),
    join(process.resourcesPath, BUG_REPORT_CONFIG_FILE_NAME)
  ]
}

/** 读一个候选文件；不存在或读失败都返回 `undefined`——配置读不了不该是启动失败的原因。 */
function readText(path: string): string | undefined {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined
  } catch {
    return undefined
  }
}
