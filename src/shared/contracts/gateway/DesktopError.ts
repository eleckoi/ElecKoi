export const DESKTOP_ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RUNTIME_UNAVAILABLE: 'RUNTIME_UNAVAILABLE',
  INTERNAL: 'INTERNAL'
} as const

export type DesktopErrorCode = typeof DESKTOP_ERROR_CODES[keyof typeof DESKTOP_ERROR_CODES]

export interface SerializedDesktopError {
  code: DesktopErrorCode
  message: string
  details?: unknown
}

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SerializedDesktopError }

export class DesktopError extends Error {
  constructor(
    readonly code: DesktopErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'DesktopError'
  }

  serialize(): SerializedDesktopError {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details }
  }
}
