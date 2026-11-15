export const inject: string[];
/** Enqueue the installed public frame Client factory ahead of browser boot. */
export function apply(ctx: { on(name: 'webserver/index-inject', callback: (table: any[]) => void): unknown }): void;
