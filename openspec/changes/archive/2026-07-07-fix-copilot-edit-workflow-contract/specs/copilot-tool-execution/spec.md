## MODIFIED Requirements

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

## ADDED Requirements

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
