## Context

The Go copilot (`apps/copilot`) is a from-scratch replacement of Sim's closed-source mothership. It receives chat POSTs from Sim (`POST /api/copilot`), calls an LLM, executes tools, and streams MothershipStreamV1 SSE events back.

Tool execution uses a checkpoint/resume protocol between the two services:

```
Go:  LLM tool_call → tool(call) SSE → run(checkpoint_pause) SSE → wait for Sim
Sim: reads pause event → executes tool locally (phase:call already dispatched it)
     → POST /api/tools/resume {checkpointId, results[]} → expects a NEW SSE stream
```

Two fundamental mismatches exist:

1. **Resume is not a stream leg.** Sim's lifecycle (`apps/sim/lib/copilot/request/lifecycle/run.ts`) treats every `POST /api/tools/resume` as a new SSE stream it reads to a terminal event (`complete` or another `checkpoint_pause`). The Go backend instead blocks on a Go channel inside the **original** request handler (`agent.go:326`) and keeps writing to the original connection, while `handleResume` (`main.go:319`) answers the POST with plain JSON `{"ok": true}`. Sim's resume leg parses zero events → `CopilotBackendError 503 "Copilot backend stream ended before a terminal event"` → retries → Go's `GetCheckpoint` has already consumed the checkpoint (it deletes on read) → 404 → the message fails. The workflow edit itself succeeded (Sim executed the tool before the resume), so users see a working edit + a failed chat message. The agent also keeps streaming into a dead connection (Sim stopped reading it), which wedges once the TCP buffer fills.

2. **Only the first Sim tool call of a turn is checkpointed.** `agent.go:293-331` pauses on the first Sim-executor call and never processes the rest. Sim, however, already dispatched **all** of them on `phase:call` and executes them all; their results are never returned to the LLM, so the next provider call fails the strict tool_calls↔tool-message pairing → provider 400 → stream error.

Additional gaps observed while mapping the flow:

- **No workflow creation.** The agent's tool list is `edit_workflow` + integration tools only. Sim's catalog has `create_workflow` with a registered handler; Sim's executor even auto-threads the new `workflowId` into the execution context after a successful call (`executor.ts:693-704`), so subsequent `edit_workflow` calls would just work. Go never exposes the tool.
- **The model cannot see the workflow it is editing.** The prompt builder replaces `{{workflow_state}}` with "(not available)" (`builder.go:60`), and Sim's `context` array (which contains the `current_workflow` → `workflows/<name>/state.json` VFS path pointer and `past_chat` transcripts) is **logged but never rendered into the prompt**. The Go agent also has no `read`/`glob`/`grep` VFS tools, so it cannot read that path. The model guesses block IDs → `block_not_found` retry loops.
- **Block-ID sanitization can produce empty IDs** for non-ASCII names (`sanitizeID` strips everything), yielding `block_id: ""` → Sim validation failure.
- **The checkpoint store is unsynchronized** (plain `map` accessed across goroutines) and has no retry tolerance (Sim retries resume legs up to 3 times on 503s).

Constraint: **no changes to `apps/sim`.** Everything below is implemented in `apps/copilot` (Go).

## Goals / Non-Goals

**Goals:**
- Make every chat message that uses Sim-executor tools complete cleanly: resume responses are SSE stream legs read by Sim to a terminal event, matching the protocol Sim already implements.
- Checkpoint **all** Sim-executor tool calls in a turn and return **all** results in order, so LLM tool calls and tool messages always pair.
- Let the agent create workflows (`create_workflow`) and see the current workflow state (`read` of the `state.json` VFS pointer + rendered `context`).
- Survive Sim's resume retries (503 → retry) without 404-ing.
- Keep the protocol wire contract unchanged (envelope, `checkpoint_pause` payload, resume request shape).

**Non-Goals:**
- No changes to Sim (routes, lifecycle, parser, tool catalog, prompts).
- No new Go-executor tools; everything stays Sim-executed via the checkpoint flow.
- No multi-process/distributed checkpoint store (single-instance Go service; in-memory is fine).
- Not fixing the headless `/api/mothership/execute`-style flows beyond what the shared agent loop provides.

## Decisions

### D1. Pause = end the leg; resume = new SSE stream leg

