# copilot-streaming Specification

## Purpose
TBD - created by archiving change open-source-copilot-backend. Update Purpose after archive.
## Requirements
### Requirement: SSE stream follows MothershipStreamV1 protocol

The copilot backend SHALL produce Server-Sent Events in exact compliance with the `MothershipStreamV1EventEnvelope` types defined in `apps/sim/lib/copilot/generated/mothership-stream-v1.ts`.

#### Scenario: Event envelope structure
- **WHEN** the copilot emits any SSE event
- **THEN** each event SHALL contain `type`, `seq` (monotonically increasing integer), `stream` (with `streamId`), `ts` (ISO 8601 timestamp), and `v: 1`

#### Scenario: SSE wire format
- **WHEN** the copilot emits an SSE event
- **THEN** the wire format SHALL be `data: <JSON>\n\n` where `<JSON>` is the serialized event envelope

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

### Requirement: Text events stream incrementally

The copilot backend SHALL emit `text` events as incremental deltas, not as complete messages, to enable streaming UI rendering.

#### Scenario: Streaming text from LLM
- **WHEN** the LLM produces text tokens via streaming
- **THEN** the copilot SHALL emit a `text` event for each chunk with `channel: 'assistant'` and the incremental text

#### Scenario: Final text accumulated
- **WHEN** the stream completes
- **THEN** all text events for a given message SHALL concatenate to form the complete assistant response text

### Requirement: Tool call events report full lifecycle

The copilot backend SHALL emit tool events in three phases: `call` (when the LLM requests a tool), optional `args_delta` (for streaming tool arguments), and `result` (when execution completes).

#### Scenario: Tool call with complete arguments
- **WHEN** the LLM returns a tool call with all arguments available immediately
- **THEN** the copilot SHALL emit `tool(phase: call)` with `arguments` populated, then `tool(phase: result)` after execution

#### Scenario: Tool call with streaming arguments
- **WHEN** the LLM streams tool arguments incrementally
- **THEN** the copilot SHALL emit `tool(phase: call)` with `partial: true`, then one or more `tool(phase: args_delta)` events, then `tool(phase: result)`

#### Scenario: Tool execution failure
- **WHEN** a tool execution fails
- **THEN** the copilot SHALL emit `tool(phase: result)` with `success: false`, `status: 'error'`, `error` message, and `output` containing error details

### Requirement: Complete event reports final status and usage

The copilot backend SHALL emit a `complete` event as the final event in every stream, reporting status, token usage, and cost.

#### Scenario: Successful completion
- **WHEN** the agent loop finishes without errors
- **THEN** the copilot SHALL emit `complete(status: complete)` with `usage` (input_tokens, output_tokens, model) and `cost` (input, output, total)

#### Scenario: Stream cancelled by user
- **WHEN** Sim sends a stop/abort request for the active stream
- **THEN** the copilot SHALL stop processing and emit `complete(status: cancelled)`

### Requirement: Error events include actionable information

The copilot backend SHALL emit `error` events with sufficient detail for the frontend to display a meaningful error message.

#### Scenario: Provider rate limit error
- **WHEN** the LLM provider returns a rate limit (429) error
- **THEN** the copilot SHALL emit `error` with `code: 'rate_limit'`, `provider: 'anthropic'`, and a user-friendly `displayMessage`

#### Scenario: Internal server error
- **WHEN** an unexpected server error occurs during processing
- **THEN** the copilot SHALL emit `error` with `code: 'internal_error'`, the error message in `error`, and a generic `displayMessage` that does not leak internal details

### Requirement: Stream supports keepalive

The copilot backend SHALL send SSE comments (`: keepalive\n\n`) every 15 seconds when no other events are being emitted, to prevent proxy timeouts.

#### Scenario: LLM takes time to respond
- **WHEN** no events have been emitted for 15 seconds
- **THEN** the copilot SHALL send an SSE comment line as keepalive

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

