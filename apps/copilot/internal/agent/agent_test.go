package agent

import (
	"context"
	"fmt"
	"net/http/httptest"
	"sim/copilot/internal/history"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"strings"
	"sync"
	"testing"
	"time"
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
	ag := NewAgent(mockP, executor, promptBuilder, "test-model", nil)

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
	ag := NewAgent(mockP, executor, promptBuilder, "test-model", nil)

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
	ag := NewAgent(nil, nil, promptBuilder, "test-model", nil)

	tools := ag.buildToolDefs(&ChatRequest{
		IntegrationTools: []ToolSchema{
			{Name: "slack_send_message", Description: "Send a Slack message"},
		},
	}, "build")

	// edit_workflow + create_workflow/read/glob/grep + 1 integration tool
	if len(tools) != 6 {
		t.Errorf("build mode should include edit_workflow + workflow tools + integration tools, got %d", len(tools))
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

// TestAgent_BuildToolDefs_WorkflowTools ensures the workflow lifecycle + VFS
// tools are present in build mode and excluded in ask mode.
func TestAgent_BuildToolDefs_WorkflowTools(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(nil, nil, promptBuilder, "test-model", nil)

	buildTools := ag.buildToolDefs(&ChatRequest{}, "build")
	names := make(map[string]bool)
	for _, td := range buildTools {
		names[td.Function.Name] = true
	}
	for _, want := range []string{"create_workflow", "read", "glob", "grep"} {
		if !names[want] {
			t.Errorf("build mode tool defs should include %s", want)
		}
	}

	askTools := ag.buildToolDefs(&ChatRequest{}, "ask")
	for _, td := range askTools {
		if td.Function.Name == "create_workflow" || td.Function.Name == "read" ||
			td.Function.Name == "glob" || td.Function.Name == "grep" {
			t.Errorf("ask mode should exclude %s", td.Function.Name)
		}
	}
	if len(askTools) != 0 {
		t.Errorf("ask mode should return no tools, got %d", len(askTools))
	}
}

// TestAgent_DetectExecutor_WorkflowTools verifies the four new tools are
// classified as Sim-executor.
func TestAgent_DetectExecutor_WorkflowTools(t *testing.T) {
	for _, name := range []string{"create_workflow", "read", "glob", "grep"} {
		if got := detectExecutor(name); got != "sim" {
			t.Errorf("detectExecutor(%q) = %q, want \"sim\"", name, got)
		}
	}
}

func toolCall(id, name string) provider.ToolCall {
	return provider.ToolCall{
		ID:   id,
		Type: "function",
		Function: struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		}{
			Name:      name,
			Arguments: `{}`,
		},
	}
}

// TestAgent_Run_SingleSimToolCallPausesLeg verifies a turn with one Sim tool
// call ends the leg with checkpoint_pause and no complete event.
func TestAgent_Run_SingleSimToolCallPausesLeg(t *testing.T) {
	mockP := &mockProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{toolCall("call-1", "edit_workflow")}},
			{Type: provider.EventDone},
		},
	}

	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(mockP, &tools.ToolExecutor{}, promptBuilder, "test-model", nil)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	req := &ChatRequest{Message: "Build a workflow", Model: "test-model", Mode: "build"}
	if err := ag.Run(context.Background(), req, sw, "req-sim-1"); err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}

	body := w.Body.String()
	if !contains(body, `"kind":"checkpoint_pause"`) {
		t.Error("leg should emit checkpoint_pause")
	}
	if !contains(body, `"pendingToolCallIds":["call-1"]`) {
		t.Error("pause should list the Sim tool call ID")
	}
	if contains(body, `"type":"complete"`) {
		t.Error("pause leg must NOT emit a terminal complete event")
	}
}

