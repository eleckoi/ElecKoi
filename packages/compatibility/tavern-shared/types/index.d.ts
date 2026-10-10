import type { PluginApi, Json } from './plugins.js';
export type { ApplicationApi, ApplicationActions, ApplicationCapabilities, ApplicationDomain, ApplicationEnvironment, NavigationApi, NavigationSnapshot, NavigationTarget, PlatformApi, FrontendTarget, ChatControllerHandlers, GenerationInput } from './application.js';
export type { FrontendScope, FrontendJson, FrontendBinding, FrontendManifest, FrontendProject, FrontendWorkspace, FrontendFileInput, FrontendChange, FrontendRootBinding, FrontendPageBinding, FrontendSlotBinding, ApplicationFrontendManifest, FrontendOwner, FrontendContext } from './frontends.js';
export type HostMethodHandler = (params: Record<string, unknown>, context: { signal: AbortSignal }) => unknown | Promise<unknown>;
export interface HostAdapter {
  methods(): string[];
  has(method: string): boolean;
  tokenizeSync(payload: Record<string, unknown>): { count: number; ids?: number[] };
  request<T = unknown>(method: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<T>;
  on(name: string, listener: (payload: unknown) => unknown | Promise<unknown>): () => void;
  publish(name: string, payload: unknown): Promise<void>;
  publishBatch(events: { name: string; payload: unknown }[]): Promise<void>;
  dispose(): void;
}
export interface SharedRealm {
  readonly adapter: HostAdapter;
  readonly frames: Map<string, { owner: string; window?: Window; parentId?: string; authorContext?: { conversationId: string; messageId?: string } }>;
  captureAuthorContext?: () => { conversationId?: string } | undefined;
  readonly globals: Map<string, unknown>;
  readonly listeners: Map<string, unknown[]>;
  readonly writes: { queue: Promise<unknown>; errors: Error[] };
  request<T = unknown>(method: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<T>;
  onNative(name: string, listener: (payload: unknown) => unknown | Promise<unknown>): () => void;
  tokenize(payload: { operation: 'resolveEncoding' | 'decode' | 'encode'; selection?: unknown; encoding?: string; text?: string; tokens?: number[] }): Promise<unknown>;
  connect(id: string, window: Window): Pick<HostAdapter, 'has' | 'methods' | 'request' | 'on' | 'tokenizeSync'>;
  adopt(window: Window, owner?: string): string;
  mount(id: string, owner: string, url: string, visible?: boolean | 'chat', displayName?: string): HTMLIFrameElement;
  unmount(id: string): void;
  release(id: string): void;
  run(id: string, method: string, payload: unknown): unknown;
  evaluate(id: string, source: string): unknown;
  dispose(): Promise<void>;
}
export interface SharedInstallOptions {
  adapter: HostAdapter;
  shared?: SharedRealm;
  pluginId?: string;
  frameId?: string;
  runtimeUrl?: string;
  libraryBaseUrl?: string;
  signal?: AbortSignal;
  /** Must be the real initialized tokenizer, never an estimated fallback. */
  tokenizers?: { initialize(): Promise<unknown>; [key: string]: unknown };
}
export function createHostAdapter(bindings?: Record<string, HostMethodHandler>, options?: { dispose?(): void; tokenizeSync?(payload: Record<string, unknown>): { count: number; ids?: number[] } }): HostAdapter;
export function createRemoteHostAdapter(remote: { invoke(request: { method: string; params: Record<string, unknown> }): Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string; code?: string } }> }, options: { methods: string[]; dispose?(): void; tokenizeSync?(payload: Record<string, unknown>): { count: number; ids?: number[] } }): HostAdapter;
export function unwrapRemote<T>(result: { ok: true; value: T } | { ok: false; error: { message: string; code?: string; [key: string]: unknown } }): T;
export function createSharedRealm(window: Window, adapter: HostAdapter): SharedRealm;
export function installElecKoiAuthorApi(window: Window): void;
export function installTavernContract(window: Window): void;
export function installTavernCompatibility(window: Window): void;
export function installBrowserLibraries(window: Window, baseUrl: string): Promise<{ ready: true; versions: Readonly<Record<string, string>> }>;
export function installTavernShared(window: Window, options: SharedInstallOptions): Promise<PluginApi>;
export type { PluginApi, Json };
