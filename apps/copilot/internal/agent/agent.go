package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sim/copilot/internal/history"
	"sim/copilot/internal/logger"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/protocol"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	MaxToolIterations          = 20
	DefaultTimeout             = 120 * time.Second
	TokenEstimateCharsPerToken = 4
	MaxToolResultContentChars  = 8000
)

type Agent struct {
	adapter      provider.ProviderAdapter
	executor     *tools.ToolExecutor
	prompt       *prompt.PromptBuilder
	historyLoader history.Loader
	defaultModel string
	timeout      time.Duration
}

func NewAgent(adapter provider.ProviderAdapter, executor *tools.ToolExecutor, promptBuilder *prompt.PromptBuilder, defaultModel string, historyLoader history.Loader) *Agent {
	return &Agent{
		adapter:       adapter,
		executor:      executor,
		prompt:        promptBuilder,
		historyLoader: historyLoader,
		defaultModel:  defaultModel,
		timeout:       DefaultTimeout,
	}
}

type ChatRequest struct {
	Message          string                   `json:"message"`
	MessageID        string                   `json:"messageId"`
	UserID           string                   `json:"userId"`
	Model            string                   `json:"model"`
	Provider         string                   `json:"provider"`
	Mode             string                   `json:"mode"`
	ChatID           string                   `json:"chatId"`
	WorkflowID       string                   `json:"workflowId"`
	WorkflowName     string                   `json:"workflowName"`
	WorkspaceID      string                   `json:"workspaceId"`
	IntegrationTools []ToolSchema             `json:"integrationTools"`
	MothershipTools  []ToolSchema             `json:"mothershipTools"`
	Commands         []string                 `json:"commands"`
	VFS              interface{}              `json:"vfs"`
	WorkspaceContext string                   `json:"workspaceContext"`
	Context          []map[string]interface{} `json:"context"`
	History          []provider.Message       `json:"history"`
	Prefetch         bool                     `json:"prefetch"`
	ImplicitFeedback string                   `json:"implicitFeedback"`
	UserPermission   string                   `json:"userPermission"`
	UserTimezone     string                   `json:"userTimezone"`
	UserMetadata     *UserMetadata            `json:"userMetadata"`
	DocCompiler      string                   `json:"docCompiler"`
	IsHosted         bool                     `json:"isHosted"`
}

type UserMetadata struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Timezone string `json:"timezone"`
}

type ToolSchema struct {
	Name         string      `json:"name"`
	Description  string      `json:"description"`
	InputSchema  interface{} `json:"input_schema"`
	Executor     string      `json:"executor"`
	DeferLoading bool        `json:"defer_loading"`
	Service      string      `json:"service"`
}

type Checkpoint struct {
	Messages           []provider.Message
	SystemPrompt       string
	ToolDefs           []provider.ToolDefinition
	Model              string
	Trace              *loopTrace
	ToolToBlockType    map[string]string
	PendingToolCallIDs []string
}

type CheckpointResult struct {
	ToolCallID string
	ToolName   string
	Success    bool
	Output     interface{}
	Error      string
}

type loopTrace struct {
	inputTokens  int
	outputTokens int
}

func (a *Agent) Run(ctx context.Context, req *ChatRequest, sw *stream.StreamWriter, requestID string) error {
	return a.RunFromCheckpoint(ctx, req, sw, requestID, nil, nil)
}

