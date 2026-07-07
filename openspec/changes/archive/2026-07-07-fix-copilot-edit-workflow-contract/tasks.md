## 1. Argument translation fixes (`translateEditWorkflowArgs`)

- [x] 1.1 Rename `subBlocks` → `inputs` in the nested `block` object path: when copying block fields into `params`, rename the `subBlocks` key to `inputs` so the Sim engine reads block configuration
- [x] 1.2 Rename `subBlocks` → `inputs` in the flat-format path: when an `edit` operation has `subBlocks` at the top level, rename it to `inputs` in `params`
- [x] 1.3 Rework the `edgeOps` accumulation to produce a handle-keyed map instead of an array of `{source, target}` pairs: collect connections per source block as `map[string][]string` (handle → target IDs), defaulting the handle to `"source"`
- [x] 1.4 Apply the collected connection map to the source block's `params.connections` as `{ "source": "targetId" }` (single target) or `{ "source": ["id1", "id2"] }` (multiple targets), matching `addConnectionsAsEdges` in the Sim engine
- [x] 1.5 Convert `add_edge` operations into the handle-keyed connection map (handle `"source"`, value = target), applied to the source block's `params.connections`
- [x] 1.6 Convert bare `{connections: [...]}` items (no `op` field) into the handle-keyed connection map: each `{source, target}` pair becomes a `"source": target` entry on the source block
- [x] 1.7 Handle `connections` nested inside a block object (LLM puts them in `block.connections`): extract and convert to the handle-keyed map on that block's `params.connections`
- [x] 1.8 Verify existing Sim-format operations (with `operation_type`) still pass through unchanged

## 2. Multi-object JSON recovery (`parseArguments`)

- [x] 2.1 Verify `splitTopLevelJSONObjects` correctly splits concatenated JSON objects by tracking brace/string/escape depth (already implemented — confirm it handles braces inside string values)
- [x] 2.2 Verify `parseConcatenatedJSONObjects` merges subsequent objects into the first object's `operations` array when present, or merges keys otherwise
- [x] 2.3 Verify single valid JSON objects take the fast `json.Unmarshal` path without invoking the splitter

## 3. System prompt and tool definition fixes

- [x] 3.1 Remove the `add_edge` and `delete_edge` operation type examples from `apps/copilot/internal/prompt/default.md`
- [x] 3.2 Update the `add` operation example in `default.md` to show `connections` as a handle-keyed map nested inside the `block` object (e.g. `"connections": {"source": "targetId"}`)
- [x] 3.3 Add a worked example to `default.md` showing two blocks added and connected in a single atomic `edit_workflow` call
- [x] 3.4 Add a rule to `default.md` stating every operation item MUST have an `op` field and connections MUST be nested inside a block operation, not emitted as standalone items
- [x] 3.5 Update the `edit_workflow` tool definition description in `buildToolDefs` (agent.go) to match the corrected prompt: describe the connections map format, reinforce the `op` requirement, and include the worked example
- [x] 3.6 Update the `connections` property description in the tool definition's JSON Schema to document the handle-keyed map format

## 4. Resume error extraction (`handleResume`)

- [x] 4.1 Verify `handleResume` in `main.go` extracts the error string from `data.error` when `success` is false (already implemented — confirm both the nested `data.error` and top-level `error` fallback paths)
- [x] 4.2 Verify successful results (`success: true`) do not set an error string even if an `error` field is present

## 5. Tests

- [x] 5.1 Add unit test for `translateEditWorkflowArgs`: `subBlocks` inside a nested `block` object is renamed to `inputs` in `params`
- [x] 5.2 Add unit test for `translateEditWorkflowArgs`: `subBlocks` in flat-format `edit` operations is renamed to `inputs`
- [x] 5.3 Add unit test for `translateEditWorkflowArgs`: `add_edge` operations produce a handle-keyed `{"source": "targetId"}` map on the source block's `params.connections`
- [x] 5.4 Add unit test for `translateEditWorkflowArgs`: bare `{connections: [...]}` items (no `op`) are converted to the handle-keyed connection map
- [x] 5.5 Add unit test for `translateEditWorkflowArgs`: `connections` nested inside a `block` object are extracted and converted to the map format
- [x] 5.6 Add unit test for `translateEditWorkflowArgs`: multiple targets from the same source produce `{"source": ["id1", "id2"]}`
- [x] 5.7 Add unit test for `translateEditWorkflowArgs`: existing Sim-format operations (with `operation_type`) pass through unchanged
- [x] 5.8 Add unit test for `parseArguments`: concatenated JSON objects `{"operations":[...]},{"op":"add",...}` are split and merged into a single operations array
- [x] 5.9 Add unit test for `parseArguments`: braces inside JSON string values (e.g. in code/prompt text) do not break the splitter
- [x] 5.10 Add unit test for `parseArguments`: single valid JSON object takes the fast path
- [x] 5.11 Add unit test for `parseArguments`: unparseable input falls back to `{"raw": args}`

## 6. Build and verification

- [x] 6.1 Run `go build ./...` in `apps/copilot/` and confirm no compile errors
- [x] 6.2 Run `go test ./...` in `apps/copilot/` and confirm all tests pass
- [ ] 6.3 Manually verify an end-to-end chat-created workflow: a multi-block workflow with connections retains block configuration (model, prompt, code) and connections after creation
