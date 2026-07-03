## ADDED Requirements

### Requirement: LLM provider is configured via environment

The copilot backend SHALL read LLM provider configuration from environment variables, supporting Anthropic, OpenAI, and OpenRouter as initial providers.

#### Scenario: Anthropic provider configured
- **WHEN** `COPILOT_LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` is set
- **THEN** the copilot SHALL use the Anthropic Messages API with Claude models

#### Scenario: OpenAI provider configured
- **WHEN** `COPILOT_LLM_PROVIDER=openai` and `OPENAI_API_KEY` is set
- **THEN** the copilot SHALL use the OpenAI Chat Completions API

#### Scenario: OpenRouter provider configured
- **WHEN** `COPILOT_LLM_PROVIDER=openrouter` and `OPENROUTER_API_KEY` is set
- **THEN** the copilot SHALL use the OpenRouter API, passing through to any supported model

#### Scenario: Missing API key
- **WHEN** the configured provider's API key environment variable is not set
- **THEN** the copilot SHALL fail to start with a clear error message indicating which variable is missing

### Requirement: Model selection is configurable

The copilot backend SHALL support configurable default model, with the ability for the Sim request to override the model per-chat.

#### Scenario: Default model from environment
- **WHEN** `COPILOT_DEFAULT_MODEL=claude-sonnet-4-5` is set and the request does not specify a model
- **THEN** the copilot SHALL use `claude-sonnet-4-5`

#### Scenario: Request overrides default model
- **WHEN** the Sim request body includes `model: 'gpt-4o'`
- **THEN** the copilot SHALL use `gpt-4o` for this request, regardless of the default

### Requirement: Copilot service URL is configurable in Sim

The existing Sim API routes SHALL support a `COPILOT_BACKEND_URL` environment variable to configure where copilot requests are forwarded.

#### Scenario: Custom backend URL configured
- **WHEN** `COPILOT_BACKEND_URL=http://localhost:3002` is set in Sim's environment
- **THEN** Sim SHALL forward copilot POST and stream requests to `http://localhost:3002` instead of the default Go backend

#### Scenario: Default backend URL
- **WHEN** `COPILOT_BACKEND_URL` is not set
- **THEN** Sim SHALL use the existing default `SIM_AGENT_API_URL` (or `https://www.copilot.sim.ai`)

### Requirement: Internal API secret secures tool callbacks

The copilot backend SHALL authenticate tool execution callbacks to Sim using `INTERNAL_API_SECRET`, matching Sim's existing internal API authentication pattern.

#### Scenario: Tool callback authenticated
- **WHEN** the copilot calls Sim's internal `/api/internal/tools/execute`
- **THEN** the request SHALL include the `x-internal-secret` header with the value of `INTERNAL_API_SECRET`

#### Scenario: Internal API secret mismatch
- **WHEN** the copilot's `INTERNAL_API_SECRET` does not match Sim's
- **THEN** Sim SHALL reject the request with 401 and the tool SHALL fail with an authentication error

### Requirement: Configuration validated at startup

The copilot backend SHALL validate all required configuration at startup and fail fast with descriptive error messages.

#### Scenario: All required config present
- **WHEN** all required environment variables are set to valid values
- **THEN** the copilot SHALL start and log the configured provider, model, and backend URL

#### Scenario: Missing required config
- **WHEN** a required environment variable is missing or empty
- **THEN** the copilot SHALL log a specific error message naming the variable and exit with code 1
