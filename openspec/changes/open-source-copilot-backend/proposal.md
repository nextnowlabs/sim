## Why

Sim is an open-source workflow automation platform, but its AI copilot — the service that lets users create and modify workflows through natural language chat — is a closed-source Go binary hosted at `copilot.sim.ai`. This is the single biggest barrier to self-hosting Sim with full functionality. Building an open-source copilot backend makes Sim fully self-hostable and unlocks community contributions to the AI layer.

## What Changes

- **New app**: `apps/copilot/` — a Go HTTP service that implements the Mothership SSE streaming protocol (`mothership-stream-v1.ts`), receives chat messages from Sim, calls LLM APIs (Anthropic/OpenAI/OpenRouter) with tool definitions, and streams structured events back.
- **No frontend changes**: The existing React chat UI, the `useChat` hook, the `edit_workflow` server tool, and all 200+ integration tool definitions are already open-source and fully compatible with the protocol.
- **No API route changes in `apps/sim`**: Sim's existing `/api/copilot/chat` and `/api/mothership/chat` routes continue to act as the proxy. The copilot backend URL becomes configurable via `COPILOT_BACKEND_URL` env var.
- **LLM provider abstraction**: Go-native SDKs (Anthropic, OpenAI, OpenRouter) with a unified `ProviderAdapter` interface for tool calling and streaming.
- **Tool execution**: `edit_workflow` and other `sim`-executor tools are called back to Sim's internal API. `go`-executor tools (filesystem, code execution) are implemented locally.

## Capabilities

### New Capabilities

- `copilot-agent-loop`: Core LLM agent loop that receives chat messages, maintains conversation context, calls LLM APIs with tool definitions, and streams events in the Mothership v1 protocol.
- `copilot-tool-execution`: Execution of tools on behalf of the LLM agent. Handles routing between Sim-side tools (edit_workflow, integration tools) and copilot-side tools (file operations, code execution, web search).
- `copilot-streaming`: Server-Sent Events streaming of text, tool calls, subagent spans, resources, and completion events in exact compliance with `MothershipStreamV1EventEnvelope`.
- `copilot-prompt-engineering`: System prompt construction that provides the LLM with workflow context, available block types, tool usage guidance, and instruction on generating `edit_workflow` operations.
- `copilot-configuration`: Environment-based configuration for LLM provider selection, API keys, model preferences, and backend URL.

### Modified Capabilities

_None — this is a new capability with no changes to existing specs._

## Impact

- **New code**: `apps/copilot/` (new Bun service)
- **Affected existing code**: `apps/sim/lib/copilot/constants.ts` (add `COPILOT_BACKEND_URL` env var), `apps/sim/lib/copilot/request/go/` (abstract backend URL behind config)
- **Dependencies**: `@sim/logger`, `@sim/db`, `@sim/utils`, LLM provider SDKs (Anthropic, OpenAI)
- **Deployment**: New service alongside existing `apps/sim` and `apps/realtime`
- **Community**: Unblocks self-hosted Sim deployments with full AI copilot functionality
