// Package title generates chat titles for new conversations. Sim calls
// POST /api/generate-chat-title on the first message of a new chat and
// persists the returned non-empty title into copilot_chats.title.
package title

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"sim/copilot/internal/logger"
	"sim/copilot/internal/provider"
)

const (
	titleSystemPrompt = "Generate a concise title for this chat's first message. " +
		"Reply with ONLY the title: max 8 words, in the user's language, no quotes, no trailing punctuation, no explanation."
	maxTitleRunes = 60
	titleTimeout  = 30 * time.Second
)

// Generator produces chat titles from the configured LLM provider using the
// backend's default model (the request's model field is a Sim-side model
// name, invalid for the backend's single provider).
type Generator struct {
	adapter      provider.ProviderAdapter
	defaultModel string
}

func NewGenerator(adapter provider.ProviderAdapter, defaultModel string) *Generator {
	return &Generator{adapter: adapter, defaultModel: defaultModel}
}

type titleRequest struct {
	Message     string `json:"message"`
	Model       string `json:"model"`
	Provider    string `json:"provider"`
	WorkspaceID string `json:"workspaceId"`
	UserID      string `json:"userId"`
}

// Handler returns the HTTP handler for POST /api/generate-chat-title.
func (g *Generator) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req titleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Message) == "" {
			http.Error(w, "message is required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), titleTimeout)
		defer cancel()

		title := g.Generate(ctx, req.Message)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"title": title})
	}
}

// Generate returns a non-empty title for the first user message: an
// LLM-generated sanitized title on success, or the message itself truncated
// to the title cap on provider error / empty output. It never returns "".
func (g *Generator) Generate(ctx context.Context, message string) string {
	title := g.generateFromLLM(ctx, message)
	if title == "" {
		logger.Warnf("[title] LLM title generation failed, falling back to truncated message")
		return truncateRunes(strings.TrimSpace(message), maxTitleRunes)
	}
	return sanitize(title)
}

func (g *Generator) generateFromLLM(ctx context.Context, message string) string {
	eventCh, err := g.adapter.StreamChat(ctx, g.defaultModel, titleSystemPrompt, []provider.Message{
		{Role: "user", Content: message},
	}, nil)
	if err != nil {
		logger.Warnf("[title] LLM call failed: %v", err)
		return ""
	}

	var text strings.Builder
	for event := range eventCh {
		switch event.Type {
		case provider.EventTextDelta:
			text.WriteString(event.TextDelta)
		case provider.EventError:
			logger.Warnf("[title] LLM stream error: %v", event.Error)
			return ""
		}
	}
	return strings.TrimSpace(text.String())
}

// sanitize trims whitespace, strips surrounding quotes, and caps the title
// length. Returns "" for empty input.
func sanitize(title string) string {
	title = strings.TrimSpace(title)
	if len(title) >= 2 {
		if (title[0] == '"' && title[len(title)-1] == '"') ||
			(title[0] == '\'' && title[len(title)-1] == '\'') {
			title = strings.TrimSpace(title[1 : len(title)-1])
		}
	}
	return truncateRunes(title, maxTitleRunes)
}

// truncateRunes caps s at max runes (byte slicing would corrupt multi-byte
// text, e.g. Chinese titles).
func truncateRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}
