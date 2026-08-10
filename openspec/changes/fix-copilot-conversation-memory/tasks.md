## 1. Database access foundation

- [x] 1.1 Add `github.com/jackc/pgx/v5` to `apps/copilot/go.mod` and wire `DATABASE_URL` into `internal/config/config.go` (optional; no startup failure when unset, warn-log when set but unreachable)
- [x] 1.2 Create `internal/history/history.go`: `HistoryLoader` interface, pgx pool constructor (lazy/optional), and `Load(ctx, chatID, excludeMessageID)` implementing the `copilot_messages` query with Sim's ordering (`seq ASC NULLS LAST, created_at ASC, id ASC`) and `deleted_at IS NULL` + `message_id <> $2` filters
- [x] 1.3 Implement text extraction from the JSONB `content`: join `contentBlocks` entries of `type == "text"` in order (accept both `content` and `text` keys), fall back to top-level `content`, skip empty results, return `[]provider.Message` with the row's role

## 2. History injection into the agent loop

- [x] 2.1 Add `historyLoader HistoryLoader` to `Agent` (constructor param), calling `Load` only on the initial leg (`cp == nil`) inside `buildMessages`/`RunFromCheckpoint`, prepending results before the current message; on loader error or nil loader, log and continue without history
- [x] 2.2 Unit tests: fake `HistoryLoader` covering injection order (history before current message), no-history chat, loader error → graceful continuation, and resume-leg skips the loader

## 3. Chat title endpoint

- [x] 3.1 Implement `handleGenerateChatTitle` in `apps/copilot/main.go` (or a new `internal/title/title.go`): parse `{message, model, provider?, workspaceId?, userId?}`, 400 on missing/empty `message`, call `adapter.StreamChat` with no tools and `COPILOT_DEFAULT_MODEL` (ignoring the request `model`), collect text deltas
- [x] 3.2 Add title sanitization: trim, strip surrounding quotes, cap at ~60 chars; fall back to truncated first message on LLM error or empty output (200 response either way)
- [x] 3.3 Register `POST /api/generate-chat-title` in `main.go` and add unit tests (sanitization, fallback, default-model usage, missing message → 400)

## 4. Cleanup and verification

- [x] 4.1 Remove the dead `saveMessage` call and function from `apps/copilot/main.go` (keep `SIM_INTERNAL_URL`/`INTERNAL_API_SECRET` — still used by `internal/tools/sim_proxy.go`)
- [x] 4.2 Run `cd apps/copilot && go build ./... && go test ./...`; update `apps/copilot/README.md` with the new `DATABASE_URL` env var and the title endpoint
- [ ] 4.3 Manual E2E: message 1 creates a workflow, message 2 references message 1's workflow/block names without re-reading state; a new chat shows a generated (non-"New Chat") title in Sim's chat list; restart the copilot mid-conversation and confirm memory persists