func (a *Agent) RunFromCheckpoint(ctx context.Context, req *ChatRequest, sw *stream.StreamWriter, requestID string, cp *Checkpoint, results []CheckpointResult) error {
	ctx, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()

	model := a.defaultModel
	logger.Infof("[agent] Using model=%s (requested=%s) provider=%s", model, req.Model, req.Provider)

	mode := req.Mode
	if mode == "" {
		mode = "build"
	}

	logger.Infof("[agent] Request: workflowId=%s workflowName=%s workspaceId=%s chatId=%s mode=%s isHosted=%v prefetch=%v messageId=%s",
		req.WorkflowID, req.WorkflowName, req.WorkspaceID, req.ChatID, mode, req.IsHosted, req.Prefetch, req.MessageID)
	logger.Infof("[agent] User: userId=%s timezone=%s permission=%s", req.UserID, req.UserTimezone, req.UserPermission)
	if req.UserMetadata != nil {
		logger.Infof("[agent] UserMetadata: name=%s email=%s timezone=%s", req.UserMetadata.Name, req.UserMetadata.Email, req.UserMetadata.Timezone)
	}
	logger.Infof("[agent] Context items: %d VFS: %v", len(req.Context), req.VFS != nil)
	if len(req.Commands) > 0 {
		logger.Infof("[agent] Commands: %v", req.Commands)
	}
	if req.ImplicitFeedback != "" {
		logger.Infof("[agent] ImplicitFeedback: %s", req.ImplicitFeedback)
	}
	if req.DocCompiler != "" {
		logger.Infof("[agent] DocCompiler: %s", req.DocCompiler)
	}

	toolInfos := make([]prompt.ToolInfo, 0, len(req.IntegrationTools))
	toolToBlockType := make(map[string]string)
	for _, t := range req.IntegrationTools {
		toolInfos = append(toolInfos, prompt.ToolInfo{Name: t.Name, Description: t.Description, Service: t.Service})
		if t.Service != "" {
			toolToBlockType[t.Name] = t.Service
		}
	}
	logger.Infof("[agent] IntegrationTools received: %d", len(req.IntegrationTools))
	for _, t := range req.IntegrationTools {
		logger.Infof("[agent]   tool: name=%s service=%s executor=%s deferLoading=%v", t.Name, t.Service, t.Executor, t.DeferLoading)
	}
	logger.Infof("[agent] MothershipTools received: %d", len(req.MothershipTools))
	for _, t := range req.MothershipTools {
		logger.Infof("[agent]   mothership: name=%s service=%s", t.Name, t.Service)
	}
	logger.Infof("[agent] WorkspaceContext length: %d", len(req.WorkspaceContext))

	systemPrompt := a.prompt.Build(mode, req.WorkflowID != "", req.VFS, req.WorkspaceContext, req.Context, toolInfos)
	toolDefs := a.buildToolDefs(req, mode)

	var trace *loopTrace
	var messages []provider.Message

	if cp != nil {
		trace = cp.Trace
		messages = cp.Messages
		systemPrompt = cp.SystemPrompt
		toolDefs = cp.ToolDefs
		model = cp.Model
		toolToBlockType = cp.ToolToBlockType

		logger.Infof("[agent] Resuming from checkpoint: pendingTools=%d results=%d", len(cp.PendingToolCallIDs), len(results))
		for _, result := range results {
			logger.Infof("[agent] Resumed: tool=%s success=%v", result.ToolName, result.Success)
			messages = a.addToolResult(messages, &result, sw, requestID)
		}
	} else {
		trace = &loopTrace{}
		messages = a.buildMessages(req)
		messages = a.loadHistory(ctx, req, messages)
	}

	if err := sw.Write(protocol.EventTypeSession, &protocol.SessionStartPayload{
		Kind: protocol.SessionStart,
		Data: &protocol.SessionStartData{ResponseID: requestID},
	}, &protocol.Trace{RequestID: requestID}, nil); err != nil {
		return fmt.Errorf("emit session start: %w", err)
	}

	if cp == nil {
		if req.ChatID != "" {
			_ = sw.Write(protocol.EventTypeSession, &protocol.SessionChatPayload{
				ChatID: req.ChatID,
				Kind:   protocol.SessionChat,
			}, nil, nil)
		}

		if req.ChatID != "" && req.Message != "" {
			title := truncateString(req.Message, 80)
			_ = sw.Write(protocol.EventTypeSession, &protocol.SessionTitlePayload{
				Kind:  protocol.SessionTitle,
				Title: title,
			}, nil, nil)
		}
	}

	return a.runLoop(ctx, sw, model, systemPrompt, messages, toolDefs, requestID, trace, toolToBlockType)
}

