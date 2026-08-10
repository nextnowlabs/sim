## 1. Checkpoint store hardening

- [x] 1.1 Add a mutex-guarded checkpoint store with TTL eviction in `internal/agent/agent.go`: `SaveCheckpoint`/`GetCheckpoint` become concurrency-safe; consumed checkpoints stay resolvable for a retry window (e.g. 10 min TTL) instead of being deleted on read
- [x] 1.2 Add a `ConsumedCheckpoint`-style lookup that returns the saved checkpoint for an already-consumed ID during the retry window, and nil otherwise (for D3 resume replay)
- [x] 1.3 Unit test: concurrent save/get does not race (`go test -race`)
- [x] 1.4 Unit test: checkpoint remains resolvable after first consume during the retry window; expires after TTL

## 2. Resume leg streaming (core fix)

- [x] 2.1 Rework `agent.go` `runLoop`: after streaming a turn, partition `completedToolCalls` into Go-executor and Sim-executor sets; execute Go tools locally and append their tool messages first
- [x] 2.2 Emit ONE `run(checkpoint_pause)` covering ALL Sim-executor tool calls of the turn: `PendingToolCallIDs` = all Sim IDs, `CheckpointID` = fresh UUID per pause (not the request ID), single frame with `ParentToolCallID` = first Sim call's ID and `pendingToolIds` = all IDs; `SaveCheckpoint` with the full loop state; then RETURN from `runLoop` WITHOUT a terminal event (end the leg)
- [x] 2.3 Keep the `CheckpointResult` channel plumbing only where still needed or remove it: the resume path SHALL go through `RunFromCheckpoint` with a new writer; remove the `<-resumeCh` blocking from `runLoop`
- [x] 2.4 Update `RunFromCheckpoint` so the `cp != nil` path: applies ALL `CheckpointResult`s (in pending-tool-call order) via `addToolResult` before running the loop, using the new writer
- [x] 2.5 Unit test: a turn with one Sim tool call ends the leg with `checkpoint_pause` and no `complete`
- [x] 2.6 Unit test: a turn with two Sim tool calls emits ONE pause with both IDs in `pendingToolCallIds`

## 3. Resume endpoint becomes a stream leg

- [x] 3.1 Rework `main.go` `handleResume`: validate body (checkpointId required, results array required); `GetCheckpoint`; on miss, check the retry window (task 1.2) and re-run from the saved checkpoint; on total miss respond 404 JSON
- [x] 3.2 Create a `StreamWriter` on the resume response, emit `session(start)` then continue via `agent.RunFromCheckpoint(ctx, cp, sw, requestID)`; stream to `complete` or the next `checkpoint_pause`; on pause the resume response ends without a terminal event
- [x] 3.3 Parse ALL `results[]` entries into `CheckpointResult`s (callId, name, success, data, error extraction — keep existing `data.error`/top-level `error` fallbacks); order them by the checkpoint's `pendingToolCallIds`; respond 400 when results are empty
- [x] 3.4 Ensure per-leg timeout: `RunFromCheckpoint` applies `context.WithTimeout(ctx, a.timeout)` (already does); pass `r.Context()` from the resume request
- [x] 3.5 Integration test (httptest): full chat → pause → resume → complete flow, asserting the resume response is SSE with `session(start)` and a terminal `complete`

## 4. Abort propagation across legs

- [x] 4.1 Register the cancel function under both the Go stream ID and `req.MessageID` in `streamManager` (and unregister both on leg end)
- [x] 4.2 Verify `/api/streams/explicit-abort` cancels the in-flight leg's context and the leg emits `complete(status: cancelled)`

## 5. Workflow lifecycle tool surface

- [x] 5.1 Add `create_workflow` tool definition to `buildToolDefs` (executor `sim`), schema from `tool-schemas-v1.ts`: `name` required, `description`/`folderId`/`workspaceId` optional
- [x] 5.2 Add `read`, `glob`, `grep` tool definitions (executor `sim`), schemas from `tool-schemas-v1.ts` (`read`: `path` + `toolTitle`; `glob`: `pattern` + `toolTitle`; `grep`: per schema)
- [x] 5.3 Add the four tool names to `detectExecutor`'s explicit `sim` list (default already routes unknown tools to sim — make it explicit)
- [x] 5.4 Unit test: `buildToolDefs` includes `create_workflow`/`read`/`glob`/`grep` in build mode and excludes them in ask mode

## 6. Context rendering and prompt alignment

- [x] 6.1 Render `req.Context` items into the system prompt: new section in `prompt.Build` (or a helper in `builder.go`) formatting each `{type, tag, content, path}` item, with a total size budget (~32k chars) and per-item truncation; keep `{{workflow_state}}` placeholder behavior for the empty case
- [x] 6.2 Update `internal/prompt/default.md`: document `create_workflow` (call first when no workflow is open; result contains the new workflowId), the read-before-edit rule (`read("workflows/<name>/state.json")` from the `current_workflow` context pointer), and confirmation before creating
- [x] 6.3 Unit test for the prompt builder: context items appear in the built prompt and oversized items are truncated

## 7. Correctness fixes

- [x] 7.1 `sanitizeID`: when the result is empty (e.g. all-Chinese names), fall back to `block_<i>` at both call sites in `translateEditWorkflowArgs`
- [x] 7.2 Cap tool-result message content when appending to the LLM conversation (`addToolResult`/`emitToolResult`), truncating oversized outputs (e.g. 8k chars) with a truncation marker
- [x] 7.3 Unit test: Chinese-only block name produces a non-empty `block_id`
- [x] 7.4 Unit test: oversized tool result is truncated in the tool message content

## 8. Build and verification

- [x] 8.1 Run `go build ./...` in `apps/copilot/`
- [x] 8.2 Run `go test ./...` (including `-race`) in `apps/copilot/` and confirm all tests pass
- [x] 8.3 Manual end-to-end against a running Sim (`COPILOT_BACKEND_URL` pointed at the local Go service): (a) workspace chat creates a workflow via `create_workflow` then `edit_workflow`; (b) second message edits the same workflow after a `read` of `state.json`; (c) a turn with two Sim tool calls; confirm every message ends with `complete` and no "stream ended before a terminal event" appears in Sim logs
