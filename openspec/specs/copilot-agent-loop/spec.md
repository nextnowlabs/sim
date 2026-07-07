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

The copilot backend SHALL support up to 20 consecutive tool-calling iterations within a single request, adding tool results to the conversation and continuing the LLM loop.

#### Scenario: Single tool call then final response
- **WHEN** the LLM calls one tool and the tool succeeds
- **THEN** the copilot SHALL emit `tool(result)`, add the result to the conversation, call the LLM again, stream the final text, and emit a `complete` event

#### Scenario: Multiple consecutive tool calls
- **WHEN** the LLM calls a tool, then calls another tool after receiving the result
- **THEN** the copilot SHALL execute each tool sequentially, emitting `tool(call)` and `tool(result)` for each, up to 20 iterations

#### Scenario: Tool call exceeds maximum iterations
- **WHEN** the LLM has made 20 tool calls without producing a final text response
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

