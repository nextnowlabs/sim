## Why

Chat-based workflow creation/modification against the open-source copilot backend is unreliable and frequently ends in an error: the checkpoint/resume protocol between the Go copilot and Sim is mismatched. Sim treats every resume as a **new SSE stream leg** (`POST /api/tools/resume` must return continuing `text`/`tool`/`complete` events), but the Go backend instead blocks on a channel inside the original request and streams all subsequent events on the original (abandoned) connection, answering the resume with a plain JSON `{"ok": true}`. Sim's resume leg therefore reads zero events, fails with "Copilot backend stream ended before a terminal event" (503), retries once, finds the already-consumed checkpoint (404), and marks the message as failed — even though the workflow edit itself was applied. Additional defects compound this: only the **first** Sim-executor tool call in a turn is checkpointed (remaining calls execute on Sim but their results are never returned to the LLM, breaking the tool-call/result pairing), there is no `create_workflow` tool definition (so workflows cannot be created from chat at all), and the LLM never sees the current workflow state when editing (it guesses block IDs, causing `block_not_found` retry loops).

## What Changes

- **Fix the resume protocol (core)**: when the agent hits a Sim-executor tool call, it SHALL emit `tool(call)` + `run(checkpoint_pause)` and **end the current SSE leg** (return without a terminal event, which Sim already accepts for pause legs). The `/api/tools/resume` handler SHALL become a first-class stream leg: it looks up the checkpoint, appends the tool results, and continues the agent loop on the **resume connection** as a new SSE stream, emitting `session(start)` (writer state machine requirement) then `text`/`tool`/`checkpoint_pause`/`complete` events. Re-pauses rotate to a fresh checkpoint ID and a fresh resume leg.
- **Checkpoint ALL Sim-executor tool calls in a turn**: `pendingToolCallIds` SHALL contain every Sim-executor tool call ID from the turn (not just the first); on resume, results for **all** of them SHALL be appended as tool messages in call order, so the LLM's `tool_calls` are always fully paired with `tool` results.
- **Retry tolerance**: consumed checkpoints SHALL be retained briefly so a retried resume (Sim retries 503 stream errors up to 3 times) replays the leg instead of 404ing.
- **Add `create_workflow` and `get_workflow_data` tool definitions** (Go side only; the Sim-side handlers `executeCreateWorkflow` / `executeGetWorkflowData` are already registered): the agent can create a workflow from chat (Sim automatically threads the new `workflowId` into the execution context for subsequent `edit_workflow` calls) and can read the current workflow state before editing instead of guessing block IDs.
- **Per-leg timeouts**: the agent loop's deadline SHALL apply per stream leg (chat start and each resume), not to the whole multi-pause conversation.
- **Block-ID sanitization fallback**: `sanitizeID` SHALL fall back to a generated ID when its output is empty (e.g. all-Chinese names), instead of emitting an empty `block_id`.
- **Prompt alignment**: `default.md` SHALL document `create_workflow` / `get_workflow_data` usage and stop claiming the current workflow state is unavailable when the workflow context exists.

## Capabilities

### New Capabilities

_None — this change fixes and extends existing capabilities._

### Modified Capabilities

- `copilot-agent-loop`: checkpoint/resume mechanics — the agent loop ends its leg on pause and resumes on a new leg; all Sim-executor tool calls in a turn are checkpointed; per-leg timeouts; retry-tolerant checkpoint store.
- `copilot-streaming`: stream-leg semantics — the `/api/tools/resume` response IS an SSE stream leg with continuing events; pause legs terminate without a terminal event; each leg starts with `session(start)`.
- `copilot-tool-execution`: Sim-executor tool surface — `create_workflow` and `get_workflow_data` become callable tools; resume results are applied in full (all pending tool IDs, ordered), not just the first result.
- `copilot-prompt-engineering`: system prompt documents the workflow-creation flow (`create_workflow` then `edit_workflow`) and the workflow-state lookup (`get_workflow_data` before editing).

## Impact

- **Affected code (Go only)**: `apps/copilot/main.go` (`handleResume` becomes a streaming leg, checkpoint lookups), `apps/copilot/internal/agent/agent.go` (pause-and-return loop, batch checkpointing, `create_workflow`/`get_workflow_data` tool defs, `sanitizeID` fallback, per-leg timeout), `apps/copilot/internal/prompt/default.md` (prompt alignment), `apps/copilot/internal/stream/writer.go` (if needed for leg reuse), plus unit/integration tests.
- **No TS changes**: Sim's lifecycle (`apps/sim/lib/copilot/request/lifecycle/run.ts`), the SSE parser, and the tool catalog are the source of truth and remain untouched. This change makes the Go backend conform to the protocol Sim already implements.
- **No breaking API changes**: the Mothership SSE envelope, `checkpoint_pause` payload shape, and `/api/tools/resume` request contract are unchanged; only the *response* of the resume endpoint changes from JSON to SSE, which is what Sim has always expected.
- **Verification**: `go build ./...` + `go test ./...` in `apps/copilot/`, plus a manual end-to-end check (create workflow → add blocks → connect → second edit pass) against a running Sim instance.
