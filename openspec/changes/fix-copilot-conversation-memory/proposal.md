## Why

The open-source Go copilot backend (`apps/copilot`) replaces Sim's closed-source mothership, but two user-facing gaps remain: (1) messages within the same chat are stateless — Sim never sends the conversation transcript to the backend (the `history` field is always absent and `past_chat` contexts are only injected when the user explicitly @-mentions another chat), so a second message in a chat has no memory of the first; (2) chat titles are never auto-generated — Sim calls `POST /api/generate-chat-title` on the first message of a new chat, but the Go backend does not implement that route, so titles stay NULL and the history list shows only "New Chat", making old conversations hard to find.

## What Changes

- **Conversation memory from Postgres (core)**: the copilot SHALL read the chat transcript directly from Sim's Postgres `copilot_messages` table (new optional `DATABASE_URL` config) and inject prior turns into the agent's initial message list. The current message is excluded by `message_id` to avoid duplication when Sim's parallel persistence races the request. Missing/absent DB config degrades gracefully (request proceeds without history, never fails the message).
- **`/api/generate-chat-title` endpoint**: implement the route Sim already calls on first message of a new chat. It SHALL generate a short title from the first user message via the configured LLM provider (using `COPILOT_DEFAULT_MODEL`, not the request's `model`, which is a Sim-side model name invalid for the backend's single provider), and fall back to a truncated message when the LLM call fails, so titles are never NULL.
- **Remove the dead `saveMessage` callback**: `main.go`'s `saveMessage` POSTs to `/api/internal/copilot/messages`, a route that does not exist in the open-source Sim; the error is silently swallowed. It is redundant (Sim persists user messages itself) and becomes obsolete once history is read from the DB — delete it.

## Capabilities

### New Capabilities

- `copilot-conversation-history`: loading the current chat's prior turns from Sim's Postgres (`copilot_messages`) and injecting them into the agent loop's initial messages, including dedup of the in-flight message, ordering semantics, text extraction from the JSONB content, and graceful degradation when the DB is unavailable.
- `copilot-chat-title`: the `POST /api/generate-chat-title` endpoint — request/response contract matching Sim's caller, model selection (default model, not the request model), title sanitization, and failure fallback.

### Modified Capabilities

- `copilot-configuration`: new optional `DATABASE_URL` environment variable for the conversation-history feature.

## Impact

- **Affected code (Go only)**: `apps/copilot/main.go` (route registration, remove `saveMessage`), `apps/copilot/internal/config/config.go` (`DATABASE_URL`), new `apps/copilot/internal/history/` package (pgx pool + loader), `apps/copilot/internal/agent/agent.go` (history injection in `buildMessages`), plus unit tests.
- **New dependency**: `github.com/jackc/pgx/v5` (Postgres driver + pool).
- **No TS changes**: Sim's payload builder, lifecycle, and title caller (`apps/sim/lib/copilot/...`) are untouched — the backend simply fills the `history` slot the payload contract already defines and answers the endpoint Sim already calls.
- **No breaking API changes**: the SSE protocol and chat POST contract are unchanged; `/api/generate-chat-title` matches the shape Sim already expects (`{title}` response).
- **Deployment**: the copilot service requires network access to the same Postgres as Sim and a new `DATABASE_URL` env var; without it the service runs exactly as before (history feature disabled).
- **Verification**: `cd apps/copilot && go build ./... && go test ./...`, then manual end-to-end: message 1 creates a workflow, message 2 edits it referencing message 1's workflow/block names without re-reading state, and a new chat shows a generated title in Sim's chat list.
