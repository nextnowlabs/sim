# copilot-configuration Delta

## ADDED Requirements

### Requirement: Postgres connection for conversation history is configurable

The copilot backend SHALL support an optional `DATABASE_URL` environment variable pointing at Sim's Postgres database. When set, the backend SHALL use it to read the `copilot_messages` table for conversation history. When unset, the backend SHALL run without the conversation-history feature and SHALL NOT fail to start or fail chat requests.

#### Scenario: DATABASE_URL set
- **WHEN** `DATABASE_URL` is set to Sim's Postgres connection string and the backend starts
- **THEN** the backend SHALL initialize a connection pool and load conversation history for chat requests

#### Scenario: DATABASE_URL unset
- **WHEN** `DATABASE_URL` is not set and the backend starts
- **THEN** the backend SHALL start normally and process chat requests without conversation history

#### Scenario: Invalid DATABASE_URL
- **WHEN** `DATABASE_URL` is set but the database is unreachable
- **THEN** the backend SHALL start with a logged warning and process chat requests without conversation history
