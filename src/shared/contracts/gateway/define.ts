import type { ZodType } from 'zod'

export interface RouteDef<TInput extends ZodType, TOutput extends ZodType> {
  input: TInput
  output: TOutput
}

export function defineRoute<TInput extends ZodType, TOutput extends ZodType>(
  input: TInput,
  output: TOutput
): RouteDef<TInput, TOutput> {
  return { input, output }
}
