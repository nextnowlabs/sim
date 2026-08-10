// Package history loads a chat's prior conversation turns from Sim's
// Postgres copilot_messages table so the agent can see earlier messages in
// the same chat. It is an optional feature: when no DATABASE_URL is
// configured the loader is nil and the agent runs without history.
package history

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"sim/copilot/internal/provider"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Loader provides prior conversation turns for a chat.
type Loader interface {
	// Load returns the chat's prior user/assistant turns in transcript
	// order, excluding the row whose message_id equals excludeMessageID
	// (the in-flight message, which Sim may already have persisted).
	Load(ctx context.Context, chatID string, excludeMessageID string) ([]provider.Message, error)
}

// PgLoader reads history from Sim's Postgres via a pgx connection pool.
type PgLoader struct {
	pool *pgxpool.Pool
}

// NewPgLoader creates a pgx pool for databaseURL. A failed initial
// connectivity check only logs (caller decides), so a temporarily
// unreachable database does not block startup.
func NewPgLoader(ctx context.Context, databaseURL string) (*PgLoader, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database unreachable: %w", err)
	}

	return &PgLoader{pool: pool}, nil
}

// Close releases the underlying connection pool.
func (l *PgLoader) Close() {
	l.pool.Close()
}

// Load implements Loader. Query and ordering mirror Sim's own transcript
// read (apps/sim/lib/copilot/chat/lifecycle.ts loadCopilotChatMessages):
// soft-deleted rows are excluded, rows order by seq (nulls last) with
// created_at/id as a deterministic tiebreak.
func (l *PgLoader) Load(ctx context.Context, chatID string, excludeMessageID string) ([]provider.Message, error) {
	const query = `
		SELECT role, content FROM copilot_messages
		WHERE chat_id = $1 AND deleted_at IS NULL AND message_id <> $2
		ORDER BY seq ASC NULLS LAST, created_at ASC, id ASC`

	rows, err := l.pool.Query(ctx, query, chatID, excludeMessageID)
	if err != nil {
		return nil, fmt.Errorf("query chat history: %w", err)
	}
	defer rows.Close()

	var messages []provider.Message
	for rows.Next() {
		var role string
		var contentJSON []byte
		if err := rows.Scan(&role, &contentJSON); err != nil {
			return nil, fmt.Errorf("scan chat history row: %w", err)
		}

		text, err := extractText(contentJSON)
		if err != nil {
			return nil, fmt.Errorf("parse chat history content: %w", err)
		}
		if strings.TrimSpace(text) == "" {
			continue
		}

		messages = append(messages, provider.Message{Role: role, Content: text})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate chat history: %w", err)
	}

	return messages, nil
}

// persistedMessage mirrors the shape Sim stores in copilot_messages.content
// (apps/sim/lib/copilot/chat/persisted-message.ts PersistedMessage). Only the
// fields needed for text extraction are declared; the JSONB may carry more.
type persistedMessage struct {
	Role          string `json:"role"`
	Content       string `json:"content"`
	ContentBlocks []struct {
		Type    string `json:"type"`
		Content string `json:"content"`
		// Text is the legacy key the closed mothership used for text blocks;
		// Sim's normalize accepts both.
		Text string `json:"text"`
	} `json:"contentBlocks"`
}

// extractText renders a persisted message as plain conversation text:
// join all text content blocks in order (content or text key), falling back
// to the top-level content string when there are no text blocks.
func extractText(contentJSON []byte) (string, error) {
	var msg persistedMessage
	if err := json.Unmarshal(contentJSON, &msg); err != nil {
		return "", err
	}

	var parts []string
	for _, block := range msg.ContentBlocks {
		if block.Type != "text" {
			continue
		}
		text := block.Content
		if text == "" {
			text = block.Text
		}
		if strings.TrimSpace(text) == "" {
			continue
		}
		parts = append(parts, text)
	}

	if len(parts) > 0 {
		return strings.Join(parts, ""), nil
	}
	return msg.Content, nil
}
