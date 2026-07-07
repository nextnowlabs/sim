package provider

import "context"

type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
}

type ToolDefinition struct {
	Type     string      `json:"type"`
	Function ToolFuncDef `json:"function"`
}

type ToolFuncDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

type ToolCall struct {
	Index    int    `json:"-"`
	ID        string `json:"id"`
	Type      string `json:"type"`
	Function  struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type StreamEventType int

const (
	EventTextDelta StreamEventType = iota
	EventToolCall
	EventToolResult
	EventError
	EventDone
)

type StreamEvent struct {
	Type      StreamEventType
	TextDelta string
	ToolCalls []ToolCall
	Error     error
	Usage     *UsageInfo
}

type UsageInfo struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
	Model        string
}

type ProviderAdapter interface {
	StreamChat(ctx context.Context, model string, systemPrompt string, messages []Message, tools []ToolDefinition) (<-chan StreamEvent, error)
}
