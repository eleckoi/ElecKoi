export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Document = Record<string, any>;
export interface ScanSettings {
  scanDepth?: number; recursive?: boolean; maxRecursionSteps?: number; caseSensitive?: boolean;
  matchWholeWords?: boolean; useGroupScoring?: boolean; budgetTokens?: number;
  minActivations?: number; maxScanDepth?: number; orderedKeys?: string[];
}
export interface ScanResult {
  entries: Document[]; outlets: Record<string, string>; timedState: Document; trace: Document[];
  activatedEntries: Document[]; outletEntries: Record<string, string[]>;
}
export interface ScanRequest {
  books: Record<string, Document>; messages?: string[]; scanText?: string; conversationId: string;
  settings?: ScanSettings; timedState?: Document; messageCount?: number; dryRun?: boolean;
  tokenCount?: (content: string) => number | Promise<number>; vectorMatches?: Set<string>;
  expand?: (content: string) => string | Promise<string>; random?: () => number;
  scanContext?: Document; forcedEntries?: Record<string, Document>;
  onScanLoop?: (payload: Document) => Document | Promise<Document>;
  matchEntries?: (payload: Document) => Document[] | Promise<Document[]>;
  formatEntries?: (payload: Document) => Document[] | Promise<Document[]>;
}
export function normalizeWorldbook(book: Document): Document;
export function defaultWorldbookSettings(): Document;
export function worldbookScanSettings(value: Document, contextWindow: number): ScanSettings;
export function worldbookEntryHash(entry: Document): string;
export function scanWorldbooks(request: ScanRequest): Promise<ScanResult>;
export function worldbookTimedEffect(request: { book: Document; name: string; uid: number | string; effect: string; timedState?: Document; messageCount: number; state?: boolean | string }): { result: { active: boolean; remaining: number; metadata: Document | null }; timedState: Document };
export function worldbookOrderedKeys(books: Record<string, Document>, scopes: Document, strategy?: string): string[];
export function worldbookVectorMatches(books: Record<string, Document>, matches: Document[], maximumPerBook: number): Set<string>;
export function worldbookFragments(entries: Document[], position: string): string[];
export function worldbookExampleContent(entries: Document[], examples: string): string;
export function projectWorldbookAnchors(entries: Document[], note: Document, examples: string, conversationId: string): { entries: Document[]; note: Document; examples: Document[] };
export function projectFrozenWorldbookMessages<T>(messages: readonly T[], fragments: Document[], options: { anchorIndexes: Readonly<Record<string, number>>; isHistoryMessage(message: T): boolean; createMessage(fragment: Document): T }): T[];
export interface NativeAdapter {
  readNative(characterId: string): Document; saveNative(characterId: string, library: Document): unknown;
  readCompanion(characterId: string): Document | null; saveCompanion(characterId: string, state: Document): unknown;
  atomic<T>(operation: () => T): T;
}
export class NativeWorldbookAdapter {
  constructor(adapter: NativeAdapter);
  read(characterId: string): Document;
  put(characterId: string, book: Document): Document;
  putNative(characterId: string, library: Document): Document;
  exportRaw(characterId: string): Document;
  exportNativeRaw(characterId: string): Document;
  compatibilityEntryIds(characterId: string): string[];
  scanBook(characterId: string): Document;
}
export interface RoundAdapter {
  readTiming(conversationId: string): Document | Promise<Document>;
  saveTiming(conversationId: string, value: Document): unknown;
  saveLastScan(conversationId: string, value: ScanResult): unknown;
  atomic<T>(operation: () => T): T;
}
export function freezeWorldbookRound(adapter: RoundAdapter, request: ScanRequest): Promise<Readonly<ScanResult>>;
