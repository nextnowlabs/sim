package agent

import (
	"encoding/json"
	"reflect"
	"testing"

	"sim/copilot/internal/protocol"
)

// mustDecodeJSON unmarshals a JSON string into a map. Fatals on error.
func mustDecodeJSON(t *testing.T, s string) protocol.AdditionalPropertiesMap {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatalf("failed to decode JSON input: %v\ninput: %s", err, s)
	}
	return protocol.AdditionalPropertiesMap(m)
}

// getOperations extracts the "operations" array from a translated result.
func getOperations(t *testing.T, result protocol.AdditionalPropertiesMap) []interface{} {
	t.Helper()
	ops, ok := result["operations"].([]interface{})
	if !ok {
		t.Fatalf("result has no operations array, got %T (%v)", result["operations"], result["operations"])
	}
	return ops
}

// getOpMap extracts a translated operation as a map.
func getOpMap(t *testing.T, op interface{}) map[string]interface{} {
	t.Helper()
	m, ok := op.(map[string]interface{})
	if !ok {
		t.Fatalf("operation is not a map, got %T", op)
	}
	return m
}

// getParams extracts the "params" map from a translated operation.
func getParams(t *testing.T, opMap map[string]interface{}) map[string]interface{} {
	t.Helper()
	params, ok := opMap["params"].(map[string]interface{})
	if !ok {
		t.Fatalf("operation has no params map, got %T (%v)", opMap["params"], opMap["params"])
	}
	return params
}

// getConnections extracts the "connections" map from params, asserting it is
// a map[string]interface{} (Sim handle-keyed format) rather than an array.
func getConnections(t *testing.T, params map[string]interface{}) map[string]interface{} {
	t.Helper()
	conns, ok := params["connections"].(map[string]interface{})
	if !ok {
		t.Fatalf("params.connections should be map[string]interface{}, got %T (%v)", params["connections"], params["connections"])
	}
	return conns
}

// ---------------------------------------------------------------------------
// translateEditWorkflowArgs tests
// ---------------------------------------------------------------------------

