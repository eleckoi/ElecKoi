export interface TokenizerDescriptor {
  filename: string; kind: 'sentencepiece' | 'json'; source: string; sha256: string; bytes: number;
  license: string; licenseSource: string; modelSource: string;
}
export interface NativeTokenCodec {
  encoding: string;
  count(text: string): number;
  encode(text: string, type?: string | number, allowed?: string[] | 'all', disallowed?: string[] | 'all'): number[];
  decode(tokens: number[], type?: string | number): string;
}
export interface NativeTokenizerRegistry {
  readonly names: readonly string[];
  prepare(model?: string, requested?: string | number): Promise<string>;
  prepareAll(): Promise<string[]>;
  forModel(model?: string, requested?: string | number): NativeTokenCodec;
  registerVocabulary(name: string, descriptor: { kind: 'sentencepiece' | 'json'; data: ArrayBuffer | Uint8Array; source?: string; license?: string }): Promise<string>;
  unregisterVocabulary(name: string): boolean;
  dispose(): void;
}
export const TOKENIZER_NAMES: readonly string[];
export function remoteTokenizerRequest(kind: 'remote-textgenerationwebui' | 'remote-kobold', params: { operation: 'count' | 'encode' | 'decode'; text?: string; url?: string; model?: string; apiType?: string; headers?: Record<string, string>; [key: string]: unknown }, transport?: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>): Promise<number | number[]>;
export const TOKENIZER_MODELS: Readonly<Record<string, TokenizerDescriptor>>;
export function resolveTokenizerEncoding(model?: string, requested?: string | number): string;
export function createTokenizerRegistry(loadModel: (name: string, descriptor: TokenizerDescriptor) => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>): NativeTokenizerRegistry;
