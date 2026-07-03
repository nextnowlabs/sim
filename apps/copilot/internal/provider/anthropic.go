package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type anthropicAdapter struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func NewAnthropicAdapter(apiKey string) ProviderAdapter {
	return &anthropicAdapter{
		apiKey:  apiKey,
		baseURL: "https://api.anthropic.com",
		client:  &http.Client{},
	}
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
}

type anthropicMessage struct {
	Role    string                  `json:"role"`
	Content []anthropicContentBlock `json:"content,omitempty"`
}

type anthropicTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"input_schema"`
}

type anthropicRequest struct {
	Model       string            `json:"model"`
	MaxTokens   int               `json:"max_tokens"`
	System      string            `json:"system"`
	Messages    []anthropicMessage `json:"messages"`
	Tools       []anthropicTool   `json:"tools,omitempty"`
	Stream      bool              `json:"stream"`
}

type anthropicStreamEvent struct {
	Type  string `json:"type"`
	Index *int   `json:"index,omitempty"`

	Delta struct {
		Type         string          `json:"type,omitempty"`
		Text         string          `json:"text,omitempty"`
		PartialJSON  string          `json:"partial_json,omitempty"`
	} `json:"delta,omitempty"`

	ContentBlock *anthropicContentBlock `json:"content_block,omitempty"`

	Usage *struct {
		InputTokens  int    `json:"input_tokens,omitempty"`
		OutputTokens int    `json:"output_tokens,omitempty"`
	} `json:"usage,omitempty"`

	Message *struct {
		Model string `json:"model,omitempty"`
		Usage *struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage,omitempty"`
	} `json:"message,omitempty"`

	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (a *anthropicAdapter) StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error) {
	if model == "" {
		model = "claude-sonnet-4-5-20250929"
	}

	anthropicTools := make([]anthropicTool, 0, len(tools))
	for _, t := range tools {
		anthropicTools = append(anthropicTools, anthropicTool{
			Name:        t.Function.Name,
			Description: t.Function.Description,
			InputSchema: t.Function.Parameters,
		})
	}

	anthMessages := make([]anthropicMessage, 0, len(messages))
	for _, m := range messages {
		role := m.Role
		content := m.Content
		if role == "function" || role == "tool" {
			role = "user"
		}
		if role == "system" {
			continue
		}
		block := anthropicContentBlock{
			Type: "text",
			Text: content,
		}
		anthMessages = append(anthMessages, anthropicMessage{
			Role:    role,
			Content: []anthropicContentBlock{block},
		})
	}

	reqBody := anthropicRequest{
		Model:     model,
		MaxTokens: 8192,
		System:    systemPrompt,
		Messages:  anthMessages,
		Tools:     anthropicTools,
		Stream:    true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", a.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	if err := checkHTTPError(resp, "anthropic"); err != nil {
		resp.Body.Close()
		return nil, err
	}

	eventCh := make(chan StreamEvent, 100)

	go func() {
		defer resp.Body.Close()
		defer close(eventCh)

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

		var toolCalls []ToolCall
		currentToolCall := &ToolCall{}
		var totalInputTokens, totalOutputTokens int

		for scanner.Scan() {
			select {
			case <-ctx.Done():
				eventCh <- StreamEvent{
					Type:  EventError,
					Error: fmt.Errorf("request cancelled: %w", ctx.Err()),
				}
				return
			default:
			}

			line := scanner.Text()
			if len(line) < 7 || line[:6] != "data: " {
				continue
			}

			data := line[6:]
			var event anthropicStreamEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				continue
			}

			switch event.Type {
			case "content_block_start":
				if event.ContentBlock != nil && event.ContentBlock.Type == "tool_use" {
					currentToolCall = &ToolCall{
						ID:   event.ContentBlock.ID,
						Type: "function",
					}
					currentToolCall.Function.Name = event.ContentBlock.Name
				}
			case "content_block_delta":
				switch event.Delta.Type {
				case "text_delta":
					eventCh <- StreamEvent{
						Type:      EventTextDelta,
						TextDelta: event.Delta.Text,
					}
				case "input_json_delta":
					currentToolCall.Function.Arguments += event.Delta.PartialJSON
				}
			case "content_block_stop":
				if event.Index != nil && currentToolCall.ID != "" {
					toolCalls = append(toolCalls, *currentToolCall)
					currentToolCall = &ToolCall{}
				}
			case "message_delta":
				if event.Usage != nil {
					totalOutputTokens += event.Usage.OutputTokens
				}
			case "message_start":
				if event.Message != nil && event.Message.Usage != nil {
					totalInputTokens += event.Message.Usage.InputTokens
				}
			case "message_stop":
				if len(toolCalls) > 0 {
					eventCh <- StreamEvent{
						Type:      EventToolCall,
						ToolCalls: toolCalls,
						Usage: &UsageInfo{
							InputTokens:  totalInputTokens,
							OutputTokens: totalOutputTokens,
							TotalTokens:  totalInputTokens + totalOutputTokens,
							Model:        model,
						},
					}
				}
			case "error":
				errMsg := "anthropic error"
				if event.Error != nil {
					errMsg = event.Error.Message
				}
				eventCh <- StreamEvent{
					Type:  EventError,
					Error: fmt.Errorf("anthropic: %s", errMsg),
				}
				return
			}
		}

		if err := scanner.Err(); err != nil && ctx.Err() == nil {
			eventCh <- StreamEvent{
				Type:  EventError,
				Error: fmt.Errorf("read stream: %w", err),
			}
			return
		}

		eventCh <- StreamEvent{
			Type: EventDone,
			Usage: &UsageInfo{
				InputTokens:  totalInputTokens,
				OutputTokens: totalOutputTokens,
				TotalTokens:  totalInputTokens + totalOutputTokens,
				Model:        model,
			},
		}
	}()

	return eventCh, nil
}
