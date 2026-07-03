package protocol

type EventType = string

const (
	EventTypeSession  EventType = "session"
	EventTypeText     EventType = "text"
	EventTypeTool     EventType = "tool"
	EventTypeSpan     EventType = "span"
	EventTypeResource EventType = "resource"
	EventTypeRun      EventType = "run"
	EventTypeError    EventType = "error"
	EventTypeComplete EventType = "complete"
)

type TextChannel = string

const (
	ChannelAssistant TextChannel = "assistant"
	ChannelThinking  TextChannel = "thinking"
)

type ToolExecutor = string

const (
	ExecutorGo     ToolExecutor = "go"
	ExecutorSim    ToolExecutor = "sim"
	ExecutorClient ToolExecutor = "client"
)

type ToolMode = string

const (
	ToolModeSync  ToolMode = "sync"
	ToolModeAsync ToolMode = "async"
)

type ToolStatus = string

const (
	StatusGenerating ToolStatus = "generating"
	StatusExecuting  ToolStatus = "executing"
	StatusSuccess    ToolStatus = "success"
	StatusError      ToolStatus = "error"
	StatusCancelled  ToolStatus = "cancelled"
	StatusSkipped    ToolStatus = "skipped"
	StatusRejected   ToolStatus = "rejected"
)

type ToolPhase = string

const (
	PhaseCall      ToolPhase = "call"
	PhaseArgsDelta ToolPhase = "args_delta"
	PhaseResult    ToolPhase = "result"
)

type CompletionStatus = string

const (
	CompletionComplete  CompletionStatus = "complete"
	CompletionError     CompletionStatus = "error"
	CompletionCancelled CompletionStatus = "cancelled"
)

type SessionKind = string

const (
	SessionStart SessionKind = "start"
	SessionChat  SessionKind = "chat"
	SessionTitle SessionKind = "title"
	SessionTrace SessionKind = "trace"
)

type ResourceOp = string

const (
	ResourceUpsert ResourceOp = "upsert"
	ResourceRemove ResourceOp = "remove"
)

type RunKind = string

const (
	RunCheckpointPause RunKind = "checkpoint_pause"
	RunResumed         RunKind = "resumed"
	RunCompactionStart RunKind = "compaction_start"
	RunCompactionDone  RunKind = "compaction_done"
)

type SpanKind = string

const (
	SpanKindSubagent SpanKind = "subagent"
)

type SpanLifecycleEvent = string

const (
	SpanEventStart SpanLifecycleEvent = "start"
	SpanEventEnd   SpanLifecycleEvent = "end"
)

type SpanPayloadKind = string

const (
	SpanPayloadSubagent        SpanPayloadKind = "subagent"
	SpanPayloadStructuredResult SpanPayloadKind = "structured_result"
	SpanPayloadSubagentResult  SpanPayloadKind = "subagent_result"
)

type ToolOutcome = string

const (
	OutcomeSuccess   ToolOutcome = "success"
	OutcomeError     ToolOutcome = "error"
	OutcomeCancelled ToolOutcome = "cancelled"
	OutcomeSkipped   ToolOutcome = "skipped"
	OutcomeRejected  ToolOutcome = "rejected"
)

type AsyncToolRecordStatus = string

const (
	AsyncPending   AsyncToolRecordStatus = "pending"
	AsyncRunning   AsyncToolRecordStatus = "running"
	AsyncCompleted AsyncToolRecordStatus = "completed"
	AsyncFailed    AsyncToolRecordStatus = "failed"
	AsyncCancelled AsyncToolRecordStatus = "cancelled"
	AsyncDelivered AsyncToolRecordStatus = "delivered"
)

type StreamRef struct {
	ChatID   string `json:"chatId,omitempty"`
	Cursor   string `json:"cursor,omitempty"`
	StreamID string `json:"streamId"`
}

type StreamScope struct {
	AgentID          string `json:"agentId,omitempty"`
	Lane             string `json:"lane"`
	ParentSpanID     string `json:"parentSpanId,omitempty"`
	ParentToolCallID string `json:"parentToolCallId,omitempty"`
	SpanID           string `json:"spanId,omitempty"`
}

type Trace struct {
	GoTraceID string `json:"goTraceId,omitempty"`
	RequestID string `json:"requestId"`
	SpanID    string `json:"spanId,omitempty"`
}

type ToolUI struct {
	ClientExecutable bool `json:"clientExecutable,omitempty"`
	Hidden           bool `json:"hidden,omitempty"`
	Internal         bool `json:"internal,omitempty"`
}

type AdditionalPropertiesMap map[string]interface{}

type CostData struct {
	Input  float64 `json:"input,omitempty"`
	Output float64 `json:"output,omitempty"`
	Total  float64 `json:"total,omitempty"`
}

type UsageData struct {
	CacheCreationInputTokens int     `json:"cache_creation_input_tokens,omitempty"`
	CacheReadInputTokens     int     `json:"cache_read_input_tokens,omitempty"`
	InputTokens              int     `json:"input_tokens,omitempty"`
	Model                    string  `json:"model,omitempty"`
	OutputTokens             int     `json:"output_tokens,omitempty"`
	TotalTokens              int     `json:"total_tokens,omitempty"`
}

type ResourceDescriptor struct {
	ID    string `json:"id"`
	Title string `json:"title,omitempty"`
	Type  string `json:"type"`
}

