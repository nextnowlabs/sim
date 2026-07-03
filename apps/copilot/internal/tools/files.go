package tools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ReadFileHandler struct{}

func (h *ReadFileHandler) Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	path, ok := args["path"].(string)
	if !ok || path == "" {
		return nil, fmt.Errorf("path argument is required")
	}

	// Sanitize path to prevent traversal
	path = filepath.Clean(path)
	if strings.Contains(path, "..") {
		return nil, fmt.Errorf("path traversal not allowed")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file %s: %w", path, err)
	}

	return &ToolResult{
		Output: map[string]interface{}{
			"path":    path,
			"content": string(data),
			"size":    len(data),
		},
	}, nil
}

type WriteFileHandler struct{}

func (h *WriteFileHandler) Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	path, ok := args["path"].(string)
	if !ok || path == "" {
		return nil, fmt.Errorf("path argument is required")
	}

	content, ok := args["content"].(string)
	if !ok {
		return nil, fmt.Errorf("content argument is required")
	}

	// Sanitize path
	path = filepath.Clean(path)
	if strings.Contains(path, "..") {
		return nil, fmt.Errorf("path traversal not allowed")
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create directory %s: %w", dir, err)
	}

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return nil, fmt.Errorf("write file %s: %w", path, err)
	}

	return &ToolResult{
		Output: map[string]interface{}{
			"path": path,
			"size": len(content),
			"success": true,
		},
	}, nil
}

type ListDirectoryHandler struct{}

func (h *ListDirectoryHandler) Execute(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	path, ok := args["path"].(string)
	if !ok || path == "" {
		path = "."
	}

	// Sanitize path
	path = filepath.Clean(path)
	if strings.Contains(path, "..") {
		return nil, fmt.Errorf("path traversal not allowed")
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("read directory %s: %w", path, err)
	}

	var files []map[string]interface{}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, map[string]interface{}{
			"name":    entry.Name(),
			"isDir":   entry.IsDir(),
			"size":    info.Size(),
			"modTime": info.ModTime().String(),
		})
	}

	return &ToolResult{
		Output: map[string]interface{}{
			"path":  path,
			"files": files,
		},
	}, nil
}
