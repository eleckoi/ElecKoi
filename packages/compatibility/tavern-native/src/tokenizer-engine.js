import { createRequire } from 'node:module';
/** The package's ESM entry is UMD; its supported CommonJS entry works in Node. */
export const { Tokenizer } = createRequire(import.meta.url)('@agnai/web-tokenizers');
