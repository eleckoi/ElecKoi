# Agent Response Experience and Final-Answer Reliability

[Back to the open-problems index](README.en.md) | [简体中文](agent-response-experience.md)

**Status: open; several experiments exist, but there is no reliable solution yet.**

## An Agent Response Is Not a Traditional Chat Bubble

The central interface of a traditional chatbot is a sequence of questions and answers. Before producing its final reply, an Agent may search settings, read variables, execute tools, wait for results, and handle errors. ElecKoi must present two different kinds of information:

- the final roleplay text intended for the user;
- the Agent's tool timeline, including running, completed, failed, and waiting states.

How the timeline expands, collapses, and hands off to the final text is not a minor display detail. It determines whether users can understand what the Agent is doing, why they are waiting, and whether a turn has actually finished.

## Current Final-Answer Protocol

ElecKoi currently asks the Agent to wrap the final roleplay text in `<FINAL>...</FINAL>`. The app uses this boundary to separate the tool phase from the final message surface.

The protocol still depends on the model emitting the correct tags at the correct time. When attention drifts, the model may omit `<FINAL>`, produce story text too early, or mix unwanted text between the tool and final phases. The parser can tolerate some incomplete closing tags, but without the critical opening tag the app cannot always distinguish process text from the final answer reliably.

## Approaches Tried or Proposed

### Letting the Agent Control Request Stages

One experiment asked the Agent to track which model request it was handling and normalize the final text when it believed it had reached the last request. In practice, the model often misjudged the stage and could repeatedly invoke operations that were no longer useful, causing runaway requests and wasted Tokens. This is currently considered an unsuccessful experiment rather than the active design.

### Adding a Roleplay Plan

The current approach lets the Agent maintain a plan for the turn and makes “produce the final answer” an explicit final task. The plan improves the probability of following the intended process and format, but it does not eliminate missing tags and is not a reliable protocol boundary by itself.

### Using a Final-Response Subagent

One untested idea is to have the main Agent complete retrieval and tool work, then call a dedicated final-response subagent whose only job is to compose the roleplay text. This may reduce the attention conflict between tool use and final writing, but it would also add a context handoff, another model request, more Tokens, and more waiting time. It remains a hypothesis to evaluate.

## Core Problem

ElecKoi needs a phase transition that does not depend entirely on the model reproducing exact tags, while preserving streaming output, the tool timeline, and compatibility across models. A solution must also avoid fixing presentation reliability by substantially increasing Token cost and response time.
