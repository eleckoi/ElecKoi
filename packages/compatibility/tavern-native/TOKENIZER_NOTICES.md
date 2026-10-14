# Tokenizer resources

The shared browser and Host engine uses `@agnai/web-tokenizers` 0.1.6-pre3
(tokenizers-cpp WebAssembly), Apache-2.0, https://github.com/mlc-ai/tokenizers-cpp/tree/main/web.
It tokenizes text and does not run a language model. The package includes its
embedded WebAssembly; the upstream package manifest declares Apache-2.0.

Mistral-7B-v0.1 and Qwen2-7B vocabulary resources are distributed under
Apache-2.0. Their model-card/license evidence and the Apache license text
are included in `licenses/`. File sources, hashes, sizes, and owner model URLs
are recorded in `src/tokenizer-models/manifest.json`.

The Qwen2 vocabulary was obtained from SillyTavern-Tokenizers at the pinned
commit in the manifest. That distribution uses MIT and explicitly leaves
tokenizer data under its owner model license; both notices are retained.
The Mistral vocabulary was obtained from the pinned SillyTavern 1.19.0 tree.

OpenAI codecs use js-tiktoken 1.0.21 (MIT), already present in this application.
LLAMA, LLAMA3, GEMMA, DEEPSEEK, and other unbundled vocabularies are not
silently replaced. The common codec registry accepts an actual user-provided
vocabulary; applications must retain its applicable license.

Yi-6B, Jamba-v0.1 and Mistral-Nemo-Base-2407 tokenizer vocabularies use model-owner Apache-2.0 licenses. The released Anthropic Claude tokenizer uses MIT; it is the historical public codec and does not promise current Claude-model exact counts. Hashes and source URLs are in manifest.json.
