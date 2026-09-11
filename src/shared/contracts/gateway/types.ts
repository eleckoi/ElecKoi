import type { z, ZodType } from 'zod'
import type { EventContracts, EventName, RequestContracts, RequestName } from './definitions'

type ContractAt<TName extends RequestName> = RequestContracts[TName]

export type RequestInput<TName extends RequestName> =
  ContractAt<TName> extends { input: ZodType } ? z.input<ContractAt<TName>['input']> : never

export type RequestOutput<TName extends RequestName> =
  ContractAt<TName> extends { output: ZodType } ? z.output<ContractAt<TName>['output']> : never

export type EventPayload<TName extends EventName> = z.output<EventContracts[TName]>

export interface GatewayRequestEnvelope {
  name: string
  input: unknown
}

export interface GatewayEventEnvelope {
  name: string
  payload: unknown
}

export interface RequestContext {
  senderId: number
  windowId: number | undefined
}

export type RequestHandler<TName extends RequestName> = (
  input: RequestInput<TName>,
  context: RequestContext
) => RequestOutput<TName> | Promise<RequestOutput<TName>>