When the agent encounters Sim-executor tool calls it SHALL:
1. emit `tool(call)` for every call (already done during stream read),
2. emit one `run(checkpoint_pause)` with **all** pending Sim tool IDs (`pendingToolCallIds`) and a fresh `checkpointId` (UUID per pause, not the request ID — the ID rotates each re-pause exactly like Sim's `driveOneChildChain` expects),
3. save a checkpoint containing `Messages`, `SystemPrompt`, `ToolDefs`, `Model`, `Trace`, `ToolToBlockType`, and the pending tool IDs,
4. **return** — the leg ends without a terminal event. Sim explicitly accepts this for pause legs (`expectedTerminal = streamComplete && !awaitingAsyncContinuation` is false there).

`handleResume` then becomes a first-class stream leg:
1. create a `StreamWriter` on the resume response (SSE headers, flush),
2. `GetCheckpoint(checkpointId)`; on miss, check the retry cache (D3),
3. build `CheckpointResult`s from **all** `results[]` entries in `pendingToolCallIds` order (current code reads only `results[0]`),
4. call the already-existing (but dead-code) `agent.RunFromCheckpoint(ctx, cp, sw, ...)` which appends the tool messages and continues the loop on the **resume** writer,
5. the leg ends with `complete` (done) or another `checkpoint_pause` (re-pause → next resume leg).

Alternatives considered:
- **Writer swap** (keep the single goroutine, swap the underlying writer on each resume): breaks on re-pause — the agent would write the *second* resume's output to the *first* resume's connection, which Sim has already abandoned. Requires connection bookkeeping and leaks open connections for multi-tool conversations. Rejected.
- **Channel push + continue on original stream** (current code): the source of the bug. Rejected.

Rationale: Sim's lifecycle is explicitly built for per-leg streaming; `RunFromCheckpoint` was scaffolded for exactly this and is currently unreachable. This design is the smallest delta that conforms to the existing Sim-side state machine.

### D2. Batch-checkpoint all Sim tool calls of a turn

In the post-stream execution loop, partition `completedToolCalls` into Go-executor and Sim-executor sets. Execute Go tools locally first, appending their tool messages in order, then checkpoint **all** Sim tools in one pause (single frame: `parentToolCallID` = first Sim call's ID, `pendingToolIds` = all Sim IDs). On resume, append all tool results in `pendingToolCallIds` order. This guarantees the provider sees a complete tool_calls → tool-messages pairing.

Note: a mixed turn (`edit_workflow` + `read_file`) produces `assistant(tool_calls…)` → tool(read_file) → checkpoint → resume appends tool(edit_workflow) — the message order stays valid because the assistant message with all tool_calls precedes all tool messages.

### D3. Retry-tolerant checkpoint store

`GetCheckpoint` currently deletes on read, so Sim's automatic resume retry (503 → up to 3 attempts) hits 404. Change the store to:
- a `sync.Mutex`-guarded map (fixes the existing data race),
- TTL-based eviction (e.g. 10 min, since legs can be long),
- on resume for an **already-consumed** checkpoint ID, re-run the leg from the saved checkpoint (the tool results are already in `Messages`, so re-running is deterministic in content, though the LLM stream is regenerated). Sim discards the failed attempt's events via `errorsBeforeAttempt` rollback, so no duplicate UI text.

Risk: a retried leg re-invokes the LLM (cost). Bound: Sim retries at most 3 times and only on stream errors (>=500); acceptable vs. a guaranteed message failure.

Alternative considered: buffering every emitted event per leg and replaying them on retry. Much more invasive (the writer consumes events), and re-running is what a state-restored resume implies anyway. Rejected for now; revisit if retry cost shows up in practice.

### D4. Abort propagation across legs

Currently only the initial stream ID is registered in `streamManager`, and Sim aborts by message ID. Register the cancel under both the Go stream ID **and** `req.MessageID` (and keep the per-leg context cancel). The abort route (`/api/streams/explicit-abort`) cancels the in-flight leg's context; the agent writes `complete(cancelled)` on that leg. Checkpoints hold no abort state; a cancelled leg simply leaves no pending checkpoint (pause never happened or the resume ctx is cancelled).

### D5. Extend the agent tool surface (Sim-executor)

Mirror the schemas from `apps/sim/lib/copilot/generated/tool-schemas-v1.ts` (read-only reference; do not import):

| Tool | Params (from tool-schemas-v1) | Why |
|---|---|---|
| `create_workflow` | `name` (required), `description?`, `folderId?`, `workspaceId?` | Create workflows from chat; Sim auto-threads the new `workflowId` into the exec context for subsequent `edit_workflow` |
| `read` | `path`, `toolTitle` (per schema) | Read `workflows/<name>/state.json` (the `current_workflow` context pointer) and other VFS files — this is what the payload's own "Read with: read(...)" instructions assume |
| `glob` | `pattern`, `toolTitle` | Discover files/workflows in the VFS |
| `grep` | per schema | Search within the workspace |

All four are `executor=sim`; Sim already registers handlers (`executeCreateWorkflow`, `executeVfsRead/Glob/Grep`) and dispatches them on `phase:call`. `detectExecutor` must classify them as `sim` (it already defaults unknown tools to `sim`, but explicit is better).

### D6. Render `req.Context` into the system prompt

The `context` array Sim sends (`{type, tag, content, path}` items — `past_chat` transcripts, `current_workflow`/`workflow` VFS pointers, `blocks`, knowledge, docs, …) is currently dropped. Render it as a `## Conversation & Workspace Context` section with one subsection per item, capped at a size budget (e.g. 32k chars) with per-item truncation. This restores multi-message conversation memory and gives the model the `state.json` pointer to read before editing. Add a prompt rule: when the workflow state is unknown, call `read("workflows/<name>/state.json")` (or `glob`) before `edit_workflow`.

### D7. Small correctness fixes

- `sanitizeID`: when the sanitized result is empty, fall back to `block_<i>` (index available at both call sites).
- Per-leg timeout: `Run`/`RunFromCheckpoint` already apply `context.WithTimeout(ctx, a.timeout)` (120s) — with D1 the deadline naturally resets per leg (each leg runs in its own request context). Keep the default; document it as per-leg.
- `handleResume` must return a proper SSE response (headers + flush) and handle the "no results" case with a 400 instead of pushing an empty result.
- Prompt (`default.md`): document the create flow (`create_workflow` → `edit_workflow`), the read-before-edit rule, and the workspace-vs-workflow distinction for `edit_workflow`'s implicit `workflowId`.

## Risks / Trade-offs

- **[Retried resume re-runs the LLM leg]** → Bounded by Sim's `MAX_RESUME_ATTEMPTS=3`; content-deterministic (results already in checkpoint messages); Sim rolls back failed-attempt events. Monitor via Go logs if cost concerns arise.
- **[Pause leg has no terminal event]** → Sim's pause-leg handling explicitly tolerates this (`awaitingAsyncContinuation` set ⇒ `expectedTerminal=false`); verified in `run.ts:564` and `handleRunEvent`.
- **[Order of tool messages in mixed turns]** → All tool messages are appended after the single assistant message containing all tool_calls; providers accept interleaving tool messages only if the assistant message precedes them, which holds (D2).
- **[`read`/`glob`/`grep` outputs can be large]** → Cap tool result content when formatting messages to the LLM (truncate to a few KB), same as the context budget.
- **[create_workflow in workspace chat may create a workflow the user didn't want]** → Prompt instructs the model to confirm intent when the user hasn't explicitly asked to create one; the tool is only defined, not forced.
- **[In-memory checkpoint store lost on restart]** → A restart mid-pause leaves Sim's resume hitting 404; Sim treats that as a hard failure of the turn, which is acceptable for a restart (same as today).

## Migration Plan

1. Implement D1+D2+D3 (resume leg core) with tests — this alone fixes the "message fails after every tool call" bug.
2. Implement D5 (new tool defs) + D6 (context rendering) + prompt updates — restores create/edit quality.
3. D4 abort propagation; D7 small fixes.
4. Verify: `cd apps/copilot && go build ./... && go test ./...`, then a manual end-to-end pass against a running Sim: create a workflow from chat (workspace chat), add blocks + connections, then a second message that edits the same workflow (must call `read` first), and a third message with two tool calls in one turn. Confirm every message ends with `complete` and no "stream ended before a terminal event" in Sim logs.
5. Rollback: the Go service is independently deployable; revert the Go commit(s). Sim is untouched throughout.

## Open Questions

- Should the context budget and tool-result truncation limits be configurable via env? (Default: constants; env later if needed.)
- `create_workflow` placement: workspace chat only, or also allow it when a workflow is open (creating a *new* workflow mid-session)? Default: allow anywhere; Sim's exec context only auto-threads when `execContext.workflowId` is unset.
