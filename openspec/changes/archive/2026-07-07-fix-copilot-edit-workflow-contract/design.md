## Context

The Go copilot backend (`apps/copilot/`) was built to mirror the Mothership SSE protocol and proxy `edit_workflow` tool calls to Sim's internal API. The Sim-side `edit_workflow` engine (`apps/sim/lib/copilot/tools/server/workflow/edit-workflow/`) is the source of truth for the operation contract: it expects operations of the form `{operation_type, block_id, params}` where `params` uses `inputs` (not `subBlocks`) for block configuration and a handle-keyed map for `connections`.

The Go copilot sits between the LLM and Sim and performs a translation step (`translateEditWorkflowArgs`) that converts an LLM-friendly format (`{op, id, type, name, subBlocks, connections}`) into the Sim format. Three translation defects break this contract:

1. **`subBlocks` is not renamed to `inputs`** — the Sim engine's `createBlockFromParams` and `handleEditOperation` read `params.inputs` exclusively (74 references, zero for `params.subBlocks`). Every block configuration the LLM produces is silently discarded.
2. **`connections` is emitted as an array of `{source, target}` pairs** — the Sim engine's `addConnectionsAsEdges` iterates `Object.entries(connections)` expecting handle keys (`"source"`, `"if"`, `"route-1"`). An array yields numeric keys (`"0"`, `"1"`) whose values lack a `.block` property, so every connection is silently dropped.
3. **The prompt advertises `add_edge`/`delete_edge`** — these operation types do not exist in the Sim JSON schema enum (`add`, `edit`, `delete`, `insert_into_subflow`, `extract_from_subflow`). The translator converts `add_edge` to (malformed) connections and skips `delete_edge` entirely, but the prompt still teaches the LLM to use them.

A fourth defect — `parseArguments` discarding multi-object JSON payloads — was already causing the "must have required property 'operations'" validation error observed in production logs.

## Goals / Non-Goals

**Goals:**
- Make chat-created workflows retain their block configuration (model, prompt, code, inputs, etc.).
- Make chat-created workflows retain their block-to-block connections.
- Stop the LLM from generating operation types the Sim schema rejects.
- Give the LLM actionable error feedback when a tool call fails, so it can self-correct instead of retrying blindly.
- Keep all changes Go-side; the Sim engine and its JSON schema are the source of truth and remain untouched.

**Non-Goals:**
- Changing the Sim-side `edit_workflow` engine, its JSON schema, or its tool catalog.
- Changing the Mothership SSE protocol or the `/api/internal/tools/execute` HTTP contract.
- Adding new operation types to the Sim engine.
- Redesigning the LLM-friendly format the prompt teaches (the `{op, block, subBlocks}` shape stays; only the translation and prompt wording are corrected).
- Passing `currentUserWorkflow` from Go to Sim (the DB-load fallback remains; this is a latency optimization, not a correctness issue).

## Decisions

### Decision 1: Rename `subBlocks` → `inputs` in the translation layer, not the prompt

