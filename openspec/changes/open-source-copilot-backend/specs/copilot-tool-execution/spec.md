## ADDED Requirements

### Requirement: Tools are dispatched by executor type

The copilot backend SHALL route tool execution based on the `executor` field in the tool definition. `sim` tools SHALL be proxied to Sim's internal API. `go` tools SHALL be executed locally by the copilot.

#### Scenario: SIM-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'sim'`
- **THEN** the copilot SHALL POST the tool name and arguments to Sim's `/api/internal/tools/execute` endpoint using `INTERNAL_API_SECRET` for authentication

#### Scenario: GO-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'go'`
- **THEN** the copilot SHALL execute the tool locally using the registered tool handler

### Requirement: edit_workflow tool delegates to Sim

The copilot backend SHALL proxy `edit_workflow` tool calls to Sim's internal API and return the result as a `tool(result)` SSE event.

#### Scenario: Successful edit_workflow call
- **WHEN** the LLM calls `edit_workflow` with valid operations
- **THEN** the copilot SHALL proxy to Sim, receive the updated workflow state, and emit `tool(result)` with `success: true`, `blocks`, `edges`, and `lint`

#### Scenario: edit_workflow with invalid operations
- **WHEN** the LLM calls `edit_workflow` with operations referencing non-existent blocks or invalid types
- **THEN** the copilot SHALL proxy to Sim, receive results with `skippedItems` indicating which operations were rejected, and emit `tool(result)` with `success: true` (partial application) and the skipped items in the output

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
