package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

type ExecuteCodeHandler struct{}

const defaultCodeTimeout = 30 * time.Second

func (h *ExecuteCodeHandler) Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	language, _ := args["language"].(string)
	code, ok := args["code"].(string)
	if !ok || code == "" {
		return nil, fmt.Errorf("code argument is required")
	}

	ctx, cancel := context.WithTimeout(ctx, defaultCodeTimeout)
	defer cancel()

	var cmd *exec.Cmd

	switch language {
	case "python", "py", "python3":
		cmd = exec.CommandContext(ctx, "python3", "-c", code)
	case "javascript", "js", "node":
		cmd = exec.CommandContext(ctx, "node", "-e", code)
	case "bash", "sh", "shell":
		cmd = exec.CommandContext(ctx, "bash", "-c", code)
	default:
		return nil, fmt.Errorf("unsupported language: %s (supported: python, javascript, bash)", language)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	result := &ToolResult{
		Output: map[string]interface{}{
			"stdout":   stdout.String(),
			"stderr":   stderr.String(),
			"exitCode": exitCode,
		},
	}

	if ctx.Err() == context.DeadlineExceeded {
		result.Error = "execution timed out"
	}

	return result, nil
}
