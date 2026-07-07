package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sim/copilot/internal/logger"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"sim/copilot/internal/agent"
	"sim/copilot/internal/config"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"

	"github.com/google/uuid"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("Configuration error: %v", err)
	}

	logger.Infof("Starting copilot backend (provider=%s, model=%s)", cfg.LLMProvider, cfg.DefaultModel)

	adapter := createProviderAdapter(cfg)

	promptBuilder, err := prompt.NewPromptBuilder(cfg.PromptPath)
	if err != nil {
		logger.Fatalf("Failed to load prompt: %v", err)
	}

	toolExecutor := tools.NewToolExecutor(cfg)

	ag := agent.NewAgent(adapter, toolExecutor, promptBuilder, cfg.DefaultModel)
	sm := newStreamManager()

	mux := http.NewServeMux()
	chatHandler := func(w http.ResponseWriter, r *http.Request) {
		handleChat(w, r, ag, promptBuilder, sm)
	}
	mux.HandleFunc("/api/copilot", chatHandler)
	mux.HandleFunc("/api/copilot/chat", chatHandler)
	mux.HandleFunc("/api/mothership", chatHandler)
	mux.HandleFunc("/api/mothership/execute", chatHandler)

	mux.HandleFunc("/api/streams/explicit-abort", func(w http.ResponseWriter, r *http.Request) {
		handleAbort(w, r, sm)
	})

	mux.HandleFunc("/api/tools/resume", func(w http.ResponseWriter, r *http.Request) {
		handleResume(w, r, ag)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Infof("Listening on %s", cfg.ListenAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatalf("Shutdown error: %v", err)
	}
	logger.Info("Server stopped")
}

func createProviderAdapter(cfg *config.Config) provider.ProviderAdapter {
	switch strings.ToLower(cfg.LLMProvider) {
	case "anthropic":
		return provider.NewAnthropicAdapter(cfg.AnthropicKey)
	case "openai":
		return provider.NewOpenAIAdapter(cfg.OpenAIKey)
	case "openrouter":
		return provider.NewOpenRouterAdapter(cfg.OpenRouterKey)
	case "deepseek":
		return provider.NewDeepSeekAdapter(cfg.DeepSeekKey)
	case "custom":
		return provider.NewCustomAdapter(cfg.CustomKey, cfg.CustomBaseURL)
	default:
		logger.Fatalf("Unsupported provider: %s", cfg.LLMProvider)
		return nil
	}
}

func handleChat(w http.ResponseWriter, r *http.Request, ag *agent.Agent, promptBuilder *prompt.PromptBuilder, sm *streamManager) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	r.Body.Close()
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	logger.Infof("[chat] Raw request body (%d bytes): %s", len(bodyBytes), string(bodyBytes))

	var req agent.ChatRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}
	if req.Model == "" {
		http.Error(w, "model is required", http.StatusBadRequest)
		return
	}

	requestID := uuid.New().String()
	streamID := uuid.New().String()

	sw, err := stream.NewStreamWriter(w, streamID)
	if err != nil {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	defer sw.Close()

	ctx, cancel := context.WithCancel(r.Context())
	sm.Register(streamID, cancel)
	defer sm.Unregister(streamID)

	// Persist user message for chat history
	_ = saveMessage(ctx, &req, req.MessageID, "user", req.Message)

	if err := ag.Run(ctx, &req, sw, requestID); err != nil {
		if ctx.Err() != nil {
			logger.Infof("Request %s cancelled or timed out: %v", requestID, ctx.Err())
		} else {
			logger.Infof("Agent error for request %s: %v", requestID, err)
		}
	}
}

func saveMessage(ctx context.Context, req *agent.ChatRequest, messageID, role, content string) error {
	if req.ChatID == "" {
		return nil
	}

	body := map[string]interface{}{
		"chatId":   req.ChatID,
		"messageId": messageID,
		"role":     role,
		"content":  content,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	url := fmt.Sprintf("%s/api/internal/copilot/messages", strings.TrimRight(os.Getenv("SIM_INTERNAL_URL"), "/"))
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-internal-secret", os.Getenv("INTERNAL_API_SECRET"))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sim returned status %d", resp.StatusCode)
	}

	return nil
}

func handleAbort(w http.ResponseWriter, r *http.Request, sm *streamManager) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		StreamID string `json:"streamId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.StreamID == "" {
		http.Error(w, "streamId is required", http.StatusBadRequest)
		return
	}

	sm.Cancel(req.StreamID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func handleResume(w http.ResponseWriter, r *http.Request, ag *agent.Agent) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	r.Body.Close()
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	logger.Infof("[resume] Raw request body (%d bytes): %s", len(bodyBytes), string(bodyBytes))

	var req struct {
		StreamID     string                   `json:"streamId"`
		CheckpointID string                   `json:"checkpointId"`
		UserID       string                   `json:"userId"`
		WorkspaceID  string                   `json:"workspaceId"`
		Results      []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	logger.Infof("[resume] Received: streamID=%s checkpointID=%s results=%d", req.StreamID, req.CheckpointID, len(req.Results))

	// Debug: log full result details
	for i, r := range req.Results {
		logger.Debugf("[resume] Result[%d]: full=%+v", i, r)
	}

	cp := agent.GetCheckpoint(req.CheckpointID)
	if cp == nil {
		logger.Infof("[resume] No checkpoint found for checkpointID=%s", req.CheckpointID)
		http.Error(w, "no pending checkpoint found", http.StatusNotFound)
		return
	}

	// Process the first tool result
	result := &agent.CheckpointResult{}
	if len(req.Results) > 0 {
		r0 := req.Results[0]
		if tcid, ok := r0["callId"].(string); ok {
			result.ToolCallID = tcid
		}
		if tn, ok := r0["name"].(string); ok {
			result.ToolName = tn
		}
		if succ, ok := r0["success"].(bool); ok {
			result.Success = succ
		}
		if data, ok := r0["data"]; ok {
			result.Output = data
			// Sim nests the error message inside the data object on failure
			// (e.g. {"data":{"error":"[edit_workflow] ..."}}). Extract it so
			// the LLM receives a meaningful error message instead of an empty
			// string, which would leave it unable to self-correct.
			if !result.Success {
				if dataMap, ok := data.(map[string]interface{}); ok {
					if errMsg, ok := dataMap["error"].(string); ok && errMsg != "" {
						result.Error = errMsg
					}
				}
			}
		}
		// Some tool results carry the error at the top level instead of nested
		// inside data.
		if !result.Success && result.Error == "" {
			if errMsg, ok := r0["error"].(string); ok && errMsg != "" {
				result.Error = errMsg
			}
		}
	}
	if result.ToolCallID == "" && result.ToolName == "" {
		result.Success = false
		result.Error = "no result data in resume callback"
	}

	logger.Infof("[resume] Processing result: tool=%s success=%v", result.ToolName, result.Success)
	cp.ResumeCh <- result

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
