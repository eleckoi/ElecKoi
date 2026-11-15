/** Installed Client module resolver with its public asset face. */
export function withDshAssets<T extends (name: string) => any>(resolver: T): T & { asset(name: string): string };
