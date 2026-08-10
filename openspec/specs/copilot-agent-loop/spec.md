# copilot-agent-loop Specification

## Purpose
TBD - created by archiving change open-source-copilot-backend. Update Purpose after archive.
## Requirements
### Requirement: Agent receives chat request and initializes stream

The copilot backend SHALL accept POST requests containing chat messages, tool schemas, workspace context, and configuration, and initialize an SSE stream identified by a unique `streamId`.

#### Scenario: Valid chat request received
- **WHEN** Sim POSTs a chat request with `message`, `model`, `integrationTools`, and `workspaceId`
- **THEN** the copilot SHALL allocate a unique `streamId`, emit a `session(kind: start)` event, and begin processing

#### Scenario: Missing required fields
- **WHEN** Sim POSTs a chat request without `message` or `model`
- **THEN** the copilot SHALL respond with HTTP 400 and an error message

### Requirement: Agent loop calls LLM with conversation context

The copilot backend SHALL call the configured LLM provider with the full conversation history, system prompt, and available tool definitions, and process the streaming response.

#### Scenario: LLM returns text content
- **WHEN** the LLM streams text content without tool calls
- **THEN** the copilot SHALL emit `text` events with `channel: 'assistant'` and the incremental text content

#### Scenario: LLM returns tool calls
- **WHEN** the LLM emits a tool call in its response
- **THEN** the copilot SHALL pause text streaming, emit a `tool(phase: call)` event with the tool name and arguments, then execute the tool

#### Scenario: LLM returns thinking content
- **WHEN** the LLM supports thinking/reasoning and emits thinking tokens
- **THEN** the copilot SHALL emit `text` events with `channel: 'thinking'`

### Requirement: Agent loop handles multi-turn tool calling

The copilot backend SHALL support tool-calling iterations within a stream leg, executing Go-executor tools locally and checkpointing Sim-executor tools for execution by Sim. A Sim-executor checkpoint SHALL end the current stream leg; the `/api/tools/resume` call SHALL continue the loop on a new leg. All tool calls of a turn SHALL be resolved (locally or via checkpoint) so the LLM always receives a complete set of tool results.

#### Scenario: Single Go-executor tool call then final response
- **WHEN** the LLM calls one Go-executor tool and the tool succeeds
- **THEN** the copilot SHALL emit `tool(result)`, add the result to the conversation, call the LLM again, stream the final text, and emit a `complete` event

#### Scenario: Sim-executor tool call pauses the leg
- **WHEN** the LLM calls a Sim-executor tool (e.g. `edit_workflow`)
- **THEN** the copilot SHALL emit `tool(call)`, emit `run(checkpoint_pause)` with the pending tool call IDs, save a checkpoint with the full conversation state, and end the stream leg WITHOUT a `complete` event

#### Scenario: Resume continues the loop
- **WHEN** Sim executes the pending tools and POSTs the results to `/api/tools/resume`
- **THEN** the copilot SHALL append all tool results to the conversation in pending-tool-call order and continue the agent loop on the resume connection, ending with a `complete` event or another `checkpoint_pause`

#### Scenario: Multiple Sim-executor tool calls in one turn
- **WHEN** the LLM calls two or more Sim-executor tools in a single response
- **THEN** the copilot SHALL checkpoint ALL of them in one `checkpoint_pause` (all IDs in `pendingToolCallIds`), and SHALL append all returned results in order on resume — no tool call SHALL be left without a corresponding tool message

#### Scenario: Mixed Go and Sim tool calls in one turn
- **WHEN** the LLM calls both Go-executor and Sim-executor tools in a single response
- **THEN** the copilot SHALL execute the Go tools locally and append their tool messages, then checkpoint all remaining Sim tools in one pause, so the assistant tool_calls message is followed by all tool results in order

#### Scenario: Tool call exceeds maximum iterations
- **WHEN** the LLM has made 20 tool calls within a leg without producing a final text response
- **THEN** the copilot SHALL emit an `error` event and a `complete(status: error)` event

### Requirement: Agent handles LLM provider errors

The copilot backend SHALL gracefully handle errors from the LLM provider and communicate them to the frontend.

#### Scenario: LLM API returns an error
- **WHEN** the LLM provider returns a 4xx or 5xx error
- **THEN** the copilot SHALL emit an `error` event with the provider name, error message, and `displayMessage`, then emit `complete(status: error)`

#### Scenario: LLM request times out
- **WHEN** the LLM provider does not respond within the configured timeout
- **THEN** the copilot SHALL emit an `error` event with code `timeout` and `complete(status: error)`

### Requirement: Agent supports conversation history

The copilot backend SHALL maintain conversation history across multiple requests for the same `chatId`, appending new messages and using the full history as LLM context.

#### Scenario: Subsequent message in same chat
- **WHEN** Sim sends a new message with an existing `chatId`
- **THEN** the copilot SHALL include all previous messages in the conversation when calling the LLM

#### Scenario: Conversation exceeds token budget
- **WHEN** the conversation history plus tools exceed the model's context window
- **THEN** the copilot SHALL truncate earlier messages, retaining the system prompt and most recent N messages

### Requirement: Agent supports multiple modes

The copilot backend SHALL support `build` (workflow creation), `ask` (Q&A), and `plan` (planning) modes, adjusting the system prompt and available tools accordingly.

#### Scenario: Build mode
- **WHEN** mode is `build`
- **THEN** the copilot SHALL include integration tools and the `edit_workflow` tool, with instructions to modify the workflow canvas

#### Scenario: Ask mode
- **WHEN** mode is `ask`
- **THEN** the copilot SHALL exclude workflow-modification tools and instruct the LLM to answer questions conversationally

### Requirement: Agent loop checkpoints full conversation state per pause

The copilot backend SHALL save a checkpoint containing the messages, system prompt, tool definitions, model, token trace, and tool-to-block-type map whenever it pauses for Sim-executor tools, keyed by a fresh checkpoint ID that SHALL be rotated on every re-pause.

#### Scenario: Checkpoint survives the leg boundary
- **WHEN** the agent pauses for a Sim-executor tool
- **THEN** the checkpoint SHALL contain everything needed to resume the conversation on a new stream leg, including the assistant message with all tool calls of the turn

#### Scenario: Re-pause rotates the checkpoint ID
- **WHEN** a resumed leg pauses for another Sim-executor tool
- **THEN** the copilot SHALL emit a new `checkpoint_pause` with a NEW checkpoint ID, and the previous checkpoint SHALL no longer be resolvable for resume

#### Scenario: Resume for an already-consumed checkpoint is tolerated
- **WHEN** Sim retries a resume (e.g. after a 503 on a failed stream leg) with a checkpoint ID that was already consumed
- **THEN** the copilot SHALL re-run the leg from the saved checkpoint instead of returning 404, so Sim's automatic retry does not fail the message

#### Scenario: Resume without a checkpoint
- **WHEN** Sim POSTs a resume with an unknown checkpoint ID
- **THEN** the copilot SHALL respond with HTTP 404 and not attempt to continue a conversation

### Requirement: Agent applies a timeout per stream leg

The copilot backend SHALL bound each stream leg (chat start and every resume) by the configured agent timeout, so a long multi-pause conversation does not share a single global deadline.

#### Scenario: Pause resets the deadline
- **WHEN** a leg ends with `checkpoint_pause` and a new leg starts via `/api/tools/resume`
- **THEN** the new leg SHALL have its own timeout window starting at the resume request

