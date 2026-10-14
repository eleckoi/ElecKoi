import { createTokenizerRegistry } from './tokenizer-service.js';

/** Fetch once at initialization, then keep synchronous public encode/decode/count contracts. */
const registry = createTokenizerRegistry(async (_name, descriptor) => {
  const response = await fetch(`/eleckoi/html/libraries/tokenizer-models/${descriptor.filename}`);
  if (!response.ok) throw new Error(`Cannot load tokenizer ${descriptor.filename}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
});
registry.ready = registry.prepareAll();
globalThis.__ElecKoiTavernTokenizers = registry;
