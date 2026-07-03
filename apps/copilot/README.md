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
     │                             │  POST /api/internal/...    │                        │
     │                             │<───────────────────────────┤  (edit_workflow, etc.) │
     │                             │  { success, blocks, edges }│                        │
     │                             ├───────────────────────────>│                        │
     │                             │                            │                        │
```

### Protocol Boundaries

- **Sim → Copilot**: HTTP POST with JSON body containing `message`, `model`, `mode`, `chatId`, `integrationTools[]`, and context
- **Copilot → Sim**: Server-Sent Events (SSE) in Mothership v1 protocol format (`data: <JSON>\n\n`)
- **Copilot → Sim (Internal)**: `POST /api/internal/tools/execute` with `x-internal-secret` header for `edit_workflow` and other `sim`-executor tools
- **Copilot → Sim (Internal)**: `POST /api/internal/copilot/messages` for chat persistence

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
- A running Sim instance (for runtime tool execution and chat persistence via internal API)

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
| `SIM_INTERNAL_URL` | Yes | — | Sim internal API URL (e.g. `http://localhost:3000`) |
| `INTERNAL_API_SECRET` | Yes | — | Secret for Sim internal API authentication |
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
│   └── tools/
│       ├── executor.go      # Tool executor (local + sim proxy dispatch)
│       ├── executor_test.go # Tool executor tests
│       ├── sim_proxy.go     # Sim internal API proxy for tools
│       ├── files.go         # File I/O tools (read, write, list)
│       ├── code.go          # Sandboxed code execution tool
│       └── format.go        # Tool result to message formatting
```

## Tool Execution Flow

```
1. LLM returns tool_call for "edit_workflow"
2. Copilot emits tool(phase: call) SSE event
3. Copilot POSTs to $SIM_INTERNAL_URL/api/internal/tools/execute
   with x-internal-secret header
4. Sim runs edit_workflow operations
5. Sim returns { success, blocks, edges, lint, skippedItems }
6. Copilot emits tool(phase: result) SSE event
7. Copilot adds tool result to LLM conversation
8. LLM continues generating
```

## License

Apache 2.0
