# Sim Copilot Backend

Open-source Go implementation of the Sim copilot backend, replacing the closed-source mothership service. This service receives chat messages from the Sim frontend, calls LLM APIs (Anthropic / OpenAI / OpenRouter / DeepSeek / Custom), executes tools, and streams structured SSE events back.

## Architecture

```
Browser (React)              Sim API (Next.js)            Copilot Go Backend       LLM Providers
     │                             │                            │                        │
     │  POST /api/copilot/chat     │                            │                        │
     ├────────────────────────────>│                            │                        │
     │                             │  POST /api/copilot/chat   │                        │
     │                             ├───────────────────────────>│                        │
     │                             │                            │  Stream Chat (SSE)     │
     │                             │                            ├───────────────────────>│
     │                             │                            │<───────────────────────┤
     │                             │  SSE events (data: {...})  │  TextDelta / ToolCall  │
     │                             │<───────────────────────────┤                        │
     │  SSE events (relayed)       │                            │                        │
     │<────────────────────────────┤                            │                        │
     │                             │                            │                        │
     │                             │  run(checkpoint_pause)     │  sim-executor tools    │
     │                             │  ─── Sim executes ───▶     │                        │
     │                             │  POST /api/tools/resume    │                        │
     │                             │<───────────────────────────┤                        │
     │                             │                            │                        │
     │                             │  (read-only, if DATABASE_URL)                        │
     │                             ├─────── copilot_messages ───▶ Postgres                │
     │                             │                            │                        │
```

### Protocol Boundaries

- **Sim → Copilot**: HTTP POST with JSON body containing `message`, `model`, `mode`, `chatId`, `integrationTools[]`, and context
- **Copilot → Sim**: Server-Sent Events (SSE) in Mothership v1 protocol format (`data: <JSON>\n\n`) — Sim executes `sim`-executor tools itself after `run(checkpoint_pause)` and resumes via `POST /api/tools/resume`
- **Copilot → Sim DB (read-only)**: conversation history loaded from Sim's Postgres `copilot_messages` table when `DATABASE_URL` is configured

### SSE Streaming Protocol

The streaming protocol follows the `MothershipStreamV1EventEnvelope` specification defined in `apps/sim/lib/copilot/generated/mothership-stream-v1.ts`. The Go struct mirror lives in `internal/protocol/types.go`.

Events are emitted in order:
1. `session(kind: start)` — stream initialization
2. `session(kind: chat)` — chat association (if `chatId` provided)
3. `session(kind: title)` — auto-generated title from first message
4. `text(channel: assistant|thinking)` — incremental text deltas
5. `tool(phase: call)` / `tool(phase: result)` — tool execution lifecycle
6. `complete(status: complete|error|cancelled)` — terminal event

Each event envelope contains `type`, `seq` (monotonic), `stream` (with `streamId`), `ts` (ISO 8601), and `v: 1`.

## Setup

### Prerequisites

- Go 1.22+
- A running Sim instance (for workflow/tool execution via the checkpoint/resume flow; optionally its Postgres for conversation history)

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COPILOT_LLM_PROVIDER` | Yes | — | LLM provider: `anthropic`, `openai`, `openrouter`, `deepseek`, `custom` |
| `ANTHROPIC_API_KEY` | If provider=anthropic | — | Anthropic API key |
| `OPENAI_API_KEY` | If provider=openai | — | OpenAI API key |
| `OPENROUTER_API_KEY` | If provider=openrouter | — | OpenRouter API key |
| `DEEPSEEK_API_KEY` | If provider=deepseek | — | DeepSeek API key |
| `CUSTOM_LLM_API_KEY` | If provider=custom | — | API key for custom provider |
| `CUSTOM_LLM_BASE_URL` | If provider=custom | — | Base URL for custom OpenAI-compatible API (e.g. `https://your-api.example.com/v1`) |
| `COPILOT_DEFAULT_MODEL` | Yes | — | Default model (e.g. `claude-sonnet-4-5`, `gpt-4o`, `deepseek-v4-pro`) |
| `DATABASE_URL` | No | — | Sim's Postgres connection string; enables conversation history (prior turns injected into the LLM context per chat) |
| `COPILOT_PROMPT_PATH` | No | — | Path to custom system prompt template file |
| `COPILOT_LISTEN_ADDR` | No | `:3002` | HTTP listen address |

### Provider Examples

**DeepSeek:**
```bash
export COPILOT_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY=sk-xxxx
export COPILOT_DEFAULT_MODEL=deepseek-v4-pro
```

