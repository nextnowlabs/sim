package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sim/copilot/internal/logger"
	"sim/copilot/internal/protocol"
	"sim/copilot/internal/provider"
	"sim/copilot/internal/prompt"
	"sim/copilot/internal/stream"
	"sim/copilot/internal/tools"
	"strings"
	"time"
)

const (
	MaxToolIterations         = 20
	DefaultTimeout            = 120 * time.Second
	TokenEstimateCharsPerToken = 4
)

type Agent struct {
	adapter      provider.ProviderAdapter
	executor     *tools.ToolExecutor
	prompt       *prompt.PromptBuilder
	defaultModel string
	timeout      time.Duration
}

func NewAgent(adapter provider.ProviderAdapter, executor *tools.ToolExecutor, promptBuilder *prompt.PromptBuilder, defaultModel string) *Agent {
	return &Agent{
		adapter:      adapter,
		executor:     executor,
		prompt:       promptBuilder,
		defaultModel: defaultModel,
		timeout:      DefaultTimeout,
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
	Messages        []provider.Message
	SystemPrompt    string
	ToolDefs        []provider.ToolDefinition
	Model           string
	Trace           *loopTrace
	ResumeCh        chan *CheckpointResult
	ToolToBlockType map[string]string
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
	return a.RunFromCheckpoint(ctx, req, sw, requestID, nil)
}

func (a *Agent) RunFromCheckpoint(ctx context.Context, req *ChatRequest, sw *stream.StreamWriter, requestID string, cp *Checkpoint) error {
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

	systemPrompt := a.prompt.Build(mode, req.WorkflowID != "", req.VFS, req.WorkspaceContext, toolInfos)
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

		// Wait for Sim to call back with the tool result
		result := <-cp.ResumeCh
		logger.Infof("[agent] Resumed: tool=%s success=%v", result.ToolName, result.Success)
		messages = a.addToolResult(messages, result, sw, requestID)
	} else {
		trace = &loopTrace{}
		messages = a.buildMessages(req)

		if err := sw.Write(protocol.EventTypeSession, &protocol.SessionStartPayload{
			Kind: protocol.SessionStart,
			Data: &protocol.SessionStartData{ResponseID: requestID},
		}, &protocol.Trace{RequestID: requestID}, nil); err != nil {
			return fmt.Errorf("emit session start: %w", err)
		}

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

		for _, tc := range completedToolCalls {
			executor := detectExecutor(tc.Function.Name)
			args := parseArguments(tc.Function.Arguments)

			if executor == protocol.ExecutorSim {
				logger.Infof("[agent] Checkpointing for sim tool: %s requestID=%s", tc.Function.Name, requestID)

				// Emit checkpoint_pause event — tells Sim to call /api/tools/resume
				_ = sw.Write(protocol.EventTypeRun, &protocol.CheckpointPausePayload{
					Kind:               protocol.RunCheckpointPause,
					CheckpointID:       requestID,
					ExecutionID:        requestID,
					RunID:              requestID,
					PendingToolCallIDs: []string{tc.ID},
					Frames: []protocol.CheckpointPauseFrame{{
						ParentToolCallID: tc.ID,
						ParentToolName:   tc.Function.Name,
						PendingToolIDs:   []string{tc.ID},
					}},
				}, traceInfo, nil)

				resumeCh := make(chan *CheckpointResult, 1)
				SaveCheckpoint(requestID, &Checkpoint{
					Messages:        allMessages,
					SystemPrompt:    systemPrompt,
					ToolDefs:        toolDefs,
					Model:           model,
					Trace:           trace,
					ResumeCh:        resumeCh,
					ToolToBlockType: toolToBlockType,
				})

				// Block until Sim calls back with the result
				result := <-resumeCh
				logger.Infof("[agent] Resumed: tool=%s success=%v", result.ToolName, result.Success)
				allMessages = a.addToolResult(allMessages, result, sw, requestID)
				// Continue the loop - LLM will process the tool result in next iteration
				continue
			}

			// Go-executed tools: execute locally
			logger.Infof("[agent] Executing tool: %s", tc.Function.Name)
			result := a.executor.Execute(ctx, tc.Function.Name, args)
			logger.Infof("[agent] Tool %s result: success=%v error=%q", tc.Function.Name, result.Error == "", result.Error)

			allMessages = a.emitToolResult(allMessages, tc.ID, tc.Function.Name, executor, result, traceInfo, sw)
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
	messages = append(messages, provider.Message{Role: "tool", Content: content, ToolCallID: toolCallID})
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
	messages = append(messages, provider.Message{Role: "tool", Content: content, ToolCallID: result.ToolCallID})
	return messages
}

// Global checkpoint store — keyed by requestID
var checkpointStore = make(map[string]*Checkpoint)

func SaveCheckpoint(requestID string, cp *Checkpoint) {
	checkpointStore[requestID] = cp
}

func GetCheckpoint(requestID string) *Checkpoint {
	cp := checkpointStore[requestID]
	delete(checkpointStore, requestID)
	return cp
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
								"op":          map[string]interface{}{"type": "string", "description": "Operation type. Every operation item MUST include this field.", "enum": []string{"add", "edit", "delete"}},
								"id":          map[string]interface{}{"type": "string", "description": "Block ID (required for edit, delete)"},
								"type":        map[string]interface{}{"type": "string", "description": "Block type from the available blocks list (for add)"},
								"name":        map[string]interface{}{"type": "string", "description": "Block display name (for add)"},
								"subBlocks":   map[string]interface{}{"type": "object", "description": "Block configuration"},
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
	case "edit_workflow":
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
					blockID = sanitizeID(name)
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
					blockID = sanitizeID(name)
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

// hasConnectionsArray reports whether the operation map has a non-empty
// "connections" array. Used to detect bare connection items emitted by some
// LLMs (a {"connections":[...]} object with no "op" field).
func hasConnectionsArray(opMap map[string]interface{}) bool {
	conns, ok := opMap["connections"].([]interface{})
	return ok && len(conns) > 0
}
