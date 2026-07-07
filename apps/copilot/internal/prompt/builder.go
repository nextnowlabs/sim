package prompt

import (
	"embed"
	"fmt"
	"os"
	"sort"
	"strings"
)

//go:embed default.md
var defaultPromptFS embed.FS

const defaultPromptFile = "default.md"

type ToolInfo struct {
	Name        string
	Description string
	Service     string
}

type PromptBuilder struct {
	template   string
	hasCatalog bool
}

func NewPromptBuilder(customPath string) (*PromptBuilder, error) {
	var template string

	if customPath != "" {
		data, err := os.ReadFile(customPath)
		if err != nil {
			return nil, fmt.Errorf("read custom prompt from %s: %w", customPath, err)
		}
		template = string(data)
	} else {
		data, err := defaultPromptFS.ReadFile(defaultPromptFile)
		if err != nil {
			return nil, fmt.Errorf("read embedded default prompt: %w", err)
		}
		template = string(data)
	}

	hasCatalog := strings.Contains(template, "{{block_catalog}}")

	return &PromptBuilder{
		template:   template,
		hasCatalog: hasCatalog,
	}, nil
}

func (pb *PromptBuilder) Build(mode string, hasWorkflow bool, vfs interface{}, workspaceContext string, integrationTools []ToolInfo) string {
	result := strings.Clone(pb.template)

	result = strings.ReplaceAll(result, "{{mode}}", mode)

	if hasWorkflow {
		result = strings.ReplaceAll(result, "{{#workflow_state}}", "")
		result = strings.ReplaceAll(result, "{{/workflow_state}}", "")
		result = strings.ReplaceAll(result, "{{workflow_state}}", "(The current workflow state is not available in this context. Use edit_workflow to add blocks as needed.)")
	} else {
		result = removeSection(result, "{{#workflow_state}}", "{{/workflow_state}}")
	}

	if vfs != nil {
		vfsStr := formatVFS(vfs)
		result = strings.ReplaceAll(result, "{{#vfs_tree}}", "")
		result = strings.ReplaceAll(result, "{{/vfs_tree}}", "")
		result = strings.ReplaceAll(result, "{{vfs_tree}}", vfsStr)
	} else {
		result = removeSection(result, "{{#vfs_tree}}", "{{/vfs_tree}}")
		result = strings.ReplaceAll(result, "{{vfs_tree}}", "")
	}

	if workspaceContext != "" {
		result = strings.ReplaceAll(result, "{{#workspace_context}}", "")
		result = strings.ReplaceAll(result, "{{/workspace_context}}", "")
		result = strings.ReplaceAll(result, "{{workspace_context}}", workspaceContext)
	} else {
		result = removeSection(result, "{{#workspace_context}}", "{{/workspace_context}}")
		result = strings.ReplaceAll(result, "{{workspace_context}}", "")
	}

	result = strings.ReplaceAll(result, "{{builtin_blocks}}", formatBuiltinBlocks())

	if pb.hasCatalog && len(integrationTools) > 0 {
		catalog := formatIntegrationTools(integrationTools)
		result = strings.ReplaceAll(result, "{{block_catalog}}", catalog)
	} else if pb.hasCatalog {
		result = strings.ReplaceAll(result, "{{block_catalog}}", "(no blocks available)")
	}

	return result
}

func formatIntegrationTools(tools []ToolInfo) string {
	if len(tools) == 0 {
		return "(no blocks available)"
	}

	blockMap := make(map[string][]string)
	blockDescriptions := make(map[string]string)
	for _, t := range tools {
		blockType := t.Service
		if blockType == "" {
			blockType = t.Name
		}
		blockMap[blockType] = append(blockMap[blockType], t.Name)
		if blockDescriptions[blockType] == "" && t.Description != "" {
			blockDescriptions[blockType] = t.Description
		}
	}

	sortedBlocks := make([]string, 0, len(blockMap))
	for bt := range blockMap {
		sortedBlocks = append(sortedBlocks, bt)
	}
	sort.Strings(sortedBlocks)

	var sb strings.Builder
	for _, blockType := range sortedBlocks {
		toolNames := blockMap[blockType]
		sort.Strings(toolNames)
		desc := blockDescriptions[blockType]
		if desc != "" {
			sb.WriteString(fmt.Sprintf("- `%s` — %s\n  tools: %s\n", blockType, desc, strings.Join(toolNames, ", ")))
		} else {
			sb.WriteString(fmt.Sprintf("- `%s`\n  tools: %s\n", blockType, strings.Join(toolNames, ", ")))
		}
	}
	return sb.String()
}

