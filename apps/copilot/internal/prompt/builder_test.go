package prompt

import (
	"strings"
	"testing"
)

func TestPromptBuilder_VariableSubstitution(t *testing.T) {
	pb := &PromptBuilder{
		template:   "Mode: {{mode}}\nBlock catalog:\n{{block_catalog}}",
		hasCatalog: true,
	}

	tools := []ToolInfo{
		{Name: "slack_send", Description: "Send messages in Slack"},
		{Name: "http_request", Description: "Make HTTP requests"},
	}

	result := pb.Build("build", false, nil, "", nil, tools)

	if !strings.Contains(result, "Mode: build") {
		t.Error("should contain Mode: build")
	}

	if !strings.Contains(result, "slack_send") {
		t.Error("should contain slack_send tool")
	}

	if !strings.Contains(result, "http_request") {
		t.Error("should contain http_request tool")
	}
}

func TestPromptBuilder_SectionRemoval(t *testing.T) {
	template := "Start\n{{#workflow_state}}\nWorkflow:\n{{workflow_state}}\n{{/workflow_state}}\nEnd"

	pb := &PromptBuilder{
		template:   template,
		hasCatalog: false,
	}

	result := pb.Build("ask", false, nil, "", nil, nil)

	if strings.Contains(result, "Workflow:") {
		t.Error("workflow state section should be removed when hasWorkflow is false")
	}

	if !strings.Contains(result, "Start") {
		t.Error("should contain Start")
	}

	if !strings.Contains(result, "End") {
		t.Error("should contain End")
	}
}

func TestPromptBuilder_BlockCatalogFormatting(t *testing.T) {
	tools := []ToolInfo{
		{Name: "http_request", Description: "Make HTTP requests"},
		{Name: "slack_send", Description: "Send Slack messages"},
	}

	catalog := formatIntegrationTools(tools)

	if !strings.Contains(catalog, "http_request") {
		t.Error("catalog should contain http_request")
	}

	if !strings.Contains(catalog, "slack_send") {
		t.Error("catalog should contain slack_send")
	}

	if !strings.Contains(catalog, "HTTP") && !strings.Contains(catalog, "Make HTTP") {
		t.Error("catalog should contain description")
	}
}

func TestPromptBuilder_EmptyWorkflow(t *testing.T) {
	result := FormatWorkflowState(nil)

	if !strings.Contains(result, "empty") {
		t.Error("should indicate empty workflow")
	}

	result2 := FormatWorkflowState(&WorkflowState{Blocks: nil, Edges: nil})

	if !strings.Contains(result2, "empty") {
		t.Error("should indicate empty workflow")
	}
}

func TestPromptBuilder_ContextItemsRendered(t *testing.T) {
	template := "Start\n{{#context_items}}\n## Conversation & Workspace Context\n\n{{context_items}}\n{{/context_items}}\nEnd"
	pb := &PromptBuilder{template: template}

	items := []map[string]interface{}{
		{"type": "past_chat", "tag": "chat", "content": "User asked to build a Slack notifier."},
		{"type": "current_workflow", "tag": "workflow", "path": "workflows/Slack%20Notifier/state.json"},
	}

	result := pb.Build("build", false, nil, "", items, nil)

	for _, want := range []string{"past_chat", "current_workflow", "User asked to build a Slack notifier", "workflows/Slack%20Notifier/state.json"} {
		if !strings.Contains(result, want) {
			t.Errorf("built prompt should contain %q", want)
		}
	}
}

func TestPromptBuilder_ContextSectionRemovedWhenEmpty(t *testing.T) {
	template := "Start\n{{#context_items}}\n## Context\n\n{{context_items}}\n{{/context_items}}\nEnd"
	pb := &PromptBuilder{template: template}

	result := pb.Build("build", false, nil, "", nil, nil)

	if strings.Contains(result, "## Context") {
		t.Error("context section should be removed when no context items are present")
	}
}

func TestPromptBuilder_OversizedContextItemTruncated(t *testing.T) {
	pb := &PromptBuilder{template: "{{#context_items}}\n{{context_items}}\n{{/context_items}}"}

	big := strings.Repeat("x", ContextItemMaxChars*2)
	items := []map[string]interface{}{
		{"type": "blocks", "content": big},
	}

	result := pb.Build("build", false, nil, "", items, nil)

	if !strings.Contains(result, "[truncated]") {
		t.Error("oversized context item should carry a truncation marker")
	}
	if len(result) > ContextItemsBudgetChars {
		t.Errorf("built prompt exceeds context budget: %d chars", len(result))
	}
}

// TestPromptBuilder_BlockReferenceRule ensures the default prompt instructs
// the LLM on Sim's exact block reference matching (normalizeName: lowercase,
// strip spaces and dots — "Web Search" -> websearch).
func TestPromptBuilder_BlockReferenceRule(t *testing.T) {
	pb, err := NewPromptBuilder("")
	if err != nil {
		t.Fatalf("NewPromptBuilder failed: %v", err)
	}

	result := pb.Build("build", false, nil, "", nil, nil)

	for _, want := range []string{
		"<blockname.output>",
		"websearch",
		"NOT `search`",
		"Trigger.dev 1",
		"triggerdev1",
	} {
		if !strings.Contains(result, want) {
			t.Errorf("default prompt should document reference rule containing %q", want)
		}
	}
}
