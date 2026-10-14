import type { TavernRecord, TavernHelper, SillyTavernApi, TavernSharedState, MessageFormatOptions, TavernId } from './types.js';
export type * from './types.js';

export interface TavernCompatibilityOptions {
  bridge: {
    snapshot(): Promise<TavernRecord>;
    invoke(method: string, params: TavernRecord): Promise<unknown>;
    generate?(params: TavernRecord, signal: AbortSignal): AsyncIterable<TavernRecord>;
  };
  shared?: object;
  context: { conversationId: string; scriptId?: string; messageId?: string; characterId?: string };
  native: {
    request(method: string, params: TavernRecord, options?: { signal?: AbortSignal }): Promise<unknown>;
    subscribe?(event: string, listener: (value: unknown) => void): () => void;
    registerButton?(button: { id: string; label: string; onClick(signal: AbortSignal): void | Promise<void> }): () => void;
  };
  ui?: {
    mediaSrc?(reference: string): string;
    formatMessage(text: string, settings?: MessageFormatOptions): string;
    refreshMessage(id: TavernId, settings?: MessageFormatOptions): void | Promise<void>;
    generationState?(state: { id: string; running: boolean; shouldSilence: boolean; conversationId: string }): void;
  };
  tokens?: { count(text: string): number; encode(text: string, type?: unknown): number[]; decode(tokens: number[], type?: unknown): string; encoding?: string };
  report?(error: unknown): void;
  resourceUrl?: string;
}
export interface TavernCompatibilityController {
  ready: Promise<void>;
  refresh(): Promise<TavernRecord>;
  flush(): Promise<void>;
  dispose(): void;
  readonly helper: TavernHelper | undefined;
  readonly SillyTavern: SillyTavernApi | undefined;
}
export function installTavernCompatibility(view: Window, options: TavernCompatibilityOptions): TavernCompatibilityController;
export function createCompatibilitySharedState(): TavernSharedState;
export const COMPATIBILITY_VERSION: string;
export { variableSchemaRevision, subscribeVariableSchemas, variableSchemaTargets, describeEditingVariableSchema, validateEditingVariables } from './variable-schema.js';
export type { EditingVariableTarget, EditingVariableSchemaDescription } from './variable-schema.js';