func (a *Agent) runLoop(ctx context.Context, sw *stream.StreamWriter, model string, systemPrompt string, messages []provider.Message, toolDefs []provider.ToolDefinition, requestID string, trace *loopTrace, toolToBlockType map[string]string) error {
	allMessages := make([]provider.Message, len(messages))
	copy(allMessages, messages)

	for iteration := 0; iteration < MaxToolIterations; iteration++ {
		select {
		case <-ctx.Done():
			_ = sw.Write(protocol.EventTypeComplete, &protocol.CompletePayload{Status: protocol.CompletionCancelled}, nil, nil)
			return ctx.Err()
		default:
		}

		allMessages = a.truncateMessages(allMessages, systemPrompt, toolDefs, 128000)
		traceInfo := &protocol.Trace{RequestID: requestID}

		eventCh, err := a.adapter.StreamChat(ctx, model, systemPrompt, allMessages, toolDefs)
		if err != nil {
			pe := provider.MapProviderError(err, "")
			_ = sw.Write(protocol.EventTypeError, &protocol.ErrorPayload{
				Code: pe.Code, Provider: pe.Provider, Message: pe.Message, DisplayMessage: pe.Message,
			}, traceInfo, nil)
			return err
		}

		var currentText string
		var completedToolCalls []provider.ToolCall

		for event := range eventCh {
			switch event.Type {
			case provider.EventTextDelta:
				currentText += event.TextDelta
				_ = sw.Write(protocol.EventTypeText, &protocol.TextPayload{
					Channel: protocol.ChannelAssistant, Text: event.TextDelta,
				}, traceInfo, nil)

			case provider.EventToolCall:
				completedToolCalls = event.ToolCalls
				for _, tc := range event.ToolCalls {
					executor := detectExecutor(tc.Function.Name)
					args := parseArguments(tc.Function.Arguments)
					logger.Debugf("[agent] LLM tool call: name=%s args=%s executor=%s", tc.Function.Name, tc.Function.Arguments, executor)

					if tc.Function.Name == "edit_workflow" && executor == protocol.ExecutorSim {
						// Translate LLM format to Sim format before sending
						args = translateEditWorkflowArgs(args, toolToBlockType)
					}

					_ = sw.Write(protocol.EventTypeTool, &protocol.ToolCallDescriptor{
						ToolCallID: tc.ID,
						ToolName:   tc.Function.Name,
						Arguments:  args,
						Executor:   executor,
						Mode:       protocol.ToolModeSync,
						Phase:      protocol.PhaseCall,
						Status:     protocol.StatusExecuting,
					}, traceInfo, nil)
				}

				if event.Usage != nil {
					trace.inputTokens += event.Usage.InputTokens
					trace.outputTokens += event.Usage.OutputTokens
				}

			case provider.EventError:
				pe := provider.MapProviderError(event.Error, "")
				_ = sw.Write(protocol.EventTypeError, &protocol.ErrorPayload{
					Code: pe.Code, Provider: pe.Provider, Message: pe.Message, DisplayMessage: pe.Message,
				}, traceInfo, nil)
				return event.Error

			case provider.EventDone:
				if event.Usage != nil {
					trace.inputTokens += event.Usage.InputTokens
					trace.outputTokens += event.Usage.OutputTokens
				}
			}
		}

		allMessages = append(allMessages, provider.Message{Role: "assistant", Content: currentText, ToolCalls: completedToolCalls})

		if len(completedToolCalls) == 0 {
			_ = sw.Write(protocol.EventTypeComplete, &protocol.CompletePayload{
				Status: protocol.CompletionComplete,
				Usage:  &protocol.UsageData{InputTokens: trace.inputTokens, OutputTokens: trace.outputTokens, TotalTokens: trace.inputTokens + trace.outputTokens, Model: model},
			}, nil, nil)
			return nil
		}

		// Partition the turn's tool calls: Go-executor tools run locally, Sim-executor
		// tools are checkpointed as a batch for execution by Sim.
		var simCalls []provider.ToolCall
		for _, tc := range completedToolCalls {
			executor := detectExecutor(tc.Function.Name)
			if executor == protocol.ExecutorSim {
				simCalls = append(simCalls, tc)
				continue
			}

			// Go-executed tools: execute locally and append their tool messages first.
			args := parseArguments(tc.Function.Arguments)
			logger.Infof("[agent] Executing tool: %s", tc.Function.Name)
			result := a.executor.Execute(ctx, tc.Function.Name, args)
			logger.Infof("[agent] Tool %s result: success=%v error=%q", tc.Function.Name, result.Error == "", result.Error)

			allMessages = a.emitToolResult(allMessages, tc.ID, tc.Function.Name, executor, result, traceInfo, sw)
		}

		if len(simCalls) > 0 {
			// Emit ONE checkpoint_pause covering ALL Sim-executor tool calls of the
			// turn with a fresh checkpoint ID, then end the leg without a terminal
			// event — Sim executes the tools and resumes on a new stream leg.
			pendingIDs := make([]string, 0, len(simCalls))
			for _, tc := range simCalls {
				pendingIDs = append(pendingIDs, tc.ID)
			}
			checkpointID := uuid.New().String()
			logger.Infof("[agent] Checkpointing %d sim tool(s) for Sim execution: %v checkpointID=%s", len(simCalls), pendingIDs, checkpointID)

			_ = sw.Write(protocol.EventTypeRun, &protocol.CheckpointPausePayload{
				Kind:               protocol.RunCheckpointPause,
				CheckpointID:       checkpointID,
				ExecutionID:        requestID,
				RunID:              requestID,
				PendingToolCallIDs: pendingIDs,
				Frames: []protocol.CheckpointPauseFrame{{
					ParentToolCallID: simCalls[0].ID,
					ParentToolName:   simCalls[0].Function.Name,
					PendingToolIDs:   pendingIDs,
				}},
			}, traceInfo, nil)

			SaveCheckpoint(checkpointID, &Checkpoint{
				Messages:           allMessages,
				SystemPrompt:       systemPrompt,
				ToolDefs:           toolDefs,
				Model:              model,
				Trace:              trace,
				ToolToBlockType:    toolToBlockType,
				PendingToolCallIDs: pendingIDs,
			})

			// End the leg — Sim resumes the loop on a new stream via /api/tools/resume.
			return nil
		}
	}

	_ = sw.Write(protocol.EventTypeError, &protocol.ErrorPayload{
		Code: "max_iterations", Message: "maximum tool iterations reached",
		DisplayMessage: "The request required too many tool calls.",
	}, nil, nil)
	_ = sw.Write(protocol.EventTypeComplete, &protocol.CompletePayload{Status: protocol.CompletionError}, nil, nil)
	return fmt.Errorf("max tool iterations reached")
}

func (a *Agent) emitToolResult(messages []provider.Message, toolCallID, toolName, executor string, result *tools.ToolResult, traceInfo *protocol.Trace, sw *stream.StreamWriter) []provider.Message {
	success := result.Error == ""
	tr := &protocol.ToolResultPayload{
		ToolCallID: toolCallID, ToolName: toolName, Executor: executor,
		Mode:    protocol.ToolModeSync,
		Phase:   protocol.PhaseResult,
		Success: success,
		Output:  result.Output,
		Status:  protocol.StatusSuccess,
	}
	if !success {
		tr.Error = result.Error
		tr.Status = protocol.StatusError
	}
	_ = sw.Write(protocol.EventTypeTool, tr, traceInfo, nil)

	content := fmt.Sprintf("Tool %s result: %v", toolName, result.Output)
	if result.Error != "" {
		content = fmt.Sprintf("Tool %s error: %s", toolName, result.Error)
	}
	messages = append(messages, provider.Message{Role: "tool", Content: truncateToolResultContent(content), ToolCallID: toolCallID})
	return messages
}

