## Context

Sim's chat POST payload (`apps/sim/lib/copilot/chat/payload.ts`) already defines a `history` field on the wire, and the Go `ChatRequest` struct (`apps/copilot/internal/agent/agent.go:62`) already models it — but Sim never populates it, so `req.History` is always nil and every message in a chat runs with zero conversation memory. Sim's own DB is the authoritative transcript source: `copilot_chats` (title, workflow/workspace scoping) + `copilot_messages` (role, JSONB content, `seq` ordering, soft-deleted rows). Sim persists the user message before/while streaming and the assistant message when the turn completes (`finalizeAssistantTurn`); a pending-stream lock (`acquirePendingChatStream`) serializes streams per chat, so at most one in-flight turn exists per chat.

Chat titles: Sim calls `POST {goBase}/api/generate-chat-title` with `{message, model, provider?, workspaceId?, userId?}` on the first message of a new chat and persists a non-empty `title` response into `copilot_chats.title` (also emitting a `session/title` SSE event to the browser). The Go backend has no such route (404 → title stays NULL → history list shows "New Chat"). The agent's in-stream `session/title` event (truncated message) is relayed to the browser only, never persisted.

Constraint: **no changes to `apps/sim`.** Everything below is implemented in `apps/copilot` (Go). Sim's lifecycle, payload builder, and title caller are the source of truth and remain untouched.

## Goals / Non-Goals

**Goals:**
- Give the agent conversation memory within a chat: prior user/assistant turns are injected into the initial LLM message list, ordered and deduplicated, sourced from Sim's Postgres.
- Implement `/api/generate-chat-title` so every new chat gets a persisted, meaningful title.
- Degrade gracefully: no `DATABASE_URL` or a DB error never fails a chat message.
- Keep the wire protocol unchanged.

**Non-Goals:**
- No changes to Sim (routes, payload, lifecycle, DB writes).
- No conversation summarization/compaction — token budgeting relies on the existing `truncateMessages` (drop-oldest).
- No history for resume legs beyond what checkpoints already carry.
- No writes to the DB from the copilot (read-only; the existing dead `saveMessage` write is deleted).
- No title customization endpoint (Sim already has rename APIs + UI; out of scope).

## Decisions

### D1. Read history directly from Postgres via pgx

Add optional `DATABASE_URL` to `config.Config` and create a new package `internal/history` with a pgx pool. The loader queries `copilot_messages` mirroring Sim's read semantics (`apps/sim/lib/copilot/chat/lifecycle.ts:77-89`):

```sql
SELECT role, content FROM copilot_messages
WHERE chat_id = $1 AND deleted_at IS NULL AND message_id <> $2
ORDER BY seq ASC NULLS LAST, created_at ASC, id ASC
```

- `$2` = the current request's `messageId` (the payload's `userMessageId`; the user-message row is keyed by it) — dedups the in-flight message even when Sim's parallel `persistUserMessage` (post.ts `Promise.all`) committed before Go reads.
- Ordering mirrors Sim exactly (`seq` nullable → `NULLS LAST`; tiebreak `created_at`, `id`).
- Soft-deleted messages (`deleted_at IS NULL`) are excluded, matching the UI.

Alternatives considered:
- **Self-maintained store keyed by chatId (SQLite/in-memory)** — rejected: drifts from Sim's UI (deletes, forks, edits), loses memory on restart, and re-implements what the authoritative DB already has.
- **Sim HTTP API back-channel** (`GET /api/copilot/chat` etc.) — rejected: those routes authenticate browser sessions (`authenticateCopilotRequestSessionOnly`) or require `/api/internal/*` routes that do not exist in the open-source Sim.

Rationale: Sim's Postgres is the single source of truth; the copilot becomes stateless w.r.t. conversation memory, survives restarts, and stays consistent with the UI.

### D2. Text extraction from the JSONB content

Each row's `content` is a `PersistedMessage` (`apps/sim/lib/copilot/chat/persisted-message.ts`): `{role, content, contentBlocks: [{type, channel, content|text, ...}]}`. Extraction rules (mirror `processPastChatFromDb` in `process-contents.ts`):

