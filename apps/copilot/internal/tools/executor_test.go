package tools

import (
	"context"
	"testing"
)

type mockHandler struct {
	result *ToolResult
	err    error
}

func (h *mockHandler) Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	return h.result, h.err
}

func TestToolExecutor_LocalHandlerDispatch(t *testing.T) {
	te := &ToolExecutor{
		localHandlers: make(map[string]ToolHandler),
	}

	expectedResult := &ToolResult{
		Output: map[string]interface{}{
			"path":    "/test/file.txt",
			"content": "hello",
		},
	}

	te.RegisterHandler("test_tool", &mockHandler{
		result: expectedResult,
	})

	result := te.Execute(context.Background(), "test_tool", nil)

	if result.Output == nil {
		t.Error("output should not be nil")
	}
}

func TestToolExecutor_ErrorPropagation(t *testing.T) {
	te := &ToolExecutor{
		localHandlers: make(map[string]ToolHandler),
	}

	te.RegisterHandler("failing_tool", &mockHandler{
		err:    nil,
		result: &ToolResult{Error: "something went wrong"},
	})

	result := te.Execute(context.Background(), "failing_tool", nil)

	if result.Error != "something went wrong" {
		t.Errorf("expected error 'something went wrong', got %q", result.Error)
	}
}

func TestToolExecutor_UnknownToolReturnsError(t *testing.T) {
	te := &ToolExecutor{
		localHandlers: make(map[string]ToolHandler),
	}

	result := te.Execute(context.Background(), "unknown_tool", nil)

	if result.Error == "" {
		t.Error("expected error for unknown tool")
	}
}
