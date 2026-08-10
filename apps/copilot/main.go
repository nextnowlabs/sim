package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"sim/copilot/internal/logger"
	"strings"
	"syscall"
	"time"

	"sim/copilot/internal/agent"
	"sim/copilot/internal/config"
	"sim/copilot/internal/history"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/title"
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

	toolExecutor := tools.NewToolExecutor()

	var historyLoader history.Loader
	if cfg.DatabaseURL != "" {
		loader, err := history.NewPgLoader(context.Background(), cfg.DatabaseURL)
		if err != nil {
			logger.Warnf("DATABASE_URL set but unreachable, continuing without conversation history: %v", err)
		} else {
			historyLoader = loader
			defer loader.Close()
			logger.Infof("Conversation history enabled via Postgres")
		}
	} else {
		logger.Infof("DATABASE_URL not set — conversation history disabled")
	}

	ag := agent.NewAgent(adapter, toolExecutor, promptBuilder, cfg.DefaultModel, historyLoader)
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

	titleGenerator := title.NewGenerator(adapter, cfg.DefaultModel)
	mux.HandleFunc("/api/generate-chat-title", titleGenerator.Handler())

	mux.HandleFunc("/api/tools/resume", func(w http.ResponseWriter, r *http.Request) {
		handleResume(w, r, ag, sm)
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
	if req.MessageID != "" {
		// Sim aborts by message ID; register the cancel under it too so
		// /api/streams/explicit-abort can cancel this leg.
		sm.Register(req.MessageID, cancel)
	}
	defer func() {
		sm.Unregister(streamID)
		if req.MessageID != "" {
			sm.Unregister(req.MessageID)
		}
	}()

	if err := ag.Run(ctx, &req, sw, requestID); err != nil {
		if ctx.Err() != nil {
			logger.Infof("Request %s cancelled or timed out: %v", requestID, ctx.Err())
		} else {
			logger.Infof("Agent error for request %s: %v", requestID, err)
		}
	}
}

func handleAbort(w http.ResponseWriter, r *http.Request, sm *streamManager) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		StreamID  string `json:"streamId"`
		MessageID string `json:"messageId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Sim sends the chat message ID as messageId; keep streamId as a
	// backward-compatible fallback.
	id := req.MessageID
	if id == "" {
		id = req.StreamID
	}

	if id == "" {
		http.Error(w, "messageId is required", http.StatusBadRequest)
		return
	}

	sm.Cancel(id)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func handleResume(w http.ResponseWriter, r *http.Request, ag *agent.Agent, sm *streamManager) {
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

	if req.CheckpointID == "" {
		http.Error(w, "checkpointId is required", http.StatusBadRequest)
		return
	}
	if len(req.Results) == 0 {
		http.Error(w, "results must contain at least one tool result", http.StatusBadRequest)
		return
	}

	cp := agent.GetCheckpoint(req.CheckpointID)
	if cp == nil {
		// The checkpoint was already consumed by a previous (failed) resume
		// attempt. Sim retries 503 stream legs up to 3 times, so replay the
		// leg from the saved checkpoint instead of 404ing.
		cp = agent.ConsumedCheckpoint(req.CheckpointID)
	}
	if cp == nil {
		logger.Infof("[resume] No checkpoint found for checkpointID=%s", req.CheckpointID)
		writeJSONError(w, http.StatusNotFound, "no pending checkpoint found")
		return
	}

	results := buildCheckpointResults(req.Results, cp.PendingToolCallIDs)

	streamID := uuid.New().String()
	requestID := uuid.New().String()

	sw, err := stream.NewStreamWriter(w, streamID)
	if err != nil {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	defer sw.Close()

	// Per-leg deadline: the resume request's own context bounds this leg.
	ctx, cancel := context.WithCancel(r.Context())
	sm.Register(streamID, cancel)
	if req.StreamID != "" {
		// req.StreamID is the chat message ID from Sim; register under it so
		// /api/streams/explicit-abort can cancel this resume leg too.
		sm.Register(req.StreamID, cancel)
	}
	defer func() {
		sm.Unregister(streamID)
		if req.StreamID != "" {
			sm.Unregister(req.StreamID)
		}
	}()

	chatReq := &agent.ChatRequest{
		MessageID:   req.StreamID,
		UserID:      req.UserID,
		WorkspaceID: req.WorkspaceID,
		Mode:        "build",
	}

	if err := ag.RunFromCheckpoint(ctx, chatReq, sw, requestID, cp, results); err != nil {
		if ctx.Err() != nil {
			logger.Infof("Resume %s cancelled or timed out: %v", requestID, ctx.Err())
		} else {
			logger.Infof("Resume agent error for %s: %v", requestID, err)
		}
	}
}

// buildCheckpointResults parses ALL results[] entries into CheckpointResults
// ordered by the checkpoint's pendingToolCallIds, so every pending tool call
// gets exactly one tool message. Error extraction keeps the existing
// fallbacks: data.error (nested) then top-level error.
func buildCheckpointResults(rawResults []map[string]interface{}, pendingToolCallIDs []string) []agent.CheckpointResult {
	byCallID := make(map[string]agent.CheckpointResult, len(rawResults))
	for _, r0 := range rawResults {
		var result agent.CheckpointResult
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
		if result.ToolCallID == "" && result.ToolName == "" {
			result.Success = false
			result.Error = "no result data in resume callback"
		}
		byCallID[result.ToolCallID] = result
	}

	ordered := make([]agent.CheckpointResult, 0, len(pendingToolCallIDs))
	for _, id := range pendingToolCallIDs {
		result, ok := byCallID[id]
		if !ok {
			// Defensive: a missing result still produces a tool message so the
			// assistant tool_calls remain paired with tool messages.
			ordered = append(ordered, agent.CheckpointResult{
				ToolCallID: id,
				ToolName:   "unknown",
				Success:    false,
				Error:      fmt.Sprintf("missing result for pending tool call %s", id),
			})
			continue
		}
		ordered = append(ordered, result)
	}
	if len(ordered) == 0 {
		for _, result := range byCallID {
			ordered = append(ordered, result)
		}
	}
	return ordered
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
