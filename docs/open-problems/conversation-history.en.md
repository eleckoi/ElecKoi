# Long-Term Memory for Dialogue and Tool Results

[Back to the open-problems index](README.en.md) | [简体中文](conversation-history.md)

**Status: only a baseline implementation exists; there is no long-term design yet.**

## The Problem

One Agent tool call can return a large amount of material, such as a complete setting entry, source file, search result, or variable schema. If every tool call and result becomes permanent chat history, later model requests may carry all of that material again.

If an Agent repeatedly reads the same file across turns, a complete native Agent history will indeed contain repeated copies of that file. As the chat grows, duplicated content increases input Tokens, request time, and context noise. Old tool results may also be stale, causing the model to mistake historical state for current truth.

Discarding all cross-turn tool memory has a different cost: the Agent may forget what it already checked, why it reached a conclusion, and repeat the same retrieval on the next turn.

Even after old tool results are removed, the existing `user/assistant` dialogue array is still loaded in full for every model request. It grows with the roleplay and is sent repeatedly across multiple requests within the same Agent turn. This is currently the more significant source of long-term Token pressure.

## ElecKoi's Current Behavior

ElecKoi manages execution records separately from the model context used by the next turn:

- Tool calls, tool results, reasoning, and execution state may be retained in the Agent timeline for presentation and troubleshooting.
- The complete tool chain remains available during the active turn because the model must see newly obtained results in order to continue working.
- Every model request reloads the existing user messages and final assistant text; tool calls and results from completed turns are not sent back to the model.
- Current variables and settings remain in their authoritative data sources and are read again when needed instead of treating an old tool result as permanently correct.

Repeated file reads from completed turns therefore do not accumulate indefinitely in ElecKoi's role-chat context. Repeated reads within one active turn can still enter later requests in that turn and consume additional Tokens. More importantly, the growing dialogue text is still sent repeatedly; context caching can only mitigate part of that cost temporarily and is not the final solution.

## Assessment of the Current Policy

Removing old tool results is a reasonable baseline, but it only prevents raw operation logs from continuing to grow. It does not solve the increasing size of the roleplay dialogue itself. The current approach still gives the model the entire existing conversation, and ElecKoi has done little exploration of how an Agent could use that history more effectively.

The durable thread of a roleplay should preserve what the user and character actually said, together with authoritative variable and setting state, but that does not necessarily mean every request must resend every line verbatim. There is no settled answer for balancing fidelity, cost, and model attention. Keeping only final dialogue also loses useful working memory, including which sources were already checked, why an approach was selected, and intermediate conclusions that do not need to be recomputed.

## Directions Worth Studying

The likely need is selective memory rather than an all-or-nothing choice:

- Keep the complete tool chain during the active turn so the Agent can finish multi-step work.
- Keep only recent dialogue verbatim and turn older story material into updateable summaries, events, and relationship memories.
- Across turns, retain only compact conclusions that genuinely affect later story or decisions, not large raw file bodies.
- Record the source, version, or a summary of retrieved material so the Agent can decide whether current content must be read again.
- Keep variables and world state authoritative as structured data instead of turning a natural-language summary into a new source of truth.
- Introduce a dedicated conversation-history subagent that reads and maintains the `user/assistant` history, then selects or organizes context for the active character Agent, while testing whether extra model requests, summary drift, lost details, and latency outweigh the benefit.
- Measure repeated-read rates both within and across turns before deciding whether to add deduplication, caching, or retrieval-based memory.

These are possible directions as Agent architectures develop, not committed implementation plans. This document raises the problem publicly without assuming the answer. Future research must evaluate narrative continuity, information freshness, Token cost, response speed, and error recovery together rather than optimizing only for the shortest possible context.