// Test 5.1 — subBlocks nested inside a block object are renamed to inputs.
func TestTranslateEditWorkflowArgs_NestedBlockSubBlocksRenamedToInputs(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1","subBlocks":{"model":"gpt-4o","prompt":"hello"}}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["operation_type"] != "add" {
		t.Errorf("operation_type = %v, want \"add\"", opMap["operation_type"])
	}
	if opMap["block_id"] != "step1" {
		t.Errorf("block_id = %v, want \"step1\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	inputs, ok := params["inputs"].(map[string]interface{})
	if !ok {
		t.Fatalf("params.inputs is not a map, got %T", params["inputs"])
	}
	expectedInputs := map[string]interface{}{"model": "gpt-4o", "prompt": "hello"}
	if !reflect.DeepEqual(inputs, expectedInputs) {
		t.Errorf("params.inputs = %v, want %v", inputs, expectedInputs)
	}
	if _, exists := params["subBlocks"]; exists {
		t.Error("params.subBlocks should not exist (renamed to inputs)")
	}
}

// Test 5.2 — subBlocks in flat-format edit operations are renamed to inputs.
func TestTranslateEditWorkflowArgs_FlatFormatSubBlocksRenamedToInputs(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"edit","id":"existing_block","subBlocks":{"fieldName":"new value"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["operation_type"] != "edit" {
		t.Errorf("operation_type = %v, want \"edit\"", opMap["operation_type"])
	}
	if opMap["block_id"] != "existing_block" {
		t.Errorf("block_id = %v, want \"existing_block\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	inputs, ok := params["inputs"].(map[string]interface{})
	if !ok {
		t.Fatalf("params.inputs is not a map, got %T", params["inputs"])
	}
	expectedInputs := map[string]interface{}{"fieldName": "new value"}
	if !reflect.DeepEqual(inputs, expectedInputs) {
		t.Errorf("params.inputs = %v, want %v", inputs, expectedInputs)
	}
	if _, exists := params["subBlocks"]; exists {
		t.Error("params.subBlocks should not exist (renamed to inputs)")
	}
}

// Test 5.3 — add_edge operations are folded into the source block's connections.
func TestTranslateEditWorkflowArgs_AddEdgeConvertedToConnectionMap(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1"}},{"op":"add_edge","source":"step1","target":"step2"},{"op":"add","block":{"type":"function_execute","id":"step2","name":"Step 2"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations (add_edge should not be a separate op), got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["block_id"] != "step1" {
		t.Fatalf("first op block_id = %v, want \"step1\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	conns := getConnections(t, params)
	if conns["source"] != "step2" {
		t.Errorf("connections.source = %v, want \"step2\"", conns["source"])
	}
}

// Test 5.4 — bare {"connections":[...]} items (no op field) are folded into
// the source block's connections rather than emitted as separate operations.
func TestTranslateEditWorkflowArgs_BareConnectionsItemConverted(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1"}},{"connections":[{"source":"step1","target":"step2"}]},{"op":"add","block":{"type":"function_execute","id":"step2","name":"Step 2"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations (bare connections item should not be a separate op), got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["block_id"] != "step1" {
		t.Fatalf("first op block_id = %v, want \"step1\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	conns := getConnections(t, params)
	if conns["source"] != "step2" {
		t.Errorf("connections.source = %v, want \"step2\"", conns["source"])
	}
}

// Test 5.5 — connections nested inside a block object (as an array of pairs)
// are converted to the handle-keyed map format, not left as an array.
func TestTranslateEditWorkflowArgs_ConnectionsNestedInBlockObject(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1","connections":[{"source":"step1","target":"step2"}]}},{"op":"add","block":{"type":"function_execute","id":"step2","name":"Step 2"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["block_id"] != "step1" {
		t.Fatalf("first op block_id = %v, want \"step1\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	conns := getConnections(t, params)
	if conns["source"] != "step2" {
		t.Errorf("connections.source = %v, want \"step2\"", conns["source"])
	}
}

// Test 5.6 — multiple add_edge operations from the same source produce an
// array of target IDs under the "source" handle.
func TestTranslateEditWorkflowArgs_MultipleTargetsFromSameSource(t *testing.T) {
	input := mustDecodeJSON(t, `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1"}},{"op":"add_edge","source":"step1","target":"step2"},{"op":"add_edge","source":"step1","target":"step3"},{"op":"add","block":{"type":"function_execute","id":"step2","name":"Step 2"}},{"op":"add","block":{"type":"response","id":"step3","name":"Step 3"}}]}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	if len(ops) != 3 {
		t.Fatalf("expected 3 operations, got %d", len(ops))
	}

	opMap := getOpMap(t, ops[0])
	if opMap["block_id"] != "step1" {
		t.Fatalf("first op block_id = %v, want \"step1\"", opMap["block_id"])
	}

	params := getParams(t, opMap)
	conns := getConnections(t, params)
	source, ok := conns["source"].([]string)
	if !ok {
		t.Fatalf("connections.source should be []string, got %T (%v)", conns["source"], conns["source"])
	}
	expected := []string{"step2", "step3"}
	if !reflect.DeepEqual(source, expected) {
		t.Errorf("connections.source = %v, want %v", source, expected)
	}
}

// Test 5.7 — operations already in Sim format (with operation_type) are
// passed through unchanged.
func TestTranslateEditWorkflowArgs_SimFormatPassThrough(t *testing.T) {
	inputJSON := `{"operations":[{"operation_type":"add","block_id":"step1","params":{"type":"llm_chat","inputs":{"model":"gpt-4o"}}}]}`
	input := mustDecodeJSON(t, inputJSON)

	result := translateEditWorkflowArgs(input, nil)

	// The entire structure should be identical — no re-translation occurred.
	if !reflect.DeepEqual(result, input) {
		resultJSON, _ := json.Marshal(result)
		inputJSON2, _ := json.Marshal(input)
		t.Errorf("Sim-format input should pass through unchanged\nresult: %s\ninput:  %s", resultJSON, inputJSON2)
	}
}

// ---------------------------------------------------------------------------
// parseArguments tests
// ---------------------------------------------------------------------------

// Test 5.8 — concatenated JSON objects are split and merged into a single
// operations array.
func TestParseArguments_ConcatenatedJSONObjects(t *testing.T) {
	input := `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1","name":"Step 1"}}]},{"op":"add","block":{"type":"function_execute","id":"step2","name":"Step 2"}}`

	result := parseArguments(input)
	if result == nil {
		t.Fatal("result is nil")
	}

	ops, ok := result["operations"].([]interface{})
	if !ok {
		t.Fatalf("result has no operations array, got %T (%v)", result["operations"], result["operations"])
	}
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations (second object merged in), got %d", len(ops))
	}

	// The second element should be the stray operation object merged into the
	// operations array from the first object.
	secondOp, ok := ops[1].(map[string]interface{})
	if !ok {
		t.Fatalf("second operation is not a map, got %T", ops[1])
	}
	block, _ := secondOp["block"].(map[string]interface{})
	if block == nil {
		t.Fatal("second operation has no block object")
	}
	if block["id"] != "step2" {
		t.Errorf("second operation block.id = %v, want \"step2\"", block["id"])
	}
}

// Test 5.9 — braces inside JSON string values must not break the splitter.
func TestParseArguments_BracesInStringValues(t *testing.T) {
	input := `{"operations":[{"op":"add","block":{"type":"function_execute","id":"step1","name":"Step 1","subBlocks":{"code":"function() { return { a: 1 }; }"}}}]}`

	result := parseArguments(input)
	if result == nil {
		t.Fatal("result is nil")
	}

	ops, ok := result["operations"].([]interface{})
	if !ok {
		t.Fatalf("result has no operations array, got %T (%v)", result["operations"], result["operations"])
	}
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	opMap, ok := ops[0].(map[string]interface{})
	if !ok {
		t.Fatalf("operation is not a map, got %T", ops[0])
	}
	block, _ := opMap["block"].(map[string]interface{})
	if block == nil {
		t.Fatal("operation has no block object")
	}
	subBlocks, _ := block["subBlocks"].(map[string]interface{})
	if subBlocks == nil {
		t.Fatal("block has no subBlocks")
	}
	code, _ := subBlocks["code"].(string)
	expected := "function() { return { a: 1 }; }"
	if code != expected {
		t.Errorf("subBlocks.code = %q, want %q", code, expected)
	}
}

// Test 5.10 — a single valid JSON object takes the fast path and returns a
// proper map (not a {"raw": ...} fallback).
func TestParseArguments_SingleJSONObject(t *testing.T) {
	input := `{"operations":[{"op":"add","block":{"type":"llm_chat","id":"step1"}}]}`

	result := parseArguments(input)
	if result == nil {
		t.Fatal("result is nil")
	}

	if _, hasRaw := result["raw"]; hasRaw {
		t.Errorf("result should not have raw key (fast path should succeed), got raw=%v", result["raw"])
	}

	ops, ok := result["operations"].([]interface{})
	if !ok {
		t.Fatalf("result has no operations array, got %T (%v)", result["operations"], result["operations"])
	}
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}
}

// Test 5.11 — completely unparseable input falls back to {"raw": args}.
func TestParseArguments_UnparseableFallback(t *testing.T) {
	input := "this is not json at all"

	result := parseArguments(input)
	if result == nil {
		t.Fatal("result is nil")
	}

	raw, ok := result["raw"].(string)
	if !ok {
		t.Fatalf("result should have raw key with string value, got %T (%v)", result["raw"], result["raw"])
	}
	if raw != input {
		t.Errorf("raw = %q, want %q", raw, input)
	}
	if _, hasOps := result["operations"]; hasOps {
		t.Error("result should not have operations key for unparseable input")
	}
}

func TestSanitizeID_KeepsCJK(t *testing.T) {
	cases := []struct{ in, want string }{
		{"数据抓取", "数据抓取"},
		{"Web Search", "web_search"},
		{"AI 内容生成器", "ai_内容生成器"},
		{"HTTP Request", "http_request"},
		{"Trigger.dev 1", "triggerdev_1"},
		{"!!!", ""},
	}
	for _, c := range cases {
		if got := sanitizeID(c.in); got != c.want {
			t.Errorf("sanitizeID(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSanitizeIDWithFallback_ChineseName(t *testing.T) {
	if got := sanitizeIDWithFallback("数据抓取", 3); got != "数据抓取" {
		t.Errorf("expected CJK id kept, got %q", got)
	}
	if got := sanitizeIDWithFallback("!!!", 3); got != "block_3" {
		t.Errorf("expected block_3 fallback for punctuation-only name, got %q", got)
	}
}

func TestTranslate_ChineseBlockConnectionsAndReferences(t *testing.T) {
	input := mustDecodeJSON(t, `{
		"operations": [
			{"op": "add", "block": {"type": "http", "id": "数据抓取", "name": "数据抓取", "subBlocks": {"url": "https://x"}}},
			{"op": "add", "block": {"type": "function", "id": "处理结果", "name": "处理结果", "subBlocks": {"code": "return <数据抓取.response>"}, "connections": {"source": "数据抓取"}}}
		]
	}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)

	first := getOpMap(t, ops[0])
	firstParams := getParams(t, first)
	if first["block_id"] != "数据抓取" {
		t.Errorf("expected block_id 数据抓取, got %v", first["block_id"])
	}
	if firstParams["id"] != "数据抓取" {
		t.Errorf("expected params.id 数据抓取, got %v", firstParams["id"])
	}

	second := getOpMap(t, ops[1])
	secondParams := getParams(t, second)
	inputs, ok := secondParams["inputs"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected inputs map, got %T", secondParams["inputs"])
	}
	code, _ := inputs["code"].(string)
	if code != "return <数据抓取.response>" {
		t.Errorf("CJK reference should be preserved verbatim, got %q", code)
	}
	conns := getConnections(t, secondParams)
	source, _ := conns["source"].(string)
	if source != "数据抓取" {
		t.Errorf("connection target should resolve to block id 数据抓取, got %q", source)
	}
}

func TestTranslate_ReferenceVariantsRewritten(t *testing.T) {
	input := mustDecodeJSON(t, `{
		"operations": [
			{"op": "add", "block": {"type": "tavily", "id": "web_search", "name": "Web Search", "subBlocks": {}}},
			{"op": "add", "block": {"type": "agent", "id": "ai_analysis", "name": "AI Analysis", "subBlocks": {"messages": [{"role": "user", "content": "主题：<start.topic>\n结果：<websearch.results> <ai_analysis.x> <aianalysis.y>"}]}, "connections": {"source": "websearch"}}}
		]
	}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	second := getOpMap(t, ops[1])
	secondParams := getParams(t, second)
	inputs, ok := secondParams["inputs"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected inputs map, got %T", secondParams["inputs"])
	}
	messages, _ := inputs["messages"].([]interface{})
	msg, _ := messages[0].(map[string]interface{})
	content, _ := msg["content"].(string)

	// <websearch.results> is already Sim-canonical; <ai_analysis.x> (id form)
	// and <aianalysis.y> (stripped form) must be rewritten to the canonical
	// normalized name "aianalysis". <start.topic> is not part of this call and
	// must be left untouched.
	want := "主题：<start.topic>\n结果：<websearch.results> <aianalysis.x> <aianalysis.y>"
	if content != want {
		t.Errorf("references not rewritten correctly:\n got %q\nwant %q", content, want)
	}

	conns := getConnections(t, secondParams)
	source, _ := conns["source"].(string)
	if source != "web_search" {
		t.Errorf("connection target should resolve to block id web_search, got %q", source)
	}
}

func TestTranslate_ChineseStartFieldReference(t *testing.T) {
	input := mustDecodeJSON(t, `{
		"operations": [
			{"op": "add", "block": {"type": "start_trigger", "id": "start", "name": "Start", "subBlocks": {"inputFormat": [{"id": "name", "name": "你的名字", "type": "string"}]}}},
			{"op": "add", "block": {"type": "agent", "id": "gen", "name": "生成器", "subBlocks": {"messages": [{"role": "user", "content": "你好 <start.你的名字>"}]}}}
		]
	}`)

	result := translateEditWorkflowArgs(input, nil)
	ops := getOperations(t, result)
	second := getOpMap(t, ops[1])
	secondParams := getParams(t, second)
	inputs, _ := secondParams["inputs"].(map[string]interface{})
	messages, _ := inputs["messages"].([]interface{})
	msg, _ := messages[0].(map[string]interface{})
	content, _ := msg["content"].(string)
	if content != "你好 <start.你的名字>" {
		t.Errorf("Chinese path segment in reference must be preserved, got %q", content)
	}
}

func TestEncodeVfsPath(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"workflows/主题搜索分析/state.json", "workflows/%E4%B8%BB%E9%A2%98%E6%90%9C%E7%B4%A2%E5%88%86%E6%9E%90/state.json"},
		{"workflows/My Workflow/state.json", "workflows/My%20Workflow/state.json"},
		{"workflows/%E4%B8%BB%E9%A2%98/state.json", "workflows/%E4%B8%BB%E9%A2%98/state.json"},
		{"workflows/**", "workflows/**"},
		{"workflows/*/state.json", "workflows/*/state.json"},
	}
	for _, c := range cases {
		if got := encodeVfsPath(c.in, true); got != c.want {
			t.Errorf("encodeVfsPath(%q, true) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeVfsToolArgs(t *testing.T) {
	args := mustDecodeJSON(t, `{"path": "workflows/主题/state.json"}`)
	normalizeVfsToolArgs("read", args)
	if got, _ := args["path"].(string); got != "workflows/%E4%B8%BB%E9%A2%98/state.json" {
		t.Errorf("read path not encoded, got %q", got)
	}

	pattern := mustDecodeJSON(t, `{"pattern": "workflows/主题/**"}`)
	normalizeVfsToolArgs("glob", pattern)
	if got, _ := pattern["pattern"].(string); got != "workflows/%E4%B8%BB%E9%A2%98/**" {
		t.Errorf("glob pattern not encoded, got %q", got)
	}
}
