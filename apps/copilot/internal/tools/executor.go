package tools

import (
	"context"
	"fmt"
	"sim/copilot/internal/config"
)

type ToolResult struct {
	Output interface{}
	Error  string
}

type ToolHandler interface {
	Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error)
}

type ToolExecutor struct {
	config       *config.Config
	simProxy     *SimProxy
	localHandlers map[string]ToolHandler
}

func NewToolExecutor(cfg *config.Config) *ToolExecutor {
	te := &ToolExecutor{
		config:        cfg,
		simProxy:      NewSimProxy(cfg.SimInternalURL, cfg.InternalAPISecret),
		localHandlers: make(map[string]ToolHandler),
	}

	te.localHandlers["read_file"] = &ReadFileHandler{}
	te.localHandlers["write_file"] = &WriteFileHandler{}
	te.localHandlers["list_directory"] = &ListDirectoryHandler{}
	te.localHandlers["execute_code"] = &ExecuteCodeHandler{}

	return te
}

func (te *ToolExecutor) RegisterHandler(name string, handler ToolHandler) {
	te.localHandlers[name] = handler
}

func (te *ToolExecutor) Execute(ctx context.Context, toolName string, args map[string]interface{}) *ToolResult {
	if handler, ok := te.localHandlers[toolName]; ok {
		result, err := handler.Execute(ctx, args)
		if err != nil {
			return &ToolResult{Output: result.Output, Error: err.Error()}
		}
		return result
	}

	return &ToolResult{Error: fmt.Sprintf("unknown go tool: %s", toolName)}
}
