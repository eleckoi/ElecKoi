import {
  eventContracts,
  requestContracts,
  type EventName,
  type RequestName
} from '@shared/contracts/gateway/definitions'
import type {
  EventPayload,
  RequestInput,
  RequestOutput
} from '@shared/contracts/gateway/types'

export class DesktopRequestError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'DesktopRequestError'
  }
}

function unwrap<T>(result: Awaited<ReturnType<typeof window.eleckoi.request>>): T {
  if (!result.ok) throw new DesktopRequestError(result.error.code, result.error.message, result.error.details)
  return result.data as T
}

export const desktopClient = {
  async request<TName extends RequestName>(
    name: TName,
    input: RequestInput<TName>
  ): Promise<RequestOutput<TName>> {
    const contract = requestContracts[name]
    const inputResult = contract.input.safeParse(input)
    if (!inputResult.success) {
      throw new DesktopRequestError(
        'INVALID_REQUEST',
        '客户端提交的数据格式不正确。',
        inputResult.error.issues
      )
    }
    const result = await window.eleckoi.request(name, inputResult.data)
    const outputResult = contract.output.safeParse(unwrap<unknown>(result))
    if (!outputResult.success) {
      throw new DesktopRequestError(
        'INTERNAL',
        '桌面端返回的数据格式不正确。',
        outputResult.error.issues
      )
    }
    return outputResult.data as RequestOutput<TName>
  },

  on<TName extends EventName>(name: TName, listener: (payload: EventPayload<TName>) => void): () => void {
    return window.eleckoi.subscribe((event) => {
      if (event.name !== name) return
      const contract = eventContracts[name]
      listener(contract.parse(event.payload) as EventPayload<TName>)
    })
  }
}
