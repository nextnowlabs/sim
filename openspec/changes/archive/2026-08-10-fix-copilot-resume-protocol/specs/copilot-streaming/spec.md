## MODIFIED Requirements

### Requirement: Stream lifecycle events are emitted in order

The copilot backend SHALL emit events in the correct lifecycle order within each stream leg: session start → optional chat → text/tool events → complete (or checkpoint_pause for a pause leg). The `/api/copilot` request and every `/api/tools/resume` request SHALL each open a new stream leg whose first event is `session(start)`.

#### Scenario: Normal stream lifecycle
- **WHEN** a chat request is processed successfully
- **THEN** events SHALL be emitted in order: `session(start)` → `session(chat)` → `text`/`tool` events → `complete(status: complete)`

#### Scenario: Stream with auto-generated title
- **WHEN** the copilot generates a chat title from the first user message
- **THEN** the copilot SHALL emit a `session(title)` event with the generated title

#### Scenario: Pause leg terminates without a complete event
- **WHEN** the agent emits `run(checkpoint_pause)` to hand execution to Sim
- **THEN** the stream leg SHALL end immediately after the pause event, without a `complete` event — Sim treats pause legs as expected non-terminal legs

#### Scenario: Resume leg opens a new stream
- **WHEN** Sim POSTs tool results to `/api/tools/resume`
- **THEN** the copilot SHALL respond with an SSE stream whose first event is `session(start)`, followed by `text`/`tool` events, and ending with `complete` or another `checkpoint_pause`

## ADDED Requirements

### Requirement: Resume requests are SSE stream legs

The copilot backend SHALL treat `POST /api/tools/resume` as a first-class streaming endpoint: it SHALL set SSE headers, flush, and stream the continued agent output (text deltas, tool lifecycle events, checkpoint pauses, and terminal events) on the resume response body. It SHALL NOT answer with a plain JSON body.

#### Scenario: Successful resume streams continued output
- **WHEN** Sim POSTs results for a pending checkpoint
- **THEN** the copilot SHALL stream the agent's continued text and tool events on the resume response, ending with `complete(status: complete)` when the conversation finishes

#### Scenario: Resume re-pauses
- **WHEN** the resumed agent loop requires another Sim-executor tool
- **THEN** the copilot SHALL emit a new `run(checkpoint_pause)` on the resume stream and end the leg without a terminal event

#### Scenario: Resume with a missing checkpoint
- **WHEN** no checkpoint exists for the posted `checkpointId`
- **THEN** the copilot SHALL respond with HTTP 404 and a JSON error body (no SSE stream)
