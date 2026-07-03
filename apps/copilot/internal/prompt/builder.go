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

func (pb *PromptBuilder) Build(mode string, hasWorkflow bool, vfs interface{}, workspaceContext interface{}, integrationTools []ToolInfo) string {
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
		// Remove any leftover placeholder
		result = strings.ReplaceAll(result, "{{vfs_tree}}", "")
	}

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

	sorted := make([]ToolInfo, len(tools))
	copy(sorted, tools)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Name < sorted[j].Name
	})

	var sb strings.Builder
	for _, t := range sorted {
		blockType := t.Service
		if blockType == "" {
			blockType = t.Name
		}
		sb.WriteString(fmt.Sprintf("- **%s** (`%s`): %s\n", t.Name, blockType, t.Description))
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
	return fmt.Sprintf("%v", vfs)
}