1. Prefer `contentBlocks` — join all blocks of `type == "text"` in order, reading `content` or `text` key (Sim's normalize accepts both; the closed mothership wrote `text`).
2. Fall back to the top-level `content` string when there are no text blocks.
3. Skip rows whose extracted text is empty.
4. Produce `provider.Message{Role: role, Content: text}`.

Assistant thinking blocks (`channel: "thinking"`) are included in the join, matching Sim's own past_chat rendering; token bloat is bounded by the existing truncation (D4).

### D3. Injection point: initial leg only, inside `buildMessages`

`agent.go`'s `buildMessages` already supports history (`append(history, current...)`) — the slot just needs filling. The loader is injected into `Agent` as a `HistoryLoader` interface (production: pgx-backed; tests: fake):

```go
type HistoryLoader interface {
    Load(ctx context.Context, chatID string, excludeMessageID string) ([]provider.Message, error)
}
```

- Called only on the initial leg (`cp == nil`); resume legs use checkpoint `Messages`, which already include the injected history.
- Load failure (no `DATABASE_URL`, connection error, parse error) logs and returns nil history — the request proceeds without memory rather than failing.
- Concurrency: safe by construction — Sim serializes streams per chat, and the loader is read-only.

### D4. Token budgeting via existing truncation

Injected history sits at the front of the message list. `truncateMessages` (agent.go:666) walks from the tail and drops the oldest messages over the 80k-token history budget — exactly the desired drop-oldest semantics for long conversations. No new budget logic.

### D5. Title endpoint: default model + fallback title

`POST /api/generate-chat-title` registered alongside the chat handlers:

1. Parse `{message, model, provider?, workspaceId?, userId?}` (unknown fields ignored; `message` required → 400).
2. **Model selection: ignore the request `model`; use `COPILOT_DEFAULT_MODEL`.** Sim's `model` is the UI-selected Sim model name (e.g. `claude-opus-4-8`), invalid for the backend's single provider (e.g. DeepSeek). The agent loop already ignores `req.Model` in favor of `defaultModel` (agent.go:118) — consistent.
3. Call `adapter.StreamChat` with no tools and a minimal system instruction ("generate a concise title, max 8 words, no quotes"); collect text deltas until `done`.
4. Sanitize: trim, strip surrounding quotes, cap at ~60 chars.
5. Respond `{"title": "..."}`; on LLM error respond 200 with `{"title": <truncated first message, 60 chars>}` — Sim persists any non-empty title, so titles are never NULL.
6. No auth check (same as `/api/copilot`; Sim calls over internal network).

Alternatives considered: honoring the request `model` → rejected (single-provider backend, would 400 on mismatched model names); reusing the in-stream `session/title` truncated message as the only title → rejected (no LLM-derived titles, poor quality for the history list).

### D6. Remove dead Sim-API callbacks

`main.go`'s `saveMessage` POSTed to `/api/internal/copilot/messages` with `x-internal-secret` — a route that does not exist in the open-source Sim; the error was discarded (`_ =`). Sim persists user messages itself. With D1 the backend no longer needs any write-back. Additionally, `internal/tools/sim_proxy.go` (POST `/api/internal/tools/execute`) was unreachable — `detectExecutor` classifies only `read_file`/`write_file`/`list_directory`/`execute_code` as Go-executor, all of which live in `localHandlers`, so the proxy fallback never fired. Both callbacks, the `SimProxy`, and the now-unused `SIM_INTERNAL_URL` / `INTERNAL_API_SECRET` config entries are removed — the copilot has zero outbound HTTP calls to the Sim app; the only Sim-side data access is the read-only Postgres history loader.

## Risks / Trade-offs

- **[DB read per message adds latency]** → Query is indexed (`chatSeqIdx`, `chatCreatedAtIdx`), returns only `role, content` for one chat; negligible vs. LLM latency. Pool initialized at startup.
- **[Transcript ≠ LLM-visible history]** → Rows only include user/assistant text (tool results are stripped on Sim's write path too); the LLM sees a clean text exchange, which is the goal. No tool-call pairing needed since only text is injected.
- **[Retry/race duplicates]** → `message_id <> $exclude` guards the current message; Sim's `copilot_messages_chat_message_unique` index makes duplicates impossible at rest.
- **[User deleted messages reappear in LLM context]** → Soft-deleted rows are excluded (`deleted_at IS NULL`), matching the UI.
- **[DATABASE_URL credentials exposure]** → Standard PG connection string; the service already holds LLM API keys; deployment supplies it via env only.
- **[Title fallback may be low-quality]** → Only on LLM failure; better than NULL/"New Chat". Cost: one tiny LLM call per new chat.

## Migration Plan

1. Implement `internal/history` (pool + loader + text extraction) with fake-based unit tests.
2. Wire `HistoryLoader` into `Agent.buildMessages` (initial leg only), graceful degradation; delete `saveMessage`.
3. Implement `/api/generate-chat-title` + register route; unit test title sanitization and fallback.
4. Verify: `cd apps/copilot && go build ./... && go test ./...`; manual E2E: message 1 creates workflow, message 2 references message 1 without re-reading state; new chat shows generated title in Sim's chat list; restart copilot mid-conversation → memory intact.
5. Rollback: revert Go commit(s); Sim untouched throughout. Without `DATABASE_URL`, the service behaves exactly as before this change.

## Open Questions

- Should the injected history cap be configurable (e.g. `COPILOT_HISTORY_MAX_TURNS`) beyond the existing 80k token truncation? Default: rely on `truncateMessages` only.
- Title length/format: 8 words / 60 chars reasonable? Sim has no validation on `title` beyond non-empty.
