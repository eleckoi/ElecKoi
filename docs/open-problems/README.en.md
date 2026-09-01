# Open Problems in AI Roleplay Development

[简体中文](README.md) | [English](README.en.md)

This directory documents open development problems that require focused research in AI roleplay and character creation for ElecKoi. These topics are not settled solutions and do not imply that the corresponding features are complete.

## Open Topics

1. [Agent Token Cost and Response Speed](token-cost-and-speed.en.md)

   A single Agent turn may involve several model requests and tool calls. Reducing Token cost and waiting time without giving up Agent capabilities is currently the most widely discussed concern.

2. [Agent Response Experience and Final-Answer Reliability](agent-response-experience.en.md)

   An Agent produces more than one final message: it also has a timeline of tool calls, progress, and errors. Presenting that process clearly and reliably separating the final roleplay text from model output directly affects everyday usability.

3. [Long-Term Memory for Dialogue and Tool Results](conversation-history.en.md)

   Keeping every tool result makes the context grow rapidly, while discarding everything can cause repeated retrieval. Balancing long-running story continuity, information freshness, and Token cost remains an open problem.

## Current Stage

ElecKoi is currently focused on completing the foundations of its Agent runtime, character creation, state management, and frontend capabilities. These problems are now recorded publicly and will receive deeper research using real conversation metrics and experimental results once the underlying paths are stable.