func removeSection(template, startTag, endTag string) string {
	for {
		start := strings.Index(template, startTag)
		if start == -1 {
			break
		}
		end := strings.Index(template, endTag)
		if end == -1 {
			break
		}

		lineStart := strings.LastIndex(template[:start], "\n")
		if lineStart == -1 {
			lineStart = 0
		} else {
			lineStart++
		}

		lineEnd := strings.Index(template[end:], "\n")
		if lineEnd == -1 {
			lineEnd = len(template)
		} else {
			lineEnd = end + lineEnd
		}

		template = template[:lineStart] + template[lineEnd:]
	}

	return template
}

func formatVFS(vfs interface{}) string {
	if vfs == nil {
		return "(no workspace files)"
	}

	raw, ok := vfs.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("%v", vfs)
	}

	var sb strings.Builder

	if ws, ok := raw["workspace"].(map[string]interface{}); ok {
		if name, _ := ws["name"].(string); name != "" {
			sb.WriteString(fmt.Sprintf("## Workspace: %s\n", name))
		}
	}

	formatSection := func(title string, items []interface{}, formatItem func(interface{}) string) {
		if len(items) == 0 {
			return
		}
		sb.WriteString(fmt.Sprintf("\n### %s (%d)\n", title, len(items)))
		for _, item := range items {
			sb.WriteString(formatItem(item))
		}
	}

	formatSection("Workflows", toSlice(raw["workflows"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		id, _ := m["id"].(string)
		path, _ := m["path"].(string)
		deployed, _ := m["isDeployed"].(bool)
		deployTag := ""
		if deployed {
			deployTag = " [deployed]"
		}
		return fmt.Sprintf("- **%s** (`%s`)%s — %s\n", name, id, deployTag, path)
	})

	formatSection("Tables", toSlice(raw["tables"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		id, _ := m["id"].(string)
		desc, _ := m["description"].(string)
		if desc != "" {
			return fmt.Sprintf("- **%s** (`%s`): %s\n", name, id, desc)
		}
		return fmt.Sprintf("- **%s** (`%s`)\n", name, id)
	})

	formatSection("Files", toSlice(raw["files"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		path, _ := m["path"].(string)
		size, _ := m["size"].(float64)
		return fmt.Sprintf("- %s (%d bytes) — `%s`\n", name, int(size), path)
	})

	formatSection("Knowledge Bases", toSlice(raw["knowledgeBases"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		id, _ := m["id"].(string)
		return fmt.Sprintf("- **%s** (`%s`)\n", name, id)
	})

	formatSection("Integrations", toSlice(raw["integrations"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		displayName, _ := m["displayName"].(string)
		providerID, _ := m["providerId"].(string)
		id, _ := m["id"].(string)
		if displayName == "" {
			displayName = providerID
		}
		return fmt.Sprintf("- **%s** (`%s`, provider: %s)\n", displayName, id, providerID)
	})

	formatSection("MCP Servers", toSlice(raw["mcpServers"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		url, _ := m["url"].(string)
		return fmt.Sprintf("- **%s** — %s\n", name, url)
	})

	formatSection("Skills", toSlice(raw["skills"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		desc, _ := m["description"].(string)
		if desc != "" {
			return fmt.Sprintf("- **%s**: %s\n", name, desc)
		}
		return fmt.Sprintf("- **%s**\n", name)
	})

	formatSection("Custom Tools", toSlice(raw["customTools"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		name, _ := m["name"].(string)
		id, _ := m["id"].(string)
		return fmt.Sprintf("- **%s** (`%s`)\n", name, id)
	})

	formatSection("Jobs", toSlice(raw["jobs"]), func(item interface{}) string {
		m, _ := item.(map[string]interface{})
		title, _ := m["title"].(string)
		id, _ := m["id"].(string)
		cron, _ := m["cronExpression"].(string)
		status, _ := m["status"].(string)
		return fmt.Sprintf("- **%s** (`%s`) cron: %s status: %s\n", title, id, cron, status)
	})

	if members, ok := raw["members"].([]interface{}); ok && len(members) > 0 {
		sb.WriteString(fmt.Sprintf("\n### Members (%d)\n", len(members)))
		for _, m := range members {
			member, _ := m.(map[string]interface{})
			name, _ := member["name"].(string)
			email, _ := member["email"].(string)
			perm, _ := member["permissionType"].(string)
			if name != "" {
				sb.WriteString(fmt.Sprintf("- %s <%s> [%s]\n", name, email, perm))
			} else {
				sb.WriteString(fmt.Sprintf("- %s [%s]\n", email, perm))
			}
		}
	}

	if envVars, ok := raw["envVars"].([]interface{}); ok && len(envVars) > 0 {
		sb.WriteString(fmt.Sprintf("\n### Environment Variables (%d)\n", len(envVars)))
		for _, v := range envVars {
			sb.WriteString(fmt.Sprintf("- %v\n", v))
		}
	}

	result := sb.String()
	if result == "" {
		return "(empty workspace)"
	}
	return result
}

func toSlice(v interface{}) []interface{} {
	if arr, ok := v.([]interface{}); ok {
		return arr
	}
	return nil
}

func formatBuiltinBlocks() string {
	const tpl = `
- |agent| — AI/LLM block for text generation, analysis, and reasoning.
  fields:
    messages: array of {role: "system"|"user"|"assistant", content: string}
    model: string (model ID, e.g. "gpt-4o", "claude-sonnet-5")
    temperature: number (0-2)
    maxTokens: number
    responseFormat: object (JSON Schema for structured output)
    memoryType: "none" | "conversation" | "sliding_window" | "sliding_window_tokens"
    tools: array of tool config objects
    skills: array of skill ID strings
    files: array of file objects
- |start_trigger| — Manual workflow trigger. Exactly one per workflow. Always the first block.
  fields:
    inputFormat: array of {id: string, name: string, type: string, value: string}
- |api_trigger| — API endpoint trigger. Starts the workflow when its API endpoint is called.
  fields:
    inputFormat: array of {id: string, name: string, type: string, value: string}
- |chat_trigger| — Chat trigger. Starts the workflow from a chat conversation.
  (no subBlocks)
- |input_trigger| — Form input trigger. Starts the workflow when a form is submitted.
  fields:
    inputFormat: array of {id: string, name: string, type: string, value: string}
- |manual_trigger| — Manual trigger. Started by clicking a button or calling the API.
  (no subBlocks)
- |schedule| — Schedule trigger. Starts the workflow on a cron schedule.
  fields:
    scheduleType: "minutes" | "hourly" | "daily" | "weekly" | "monthly" | "custom"
    minutesInterval: number (for minutes type)
    hourlyMinute: number 0-59 (for hourly type)
    dailyTime: string "HH:MM" (for daily type)
    weeklyDay: "monday" | "tuesday" | ... | "sunday" (for weekly type)
    weeklyDayTime: string "HH:MM" (for weekly type)
    monthlyDay: number 1-31 (for monthly type)
    monthlyTime: string "HH:MM" (for monthly type)
    cronExpression: string (for custom type, standard cron syntax)
    timezone: string (IANA timezone, e.g. "America/New_York")
- |generic_webhook| — Webhook trigger. Starts the workflow when an external webhook is received.
  (no subBlocks)
- |response| — Sends a response back to the user. Single-instance (one per workflow).
  fields:
    dataMode: "structured" | "json"
    builderData: object (key-value pairs for structured mode)
    data: string or object (JSON data for json mode)
    status: number (HTTP status code, default 200)
    headers: array of {key: string, value: string}
- |condition| — If/else conditional branching. Routes to different paths based on JavaScript expressions.
  fields:
    conditions: array of {id: string, title: string, condition: string} where condition is a JS expression that evaluates to boolean
- |loop| — Container block. Loop over items or repeat blocks N times. Place child blocks inside it.
  fields:
    loopType: "for" | "forEach" | "while" | "doWhile"
    iterations: number (for "for" type — how many times to loop)
    collection: string (for "forEach" type — reference to an array output, e.g. "<blockId>.results")
    condition: string (for "while"/"doWhile" type — JS expression)
- |parallel| — Container block. Run blocks in parallel. Place child blocks inside it.
  fields:
    parallelType: "count" | "collection"
    count: number (for "count" type — how many parallel branches)
    collection: string (for "collection" type — reference to an array output)
- |router| — Route to different paths based on LLM classification.
  fields:
    routes: array of {id: string, title: string, description: string}
    prompt: string (the content to classify)
    model: string (model ID)
    temperature: number
    systemPrompt: string
    context: string (additional context for classification)
- |evaluator| — Evaluate content against metrics using LLM.
  fields:
    metrics: array of {id: string, name: string, description: string}
    content: string (the content to evaluate)
    model: string (model ID)
    temperature: number
    systemPrompt: string
- |human_in_the_loop| — Pause execution for human approval. The workflow waits for a user to approve or reject.
  fields:
    builderData: object (key-value pairs to display to the approver)
    notification: string (message shown to the approver)
    inputFormat: array of {id: string, name: string, type: string, value: string} (form fields for the approver to fill)
- |wait| — Wait for a specified duration before continuing.
  fields:
    timeValue: number
    timeUnit: "seconds" | "minutes" | "hours" | "days"
    async: boolean
- |mcp| — MCP (Model Context Protocol) server block. Connects to external MCP servers.
  fields:
    server: string (MCP server ID)
    tool: string (tool name on the server)
    arguments: object (tool-specific arguments as key-value pairs)
- |variables| — Define and reference workflow variables.
  fields:
    variables: array of {name: string, value: string}
- |circleback| — Circleback meeting notes integration. Syncs meeting notes and action items.
  (no subBlocks)
- |credential| — Manage OAuth credentials. Used to select or list connected service credentials.
  fields:
    operation: "select" | "list"
    providerFilter: string (provider ID to filter by)
    credential: string (selected credential ID)
    manualCredential: string (manual credential ID)
- |imap| — IMAP email trigger. Starts the workflow when new emails arrive.
  (no subBlocks)
- |mothership| — Mothership block. Sends a prompt to the Sim mothership agent.
  fields:
    prompt: string (the prompt to send)
    conversationId: string (optional conversation thread ID)
    attachmentFiles: array of file objects
    fileReferences: array of file reference strings
- |note| — Sticky note block. Display-only, for documentation within the workflow.
  fields:
    content: string (markdown text)
- |pi| — Pi coding agent block. Executes a coding task using an AI agent.
  fields:
    mode: "cloud" | "local"
    task: string (instruction for the coding agent)
    model: string (model ID)
    owner: string (GitHub repository owner, local mode)
    repo: string (GitHub repository name, local mode)
    githubToken: string (GitHub token, local mode)
- |rss| — RSS feed trigger. Starts the workflow when new RSS feed items are detected.
  (no subBlocks)
- |sim_workspace_event| — Workspace event trigger. Starts the workflow on workspace events (e.g. file uploaded, table row added).
  (no subBlocks)
- |starter| — Starter template block. Starts a child workflow from this workflow.
  fields:
    startWorkflow: string (workflow ID to start)
    inputFormat: array of {id: string, name: string, type: string, value: string}`
	return strings.NewReplacer("|", "`").Replace(tpl)
}
