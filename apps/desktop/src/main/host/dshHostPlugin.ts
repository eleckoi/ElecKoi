import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { app, session } from 'electron'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { DshDesktopPluginHost, resolveDshWebFrontendDirectory } from '@eleckoi/desktop-host'
import { resolveDshSystemProxyEnvironment } from '@main/platform/electron/systemProxy'

const require = createRequire(import.meta.url)

/**
 * 从任意抛出值里按形状读契约码。
 * 不用 `instanceof DesktopError`：这个类会被打进 `@eleckoi/desktop-host` 的 bundle 副本。
 * @param value - 被捕获的任意抛出。 @returns 码，或 `undefined`。
 */
function failureCodeOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const code = (value as { readonly code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/**
 * 按形状读契约详情（只接受非数组对象，与 `foldFailure` 同一条规矩）。
 * @param value - 被捕获的任意抛出。 @returns 扁平详情对象，或 `undefined`。
 */
function failureDetailsOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const details = (value as { readonly details?: unknown }).details
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return undefined
  return details as Record<string, unknown>
}

export const dshHostPlugin = {
  name: 'eleckoi-dsh-host',
  inject: ['appPaths', 'appLog'],
  provide: 'pluginHost',
  apply(ctx: Context) {
    const failureListeners = new Set<(error: Error) => void>()
    const packageManager = app.isPackaged
      ? {
          entryPath: join(process.resourcesPath, 'dsh', 'pnpm', 'bin', 'pnpm.mjs'),
          nodeBinPath: join(process.resourcesPath, 'dsh', 'node-bin')
        }
      : {
          entryPath: join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs'),
          nodeBinPath: ctx.appPaths.resolveResource('dsh', 'node-bin')
        }
    const host = new DshDesktopPluginHost({
      runtimeDataRoot: ctx.appPaths.dshRuntime,
      workspaceRoot: ctx.appPaths.workspace,
      productDatabasePath: ctx.appPaths.database,
      productMediaRoot: ctx.appPaths.media,
      presetTemplatePath: ctx.appPaths.resolveResource('dsh', 'agent-preset-template', 'agent.cordis.yml'),
      agentPatchPath: ctx.appPaths.resolveResource('dsh', 'desktop-agent.patch.yml'),
      executablePath: process.execPath,
      packageManager,
      // 子进程的 stdout/stderr 以前被完全丢掉（`onDiagnostic` 没人传），唯一能看到的诊断就没了。
      // 这里接进主进程日志；行前缀是给 grep 用的固定标记，不是用户文案。
      onDiagnostic(message) {
        const line = message.trim()
        if (line !== '') ctx.appLog.info({ source: 'dsh-plugin-host' }, line)
      },
      onFailure(error) {
        // 边界③ 已经把子进程的失败折成契约形态（码 + 详情 + 子进程栈），这里只负责记录与转发。
        // pino 只认 `err` 这个键；写成 `error` 会丢掉栈。
        ctx.appLog.error({ err: error, code: failureCodeOf(error), details: failureDetailsOf(error) }, 'DSH 插件宿主意外退出')
        for (const listener of failureListeners) listener(error)
        ctx.emit('eleckoi/desktop-fatal', error)
      }
    })
    ctx.provide('pluginHost', {
      async start() {
        const proxyEnvironment = await resolveDshSystemProxyEnvironment(
          url => session.defaultSession.resolveProxy(url),
          process.env,
          message => ctx.appLog.warn(message)
        )
        return host.start(proxyEnvironment)
      },
      frontendDirectory: resolveDshWebFrontendDirectory,
      updateTasks: (action) => host.updateTasks(action),
      resolveDragResource: (address, signal) => host.resolveDragResource(address, signal),
      close: (requireClean) => host.close(requireClean),
      disableUserPlugins: () => host.disableUserPlugins(),
      onFailure(listener) {
        failureListeners.add(listener)
        return () => { failureListeners.delete(listener) }
      }
    })
    return () => host.close()
  }
} satisfies Plugin.Object
