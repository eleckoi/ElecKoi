import type { GatewayResult } from './gateway/DesktopError'
import type { GatewayEventEnvelope } from './gateway/types'

export interface DesktopBridge {
  request(name: string, input: unknown): Promise<GatewayResult<unknown>>
  subscribe(listener: (event: GatewayEventEnvelope) => void): () => void
}
