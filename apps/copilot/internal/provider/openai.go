package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type openaiAdapter struct {
	apiKey       string
	baseURL      string
	client       *http.Client
	providerName string
}

func NewOpenAIAdapter(apiKey string) ProviderAdapter {
	return &openaiAdapter{
		apiKey:       apiKey,
		baseURL:      "https://api.openai.com",
		client:       &http.Client{},
		providerName: "openai",
	}
}

func newOpenAIAdapterWithBaseURL(apiKey, baseURL string) *openaiAdapter {
	return &openaiAdapter{
		apiKey:       apiKey,
		baseURL:      baseURL,
		client:       &http.Client{},
		providerName: "openai",
	}
}

type openaiMessage struct {
	Role    string       `json:"role"`
	Content string       `json:"content"`
}

type openaiRequest struct {
	Model       string          `json:"model"`
	Messages    []openaiMessage `json:"messages"`
	Tools       []ToolDefinition `json:"tools,omitempty"`
	Stream      bool            `json:"stream"`
}

type openaiStreamChoice struct {
	Index int `json:"index"`
	Delta struct {
		Role      string      `json:"role,omitempty"`
		Content   string      `json:"content,omitempty"`
		ToolCalls []openaiToolCallDelta `json:"tool_calls,omitempty"`
	} `json:"delta"`
	FinishReason *string `json:"finish_reason,omitempty"`
}

type openaiToolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function *struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function,omitempty"`
}

type openaiChunk struct {
	ID      string               `json:"id"`
	Object  string               `json:"object"`
	Created int64                `json:"created"`
	Model   string               `json:"model"`
	Choices []openaiStreamChoice `json:"choices"`
	Usage   *struct {
		PromptTokens     int `json:"prompt_tokens,omitempty"`
		CompletionTokens int `json:"completion_tokens,omitempty"`
		TotalTokens      int `json:"total_tokens,omitempty"`
	} `json:"usage,omitempty"`
}

func (a *openaiAdapter) StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error) {
	if model == "" {
		model = "gpt-4o"
	}

	openaiMessages := make([]openaiMessage, 0, len(messages)+1)

	if systemPrompt != "" {
		openaiMessages = append(openaiMessages, openaiMessage{
			Role:    "system",
			Content: systemPrompt,
		})
	}

	for _, m := range messages {
		role := m.Role
		if role == "function" || role == "tool" {
			role = "tool"
		}
		openaiMessages = append(openaiMessages, openaiMessage{
			Role:    role,
			Content: m.Content,
		})
	}

	// OpenAI doesn't support system tools prompt well, use user message if needed
	if systemPrompt != "" && len(openaiMessages) == 0 {
		openaiMessages = append(openaiMessages, openaiMessage{
			Role:    "system",
			Content: systemPrompt,
		})
	}

	reqBody := openaiRequest{
		Model:    model,
		Messages: openaiMessages,
		Tools:    tools,
		Stream:   true,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	endpoint := a.baseURL + "/v1/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+a.apiKey)

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	if err := checkHTTPError(resp, a.providerName); err != nil {
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
		toolCallMap := make(map[int]*ToolCall)

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
			if data == "[DONE]" {
				break
			}

			var chunk openaiChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}

			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					eventCh <- StreamEvent{
						Type:      EventTextDelta,
						TextDelta: choice.Delta.Content,
					}
				}

				for _, tc := range choice.Delta.ToolCalls {
					existing, ok := toolCallMap[tc.Index]
					if !ok {
						existing = &ToolCall{
							Index: tc.Index,
							Type:  "function",
						}
						toolCallMap[tc.Index] = existing
					}

					if tc.ID != "" {
						existing.ID = tc.ID
					}
					if tc.Type != "" {
						existing.Type = tc.Type
					}
					if tc.Function != nil {
						if tc.Function.Name != "" {
							existing.Function.Name = tc.Function.Name
						}
						existing.Function.Arguments += tc.Function.Arguments
					}
				}

				if choice.FinishReason != nil && *choice.FinishReason == "tool_calls" {
					for _, tc := range toolCallMap {
						toolCalls = append(toolCalls, *tc)
					}
					eventCh <- StreamEvent{
						Type:      EventToolCall,
						ToolCalls: toolCalls,
					}
					toolCalls = nil
					toolCallMap = make(map[int]*ToolCall)
				}
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
		}
	}()

	return eventCh, nil
}