func (a *Agent) addToolResult(messages []provider.Message, result *CheckpointResult, sw *stream.StreamWriter, requestID string) []provider.Message {
	success := result.Success
	executor := protocol.ExecutorSim
	tr := &protocol.ToolResultPayload{
		ToolCallID: result.ToolCallID, ToolName: result.ToolName, Executor: executor,
		Mode:    protocol.ToolModeSync,
		Phase:   protocol.PhaseResult,
		Success: success,
		Output:  result.Output,
		Status:  protocol.StatusSuccess,
	}
	if !success {
		tr.Error = result.Error
		tr.Status = protocol.StatusError
	}
	_ = sw.Write(protocol.EventTypeTool, tr, &protocol.Trace{RequestID: requestID}, nil)

	content := fmt.Sprintf("Tool %s result: %v", result.ToolName, result.Output)
	if result.Error != "" {
		content = fmt.Sprintf("Tool %s error: %s", result.ToolName, result.Error)
	}
	messages = append(messages, provider.Message{Role: "tool", Content: truncateToolResultContent(content), ToolCallID: result.ToolCallID})
	return messages
}

// truncateToolResultContent caps tool result content appended to the LLM
// conversation so a single oversized output (file reads, workflow state JSON,
// search results) cannot exhaust the conversation budget.
func truncateToolResultContent(content string) string {
	runes := []rune(content)
	if len(runes) <= MaxToolResultContentChars {
		return content
	}
	return string(runes[:MaxToolResultContentChars]) + "\n... [truncated]"
}

// Global checkpoint store — keyed by checkpoint ID (fresh UUID per pause).
// Entries survive consumption for a retry window so Sim's automatic resume
// retries (503 -> up to 3 attempts) can replay the leg instead of 404ing.
var (
	checkpointStore   = make(map[string]*checkpointEntry)
	checkpointStoreMu sync.Mutex
	checkpointTTL     = 10 * time.Minute
	checkpointJanitor sync.Once
)

type checkpointEntry struct {
	cp       *Checkpoint
	consumed bool
	savedAt  time.Time
}

func saveCheckpointLocked(id string, cp *Checkpoint, now time.Time) {
	checkpointStore[id] = &checkpointEntry{cp: cp, savedAt: now}
}

func evictExpiredLocked(now time.Time) {
	for id, entry := range checkpointStore {
		if now.Sub(entry.savedAt) > checkpointTTL {
			delete(checkpointStore, id)
		}
	}
}

func SaveCheckpoint(requestID string, cp *Checkpoint) {
	checkpointStoreMu.Lock()
	defer checkpointStoreMu.Unlock()
	checkpointJanitor.Do(func() {
		go func() {
			ticker := time.NewTicker(checkpointTTL / 2)
			defer ticker.Stop()
			for range ticker.C {
				checkpointStoreMu.Lock()
				evictExpiredLocked(time.Now())
				checkpointStoreMu.Unlock()
			}
		}()
	})
	evictExpiredLocked(time.Now())
	saveCheckpointLocked(requestID, cp, time.Now())
}

// GetCheckpoint returns the checkpoint for id when it exists and has not been
// consumed yet, marking it consumed on first read. It returns nil for
// already-consumed or unknown IDs.
func GetCheckpoint(requestID string) *Checkpoint {
	checkpointStoreMu.Lock()
	defer checkpointStoreMu.Unlock()
	evictExpiredLocked(time.Now())
	entry, ok := checkpointStore[requestID]
	if !ok || entry.consumed {
		return nil
	}
	entry.consumed = true
	return entry.cp
}

// ConsumedCheckpoint returns the saved checkpoint for an already-consumed ID
// during the retry window, and nil otherwise. Used by the resume handler to
// replay a leg when Sim retries a resume after a failed stream attempt.
func ConsumedCheckpoint(requestID string) *Checkpoint {
	checkpointStoreMu.Lock()
	defer checkpointStoreMu.Unlock()
	evictExpiredLocked(time.Now())
	entry, ok := checkpointStore[requestID]
	if !ok || !entry.consumed {
		return nil
	}
	return entry.cp
}

func (a *Agent) buildMessages(req *ChatRequest) []provider.Message {
	var messages []provider.Message
	if req.Message != "" {
		messages = append(messages, provider.Message{Role: "user", Content: req.Message})
	}
	if req.History != nil {
		messages = append(req.History, messages...)
	}
	return messages
}

