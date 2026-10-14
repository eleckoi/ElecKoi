/** The helper preserves the concrete event type and identity supplied by its caller. */
export declare function assistantContinuationSuffixEvents<TEvent extends {
  readonly type: string
  readonly data: unknown
  readonly surfaceOp?: unknown
}>(events: readonly TEvent[], rootId: unknown): TEvent[]
