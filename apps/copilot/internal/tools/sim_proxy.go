package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sim/copilot/internal/logger"
	"net/http"
	"time"
)

type SimProxy struct {
	baseURL    string
	apiSecret  string
	client     *http.Client
}

func NewSimProxy(baseURL, apiSecret string) *SimProxy {
	return &SimProxy{
		baseURL:   baseURL,
		apiSecret: apiSecret,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

type simToolRequest struct {
	ToolName  string                 `json:"toolName"`
	Arguments map[string]interface{} `json:"arguments"`
}

type simToolResponse struct {
	Success bool                   `json:"success"`
	Output  interface{}            `json:"output"`
	Error   string                 `json:"error,omitempty"`
}

func (p *SimProxy) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
	reqBody := simToolRequest{
		ToolName:  toolName,
		Arguments: args,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := p.baseURL + "/api/internal/tools/execute"
	logger.Infof("[sim-proxy] POST %s body=%s", url, string(bodyBytes))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiSecret)

	resp, err := p.client.Do(req)
	if err != nil {
		logger.Infof("[sim-proxy] ERROR: request failed: %v", err)
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	logger.Infof("[sim-proxy] Response status=%d", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		body, _ := json.Marshal(resp.Body)
		logger.Infof("[sim-proxy] ERROR: unexpected status %d body=%s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("sim returned status %d", resp.StatusCode)
	}

	var simResp simToolResponse
	if err := json.NewDecoder(resp.Body).Decode(&simResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	logger.Infof("[sim-proxy] Decoded response: success=%v output=%v error=%q", simResp.Success, simResp.Output, simResp.Error)

	if !simResp.Success {
		return &ToolResult{
			Output: simResp.Output,
			Error:  simResp.Error,
		}, fmt.Errorf("tool execution failed: %s", simResp.Error)
	}

	return &ToolResult{
		Output: simResp.Output,
	}, nil
}