// loadHistory prepends prior conversation turns from the history loader
// (Sim's Postgres) ahead of the current message. Only the initial leg calls
// it — resume legs continue from checkpoint messages, which already contain
// the injected history. A missing loader or a load error degrades gracefully:
// the request proceeds without conversation memory.
func (a *Agent) loadHistory(ctx context.Context, req *ChatRequest, messages []provider.Message) []provider.Message {
	if a.historyLoader == nil || req.ChatID == "" || req.MessageID == "" {
		return messages
	}

	historyMessages, err := a.historyLoader.Load(ctx, req.ChatID, req.MessageID)
	if err != nil {
		logger.Warnf("[agent] Failed to load chat history for chat=%s: %v (continuing without history)", req.ChatID, err)
		return messages
	}
	if len(historyMessages) == 0 {
		return messages
	}

	logger.Infof("[agent] Loaded %d history message(s) for chat=%s", len(historyMessages), req.ChatID)
	return append(historyMessages, messages...)
}

func (a *Agent) buildToolDefs(req *ChatRequest, mode string) []provider.ToolDefinition {
	if mode == "ask" {
		return nil
	}

	var tools []provider.ToolDefinition

	tools = append(tools, provider.ToolDefinition{
		Type: "function",
		Function: provider.ToolFuncDef{
			Name: "edit_workflow",
			Description: "Modify the Sim workflow canvas. Use to add, edit, or delete blocks in a single atomic call. " +
				"CRITICAL: The entire request MUST be a single JSON object with an \"operations\" array — never emit multiple top-level JSON objects. " +
				"Each element in the \"operations\" array MUST have an \"op\" field (add | edit | delete). " +
				"Use block types from the Available Blocks list in the system prompt. " +
				"References to other blocks' outputs use the form <blockname.output> where blockname is the block's name lowercased with all spaces and dots removed (e.g. name \"Web Search\" -> <websearch.results>, NOT <search.results>). " +
				"To connect two blocks, nest a \"connections\" object inside the source block's add operation (inside the \"block\" object) as a handle-keyed map: " +
				"\"connections\": {\"source\": \"targetBlockId\"}. The key is the output handle (default \"source\"), the value is the target block ID string or array of strings. " +
				"Do NOT create separate operation items just for connections, and do NOT use an array of {source, target} pairs. " +
				"Example: {\"operations\":[{\"op\":\"add\",\"block\":{\"type\":\"<block_type>\",\"id\":\"step1\",\"name\":\"Step 1\",\"subBlocks\":{\"field\":\"value\"},\"connections\":{\"source\":\"step2\"}}},{\"op\":\"add\",\"block\":{\"type\":\"<block_type>\",\"id\":\"step2\",\"name\":\"Step 2\",\"subBlocks\":{\"field\":\"value\"}}}]}",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"operations": map[string]interface{}{
						"type": "array", "description": "Array of operations. Every item MUST have an \"op\" field. Nest connections inside the block object, not as separate items.",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"op":        map[string]interface{}{"type": "string", "description": "Operation type. Every operation item MUST include this field.", "enum": []string{"add", "edit", "delete"}},
								"id":        map[string]interface{}{"type": "string", "description": "Block ID (required for edit, delete)"},
								"type":      map[string]interface{}{"type": "string", "description": "Block type from the available blocks list (for add)"},
								"name":      map[string]interface{}{"type": "string", "description": "Block display name (for add)"},
								"subBlocks": map[string]interface{}{"type": "object", "description": "Block configuration"},
								"connections": map[string]interface{}{
									"type": "object", "description": "Handle-keyed map of connections FROM this block to target blocks. The key is the output handle (default \"source\"), the value is the target block ID string or an array of target block ID strings. Example: {\"source\": \"targetBlockId\"} or {\"source\": [\"id1\", \"id2\"]}. Nest inside the block object, not as a standalone operation.",
									"additionalProperties": map[string]interface{}{},
								},
							},
							"required": []string{"op"},
						},
					},
				},
				"required": []string{"operations"},
			},
		},
	})

	if req.IntegrationTools != nil {
		for _, t := range req.IntegrationTools {
			tools = append(tools, provider.ToolDefinition{
				Type: "function",
				Function: provider.ToolFuncDef{
					Name: t.Name, Description: t.Description, Parameters: t.InputSchema,
				},
			})
		}
	}

	if req.MothershipTools != nil {
		for _, t := range req.MothershipTools {
			tools = append(tools, provider.ToolDefinition{
				Type: "function",
				Function: provider.ToolFuncDef{
					Name: t.Name, Description: t.Description, Parameters: t.InputSchema,
				},
			})
		}
	}

	// Workflow lifecycle + VFS tools (all Sim-executed). Schemas mirror
	// apps/sim/lib/copilot/generated/tool-schemas-v1.ts.
	tools = append(tools, provider.ToolDefinition{
		Type: "function",
		Function: provider.ToolFuncDef{
			Name: "create_workflow",
			Description: "Create a new workflow from chat. Call this FIRST when no workflow is open " +
				"(workspace chat without a workflowId in context) and the user asks to build a workflow. " +
				"The result contains the new workflowId, which Sim threads into the execution context " +
				"so subsequent edit_workflow calls target the new workflow. Confirm intent with the user " +
				"before creating unless they explicitly asked.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name":        map[string]interface{}{"type": "string", "description": "Workflow name."},
					"description": map[string]interface{}{"type": "string", "description": "Optional workflow description."},
					"folderId":    map[string]interface{}{"type": "string", "description": "Optional folder ID."},
					"workspaceId": map[string]interface{}{"type": "string", "description": "Optional workspace ID."},
				},
				"required": []string{"name"},
			},
		},
	})
	tools = append(tools, provider.ToolDefinition{
		Type: "function",
		Function: provider.ToolFuncDef{
			Name: "read",
			Description: "Read a VFS resource, e.g. 'workflows/My%20Workflow/state.json' (the current_workflow " +
				"context pointer — use this to see the live workflow state before editing), " +
				"'files/Q4%20Report.pdf/content' for file bytes/parsed text, or 'uploads/data.csv' for a chat upload. " +
				"Copy paths verbatim from glob/grep/read output.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"path":        map[string]interface{}{"type": "string", "description": "Path to the VFS resource to read."},
					"limit":       map[string]interface{}{"type": "number", "description": "Maximum number of lines to read."},
					"offset":      map[string]interface{}{"type": "number", "description": "Line offset to start reading from (0-indexed)."},
					"outputTable": map[string]interface{}{"type": "string", "description": "Table ID to import the file contents into (CSV/JSON)."},
				},
				"required": []string{"path"},
			},
		},
	})
	tools = append(tools, provider.ToolDefinition{
		Type: "function",
		Function: provider.ToolFuncDef{
			Name: "glob",
			Description: "Discover files and workflows in the workspace VFS. Use to find workflow names/paths " +
				"before reading their state.json.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"pattern":   map[string]interface{}{"type": "string", "description": "Glob pattern to match file paths. Supports * (any segment) and ** (any depth)."},
					"toolTitle": map[string]interface{}{"type": "string", "description": "Optional target-only UI phrase for the search row."},
				},
				"required": []string{"pattern", "toolTitle"},
			},
		},
	})
	tools = append(tools, provider.ToolDefinition{
		Type: "function",
		Function: provider.ToolFuncDef{
			Name: "grep",
			Description: "Search the workspace VFS for a regex pattern. Searches workflow JSON, metadata, plans, " +
				"and memories by default; searches a single file's extracted text when path is one files/ or uploads/ file leaf.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"pattern":     map[string]interface{}{"type": "string", "description": "Regex pattern to search for."},
					"toolTitle":   map[string]interface{}{"type": "string", "description": "Optional target-only UI phrase for the search row."},
					"path":        map[string]interface{}{"type": "string", "description": "Optional scope: a prefix (e.g. 'workflows/') or an exact single-file path under files/ or uploads/."},
					"output_mode": map[string]interface{}{"type": "string", "description": "Output mode: 'content' (default), 'files_with_matches', or 'count'.", "enum": []string{"content", "files_with_matches", "count"}},
					"context":     map[string]interface{}{"type": "number", "description": "Number of lines to show before and after each match. Only applies to output_mode 'content'."},
					"ignoreCase":  map[string]interface{}{"type": "boolean", "description": "Case insensitive search (default false)."},
					"lineNumbers": map[string]interface{}{"type": "boolean", "description": "Include line numbers in output (default true)."},
					"maxResults":  map[string]interface{}{"type": "number", "description": "Maximum number of matches to return (default 50)."},
				},
				"required": []string{"pattern", "toolTitle"},
			},
		},
	})

	return tools
}

