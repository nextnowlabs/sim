## MODIFIED Requirements

### Requirement: Tools are dispatched by executor type

The copilot backend SHALL route tool execution based on the `executor` field in the tool definition. `sim` tools SHALL be executed by Sim through the checkpoint/resume protocol: the copilot emits `tool(call)`, pauses with `run(checkpoint_pause)`, and receives the result via `/api/tools/resume`. `go` tools SHALL be executed locally by the copilot.

#### Scenario: SIM-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'sim'`
- **THEN** the copilot SHALL emit `tool(phase: call)` with the translated arguments, then `run(checkpoint_pause)` listing the tool call ID, and receive the execution result from Sim via `/api/tools/resume`

#### Scenario: GO-executor tool call
- **WHEN** the LLM calls a tool with `executor: 'go'`
- **THEN** the copilot SHALL execute the tool locally using the registered tool handler and emit `tool(phase: result)`

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

## ADDED Requirements

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