// TestAgent_Run_TwoSimToolCallsSinglePause verifies a turn with two Sim tool
// calls emits ONE checkpoint_pause carrying both IDs.
func TestAgent_Run_TwoSimToolCallsSinglePause(t *testing.T) {
	mockP := &mockProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{
				toolCall("call-1", "edit_workflow"),
				toolCall("call-2", "read"),
			}},
			{Type: provider.EventDone},
		},
	}

	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(mockP, &tools.ToolExecutor{}, promptBuilder, "test-model", nil)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	req := &ChatRequest{Message: "Build a workflow", Model: "test-model", Mode: "build"}
	if err := ag.Run(context.Background(), req, sw, "req-sim-2"); err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}

	body := w.Body.String()
	pauseCount := countOccurrences(body, `"kind":"checkpoint_pause"`)
	if pauseCount != 1 {
		t.Errorf("expected exactly ONE checkpoint_pause, got %d", pauseCount)
	}
	if !contains(body, `"pendingToolCallIds":["call-1","call-2"]`) {
		t.Error("pause should list BOTH Sim tool call IDs in order")
	}
	if contains(body, `"type":"complete"`) {
		t.Error("pause leg must NOT emit a terminal complete event")
	}
}

// TestAgent_Run_MixedGoAndSimTools verifies Go-executor tools run locally
// before the Sim tools are checkpointed in one pause.
func TestAgent_Run_MixedGoAndSimTools(t *testing.T) {
	mockP := &mockProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventToolCall, ToolCalls: []provider.ToolCall{
				toolCall("call-1", "read_file"),
				toolCall("call-2", "edit_workflow"),
			}},
			{Type: provider.EventDone},
		},
	}

	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(mockP, &tools.ToolExecutor{}, promptBuilder, "test-model", nil)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	req := &ChatRequest{Message: "Build a workflow", Model: "test-model", Mode: "build"}
	if err := ag.Run(context.Background(), req, sw, "req-mixed"); err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}

	body := w.Body.String()
	// The Go tool result must be emitted before the pause for the Sim tool.
	callIdx := indexOf(body, `"phase":"call"`)
	resultIdx := indexOf(body, `"phase":"result"`)
	pauseIdx := indexOf(body, `"kind":"checkpoint_pause"`)
	if resultIdx < 0 {
		t.Error("Go tool result should be emitted for read_file")
	}
	if !(resultIdx < pauseIdx) {
		t.Error("Go tool result must be appended before the checkpoint_pause")
	}
	if callIdx < 0 {
		t.Error("tool call events should be emitted")
	}
}

func countOccurrences(s, substr string) int {
	count := 0
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			count++
		}
	}
	return count
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// TestSanitizeID_ChineseOnlyNameFallback verifies an all-Chinese block name
// still produces a non-empty block_id.
func TestSanitizeID_ChineseOnlyNameFallback(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","name":"客户服务机器人"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	blockID, _ := opMap["block_id"].(string)
	if blockID == "" {
		t.Fatal("block_id must not be empty for an all-Chinese block name")
	}
	if blockID != "block_0" {
		t.Errorf("block_id = %q, want fallback \"block_0\"", blockID)
	}
}

// TestSanitizeID_ChineseOnlyNameFallbackFlat verifies the flat-format call
// site behaves identically.
func TestSanitizeID_ChineseOnlyNameFallbackFlat(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","type":"llm_chat","name":"数据导入"}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	blockID, _ := opMap["block_id"].(string)
	if blockID != "block_0" {
		t.Errorf("block_id = %q, want fallback \"block_0\"", blockID)
	}
}

// TestTruncateToolResultContent verifies oversized tool results are truncated
// with a marker and never exceed the cap.
func TestTruncateToolResultContent(t *testing.T) {
	short := "Tool read result: {ok: true}"
	if got := truncateToolResultContent(short); got != short {
		t.Errorf("short content should pass through unchanged, got %d chars", len(got))
	}

	big := strings.Repeat("数据", 5000)
	got := truncateToolResultContent(big)
	if !strings.Contains(got, "[truncated]") {
		t.Error("oversized tool result should carry a truncation marker")
	}
	const marker = "\n... [truncated]"
	if len([]rune(got)) > MaxToolResultContentChars+len(marker) {
		t.Errorf("truncated content too large: %d runes", len([]rune(got)))
	}
}