**Custom (OpenAI-compatible, e.g. vLLM / Ollama / LM Studio / local models):**
```bash
export COPILOT_LLM_PROVIDER=custom
export CUSTOM_LLM_API_KEY=your-key
export CUSTOM_LLM_BASE_URL=https://your-api.example.com/v1
export COPILOT_DEFAULT_MODEL=your-model-name
```

### Running

```bash
# Build
make build

# Run
make run

# Test
make test

# Lint
make lint
```

Or using turborepo:

```bash
bunx turbo go:dev
```

## Configuring Sim

To point Sim at the open-source copilot backend, set the `COPILOT_BACKEND_URL` environment variable in Sim's environment:

```bash
COPILOT_BACKEND_URL=http://localhost:3002
```

If not set, Sim falls back to `SIM_AGENT_API_URL` (default: `https://www.copilot.sim.ai`) or the environment-specific URLs for admin users.

## Conversation Memory & Chat Titles

- **Conversation history**: when `DATABASE_URL` points at Sim's Postgres, each chat request loads the chat's prior user/assistant turns from `copilot_messages` (mirroring Sim's ordering and soft-delete semantics; the in-flight message is excluded by `message_id`) and prepends them to the LLM context. Without `DATABASE_URL`, or on a database error, the request proceeds without history — never fails. Resume legs reuse checkpoint messages and skip the database.
- **Chat titles**: Sim calls `POST /api/generate-chat-title` on the first message of a new chat. The endpoint generates a short title via the configured LLM using `COPILOT_DEFAULT_MODEL` (the request's `model` is a Sim-side model name and is ignored), sanitizes it (quotes stripped, ~60 char cap), and falls back to the truncated first message on LLM failure so the title is never empty.

## Project Structure

```
apps/copilot/
├── main.go                  # Entry point, HTTP server, handler wiring
├── stream_manager.go        # Per-stream cancel functions for abort
├── integration_test.go      # Integration tests
├── Makefile                 # Build/run/test targets
├── prompts/
│   └── default.md           # Default system prompt template
├── internal/
│   ├── agent/
│   │   ├── agent.go         # LLM agent loop, message history, tool iteration
│   │   └── agent_test.go    # Agent unit tests
│   ├── config/
│   │   └── config.go        # Environment-based configuration
│   ├── history/
│   │   └── history.go       # Conversation history loader (Sim Postgres copilot_messages)
│   ├── prompt/
│   │   ├── builder.go       # Template loading, variable substitution, block catalog formatting
│   │   ├── builder_test.go  # Prompt builder tests
│   │   ├── default.md       # Embedded default prompt (go:embed)
│   │   └── workflow.go      # Workflow state formatter
│   ├── provider/
│   │   ├── adapter.go       # ProviderAdapter interface, types
│   │   ├── anthropic.go     # Anthropic Messages API adapter
│   │   ├── openai.go        # OpenAI Chat Completions adapter
│   │   ├── openrouter.go    # OpenRouter adapter (wraps OpenAI)
│   │   ├── deepseek.go      # DeepSeek adapter (wraps OpenAI)
│   │   ├── custom.go        # Custom OpenAI-compatible adapter
│   │   └── errors.go        # Error handling, HTTP status mapping
│   ├── protocol/
│   │   └── types.go         # Go mirror of MothershipStreamV1 types
│   ├── stream/
│   │   ├── writer.go        # SSE stream writer, keepalive, lifecycle
│   │   └── writer_test.go   # Stream writer tests
│   ├── title/
│   │   ├── title.go         # Chat title generation (/api/generate-chat-title)
│   │   └── title_test.go    # Title generator tests
│   └── tools/
│       ├── executor.go      # Tool executor (local go-executor tools)
│       ├── executor_test.go # Tool executor tests
│       ├── files.go         # File I/O tools (read, write, list)
│       ├── code.go          # Sandboxed code execution tool
│       └── format.go        # Tool result to message formatting
```

## Tool Execution Flow

```
1. LLM returns tool_call for a sim-executor tool (edit_workflow, read, ...)
2. Copilot emits tool(phase: call) SSE event
3. Copilot emits run(checkpoint_pause) with the pending tool IDs and ends the stream leg
4. Sim executes the tools locally
5. Sim resumes via POST /api/tools/resume with the tool results
6. Copilot emits tool(phase: result) SSE events on the resume leg
7. Copilot adds tool results to LLM conversation
8. LLM continues generating (re-pauses rotate to fresh checkpoints)
```

## License

Apache 2.0
