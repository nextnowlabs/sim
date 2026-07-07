## Why

The Go copilot backend translates LLM-generated `edit_workflow` arguments into a format that does not match the Sim-side engine's contract. Two translation bugs cause every chat-created workflow to silently lose all block configuration and all block-to-block connections: (1) the translator passes `subBlocks` through unchanged, but the Sim engine only reads `inputs`; (2) the translator emits `connections` as an array of `{source, target}` pairs, but the engine expects a handle-keyed map. A third mismatch — the system prompt advertising `add_edge`/`delete_edge` operation types that the Sim schema rejects — compounds the failures and drives the LLM into retry loops it cannot escape.

## What Changes

- **Fix `subBlocks` → `inputs` translation**: `translateEditWorkflowArgs` SHALL rename the `subBlocks` key to `inputs` when building `params`, so block configuration survives the LLM → Sim handoff.
- **Fix `connections` format**: the translator SHALL emit connections as a handle-keyed map (`{ "source": "targetId" }`) instead of an array of `{source, target}` pairs, matching `addConnectionsAsEdges` in the Sim engine.
- **Fix bare-connection and `add_edge` handling**: standalone `{connections: [...]}` operation items and `add_edge` ops SHALL both be converted into handle-keyed connection maps applied to the source block's `params.connections`.
- **Fix multi-object JSON parsing**: `parseArguments` SHALL recover when an LLM emits multiple concatenated top-level JSON objects (e.g. `{"operations":[...]},{"op":"add",...}`) by splitting and merging them, instead of discarding the entire payload.
- **Fix resume error extraction**: the `/api/tools/resume` handler SHALL extract the error message from the tool result `data` field so the LLM receives actionable feedback instead of an empty error string.
- **Fix system prompt**: the prompt SHALL use `inputs` (not `subBlocks`), SHALL NOT advertise `add_edge`/`delete_edge` as operation types (they are not in the Sim schema), and SHALL show the correct `connections` map format with a worked example.
- **Fix tool definition schema**: the `edit_workflow` JSON Schema description SHALL accurately describe the connections format and reinforce that every operation item requires an `op` field.

## Capabilities

### New Capabilities

_None — this change fixes an existing capability, it does not introduce a new one._

### Modified Capabilities

- `copilot-tool-execution`: The `edit_workflow` argument translation contract is corrected — `subBlocks` is renamed to `inputs`, `connections` is emitted as a handle-keyed map, multi-object JSON payloads are recovered, and resume error messages are extracted for LLM feedback.
- `copilot-prompt-engineering`: The system prompt and tool definition are corrected to use `inputs` instead of `subBlocks`, to remove the non-existent `add_edge`/`delete_edge` operation types, and to document the correct `connections` map format.

## Impact

- **Affected code (Go)**: `apps/copilot/internal/agent/agent.go` (`parseArguments`, `translateEditWorkflowArgs`, `buildToolDefs`), `apps/copilot/internal/prompt/default.md` (system prompt), `apps/copilot/main.go` (`handleResume`).
- **No TS changes**: the Sim-side `edit_workflow` engine, JSON schema, and tool catalog are the source of truth and remain unchanged. All fixes are Go-side.
- **No breaking API changes**: the Mothership SSE protocol and the `/api/internal/tools/execute` contract are unchanged. Only the shape of arguments the Go copilot *produces* (before sending to Sim) is corrected to match what Sim already expects.
- **Tests**: Go unit tests covering `parseArguments` (multi-object recovery), `translateEditWorkflowArgs` (`subBlocks`→`inputs`, connections map format, bare-connection handling, `add_edge` conversion), and `handleResume` (error extraction).
