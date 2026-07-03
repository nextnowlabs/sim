## 1. Project Setup

- [x] 1.1 Create `apps/copilot/` directory with `go.mod` and `main.go`
- [x] 1.2 Set up Go project layout: `cmd/server/`, `internal/agent/`, `internal/provider/`, `internal/stream/`, `internal/tools/`, `internal/prompt/`, `internal/protocol/`, `internal/config/`
- [x] 1.3 Implement configuration module (`internal/config/config.go`) that reads `COPILOT_LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `COPILOT_DEFAULT_MODEL`, `SIM_INTERNAL_URL`, `INTERNAL_API_SECRET`, `COPILOT_PROMPT_PATH` from environment
- [x] 1.4 Add startup validation that fails fast (`log.Fatal`) if required env vars are missing
- [x] 1.5 Add `Makefile` with `build`, `run`, `test` targets; add `go run` task to root `turbo.json`

## 2. SSE Streaming Protocol

- [x] 2.1 Create Go struct mirror of `MothershipStreamV1EventEnvelope` types in `internal/protocol/types.go` — all event envelope types, payloads, and constants (`TextChannel`, `ToolPhase`, `CompletionStatus`, etc.)
- [x] 2.2 Implement `StreamWriter` in `internal/stream/writer.go` — `http.Flusher`-based SSE writer that formats events as `data: <JSON>\n\n`, assigns monotonic `seq` via `atomic.Int64`, enforces event ordering via channel
- [x] 2.3 Implement keepalive goroutine — sends SSE comment `: keepalive\n\n` every 15 seconds when no data events
- [x] 2.4 Implement stream lifecycle: `session(start)` → `session(chat)` → text/tool events → `complete(status)` — validated in `StreamWriter.Write()` that events arrive in valid order

## 3. LLM Provider Integration

- [x] 3.1 Define `ProviderAdapter` interface in `internal/provider/adapter.go` — `StreamChat(ctx, model, systemPrompt, messages, tools) (<-chan StreamEvent, error)` where `StreamEvent` is a Go enum: `TextDelta | ToolCall | ToolResult | Error | Done`
- [x] 3.2 Implement Anthropic adapter (`internal/provider/anthropic.go`) — uses `github.com/anthropics/anthropic-sdk-go`, Maps `content_block_delta` → `TextDelta`, `content_block_start(tool_use)` → `ToolCall`
- [x] 3.3 Implement OpenAI adapter (`internal/provider/openai.go`) — uses `github.com/sashabaranov/go-openai`, Maps `delta.content` → `TextDelta`, `delta.tool_calls` → `ToolCall`
- [x] 3.4 Implement OpenRouter adapter — wraps OpenAI adapter with `https://openrouter.ai/api/v1` base URL, adds `HTTP-Referer` and `X-Title` headers
- [x] 3.5 Implement provider error handling — map HTTP 401/429/5xx to protocol `ErrorEvent` with appropriate `code`, `provider`, and `displayMessage`
- [x] 3.6 Implement `context.Context`-based timeout (configurable, default 120s) — cancel LLM request, emit `error(code: timeout)` SSE event

## 4. Agent Loop

- [x] 4.1 Implement `Agent` struct in `internal/agent/agent.go` — holds `ProviderAdapter`, `ToolExecutor`, `PromptBuilder`, message history; method `Run(ctx, req) (<-chan protocol.Event, error)`
- [x] 4.2 Implement message history management — append user messages, assistant responses, and tool results to `[]Message` slice
- [x] 4.3 Implement tool-iteration loop — after `ToolCall` events from provider, execute tools via `ToolExecutor`, add results to messages, call provider again; max `MAX_TOOL_ITERATIONS` (20)
- [x] 4.4 Implement token budget estimation — approximate token count using `tiktoken-go` or simple heuristic (4 chars ≈ 1 token), truncate earliest messages when approaching model context limit
- [x] 4.5 Implement mode dispatch — `build` mode adds integration tools to provider request, `ask` mode excludes them

## 5. Tool Execution

