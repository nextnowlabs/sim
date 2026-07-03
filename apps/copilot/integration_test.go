package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sim/copilot/internal/agent"
	"sim/copilot/internal/config"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"strings"
	"testing"
)

type integrationMockProvider struct{}

func (m *integrationMockProvider) StreamChat(ctx context.Context, model, systemPrompt string, messages []provider.Message, tools []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	ch := make(chan provider.StreamEvent, 10)
	go func() {
		defer close(ch)
		ch <- provider.StreamEvent{Type: provider.EventTextDelta, TextDelta: "Hello! I can help you build workflows."}
		ch <- provider.StreamEvent{Type: provider.EventDone}
	}()
	return ch, nil
}

func TestIntegration_FullSSEStreamLifecycle(t *testing.T) {
	cfg := &config.Config{
		LLMProvider:       "anthropic",
		DefaultModel:      "claude-sonnet-4-5",
		SimInternalURL:    "http://localhost:3000",
		InternalAPISecret: "test-secret",
	}

	promptBuilder, err := prompt.NewPromptBuilder("")
	if err != nil {
		t.Fatalf("NewPromptBuilder failed: %v", err)
	}

	toolExecutor := tools.NewToolExecutor(cfg)
	mockP := &integrationMockProvider{}
	ag := agent.NewAgent(mockP, toolExecutor, promptBuilder, cfg.DefaultModel)

	reqBody := map[string]interface{}{
		"message": "Hello",
		"model":   "claude-sonnet-4-5",
		"mode":    "ask",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/copilot/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()

	sw, err := stream.NewStreamWriter(w, "test-stream-id")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	chatReq := &agent.ChatRequest{
		Message: "Hello",
		Model:   "claude-sonnet-4-5",
		Mode:    "ask",
	}

	err = ag.Run(context.Background(), chatReq, sw, "req-1")
	if err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}

	body := w.Body.String()

	if !strings.Contains(body, `"type":"session"`) {
		t.Error("response should contain session event")
	}

	if !strings.Contains(body, `"type":"text"`) {
		t.Error("response should contain text event")
	}

	if !strings.Contains(body, `"type":"complete"`) {
		t.Error("response should contain complete event")
	}

	scanner := bufio.NewScanner(strings.NewReader(body))
	eventCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			eventCount++
		}
	}

	if eventCount == 0 {
		t.Error("should have at least one SSE event")
	}
}

type toolCallMockProvider struct{}

func (m *toolCallMockProvider) StreamChat(ctx context.Context, model, systemPrompt string, messages []provider.Message, tools []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	ch := make(chan provider.StreamEvent, 10)
	go func() {
		defer close(ch)
		ch <- provider.StreamEvent{
			Type: provider.EventToolCall,
			ToolCalls: []provider.ToolCall{{
				ID:   "call-1",
				Type: "function",
				Function: struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				}{
					Name:      "slack_send_message",
					Arguments: `{"channel":"general","text":"hello"}`,
				},
			}},
		}
		ch <- provider.StreamEvent{Type: provider.EventTextDelta, TextDelta: "I've set up the workflow!"}
		ch <- provider.StreamEvent{Type: provider.EventDone}
	}()
	return ch, nil
}

func TestIntegration_MultiTurnConversation(t *testing.T) {
	cfg := &config.Config{
		LLMProvider:       "openai",
		DefaultModel:      "gpt-4o",
		SimInternalURL:    "http://localhost:3000",
		InternalAPISecret: "test-secret",
	}

	promptBuilder, err := prompt.NewPromptBuilder("")
	if err != nil {
		t.Fatalf("NewPromptBuilder failed: %v", err)
	}

	toolExecutor := tools.NewToolExecutor(cfg)

	mockP := &toolCallMockProvider{}
	ag := agent.NewAgent(mockP, toolExecutor, promptBuilder, cfg.DefaultModel)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream-2")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	chatReq := &agent.ChatRequest{
		Message: "Create a workflow",
		Model:   "gpt-4o",
		Mode:    "build",
		IntegrationTools: []agent.ToolSchema{
			{Name: "slack_send_message", Description: "Send a Slack message", Executor: "sim"},
		},
	}

	err = ag.Run(context.Background(), chatReq, sw, "req-2")
	if err != nil {
		t.Logf("Agent.Run result: %v", err)
	}

	body := w.Body.String()

	if !strings.Contains(body, `"type":"tool"`) {
		t.Error("response should contain tool event")
	}

	if !strings.Contains(body, `"type":"text"`) {
		t.Error("response should contain text event after tool call")
	}
}