**Choice**: Keep the prompt teaching `subBlocks` (it matches the Sim UI's terminology and is intuitive for the LLM), and rename the key to `inputs` inside `translateEditWorkflowArgs` when building `params`.

**Alternatives considered**:
- *Change the prompt to teach `inputs` directly*: rejected because `subBlocks` is the term the Sim UI, block registry, and existing prompt all use. Teaching `inputs` would diverge from platform vocabulary and risk confusing the LLM when it reads back workflow state (which uses `subBlocks` in its block descriptions).
- *Add a `subBlocks` reader to the Sim engine*: rejected because it would modify TS code, which is out of scope (the Sim engine is the source of truth and already has a well-defined `inputs` contract with validation).

### Decision 2: Emit `connections` as a handle-keyed map

**Choice**: Convert every connection source — `add_edge` ops, bare `{connections: [...]}` items, and `connections` nested inside a block object — into a single handle-keyed map on the source block's `params.connections`, using `"source"` as the default handle.

**Format**:
```
params.connections = {
  "source": "targetBlockId"     // simple linear connection
}
```

For multi-target or branched connections (condition/router blocks), the LLM may specify other handles (`"if"`, `"else"`, `"route-1"`), but the default and most common case is `"source"`.

**Rationale**: `addConnectionsAsEdges` (builders.ts:551-595) normalizes `"success"` → `"source"` and iterates `Object.entries(connections)`. The handle key IS the source output handle. The array-of-pairs format the translator currently emits produces numeric keys that the engine cannot interpret.

**Alternatives considered**:
- *Keep the array format and add array support to the Sim engine*: rejected — modifies TS code, and the map format is already the canonical contract.
- *Teach the LLM the map format directly in the prompt*: partially adopted (the prompt will show the map format in its example), but the translator must still normalize because the LLM may generate the array format anyway.

### Decision 3: Recover multi-object JSON in `parseArguments`

**Choice**: When `json.Unmarshal` fails (e.g. "invalid character ',' after top-level value"), split the input into individual top-level JSON objects by tracking brace/string/escape depth, parse each, and merge: if the first object has an `operations` array, append subsequent objects to it; otherwise merge keys.

**Rationale**: Some LLMs (observed with DeepSeek) emit `{"operations":[...]},{"op":"add",...},{"connections":[...]}` as a single tool-call arguments string. Go's `json.Unmarshal` rejects this entirely, causing `parseArguments` to fall back to `{"raw": "..."}` which has no `operations` key — the root cause of the "must have required property 'operations'" error. Splitting and merging preserves the LLM's intent.

**Alternatives considered**:
- *Use `json.Decoder` in a loop*: rejected because `json.Decoder.Decode` also fails on the comma between objects ("invalid character ',' looking for beginning of value"). A manual brace-depth scanner is required.
- *Reject and ask the LLM to retry*: rejected because it wastes a round-trip and the LLM tends to repeat the same malformed output.

### Decision 4: Extract error messages in the resume handler

**Choice**: In `handleResume` (main.go), when `result.Success` is false, extract the error string from `data.error` (the Sim-side adapter wraps errors as `[edit_workflow] <message>` inside the `data` object) and set `result.Error`. Also check a top-level `error` field as a fallback.

**Rationale**: The current code sets `result.Output = data` but never sets `result.Error`. The agent's `addToolResult` then produces `"Tool edit_workflow error: "` (empty string), leaving the LLM with no information to self-correct. The error message is already in the payload — it just needs to be extracted.

### Decision 5: Remove `add_edge`/`delete_edge` from the prompt; document the map format

**Choice**: Update `default.md` to:
- Remove the `add_edge` and `delete_edge` operation type examples.
- Show `connections` as a nested map inside the `add` operation's `block` object (the source block), using `"source": "targetId"` format.
- Add a worked example showing two blocks connected in a single atomic call.
- Reinforce that every operation item must have an `op` field and that connections belong inside the block, not as standalone items.

**Rationale**: The Sim schema enum is `add | edit | delete | insert_into_subflow | extract_from_subflow`. There is no `add_edge`. The translator converts `add_edge` to connections, but teaching the LLM a non-existent op type increases the chance of malformed payloads. `delete_edge` is silently dropped by the translator (not supported), so advertising it is misleading.

## Risks / Trade-offs

- **[Risk] LLM still generates the array-connections format despite prompt changes** → Mitigation: the translator normalizes both formats (array-of-pairs and handle-keyed map) into the canonical map, so even if the LLM does not follow the prompt, the output is correct.
- **[Risk] LLM still generates `add_edge` despite prompt removal** → Mitigation: the translator already converts `add_edge` to connections; this behavior is retained. The prompt change reduces frequency, the translator guarantees correctness.
- **[Risk] `subBlocks` → `inputs` rename breaks a block type that legitimately expects `subBlocks` in `params`** → Mitigation: confirmed via grep that the Sim engine has zero references to `params.subBlocks` (74 references to `params.inputs`). The rename is safe.
- **[Risk] Multi-object JSON splitter mishandles nested braces in strings** → Mitigation: the splitter tracks string and escape state, so braces inside JSON string values (e.g. in code or prompts) do not break the split. Unit tests cover this case.
- **[Trade-off] The translator now does more normalization work** → Acceptable: the alternative (trusting the LLM to produce the exact Sim format) is unreliable across providers. The translation layer is the correct place for format reconciliation.
- **[Trade-off] `delete_edge` remains unsupported** → Acceptable for now: the Sim engine has no delete-edge operation type. Edge removal is possible via `edit` with `removeEdges` in `params`, but that is an advanced feature not needed for the common chat-creation flow. The prompt will not advertise it.
