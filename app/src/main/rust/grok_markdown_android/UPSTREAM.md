# Grok Build Markdown provenance

This Android bridge intentionally reuses Grok Build's headless Markdown semantics without
bringing its Ratatui terminal renderer into the Android UI.

- Upstream: `xai-org/grok-build`
- Reviewed commit: `98c3b24`
- Upstream license: Apache-2.0
- Linked Mermaid engine license: MIT
- Parser version: `pulldown-cmark 0.13`
- Reference files:
  - `crates/codegen/xai-grok-markdown-core/src/lib.rs`
  - `crates/codegen/xai-grok-markdown/src/parse.rs`
  - `crates/codegen/xai-grok-markdown/src/streaming.rs`
  - `crates/codegen/xai-grok-mermaid/src/pure.rs`
  - `third_party/mermaid-to-svg`

The following behavior is intentionally pinned to the upstream implementation:

1. `ENABLE_GFM | ENABLE_STRIKETHROUGH | ENABLE_MATH | ENABLE_TASKLISTS | ENABLE_TABLES`.
2. Single-tilde pairs remain literal; only `~~text~~` becomes strikethrough.
3. Streaming freezes only complete top-level blocks at Grok checkpoint boundaries.
4. Finalization performs a complete parse of the remaining tail.
5. Mermaid layout is linked from the same pinned Grok Build revision and runs without Node,
   Chromium, subprocesses or network access.

ElecKoi-specific code is limited to translating the upstream event stream into the existing
Compose document model and JNI-safe primitive payloads.
