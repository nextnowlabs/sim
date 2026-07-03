package tools

import (
	"encoding/json"
	"sim/copilot/internal/provider"
)

func FormatToolResultAsMessage(toolCallID, toolName string, result *ToolResult) provider.Message {
	role := "tool"
	var content string

	if result.Error != "" {
		content = result.Error
	} else if result.Output != nil {
		if s, ok := result.Output.(string); ok {
			content = s
		} else if b, err := json.Marshal(result.Output); err == nil {
			content = string(b)
		}
	}

	if content == "" {
		content = "(empty result)"
	}

	return provider.Message{
		Role:    role,
		Content: content,
	}
}