- [x] 5.1 Implement `ToolExecutor` in `internal/tools/executor.go` — reads `executor` field from tool call context, dispatches to `simProxy` or local handler via map of `localHandlers map[string]ToolHandler`
- [x] 5.2 Implement Sim proxy executor (`internal/tools/sim_proxy.go`) — `http.Post` to `$SIM_INTERNAL_URL/api/internal/tools/execute` with `X-Internal-Secret` header, parse JSON response
- [x] 5.3 Implement local file tools (`internal/tools/files.go`) — `read_file`, `write_file`, `list_directory` operating on workspace VFS paths from request payload
- [x] 5.4 Implement local code execution tool (`internal/tools/code.go`) — sandboxed `execute_code` using `os/exec` with `context.WithTimeout` (default 30s), capturing stdout/stderr, returning `{stdout, stderr, exitCode}`
- [x] 5.5 Implement tool result formatting — convert execution result to provider-specific tool-result message format for appending to conversation

## 6. System Prompt Engineering

- [x] 6.1 Create default system prompt template at `apps/copilot/prompts/default.md` with `{{block_catalog}}`, `{{workflow_state}}`, `{{vfs_tree}}`, `{{mode}}` placeholders — embed via `embed.FS`
- [x] 6.2 Implement `PromptBuilder` in `internal/prompt/builder.go` — loads template, replaces `{{variables}}` with runtime values using `strings.ReplaceAll`
- [x] 6.3 Implement block catalog fetcher — on startup, call Sim internal API `GET /api/internal/blocks/catalog` for block list with descriptions and key subBlocks; cache with periodic refresh (hourly)
- [x] 6.4 Implement workflow state formatter — serialize current blocks (id, type, name, key subBlock values) and edges from the workflow state in the request context
- [x] 6.5 Support `COPILOT_PROMPT_PATH` env var — load custom template from filesystem, fall back to embedded default

## 7. Sim API Route Integration

- [x] 7.1 Add `COPILOT_BACKEND_URL` env var to `apps/sim/lib/copilot/constants.ts`
- [x] 7.2 Update `apps/sim/lib/copilot/server/agent-url.ts` to use `COPILOT_BACKEND_URL` when set, falling back to `SIM_AGENT_API_URL`
- [x] 7.3 Ensure stream parsing (`apps/sim/lib/copilot/request/go/stream.ts`) works unchanged with copilot backend responses

## 8. Chat Lifecycle

- [x] 8.1 Implement chat title auto-generation — extract short title from first user message using simple heuristic (first sentence, max 80 chars) or lightweight LLM call
- [x] 8.2 Implement stream stop/abort — `context.CancelFunc` stored per `streamId`, called when Sim sends abort request; agent loop checks `ctx.Done()`, emits `complete(status: cancelled)`
- [x] 8.3 Implement chat persistence — conversation history stored in `copilot_messages` table via Sim's internal API; copilot backend itself is stateless (no direct DB connection)

## 9. Development & Testing

- [x] 9.1 Add unit tests for `StreamWriter` — event formatting, sequence numbering, invalid order detection
- [x] 9.2 Add unit tests for `Agent.Run()` — tool iteration limit, mode dispatch, message truncation (mock `ProviderAdapter`)
- [x] 9.3 Add unit tests for `ToolExecutor` — sim proxy vs local handler dispatch, error propagation
- [x] 9.4 Add unit tests for `PromptBuilder` — template variable substitution, block catalog formatting
- [x] 9.5 Add integration test — full HTTP request → SSE stream → complete lifecycle with mock provider that returns canned `TextDelta` events
- [x] 9.6 Add integration test — multi-turn conversation with tool calling using mock provider that returns `ToolCall` then `TextDelta`
- [x] 9.7 Add README.md in `apps/copilot/` — setup instructions (Go 1.22+, env vars), architecture overview (ASCII diagram), API reference

## 10. Documentation

- [x] 10.1 Document all environment variables in copilot README with defaults and descriptions
- [x] 10.2 Document the SSE streaming protocol contract — reference `mothership-stream-v1.ts` as the canonical spec, note Go struct mirror location
- [x] 10.3 Document how to configure Sim's `COPILOT_BACKEND_URL` to point to the open-source copilot
- [x] 10.4 Add ASCII architecture diagram showing Sim → copilot → LLM provider flow with protocol boundaries