func (a *Agent) truncateMessages(messages []provider.Message, systemPrompt string, tools []provider.ToolDefinition, maxTokens int) []provider.Message {
	const maxHistoryTokens = 80000
	estimatedTokens := estimateTokens(systemPrompt) + estimateToolTokens(tools)
	for i := len(messages) - 1; i >= 0; i-- {
		t := estimateTokens(messages[i].Content)
		if estimatedTokens+t > maxHistoryTokens {
			return messages[i+1:]
		}
		estimatedTokens += t
	}
	return messages
}

func estimateTokens(text string) int {
	return len(text) / TokenEstimateCharsPerToken
}

func estimateToolTokens(tools []provider.ToolDefinition) int {
	total := 0
	for _, t := range tools {
		total += estimateTokens(t.Function.Description) + estimateTokens(t.Function.Name)
	}
	return total
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	for i := maxLen - 1; i > 0; i-- {
		if s[i] == '.' || s[i] == '!' || s[i] == '?' || s[i] == '\n' {
			return s[:i+1]
		}
	}
	return s[:maxLen] + "..."
}

func detectExecutor(toolName string) string {
	switch toolName {
	case "edit_workflow", "create_workflow", "read", "glob", "grep":
		return protocol.ExecutorSim
	case "read_file", "write_file", "list_directory", "execute_code":
		return protocol.ExecutorGo
	default:
		// All other tools (http_request, slack_send_message, etc.)
		// are executed by Sim via checkpoint
		return protocol.ExecutorSim
	}
}

