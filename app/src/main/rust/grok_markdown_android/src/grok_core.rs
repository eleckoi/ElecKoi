//! Direct bridge to Grok Build's pinned headless Markdown core.
//!
//! Parser options and the LLM-friendly double-tilde policy intentionally live upstream. Keeping
//! this re-export prevents the Android bridge from drifting into a second implementation.

pub use xai_grok_markdown_core::offset_events;