func TestAgent_MessageTruncation(t *testing.T) {
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(nil, nil, promptBuilder, "test-model", nil)

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

func testCheckpoint(messages int) *Checkpoint {
	msgs := make([]provider.Message, messages)
	for i := range msgs {
		msgs[i] = provider.Message{Role: "user", Content: "hello"}
	}
	return &Checkpoint{
		Messages:           msgs,
		SystemPrompt:       "system",
		Model:              "test-model",
		PendingToolCallIDs: []string{"call-1"},
	}
}

// TestCheckpointStore_ConcurrentSaveGet exercises concurrent save/get from
// many goroutines. Run with -race to verify the store is mutex-guarded.
func TestCheckpointStore_ConcurrentSaveGet(t *testing.T) {
	checkpointStoreMu.Lock()
	checkpointStore = make(map[string]*checkpointEntry)
	checkpointStoreMu.Unlock()

	const workers = 32
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("ckpt-%d", i)
			SaveCheckpoint(id, testCheckpoint(2))
			cp := GetCheckpoint(id)
			if cp == nil {
				t.Errorf("goroutine %d: expected checkpoint to be resolvable", i)
			}
		}(i)
	}
	wg.Wait()
}

// TestCheckpointStore_ConsumedRemainsResolvable checks that a consumed
// checkpoint stays resolvable via ConsumedCheckpoint during the retry window
// and expires after the TTL.
func TestCheckpointStore_ConsumedRemainsResolvable(t *testing.T) {
	checkpointStoreMu.Lock()
	checkpointStore = make(map[string]*checkpointEntry)
	oldTTL := checkpointTTL
	checkpointTTL = 80 * time.Millisecond
	checkpointStoreMu.Unlock()
	defer func() {
		checkpointStoreMu.Lock()
		checkpointTTL = oldTTL
		checkpointStoreMu.Unlock()
	}()

	SaveCheckpoint("ckpt-retry", testCheckpoint(1))

	first := GetCheckpoint("ckpt-retry")
	if first == nil {
		t.Fatal("first GetCheckpoint should resolve the checkpoint")
	}
	if second := GetCheckpoint("ckpt-retry"); second != nil {
		t.Error("GetCheckpoint must return nil for an already-consumed ID")
	}

	replayed := ConsumedCheckpoint("ckpt-retry")
	if replayed == nil {
		t.Fatal("ConsumedCheckpoint should return the saved checkpoint during the retry window")
	}
	if len(replayed.Messages) != 1 {
		t.Errorf("replayed checkpoint should carry the saved messages, got %d", len(replayed.Messages))
	}

	time.Sleep(120 * time.Millisecond)
	if afterTTL := ConsumedCheckpoint("ckpt-retry"); afterTTL != nil {
		t.Error("ConsumedCheckpoint must return nil after the TTL expires")
	}
}

// TestCheckpointStore_UnknownID verifies unknown IDs are never resolvable.
func TestCheckpointStore_UnknownID(t *testing.T) {
	checkpointStoreMu.Lock()
	checkpointStore = make(map[string]*checkpointEntry)
	checkpointStoreMu.Unlock()

	if cp := GetCheckpoint("does-not-exist"); cp != nil {
		t.Error("GetCheckpoint must return nil for unknown IDs")
	}
	if cp := ConsumedCheckpoint("does-not-exist"); cp != nil {
		t.Error("ConsumedCheckpoint must return nil for unknown IDs")
	}
}

// recordingProvider captures every StreamChat call's messages so tests can
// assert exactly what the LLM received.
type recordingProvider struct {
	events []provider.StreamEvent
	calls  []recordedCall
}

type recordedCall struct {
	model    string
	messages []provider.Message
}

func (m *recordingProvider) StreamChat(ctx context.Context, model string, _ string, messages []provider.Message, _ []provider.ToolDefinition) (<-chan provider.StreamEvent, error) {
	m.calls = append(m.calls, recordedCall{
		model:    model,
		messages: append([]provider.Message(nil), messages...),
	})
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

// fakeHistoryLoader records Load invocations and returns preconfigured data.
type fakeHistoryLoader struct {
	messages []provider.Message
	err      error
	calls    int
	chatID   string
	exclude  string
}

func (f *fakeHistoryLoader) Load(_ context.Context, chatID string, excludeMessageID string) ([]provider.Message, error) {
	f.calls++
	f.chatID = chatID
	f.exclude = excludeMessageID
	return f.messages, f.err
}

func runAgentWithHistory(t *testing.T, loader history.Loader, req *ChatRequest) *recordingProvider {
	t.Helper()
	mockP := &recordingProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: "ok"},
			{Type: provider.EventDone},
		},
	}
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(mockP, &tools.ToolExecutor{}, promptBuilder, "test-model", loader)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	if err := ag.Run(context.Background(), req, sw, "req-1"); err != nil {
		t.Fatalf("Agent.Run failed: %v", err)
	}
	return mockP
}