func parseArguments(args string) protocol.AdditionalPropertiesMap {
	if args == "" {
		return nil
	}
	var m map[string]interface{}
	if json.Unmarshal([]byte(args), &m) == nil && m != nil {
		return protocol.AdditionalPropertiesMap(m)
	}
	// Fallback: some LLMs emit multiple top-level JSON objects concatenated
	// (e.g. {"operations":[...]},{"op":"add",...},{"connections":[...]}).
	// json.Unmarshal rejects this ("invalid character ',' after top-level
	// value"), which would lose the entire payload. Split the input into
	// individual objects and merge them so the tool call survives.
	if merged := parseConcatenatedJSONObjects(args); merged != nil {
		return merged
	}
	return protocol.AdditionalPropertiesMap{"raw": args}
}

// parseConcatenatedJSONObjects splits an input that contains one or more
// top-level JSON objects (possibly separated by commas) and merges them into
// a single map. When the first object has an "operations" array, every
// subsequent object is appended to that array — this is the common case where
// an LLM generates {"operations":[...]} followed by stray operation objects.
// Returns nil when no valid JSON object can be extracted.
func parseConcatenatedJSONObjects(input string) protocol.AdditionalPropertiesMap {
	objects := splitTopLevelJSONObjects(input)
	if len(objects) == 0 {
		return nil
	}

	var first map[string]interface{}
	if err := json.Unmarshal([]byte(objects[0]), &first); err != nil || first == nil {
		return nil
	}

	if len(objects) == 1 {
		return protocol.AdditionalPropertiesMap(first)
	}

	ops, hasOps := first["operations"].([]interface{})
	for i := 1; i < len(objects); i++ {
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(objects[i]), &obj); err != nil || obj == nil {
			continue
		}
		if hasOps {
			ops = append(ops, obj)
		} else {
			for k, v := range obj {
				if _, exists := first[k]; !exists {
					first[k] = v
				}
			}
		}
	}
	if hasOps {
		first["operations"] = ops
	}
	return protocol.AdditionalPropertiesMap(first)
}

// splitTopLevelJSONObjects scans the input and returns each top-level JSON
// object as a substring. It tracks brace depth and string/escape state so
// braces inside strings or nested objects do not break the split. Non-object
// tokens (commas, whitespace) between objects are treated as separators.
func splitTopLevelJSONObjects(input string) []string {
	var objects []string
	depth := 0
	start := -1
	inString := false
	escaped := false

	for i := 0; i < len(input); i++ {
		c := input[i]
		if escaped {
			escaped = false
			continue
		}
		if inString {
			if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			if depth == 0 {
				start = i
			}
			depth++
		case '}':
			if depth > 0 {
				depth--
				if depth == 0 && start >= 0 {
					objects = append(objects, input[start:i+1])
					start = -1
				}
			}
		}
	}
	return objects
}

