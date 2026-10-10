export type AuthorValue = null | boolean | number | string | AuthorValue[] | { [key: string]: AuthorValue }
export interface AuthorCommand { method: string; params: { [key: string]: AuthorValue } }
export interface AuthorChange { event: string; payload: AuthorValue }
export interface AuthorCapabilities { methods: string[]; version: number; assetsBaseUrl: string }
