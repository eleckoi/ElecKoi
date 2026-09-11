import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import type { ZodType } from 'zod'
import { assertTrustedRenderer } from '@main/platform/electron/validateSender'
import { DESKTOP_EVENT_CHANNEL, DESKTOP_REQUEST_CHANNEL } from '@shared/contracts/gateway/channels'
import {
  eventContracts,
  requestContracts,
  type EventName,
  type RequestName
} from '@shared/contracts/gateway/definitions'
import {
  DesktopError,
  DESKTOP_ERROR_CODES
} from '@shared/contracts/gateway/DesktopError'
import type {
  EventPayload,
  GatewayEventEnvelope,
  GatewayRequestEnvelope,
  RequestContext,
  RequestHandler
} from '@shared/contracts/gateway/types'
import { failure, success } from '@shared/foundation/result'

type RuntimeContract = { input: ZodType; output: ZodType }
type RuntimeHandler = (input: unknown, context: RequestContext) => unknown | Promise<unknown>

export class DesktopGateway {
  private readonly handlers = new Map<RequestName, RuntimeHandler>()
  private started = false

  start(): void {
    if (this.started) return
    ipcMain.handle(DESKTOP_REQUEST_CHANNEL, async (event, envelope: GatewayRequestEnvelope) => {
      try {
        assertTrustedRenderer(event.sender)
        const window = BrowserWindow.fromWebContents(event.sender)
        const output = await this.dispatch(envelope, {
          senderId: event.sender.id,
          windowId: window?.id
        })
        return success(output)
      } catch (error) {
        return failure(error)
      }
    })
    this.started = true
  }

  register<TName extends RequestName>(name: TName, handler: RequestHandler<TName>): () => void {
    if (this.handlers.has(name)) throw new Error(`Desktop Gateway 路由重复注册：${name}`)
    this.handlers.set(name, handler as RuntimeHandler)
    return () => {
      if (this.handlers.get(name) === handler) this.handlers.delete(name)
    }
  }

  async dispatch(envelope: GatewayRequestEnvelope, context: RequestContext): Promise<unknown> {
    const name = envelope.name as RequestName
    const contract = (requestContracts as Record<string, RuntimeContract>)[name]
    const handler = this.handlers.get(name)
    if (contract === undefined || handler === undefined) {
      throw new DesktopError(DESKTOP_ERROR_CODES.NOT_FOUND, `Desktop Gateway 路由不存在：${envelope.name}`)
    }
    const inputResult = contract.input.safeParse(envelope.input)
    if (!inputResult.success) {
      throw new DesktopError(
        DESKTOP_ERROR_CODES.INVALID_REQUEST,
        '客户端提交的数据格式不正确。',
        inputResult.error.issues
      )
    }
    const outputResult = contract.output.safeParse(await handler(inputResult.data, context))
    if (!outputResult.success) {
      throw new DesktopError(
        DESKTOP_ERROR_CODES.INTERNAL,
        '桌面端返回的数据格式不正确。',
        outputResult.error.issues
      )
    }
    return outputResult.data
  }

  broadcast<TName extends EventName>(name: TName, payload: EventPayload<TName>): void {
    const parsed = eventContracts[name].parse(payload)
    const envelope: GatewayEventEnvelope = { name, payload: parsed }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_EVENT_CHANNEL, envelope)
    }
  }

  send<TName extends EventName>(target: WebContents, name: TName, payload: EventPayload<TName>): void {
    const parsed = eventContracts[name].parse(payload)
    target.send(DESKTOP_EVENT_CHANNEL, { name, payload: parsed } satisfies GatewayEventEnvelope)
  }

  dispose(): void {
    if (this.started) ipcMain.removeHandler(DESKTOP_REQUEST_CHANNEL)
    this.handlers.clear()
    this.started = false
  }
}
