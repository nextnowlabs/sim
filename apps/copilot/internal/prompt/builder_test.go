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

	result := pb.Build("build", false, nil, "", tools)

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

	result := pb.Build("ask", false, nil, "", nil)

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