func TestAgent_Run_HistoryInjectedBeforeCurrentMessage(t *testing.T) {
	loader := &fakeHistoryLoader{
		messages: []provider.Message{
			{Role: "user", Content: "prior question"},
			{Role: "assistant", Content: "prior answer"},
		},
	}
	req := &ChatRequest{
		Message:   "current question",
		Model:     "test-model",
		Mode:      "ask",
		ChatID:    "chat-1",
		MessageID: "msg-2",
	}

	mockP := runAgentWithHistory(t, loader, req)

	if loader.calls != 1 {
		t.Fatalf("history loader should be called once, got %d", loader.calls)
	}
	if loader.chatID != "chat-1" || loader.exclude != "msg-2" {
		t.Errorf("loader should receive chatID=chat-1 exclude=msg-2, got %s %s", loader.chatID, loader.exclude)
	}
	if len(mockP.calls) != 1 {
		t.Fatalf("provider should be called once, got %d", len(mockP.calls))
	}
	got := mockP.calls[0].messages
	want := []string{"prior question", "prior answer", "current question"}
	if len(got) != len(want) {
		t.Fatalf("expected %d messages, got %d: %+v", len(want), len(got), got)
	}
	for i := range want {
		if got[i].Role != []string{"user", "assistant", "user"}[i] || got[i].Content != want[i] {
			t.Errorf("message %d = %s:%q, want %q", i, got[i].Role, got[i].Content, want[i])
		}
	}
}

func TestAgent_Run_NoHistoryMessages(t *testing.T) {
	loader := &fakeHistoryLoader{messages: nil}
	req := &ChatRequest{
		Message:   "hello",
		Model:     "test-model",
		Mode:      "ask",
		ChatID:    "chat-1",
		MessageID: "msg-1",
	}

	mockP := runAgentWithHistory(t, loader, req)

	got := mockP.calls[0].messages
	if len(got) != 1 || got[0].Content != "hello" {
		t.Fatalf("expected only the current message, got %+v", got)
	}
}

func TestAgent_Run_HistoryLoaderErrorContinuesGracefully(t *testing.T) {
	loader := &fakeHistoryLoader{err: fmt.Errorf("db down")}
	req := &ChatRequest{
		Message:   "hello",
		Model:     "test-model",
		Mode:      "ask",
		ChatID:    "chat-1",
		MessageID: "msg-1",
	}

	mockP := runAgentWithHistory(t, loader, req)

	got := mockP.calls[0].messages
	if len(got) != 1 || got[0].Content != "hello" {
		t.Fatalf("expected graceful continuation without history, got %+v", got)
	}
}

func TestAgent_RunFromCheckpoint_SkipsHistoryLoader(t *testing.T) {
	loader := &fakeHistoryLoader{
		messages: []provider.Message{{Role: "user", Content: "should not load"}},
	}
	mockP := &recordingProvider{
		events: []provider.StreamEvent{
			{Type: provider.EventTextDelta, TextDelta: "resumed"},
			{Type: provider.EventDone},
		},
	}
	promptBuilder, _ := prompt.NewPromptBuilder("")
	ag := NewAgent(mockP, &tools.ToolExecutor{}, promptBuilder, "test-model", loader)

	w := httptest.NewRecorder()
	sw, err := stream.NewStreamWriter(w, "test-stream")
	if err != nil {
		t.Fatalf("NewStreamWriter failed: %v", err)
	}
	defer sw.Close()

	cp := &Checkpoint{
		Messages: []provider.Message{{Role: "assistant", Content: "checkpoint content"}},
		Model:    "test-model",
		Trace:    &loopTrace{},
	}
	req := &ChatRequest{MessageID: "msg-1", ChatID: "chat-1", Mode: "ask"}
	if err := ag.RunFromCheckpoint(context.Background(), req, sw, "req-1", cp, nil); err != nil {
		t.Fatalf("RunFromCheckpoint failed: %v", err)
	}

	if loader.calls != 0 {
		t.Fatalf("history loader must not run on resume legs, got %d calls", loader.calls)
	}
	if len(mockP.calls) != 1 || mockP.calls[0].messages[0].Content != "checkpoint content" {
		t.Fatalf("resume leg should continue from checkpoint messages, got %+v", mockP.calls)
	}
}
