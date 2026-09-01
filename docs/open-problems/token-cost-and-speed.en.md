# Agent Token Cost and Response Speed

[Back to the open-problems index](README.en.md) | [简体中文](token-cost-and-speed.md)

**Status: open and unsolved.**

This is currently the issue people ask about most often.

## Why Agents Are Slower and More Expensive

A traditional chatbot usually produces one reply from one request. During a single turn, an Agent may interpret the task, search character settings, read variables, call tools, receive tool results, and then request the model again to produce the final text. One user turn can therefore require several model requests, each of which may carry the current context again and add new input and output Tokens.

Response time also includes setting retrieval, tool execution, network waits, repeated model continuations, and final-text generation. Measuring only the generation speed of the last paragraph does not describe the Agent's full waiting time.

## Current Implementation

- Role chat currently uses the existing `user/assistant` dialogue array as its long-term history. Every model request, including repeated continuations within one Agent turn, carries that history again.
- Reasoning, tool calls, and tool results from completed turns are not sent back to the model as long-term dialogue.
- Tool calls and results from the active turn are retained until that turn finishes, allowing the model to continue from information it has just obtained.
- The tool timeline may be kept for presentation and execution records, but “stored for the user” does not mean “sent to the model again next turn.”
- Provider-side context caching may reduce some repeated computation or billing when it hits, but caches can miss or expire and do not solve continuous context growth or attention being diluted by old dialogue. It is a temporary mitigation, not a conversation-history design.
- ElecKoi has done little exploration of how roleplay history should be used. The current implementation essentially loads all existing user and assistant text into context and does not yet have a mature strategy for compression, summarization, hierarchy, or retrieval.

## Unresolved Questions

- Which recent messages must remain verbatim, and which older material can be compressed?
- How can story history be compressed without losing relationships, promises, causality, or narrative voice?
- How can repeated model continuations avoid carrying prompt and tool context that is no longer useful?
- Could a dedicated history-management subagent process the `user/assistant` dialogue and prepare context for the main Agent based on the current scene? How could it avoid losing foreshadowing, relationships, and critical wording without adding even more requests, Tokens, and latency?
- How should request count, input and output Tokens, cache use, tool time, time to first Token, and total turn time be measured together?
- How can cost and waiting time be reduced without turning the Agent back into a one-shot chatbot?

## Current Plan

The project is currently prioritizing its foundational execution paths and has not yet conducted systematic research into dialogue compression. As the Agent architecture develops, conversation history may evolve from a passively loaded array into context actively maintained by specialized capabilities, but that remains a hypothesis to test. A later phase will first establish reproducible measurements using real conversations, then compare full-history loading, pruning, summarization, retrieval, and subagent management. This document raises the problem without assuming a final answer.
