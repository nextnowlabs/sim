# copilot-tool-execution Specification

## Purpose
TBD - created by archiving change open-source-copilot-backend. Update Purpose after archive.
## Requirements
### Requirement: Tools are dispatched by executor type

The copilot backend SHALL route tool execution based on the `executor` field in the tool definition. `sim` tools SHALL be executed by Sim through the checkpoint/resume protocol: the copilot emits `tool(call)`, pauses with `run(checkpoint_pause)`, and receives the result via `/api/tools/resume`. `go` tools SHALL be executed locally by the copilot.

#### Scenario: SIM-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'sim'`
- **THEN** the copilot SHALL emit `tool(phase: call)` with the translated arguments, then `run(checkpoint_pause)` listing the tool call ID, and receive the execution result from Sim via `/api/tools/resume`

#### Scenario: GO-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'go'`
- **THEN** the copilot SHALL execute the tool locally using the registered tool handler and emit `tool(phase: result)`

### Requirement: edit_workflow tool delegates to Sim

The copilot backend SHALL proxy `edit_workflow` tool calls to Sim's internal API and return the result as a `tool(result)` SSE event. Before proxying, the copilot SHALL translate the LLM-friendly argument format into Sim's internal operation format (`{operation_type, block_id, params}`) so that block configurations and connections survive the handoff.

#### Scenario: Successful edit_workflow call
- **WHEN** the LLM calls `edit_workflow` with valid operations
- **THEN** the copilot SHALL translate the arguments to Sim's internal format, proxy to Sim, receive the updated workflow state, and emit `tool(result)` with `success: true`, `blocks`, `edges`, and `lint`

#### Scenario: edit_workflow with invalid operations
- **WHEN** the LLM calls `edit_workflow` with operations referencing non-existent blocks or invalid types
- **THEN** the copilot SHALL proxy to Sim, receive results with `skippedItems` indicating which operations were rejected, and emit `tool(result)` with `success: true` (partial application) and the skipped items in the output

#### Scenario: edit_workflow with failed operations
- **WHEN** Sim rejects the `edit_workflow` call (e.g. schema validation failure)
- **THEN** the copilot SHALL extract the error message from the tool result's `data.error` field and include it in the `tool(result)` event so the LLM can self-correct

### Requirement: File operation tools execute locally

The copilot backend SHALL implement local handlers for filesystem tools: read file, write file, list directory, and search file content within the workspace VFS.

#### Scenario: Read file from workspace
- **WHEN** the LLM calls a file-read tool with a valid workspace file path
- **THEN** the copilot SHALL read the file content and return it in the tool result

#### Scenario: Write file to workspace
- **WHEN** the LLM calls a file-write tool with a path and content
- **THEN** the copilot SHALL write the file to the workspace VFS and emit a `resource(upsert)` event

### Requirement: Code execution tool runs sandboxed

The copilot backend SHALL support executing code snippets in a sandboxed environment and returning the output.

#### Scenario: Execute JavaScript code
- **WHEN** the LLM calls the code execution tool with JavaScript code
- **THEN** the copilot SHALL execute the code in a sandboxed runtime and return stdout, stderr, and exit code

#### Scenario: Code execution timeout
- **WHEN** the code snippet runs longer than the configured timeout (default 30 seconds)
- **THEN** the copilot SHALL terminate execution and return an error result

### Requirement: Tool result is added to LLM conversation

The copilot backend SHALL format tool results as LLM conversation messages and include them in subsequent LLM calls within the same agent loop iteration.

#### Scenario: Tool result appended to conversation
- **WHEN** a tool executes successfully
- **THEN** the copilot SHALL add a `tool_result` message to the conversation with the tool's output before calling the LLM again

#### Scenario: Tool error appended to conversation
- **WHEN** a tool execution fails
- **THEN** the copilot SHALL add a `tool_result` message with the error details, allowing the LLM to retry or adjust

#### Scenario: All results of a checkpointed turn are appended
- **WHEN** a checkpoint resumes with results for multiple pending tool calls
- **THEN** the copilot SHALL append a tool message for EVERY result in `pendingToolCallIds` order, so each LLM tool call has exactly one matching tool message

### Requirement: edit_workflow arguments are translated to Sim's internal format

The copilot backend SHALL translate LLM-friendly `edit_workflow` arguments into Sim's internal operation format before proxying. The translation SHALL preserve block configuration and connection intent by conforming to the Sim engine's `params` contract.

#### Scenario: subBlocks are renamed to inputs

- **WHEN** the LLM generates an `add` or `edit` operation with a `subBlocks` field (either inside a nested `block` object or at the operation top level)
- **THEN** the translator SHALL rename the `subBlocks` key to `inputs` in the resulting `params` object, preserving all field values, so the Sim engine's `createBlockFromParams` and `handleEditOperation` read the configuration

#### Scenario: Block type and name are preserved in params

- **WHEN** the LLM generates an `add` operation with a nested `block` object containing `type` and `name`
- **THEN** the translator SHALL copy `type` and `name` into `params`, derive `block_id` from the block's `id` or sanitized `name`, and emit `{operation_type: "add", block_id, params: {type, name, inputs}}`