// translateEditWorkflowArgs converts LLM-friendly format to Sim's edit_workflow format.
// LLM:   { op: "add", id: "x", type: "http", name: "My Block", subBlocks: {...} }
// Sim:    { operation_type: "add", block_id: "x", params: { type: "http", name: "My Block", ... } }
// It also resolves tool IDs (e.g. serper_search) to their canonical block types (e.g. serper)
// when the LLM mistakenly uses the callable tool name instead of the block type.
func translateEditWorkflowArgs(args protocol.AdditionalPropertiesMap, toolToBlockType map[string]string) protocol.AdditionalPropertiesMap {
	ops, ok := args["operations"].([]interface{})
	if !ok {
		return args
	}

	// resolveBlockType corrects a tool-id-as-block-type to the real block type.
	resolveBlockType := func(rawType string) string {
		if bt, ok := toolToBlockType[rawType]; ok {
			return bt
		}
		return rawType
	}

	translated := make([]interface{}, 0, len(ops))
	edgeOps := make(map[string][]string) // source block ID -> target IDs

	for i, rawOp := range ops {
		opMap, ok := rawOp.(map[string]interface{})
		if !ok {
			continue
		}

		// Check if operation_type already exists (already in Sim format)
		if _, isSim := opMap["operation_type"].(string); isSim {
			translated = append(translated, rawOp)
			continue
		}

		opType, _ := opMap["op"].(string)
		blockID, _ := opMap["id"].(string)

		// Handle edge operations: convert to connections on source block.
		// Also handles bare connection items — some LLMs emit a standalone
		// {"connections":[{"source":"a","target":"b"}]} object without an "op"
		// field instead of nesting connections inside a block operation.
		if opType == "add_edge" || (opType == "" && hasConnectionsArray(opMap)) {
			if opType == "add_edge" {
				source, _ := opMap["source"].(string)
				target, _ := opMap["target"].(string)
				if source == "" || target == "" {
					continue
				}
				sourceID := sanitizeID(source)
				edgeOps[sourceID] = append(edgeOps[sourceID], sanitizeID(target))
			} else {
				conns, _ := opMap["connections"].([]interface{})
				for _, conn := range conns {
					connMap, ok := conn.(map[string]interface{})
					if !ok {
						continue
					}
					source, _ := connMap["source"].(string)
					target, _ := connMap["target"].(string)
					if source == "" || target == "" {
						continue
					}
					sourceID := sanitizeID(source)
					edgeOps[sourceID] = append(edgeOps[sourceID], sanitizeID(target))
				}
			}
			continue
		}

		if opType == "delete_edge" {
			continue // Not supported yet
		}

		params := make(map[string]interface{})

		// Check for nested "block" object format
		if block, ok := opMap["block"].(map[string]interface{}); ok {
			for k, v := range block {
				if k == "connections" {
					continue
				}
				if k == "subBlocks" {
					params["inputs"] = v
					continue
				}
				params[k] = v
			}
			if conns, ok := block["connections"]; ok {
				switch c := conns.(type) {
				case []interface{}:
					for _, conn := range c {
						connMap, ok := conn.(map[string]interface{})
						if !ok {
							continue
						}
						source, _ := connMap["source"].(string)
						target, _ := connMap["target"].(string)
						if source == "" || target == "" {
							continue
						}
						sourceID := sanitizeID(source)
						edgeOps[sourceID] = append(edgeOps[sourceID], sanitizeID(target))
					}
				case map[string]interface{}:
					params["connections"] = c
				}
			}
			// Resolve tool-id-as-block-type to the real block type.
			if rawType, _ := params["type"].(string); rawType != "" {
				params["type"] = resolveBlockType(rawType)
			}
			if blockID == "" {
				if id, _ := block["id"].(string); id != "" {
					blockID = sanitizeID(id)
				}
			}
			if blockID == "" {
				if name, _ := block["name"].(string); name != "" {
					blockID = sanitizeIDWithFallback(name, i)
				} else {
					blockID = fmt.Sprintf("block_%d", i)
				}
			}
		} else {
			// Flat format
			for k, v := range opMap {
				if k == "op" || k == "id" || k == "connections" {
					continue
				}
				if k == "subBlocks" {
					params["inputs"] = v
					continue
				}
				params[k] = v
			}
			if conns, ok := opMap["connections"]; ok {
				switch c := conns.(type) {
				case []interface{}:
					for _, conn := range c {
						connMap, ok := conn.(map[string]interface{})
						if !ok {
							continue
						}
						source, _ := connMap["source"].(string)
						target, _ := connMap["target"].(string)
						if source == "" || target == "" {
							continue
						}
						sourceID := sanitizeID(source)
						edgeOps[sourceID] = append(edgeOps[sourceID], sanitizeID(target))
					}
				case map[string]interface{}:
					params["connections"] = c
				}
			}
			// Resolve tool-id-as-block-type to the real block type.
			if rawType, _ := params["type"].(string); rawType != "" {
				params["type"] = resolveBlockType(rawType)
			}
			if blockID == "" {
				if name, _ := opMap["name"].(string); name != "" {
					blockID = sanitizeIDWithFallback(name, i)
				} else {
					blockID = fmt.Sprintf("block_%d", i)
				}
			}
		}

		translated = append(translated, map[string]interface{}{
			"operation_type": opType,
			"block_id":       blockID,
			"params":         params,
		})
	}

	// Apply edge connections to the source block's params
	for i, op := range translated {
		opMap, _ := op.(map[string]interface{})
		blockID, _ := opMap["block_id"].(string)
		targets, ok := edgeOps[blockID]
		if !ok || len(targets) == 0 {
			continue
		}
		params, _ := opMap["params"].(map[string]interface{})
		if params == nil {
			params = make(map[string]interface{})
		}
		if existing, ok := params["connections"].(map[string]interface{}); ok {
			var combined []string
			switch src := existing["source"].(type) {
			case string:
				combined = append(combined, src)
			case []string:
				combined = append(combined, src...)
			case []interface{}:
				for _, s := range src {
					if str, ok := s.(string); ok {
						combined = append(combined, str)
					}
				}
			}
			combined = append(combined, targets...)
			if len(combined) == 1 {
				existing["source"] = combined[0]
			} else {
				existing["source"] = combined
			}
		} else if len(targets) == 1 {
			params["connections"] = map[string]interface{}{
				"source": targets[0],
			}
		} else {
			params["connections"] = map[string]interface{}{
				"source": targets,
			}
		}
		opMap["params"] = params
		translated[i] = opMap
	}

	return protocol.AdditionalPropertiesMap{"operations": translated}
}

// sanitizeID converts a name to a valid block ID.
func sanitizeID(name string) string {
	id := strings.ToLower(name)
	id = strings.ReplaceAll(id, " ", "_")
	id = strings.ReplaceAll(id, "-", "_")
	// Remove non-alphanumeric chars except underscore
	var result strings.Builder
	for _, c := range id {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
			result.WriteRune(c)
		}
	}
	return result.String()
}

// sanitizeIDWithFallback sanitizes a block name and falls back to a generated
// ID when the result is empty (e.g. all-Chinese names), so block_id is never
// empty.
func sanitizeIDWithFallback(name string, index int) string {
	id := sanitizeID(name)
	if id == "" {
		return fmt.Sprintf("block_%d", index)
	}
	return id
}

// hasConnectionsArray reports whether the operation map has a non-empty
// "connections" array. Used to detect bare connection items emitted by some
// LLMs (a {"connections":[...]} object with no "op" field).
func hasConnectionsArray(opMap map[string]interface{}) bool {
	conns, ok := opMap["connections"].([]interface{})
	return ok && len(conns) > 0
}
