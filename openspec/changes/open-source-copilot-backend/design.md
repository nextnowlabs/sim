## Context

Sim's AI copilot architecture is a two-tier system: the Next.js frontend/API (`apps/sim`) acts as a proxy that authenticates users, builds request payloads (tools, VFS, contexts), forwards them to a Go backend, and relays SSE events to the browser. The Go backend (Mothership) runs the actual LLM agent loop — it receives messages + tool schemas, calls LLM APIs with tool calling, decides which tools to invoke, and streams structured events back.

The streaming protocol between them is fully defined in the auto-generated type file `apps/sim/lib/copilot/generated/mothership-stream-v1.ts`. The POST request format is defined implicitly by `apps/sim/lib/copilot/chat/payload.ts`. The `edit_workflow` tool that mutates the workflow canvas is already open source on the Sim side.

The new `apps/copilot/` service replaces the closed-source Go backend. It sits behind Sim's existing API routes, receives the same payloads, and emits the same SSE stream. No frontend or API route changes are required.

```
BEFORE (current):                     AFTER (target):
Browser → Sim API → Go Mothership     Browser → Sim API → apps/copilot (new)
                ← SSE events                          ← SSE events
```

## Goals / Non-Goals

**Goals:**
- Implement the Mothership v1 SSE streaming protocol fully so the existing React frontend works without changes
- Implement LLM agent loop with tool calling (Anthropic Claude, OpenAI GPT, OpenRouter as providers)
- Support `edit_workflow` tool calls (delegated back to Sim's internal API)
- Support file operations (read/write in workspace VFS)
- Support conversation context management (history, trimming, compaction ready-points)
- Configurable via environment variables (provider, model, API keys, backend URL)
- Run as a Go service in the monorepo

**Non-Goals:**
- Sub-agent orchestration (file agent, research agent) in v1 — all work happens in the main agent loop
- Checkpoint pause/resume — the `run(checkpoint_pause)` event and confirmation flow are deferred
- Hosted API key billing — BYOK (bring your own key) only
- Async tool confirmation — all tools execute synchronously (mode: `sync`)
- Voice/speech-to-text — that's a frontend concern already handled
- Deployed chat (public-facing `/api/chat/[identifier]`) — that uses a different workflow-execution path, not the copilot backend
- Training data collection, feedback, analytics

## Decisions

### 1. Runtime: Go

**Rationale**: The original closed-source Mothership is written in Go, validating this choice for an LLM agent service. Go's goroutine-per-connection concurrency model maps naturally to long-lived SSE streams. The standard library `net/http` server is production-grade with zero dependencies. Go's static compilation produces a single binary — simpler deployment.

**Alternatives considered**: Bun/Node.js (monorepo integration but event-loop model less natural for stateful agent loops), Python (not in the monorepo ecosystem).

### 2. Service placement: `apps/copilot/` in the monorepo

**Rationale**: Keeps the copilot backend versioned alongside Sim's frontend and API — the SSE protocol types in `mothership-stream-v1.ts` are the contract between them, and they evolve together. Deploy as a separate container alongside `apps/sim`. Go code lives in `apps/copilot/`, built via `Makefile` or `go build`, orchestrated via root `turbo.json` task for `go run`.

Go cannot directly import TypeScript packages (`@sim/logger`, `@sim/db`). The copilot backend communicates with Sim exclusively over HTTP (internal API for tool execution, DB via Sim's API), so this is not a problem. The SSE protocol types (`mothership-stream-v1.ts`) must be mirrored as Go structs — maintained manually with a CI check that warns on drift.

**Alternatives considered**: Separate repo (version skew between protocol types), embed in `apps/sim` (bloats the Next.js process, different scaling needs).

### 3. LLM provider: Go-native SDKs with unified adapter interface

**Rationale**: Use `github.com/anthropics/anthropic-sdk-go` and `github.com/openai/openai-go` (or `github.com/sashabaranov/go-openai`) directly. Define a Go interface `ProviderAdapter` with methods `StreamChat(ctx, messages, tools)` that returns channels of `StreamEvent` (text delta, tool call, tool result, error, done). Each provider implements this interface.

The adapter is responsible for translating provider-specific streaming responses into the canonical `MothershipStreamV1EventEnvelope` format for SSE output. This mirrors the role of `apps/sim/providers/index.ts` but implemented natively in Go.

**Alternatives considered**: LangChain Go (heavy, opinionated, limited tool-calling support), single-provider-only (locks users into one vendor), calling Sim's provider API over HTTP (adds a network hop for every LLM call, defeats the purpose).

### 4. Tool execution: Call Sim's internal API for `sim` tools, implement `go` tools locally

**Rationale**: `edit_workflow` is already implemented in `apps/sim/lib/copilot/tools/server/workflow/edit-workflow/`. Instead of duplicating that ~3000 lines of workflow mutation logic, call Sim's internal API with `INTERNAL_API_SECRET`. Tools marked `executor: 'sim'` in the tool catalog get proxied.

For `executor: 'go'` tools, implement a small tool executor locally for filesystem operations (read, write, list files in the VFS), code execution (sandboxed), and web search.

**Tool execution flow**:
```
LLM returns tool_call for "edit_workflow"
  → copilot emits tool(call) SSE event
  → copilot POSTs to Sim internal API: /api/internal/tools/execute
  → Sim runs edit_workflow operations.ts logic
  → Sim returns { success, blocks, edges, lint }
  → copilot emits tool(result) SSE event
  → copilot adds tool result to LLM conversation
  → LLM continues generating
```

### 5. Agent loop: Single-pass with up to 20 tool iterations

**Rationale**: Follow the same pattern as `apps/sim/executor/handlers/agent/agent-handler.ts` and `apps/sim/providers/index.ts` (`MAX_TOOL_ITERATIONS = 20`). The loop:
1. Build provider request (system prompt + messages + tools)
2. Call LLM with streaming
3. Stream text deltas as `text` events
4. When LLM returns `tool_use`, emit `tool(call)` event
5. Execute tool, emit `tool(result)` event
6. Add tool result to messages, go to step 2
7. On final response or max iterations, emit `complete` event

**Alternatives considered**: ReAct loop with separate planning step (adds latency without clear benefit for workflow generation), parallel tool execution (adds complexity, most workflow operations are sequential).

### 6. Conversation context management: Sliding window with compaction markers

**Rationale**: LLM context windows are finite. For long conversations:
- Keep last N messages in full (configurable, default 50)
- When exceeding token budget, emit `run(compaction_start)` and `run(compaction_done)` events
- Older messages summarized into a system-prompt prefix
- User sees a brief "summarizing..." state via the existing frontend handling

V1 ships with simple truncation (keep last N messages). Compaction (LLM-based summarization) is a future enhancement — the protocol events are emitted but the logic is placeholder.

### 7. System prompt: Configurable template with block catalog from Sim API

**Rationale**: The system prompt is the most critical determinant of output quality. V1 uses a template stored as a file with `{{variables}}`:
- `{{block_catalog}}` — fetched from Sim's internal API (`GET /api/internal/blocks/catalog`) which returns block types, descriptions, key subBlocks, and outputs. The copilot caches this at startup and refreshes periodically.
- `{{workflow_state}}` — current workflow's blocks, edges, loops (if scoped to a workflow), fetched from Sim when a `workflowId` is provided.
- `{{vfs_tree}}` — workspace file tree from the request payload.
- `{{mode}}` — current mode (`build`, `ask`, `plan`)

The template instructs the LLM that:
- To modify the workflow, use `edit_workflow` with operations
- Each operation describes one change (add/edit/delete block, add/delete edge)
- Blocks are identified by their `type` (matches `blocks/registry.ts` keys)
- SubBlock values correspond to the block's configuration fields

### 8. Protocol types: Manual Go struct mirror with CI drift check

**Rationale**: The SSE protocol types are defined in TypeScript (`mothership-stream-v1.ts`). Go cannot import them. Maintain a hand-written Go mirror in `apps/copilot/internal/protocol/types.go` with identical JSON tags. A CI script compares the TS union members and Go struct fields, warning on drift without blocking builds (the protocol rarely changes).

Each Go struct maps 1:1 to a TS interface, e.g.:
```go
type TextEvent struct {
    Type    string          `json:"type"`    // "text"
    Seq     int             `json:"seq"`
    Stream  StreamRef       `json:"stream"`
    Trace   *Trace          `json:"trace,omitempty"`
    TS      string          `json:"ts"`
    V       int             `json:"v"`
    Scope   *StreamScope    `json:"scope,omitempty"`
    Payload TextPayload     `json:"payload"`
}
```

**Alternatives considered**: Code generation from TS → Go (heavy toolchain for a rare operation), JSON passthrough without typed structs (loses type safety on the Go side).

## Risks / Trade-offs

- **[Prompt quality]**: The system prompt determines whether the LLM generates correct `edit_workflow` operations. A bad prompt produces broken workflows. → Ship with a well-tested default prompt; make it configurable via env var or file so the community can iterate.
- **[Tool schema size]**: 200+ integration tools with full JSON schemas can consume significant context window. → Tools are marked `defer_loading: true` in the payload; the copilot can lazy-load tool details only when the LLM requests them. V1 loads all tools; defer loading is a future optimization.
- **[LLM cost]**: Each message consumes tokens proportional to conversation length + tool schemas. → Document token usage estimates; support OpenRouter for cheaper models; implement conversation trimming.
- **[edit_workflow reliability]**: The LLM may generate invalid operations (wrong block type, missing required fields). → The existing `edit_workflow/validation.ts` and `edit_workflow/lint.ts` handle this — invalid operations are skipped with `skippedItems` returned in the result. The LLM can retry on failure.
- **[No sub-agents in v1]**: The closed-source backend spawns sub-agents for file editing, research, etc. Without sub-agents, the main agent handles everything sequentially — slower for complex tasks but simpler and reliable. → Span events for sub-agents are omitted entirely in v1; the frontend gracefully handles their absence.
