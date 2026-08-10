package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sim/copilot/internal/agent"
	"sim/copilot/internal/config"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"strings"
	"sync"
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

// scriptedMockProvider returns a different event script per StreamChat call,
// letting tests drive a multi-leg conversation (pause on call 1, answer on
// call 2).
type scriptedMockProvider struct {
	mu       sync.Mutex
	scripts  [][]provider.StreamEvent
	call     int
	messages []provider.Message
}

func (m *scriptedMockProvider) StreamChat(ctx context.Context, model, systemPrompt string, messages []provider.Message, tools []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	m.mu.Lock()
	m.messages = messages
	idx := m.call
	if idx >= len(m.scripts) {
		idx = len(m.scripts) - 1
	}
	m.call++
	script := m.scripts[idx]
	m.mu.Unlock()

	ch := make(chan provider.StreamEvent, len(script)+1)
	go func() {
		defer close(ch)
		for _, e := range script {
			select {
			case <-ctx.Done():
				return
			case ch <- e:
			}
		}
	}()
	return ch, nil
}

type sseEnvelope struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

// extractCheckpointID parses the first checkpoint_pause event from an SSE
// body and returns its checkpointId.
func extractCheckpointID(t *testing.T, body string) string {
	t.Helper()
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var env sseEnvelope
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &env); err != nil {
			continue
		}
		if env.Type == "run" && env.Payload["kind"] == "checkpoint_pause" {
			id, _ := env.Payload["checkpointId"].(string)
			return id
		}
	}
	t.Fatalf("no checkpoint_pause found in SSE body")
	return ""
}

// TestIntegration_FullChatPauseResumeComplete drives the full checkpoint
// protocol: chat leg pauses for a Sim tool, the resume leg streams
// session(start) and completes.
func TestIntegration_FullChatPauseResumeComplete(t *testing.T) {
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

	mockP := &scriptedMockProvider{
		scripts: [][]provider.StreamEvent{
			{
				{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{{
					ID: "call-1", Type: "function",
					Function: struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					}{Name: "edit_workflow", Arguments: `{"operations":[]}`},
				}}},
				{Type: provider.EventDone},
			},
			{
				{Type: provider.EventTextDelta, TextDelta: "Workflow updated!"},
				{Type: provider.EventDone},
			},
		},
	}
	ag := agent.NewAgent(mockP, tools.NewToolExecutor(cfg), promptBuilder, cfg.DefaultModel)
	sm := newStreamManager()

	chatReq := &agent.ChatRequest{
		Message: "Create a workflow",
		Model:   "claude-sonnet-4-5",
		Mode:    "build",
	}

	w1 := httptest.NewRecorder()
	sw1, err := stream.NewStreamWriter(w1, "chat-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw1.Close()

	if err := ag.Run(context.Background(), chatReq, sw1, "req-1"); err != nil {
		t.Fatalf("first leg failed: %v", err)
	}

	checkpointID := extractCheckpointID(t, w1.Body.String())
	if checkpointID == "" {
		t.Fatal("expected a checkpoint ID from the pause")
	}

	resumeBody, _ := json.Marshal(map[string]interface{}{
		"streamId":     "msg-1",
		"checkpointId": checkpointID,
		"userId":       "user-1",
		"results": []map[string]interface{}{
			{"callId": "call-1", "name": "edit_workflow", "success": true, "data": map[string]interface{}{"ok": true}},
		},
	})

	resumeReq := httptest.NewRequest(http.MethodPost, "/api/tools/resume", bytes.NewReader(resumeBody))
	resumeReq.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()

	handleResume(w2, resumeReq, ag, sm)

	if ct := w2.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("resume response must be SSE, got Content-Type %q", ct)
	}

	resumeBodyStr := w2.Body.String()
	if !strings.Contains(resumeBodyStr, `"type":"session"`) || !strings.Contains(resumeBodyStr, `"kind":"start"`) {
		t.Error("resume leg must start with session(start)")
	}
	if !strings.Contains(resumeBodyStr, "Workflow updated!") {
		t.Error("resume leg should stream the final text")
	}
	if !strings.Contains(resumeBodyStr, `"type":"complete"`) || !strings.Contains(resumeBodyStr, `"status":"complete"`) {
		t.Error("resume leg must end with a terminal complete event")
	}
}

