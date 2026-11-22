import type { Context } from '@deepseek-ai/cordis'

/** Imported HTML presentation resources; no author or script execution API. */
export interface ElecKoiHtmlResources {
  /**
   * Read presentation resource availability.
   * @returns The resource readiness state and its error text.
   */
  getSnapshot(): { status: 'ready'; error: string }
  /**
   * Subscribe to resource availability changes.
   * @param listener - Called when the resource state changes.
   * @returns Stops this subscription.
   */
  subscribe(listener: () => void): () => void
}
declare module '@deepseek-ai/cordis' { interface Context { eleckoiHtmlResources: ElecKoiHtmlResources } }
export declare function apply(ctx: Context): void
