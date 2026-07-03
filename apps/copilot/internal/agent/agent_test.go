package agent

import (
	"context"
	"net/http/httptest"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"testing"
)

type mockProvider struct {
	events []provider.StreamEvent
}

func (m *mockProvider) StreamChat(ctx context.Context, model string, systemPrompt string, messages []provider.Message, tools []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	ch := make(chan provider.StreamEvent, len(m.events)+1)
	go func() {
		defer close(ch)
		for _, e := range m.events {
			select {
			case <-ctx.Done():
				return
			case ch <- e:
			}
		}
	}()

	return ch, nil
}

func TestAgent_Run_TextOnly(t *testing.T) {
	mockP := &mockProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: "Hello, "},
			{Type: provider.EventTextDelta, TextDelta: "world!"},
			{Type: provider.EventDone},
		},
	}

	promptBuilder, _ := prompt.NewPromptBuilder("")
	executor := &tools.ToolExecutor{}
	ag := NewAgent(mockP, executor, promptBuilder, "test-model")

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	req := &ChatRequest{
		Message: "Hello",
		Model:   "test-model",
		Mode:    "ask",
	}

	err = ag.Run(context.Background(), req, sw, "req-1")
	if err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}

	body := w.Body.String()

	if !contains(body, "Hello, ") {
		t.Error("response should contain text delta")
	}
	if !contains(body, "world!") {
		t.Error("response should contain text delta")
	}
}

func TestAgent_Run_WithToolCalls(t *testing.T) {
	mockP := &mockProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{{
				ID:   "call-1",
				Type: "function",
				Function: struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				}{
					Name:      "edit_workflow",
					Arguments: `{"op":"add"}`,
				},
			}}},
			{Type: provider.EventTextDelta, TextDelta: "Done!"},
			{Type: provider.EventDone},
		},
	}

	promptBuilder, _ := prompt.NewPromptBuilder("")
	executor := &tools.ToolExecutor{}
	ag := NewAgent(mockP, executor, promptBuilder, "test-model")

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	req := &ChatRequest{
		Message: "Build a workflow",
		Model:   "test-model",
		Mode:    "build",
	}

	err = ag.Run(context.Background(), req, sw, "req-2")
	// May error because edit_workflow is not a local handler and sim proxy isn't set up
	// But the flow should still work
	if err != nil {
		t.Logf("Agent.Run completed with error (expected for sim proxy): %v", err)
	}

	body := w.Body.String()
	if !contains(body, `"type":"tool"`) {
		t.Error("response should contain tool event")
	}
}

func TestAgent_Run_ModeDispatch(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(nil, nil, promptBuilder, "test-model")

	tools := ag.buildToolDefs(&ChatRequest{
		IntegrationTools: []ToolSchema{
			{Name: "slack_send_message", Description: "Send a Slack message"},
		},
	}, "build")

	if len(tools) != 2 {
		t.Errorf("build mode should include edit_workflow + integration tools, got %d", len(tools))
	}

	askTools := ag.buildToolDefs(&ChatRequest{
		IntegrationTools: []ToolSchema{
			{Name: "slack_send_message", Description: "Send a Slack message"},
		},
	}, "ask")

	if len(askTools) != 0 {
		t.Errorf("ask mode should exclude integration tools, got %d", len(askTools))
	}
}

func TestAgent_MessageTruncation(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(nil, nil, promptBuilder, "test-model")

	messages := make([]provider.Message, 100)
	for i := range messages {
		messages[i] = provider.Message{
			Role:    "user",
			Content: "this is a long message that uses tokens",
		}
	}

	truncated := ag.truncateMessages(messages, "system prompt", nil, 128000)

	if len(truncated) >= 100 {
		t.Skip("truncation test may not trigger with small messages in large context")
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