// TestIntegration_ResumeAppliesAllResultsInOrder verifies ALL results are
// applied in pendingToolCallIds order even when the request body lists them
// in a different order.
func TestIntegration_ResumeAppliesAllResultsInOrder(t *testing.T) {
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

	mockP := &scriptedMockProvider{
		scripts: [][]provider.StreamEvent{
			{
				{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{
					{ID: "call-1", Type: "function", Function: struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					}{Name: "edit_workflow", Arguments: `{}`}},
					{ID: "call-2", Type: "function", Function: struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					}{Name: "read", Arguments: `{"path":"x"}`}},
				}},
				{Type: provider.EventDone},
			},
			{
				{Type: provider.EventTextDelta, TextDelta: "All results applied."},
				{Type: provider.EventDone},
			},
		},
	}
	ag := agent.NewAgent(mockP, tools.NewToolExecutor(cfg), promptBuilder, cfg.DefaultModel)
	sm := newStreamManager()

	chatReq := &agent.ChatRequest{Message: "Build", Model: "claude-sonnet-4-5", Mode: "build"}
	w1 := httptest.NewRecorder()
	sw1, err := stream.NewStreamWriter(w1, "chat-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw1.Close()
	if err := ag.Run(context.Background(), chatReq, sw1, "req-1"); err != nil {
		t.Fatalf("first leg failed: %v", err)
	}

	checkpointID := extractCheckpointID(t, w1.Body.String())

	// Results arrive REVERSED; the handler must order them by pendingToolCallIds.
	resumeBody, _ := json.Marshal(map[string]interface{}{
		"streamId":     "msg-2",
		"checkpointId": checkpointID,
		"userId":       "user-1",
		"results": []map[string]interface{}{
			{"callId": "call-2", "name": "read", "success": true, "data": map[string]interface{}{"content": "state"}},
			{"callId": "call-1", "name": "edit_workflow", "success": true, "data": map[string]interface{}{"ok": true}},
		},
	})

	resumeReq := httptest.NewRequest(http.MethodPost, "/api/tools/resume", bytes.NewReader(resumeBody))
	resumeReq.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	handleResume(w2, resumeReq, ag, sm)

	if !strings.Contains(w2.Body.String(), `"type":"complete"`) {
		t.Fatal("resume leg should complete")
	}

	mockP.mu.Lock()
	messages := mockP.messages
	mockP.mu.Unlock()

	var toolContents []string
	for _, m := range messages {
		if m.Role == "tool" {
			toolContents = append(toolContents, m.Content)
		}
	}
	if len(toolContents) != 2 {
		t.Fatalf("expected 2 tool messages, got %d", len(toolContents))
	}
	if !strings.Contains(toolContents[0], "edit_workflow") {
		t.Errorf("first tool message should be for call-1 (edit_workflow), got %q", toolContents[0])
	}
	if !strings.Contains(toolContents[1], "read") {
		t.Errorf("second tool message should be for call-2 (read), got %q", toolContents[1])
	}
}

func newResumeRequest(t *testing.T, body map[string]interface{}) *http.Request {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/tools/resume", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestResume_MissingCheckpointReturns404(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := agent.NewAgent(&scriptedMockProvider{}, tools.NewToolExecutor(&config.Config{}), promptBuilder, "test-model")
	sm := newStreamManager()

	req := newResumeRequest(t, map[string]interface{}{
		"checkpointId": "nope",
		"results":      []map[string]interface{}{{"callId": "c1", "name": "x", "success": true, "data": map[string]interface{}{}}},
	})
	w := httptest.NewRecorder()
	handleResume(w, req, ag, sm)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown checkpoint, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("404 body should be JSON, got %q", ct)
	}
}

func TestResume_EmptyResultsReturns400(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := agent.NewAgent(&scriptedMockProvider{}, tools.NewToolExecutor(&config.Config{}), promptBuilder, "test-model")
	sm := newStreamManager()

	req := newResumeRequest(t, map[string]interface{}{"checkpointId": "ckpt-x"})
	w := httptest.NewRecorder()
	handleResume(w, req, ag, sm)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty results, got %d", w.Code)
	}
}

func TestResume_MissingCheckpointIDReturns400(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := agent.NewAgent(&scriptedMockProvider{}, tools.NewToolExecutor(&config.Config{}), promptBuilder, "test-model")
	sm := newStreamManager()

	req := newResumeRequest(t, map[string]interface{}{
		"results": []map[string]interface{}{{"callId": "c1", "name": "x", "success": true, "data": map[string]interface{}{}}},
	})
	w := httptest.NewRecorder()
	handleResume(w, req, ag, sm)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing checkpointId, got %d", w.Code)
	}
}

// blockingToolHandler blocks until the context is cancelled, mimicking a
// long-running Go-executor tool.
type blockingToolHandler struct {
	entered chan struct{}
}

func (h *blockingToolHandler) Execute(ctx context.Context, args map[string]interface{}) (*tools.ToolResult, error) {
	close(h.entered)
	<-ctx.Done()
	return &tools.ToolResult{}, context.Canceled
}

// TestIntegration_ExplicitAbortCancelsLeg verifies /api/streams/explicit-abort
// (messageId lookup) cancels the in-flight leg and the leg emits
// complete(status: cancelled).
func TestIntegration_ExplicitAbortCancelsLeg(t *testing.T) {
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

	mockP := &scriptedMockProvider{
		scripts: [][]provider.StreamEvent{
			{
				{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{{
					ID: "call-1", Type: "function",
					Function: struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					}{Name: "read_file", Arguments: `{"path":"x"}`},
				}}},
				{Type: provider.EventDone},
			},
		},
	}

	executor := tools.NewToolExecutor(cfg)
	blocking := &blockingToolHandler{entered: make(chan struct{})}
	executor.RegisterHandler("read_file", blocking)

	ag := agent.NewAgent(mockP, executor, promptBuilder, cfg.DefaultModel)
	sm := newStreamManager()

	ctx, cancel := context.WithCancel(context.Background())
	sm.Register("chat-stream-1", cancel)
	sm.Register("msg-42", cancel)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "chat-stream-1")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	chatReq := &agent.ChatRequest{Message: "Read the file", Model: "claude-sonnet-4-5", Mode: "build"}

	done := make(chan error, 1)
	go func() {
		done <- ag.Run(ctx, chatReq, sw, "req-abort")
	}()

	<-blocking.entered

	abortBody, _ := json.Marshal(map[string]interface{}{"messageId": "msg-42"})
	abortReq := httptest.NewRequest(http.MethodPost, "/api/streams/explicit-abort", bytes.NewReader(abortBody))
	abortW := httptest.NewRecorder()
	handleAbort(abortW, abortReq, sm)

	if abortW.Code != http.StatusOK {
		t.Fatalf("abort should return 200, got %d", abortW.Code)
	}

	runErr := <-done
	if !errors.Is(runErr, context.Canceled) {
		t.Errorf("leg should return context.Canceled, got %v", runErr)
	}

	body := w.Body.String()
	if !strings.Contains(body, `"status":"cancelled"`) {
		t.Error("leg should emit complete(status: cancelled)")
	}
}