#### Scenario: Connections are emitted as a handle-keyed map

- **WHEN** the LLM specifies connections for a block (via an `add_edge` operation, a bare `{connections: [...]}` item, or a `connections` field nested inside a block object)
- **THEN** the translator SHALL collect all connections for each source block and emit them as a handle-keyed map in the source block's `params.connections`, using `"source"` as the default handle key (e.g. `{"source": "targetBlockId"}`)

#### Scenario: add_edge operation is converted to a connection

- **WHEN** the LLM generates an `add_edge` operation with `source` and `target` fields
- **THEN** the translator SHALL convert it into a `{"source": "<target>"}` entry in the source block's `params.connections` map and SHALL NOT emit it as a separate operation

#### Scenario: Bare connection item without an op field is normalized

- **WHEN** the LLM generates an operations-array item that has a `connections` array but no `op` field
- **THEN** the translator SHALL treat each `{source, target}` pair in the array as an edge and apply it to the source block's `params.connections` map, rather than emitting an operation with an empty `operation_type`

#### Scenario: Existing Sim-format operations pass through unchanged

- **WHEN** an operation already contains an `operation_type` field (Sim format)
- **THEN** the translator SHALL pass it through unchanged without re-translating

### Requirement: Multi-object JSON tool arguments are recovered

The copilot backend SHALL recover tool-call arguments when an LLM emits multiple concatenated top-level JSON objects as a single arguments string.

#### Scenario: Concatenated JSON objects with an operations array

- **WHEN** the LLM emits arguments like `{"operations":[...]},{"op":"add",...},{"connections":[...]}` (multiple objects separated by commas)
- **THEN** `parseArguments` SHALL split the input into individual JSON objects by tracking brace/string/escape depth, parse each, and merge them: if the first object has an `operations` array, subsequent objects SHALL be appended to that array

#### Scenario: Single valid JSON object is unaffected

- **WHEN** the LLM emits a single valid JSON object as arguments
- **THEN** `parseArguments` SHALL parse it directly via `json.Unmarshal` without invoking the multi-object splitter

#### Scenario: Unparseable arguments fall back to raw

- **WHEN** the arguments string contains no valid JSON object at all
- **THEN** `parseArguments` SHALL fall back to `{"raw": "<args>"}` so downstream code can decide how to handle it

### Requirement: Tool result errors are extracted for LLM feedback

The copilot backend SHALL extract error messages from tool results returned via the `/api/tools/resume` callback so the LLM receives actionable feedback when a Sim-executed tool fails.

#### Scenario: Error nested in result data

- **WHEN** the resume callback contains a result with `success: false` and a `data` object containing an `error` string
- **THEN** the copilot SHALL set the `CheckpointResult.Error` field to that error string, so `addToolResult` includes the message in the LLM conversation

#### Scenario: Error at result top level

- **WHEN** the resume callback contains a result with `success: false` and a top-level `error` string (no nested `data.error`)
- **THEN** the copilot SHALL set the `CheckpointResult.Error` field to that top-level error string

#### Scenario: Successful result has no error

- **WHEN** the resume callback contains a result with `success: true`
- **THEN** the copilot SHALL NOT set an error string, even if an `error` field is present in the data

### Requirement: Workflow lifecycle tools are available to the agent

The copilot backend SHALL define `create_workflow`, `read`, `glob`, and `grep` tools (executor `sim`) mirroring the schemas in `apps/sim/lib/copilot/generated/tool-schemas-v1.ts`, so the agent can create workflows from chat and inspect the workspace/current workflow state before editing. Sim already registers handlers for these tools; the copilot only exposes the definitions.

#### Scenario: Create a workflow from chat
- **WHEN** the LLM calls `create_workflow` with a `name` (and optional `description`, `folderId`, `workspaceId`)
- **THEN** the copilot SHALL checkpoint the call for Sim execution, and the result SHALL include the new `workflowId` and `workspaceId`; Sim SHALL thread the new workflow ID into the execution context so subsequent `edit_workflow` calls target the new workflow

#### Scenario: Read the current workflow state
- **WHEN** the LLM calls `read` with a `workflows/<name>/state.json` path (the `current_workflow` context pointer)
- **THEN** the copilot SHALL checkpoint the call for Sim execution and surface the returned workflow state JSON to the LLM

#### Scenario: Glob for workspace files
- **WHEN** the LLM calls `glob` with a pattern
- **THEN** the copilot SHALL checkpoint the call for Sim execution and surface matching file paths to the LLM

#### Scenario: Grep within the workspace
- **WHEN** the LLM calls `grep` with a pattern
- **THEN** the copilot SHALL checkpoint the call for Sim execution and surface matching lines to the LLM

### Requirement: Tool result content is size-bounded for LLM context

The copilot backend SHALL cap the content of tool results (e.g. file reads, workflow state JSON, search output) when formatting tool messages for the LLM, truncating oversized outputs so a single tool result cannot exhaust the conversation budget.

#### Scenario: Oversized tool output is truncated
- **WHEN** a tool result exceeds the configured content cap
- **THEN** the copilot SHALL truncate the message content sent to the LLM and indicate that truncation occurred