type CheckpointPauseFrame struct {
	CheckpointID     string   `json:"checkpointId,omitempty"`
	ParentToolCallID string   `json:"parentToolCallId"`
	ParentToolName   string   `json:"parentToolName"`
	PendingToolIDs   []string `json:"pendingToolIds"`
}

type CompactionDoneData struct {
	SummaryChars int `json:"summary_chars"`
}

type SessionStartData struct {
	ResponseID string `json:"responseId,omitempty"`
}

type SessionStartPayload struct {
	Data *SessionStartData `json:"data,omitempty"`
	Kind string            `json:"kind"`
}

type SessionChatPayload struct {
	ChatID string `json:"chatId"`
	Kind   string `json:"kind"`
}

type SessionTitlePayload struct {
	Kind  string `json:"kind"`
	Title string `json:"title"`
}

type SessionTracePayload struct {
	Kind      string `json:"kind"`
	RequestID string `json:"requestId"`
	SpanID    string `json:"spanId,omitempty"`
}

type TextPayload struct {
	Channel string `json:"channel"`
	Text    string `json:"text"`
}

type ToolCallDescriptor struct {
	Arguments  AdditionalPropertiesMap `json:"arguments,omitempty"`
	Executor   string                  `json:"executor"`
	Mode       string                  `json:"mode"`
	Partial    bool                    `json:"partial,omitempty"`
	Phase      string                  `json:"phase"`
	Status     string                  `json:"status,omitempty"`
	ToolCallID string                  `json:"toolCallId"`
	ToolName   string                  `json:"toolName"`
	UI         *ToolUI                 `json:"ui,omitempty"`
}

type ToolArgsDeltaPayload struct {
	ArgumentsDelta string `json:"argumentsDelta"`
	Executor       string `json:"executor"`
	Mode           string `json:"mode"`
	Phase          string `json:"phase"`
	ToolCallID     string `json:"toolCallId"`
	ToolName       string `json:"toolName"`
}

type ToolResultPayload struct {
	Error      string      `json:"error,omitempty"`
	Executor   string      `json:"executor"`
	Mode       string      `json:"mode"`
	Output     interface{} `json:"output,omitempty"`
	Phase      string      `json:"phase"`
	Status     string      `json:"status,omitempty"`
	Success    bool        `json:"success"`
	ToolCallID string      `json:"toolCallId"`
	ToolName   string      `json:"toolName"`
}

type SubagentSpanStartPayload struct {
	Agent string      `json:"agent,omitempty"`
	Data  interface{} `json:"data,omitempty"`
	Event string      `json:"event"`
	Kind  string      `json:"kind"`
}

type SubagentSpanEndPayload struct {
	Agent string      `json:"agent,omitempty"`
	Data  interface{} `json:"data,omitempty"`
	Event string      `json:"event"`
	Kind  string      `json:"kind"`
}

type StructuredResultSpanPayload struct {
	Agent string      `json:"agent,omitempty"`
	Data  interface{} `json:"data,omitempty"`
	Kind  string      `json:"kind"`
}

type SubagentResultSpanPayload struct {
	Agent string      `json:"agent,omitempty"`
	Data  interface{} `json:"data,omitempty"`
	Kind  string      `json:"kind"`
}

type ResourceUpsertPayload struct {
	Op       string              `json:"op"`
	Resource ResourceDescriptor  `json:"resource"`
}

type ResourceRemovePayload struct {
	Op       string              `json:"op"`
	Resource ResourceDescriptor  `json:"resource"`
}

type CheckpointPausePayload struct {
	CheckpointID       string                 `json:"checkpointId"`
	ExecutionID        string                 `json:"executionId"`
	Frames             []CheckpointPauseFrame `json:"frames,omitempty"`
	Kind               string                 `json:"kind"`
	PendingToolCallIDs []string               `json:"pendingToolCallIds"`
	RunID              string                 `json:"runId"`
}

type RunResumedPayload struct {
	Kind string `json:"kind"`
}

type CompactionStartPayload struct {
	Kind string `json:"kind"`
}

type CompactionDonePayload struct {
	Data *CompactionDoneData `json:"data,omitempty"`
	Kind string              `json:"kind"`
}

type ErrorPayload struct {
	Code           string      `json:"code,omitempty"`
	Data           interface{} `json:"data,omitempty"`
	DisplayMessage string      `json:"displayMessage,omitempty"`
	Error          string      `json:"error,omitempty"`
	Message        string      `json:"message"`
	Provider       string      `json:"provider,omitempty"`
}

type CompletePayload struct {
	Cost     *CostData    `json:"cost,omitempty"`
	Reason   string       `json:"reason,omitempty"`
	Response interface{}  `json:"response,omitempty"`
	Status   string       `json:"status"`
	Usage    *UsageData   `json:"usage,omitempty"`
}

type Envelope struct {
	Payload interface{}  `json:"payload"`
	Scope   *StreamScope `json:"scope,omitempty"`
	Seq     int64        `json:"seq"`
	Stream  StreamRef    `json:"stream"`
	Trace   *Trace       `json:"trace,omitempty"`
	TS      string       `json:"ts"`
	Type    string       `json:"type"`
	V       int          `json:"v"`
}

func NewEnvelope(typ string, stream StreamRef, seq int64, ts string, payload interface{}) *Envelope {
	return &Envelope{
		Type:    typ,
		Seq:     seq,
		Stream:  stream,
		TS:      ts,
		V:       1,
		Payload: payload,
	}
}
