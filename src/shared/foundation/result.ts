import {
  DesktopError,
  DESKTOP_ERROR_CODES,
  type GatewayResult
} from '../contracts/gateway/DesktopError'

export function success<T>(data: T): GatewayResult<T> {
  return { ok: true, data }
}

export function failure(error: unknown): GatewayResult<never> {
  if (error instanceof DesktopError) return { ok: false, error: error.serialize() }
  return {
    ok: false,
    error: {
      code: DESKTOP_ERROR_CODES.INTERNAL,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
