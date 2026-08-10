# copilot-conversation-history Specification

## Purpose
TBD - created by archiving change fix-copilot-conversation-memory. Update Purpose after archive.
## Requirements
### Requirement: Conversation history is loaded from Sim's Postgres

The copilot backend SHALL load the current chat's prior user/assistant turns from the `copilot_messages` table in Sim's Postgres database when a `DATABASE_URL` is configured, using the `chatId` from the chat request.

#### Scenario: Prior turns exist for the chat
- **WHEN** the copilot receives a chat request whose `chatId` has prior user/assistant messages in `copilot_messages`
- **THEN** the copilot SHALL load those messages and include them in the LLM conversation before the current user message

#### Scenario: Chat has no prior messages
- **WHEN** the copilot receives a chat request whose `chatId` has no messages in `copilot_messages`
- **THEN** the copilot SHALL run the agent with only the current message

#### Scenario: DATABASE_URL not configured
- **WHEN** the copilot receives a chat request and `DATABASE_URL` is not set
- **THEN** the copilot SHALL run the agent without conversation history and SHALL NOT fail the request

#### Scenario: Database unavailable or query fails
- **WHEN** the copilot's history query errors (connection failure, parse failure)
- **THEN** the copilot SHALL log the error and run the agent without conversation history, without failing the request

### Requirement: History excludes the current in-flight message

The copilot SHALL exclude the message row whose `message_id` equals the current request's `messageId` from the loaded history, so the current user message is never duplicated in the LLM conversation.

#### Scenario: Current message already persisted by Sim
- **WHEN** Sim's parallel persistence commits the current user message row before the copilot reads the history
- **THEN** the copilot SHALL still include the current message exactly once in the LLM conversation

### Requirement: History respects Sim's message ordering and soft-deletion

The copilot SHALL order loaded history as `seq ASC NULLS LAST, created_at ASC, id ASC` and SHALL exclude rows with a non-null `deleted_at`, mirroring Sim's own transcript reads.

#### Scenario: Rows have mixed seq values
- **WHEN** the chat has messages where some `seq` values are NULL
- **THEN** the copilot SHALL order NULL-seq rows after sequenced rows, with `created_at`/`id` as tiebreak

#### Scenario: Messages were soft-deleted
- **WHEN** the chat has rows with a non-null `deleted_at`
- **THEN** the copilot SHALL omit those rows from the loaded history

### Requirement: Text extraction from persisted message JSON

The copilot SHALL extract conversation text from each row's JSONB `content` (a `PersistedMessage`): join all `contentBlocks` of type `text` in order (reading either the `content` or `text` key), falling back to the top-level `content` string when no text blocks exist, and SHALL skip rows whose extracted text is empty. Extracted messages SHALL use the row's `role` and SHALL be injected before the current message.

#### Scenario: Message with contentBlocks
- **WHEN** a row's content JSON has `contentBlocks` with `type: "text"` blocks
- **THEN** the copilot SHALL join those blocks' text in order into a single message

#### Scenario: Message with only top-level content
- **WHEN** a row's content JSON has no text blocks
- **THEN** the copilot SHALL use the top-level `content` string as the message text

#### Scenario: Empty text
- **WHEN** a row's extracted text is empty or whitespace-only
- **THEN** the copilot SHALL skip that row

### Requirement: History injection is limited to the initial leg

The copilot SHALL load and inject conversation history only when starting a new agent leg (`Run` without a checkpoint). Resume legs SHALL continue from checkpoint messages, which already contain the injected history.

#### Scenario: Initial chat request
- **WHEN** the copilot runs the agent loop for a new chat request (no checkpoint)
- **THEN** the copilot SHALL load history and prepend it to the LLM messages

#### Scenario: Resume after checkpoint pause
- **WHEN** the copilot resumes an agent loop from a checkpoint
- **THEN** the copilot SHALL NOT re-load history from the database

### Requirement: History stays within the LLM token budget

The copilot SHALL apply its existing message truncation (drop-oldest when the conversation exceeds the history token budget) to the combined history + current messages.

#### Scenario: Long conversation exceeds budget
- **WHEN** the combined history exceeds the token budget
- **THEN** the copilot SHALL drop the oldest messages and keep the most recent within budget

