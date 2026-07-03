package prompt

import (
	"fmt"
	"sort"
	"strings"
)

type WorkflowBlock struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Name      string                 `json:"name"`
	SubBlocks map[string]interface{} `json:"subBlocks"`
}

type WorkflowEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type WorkflowState struct {
	Blocks []WorkflowBlock `json:"blocks"`
	Edges  []WorkflowEdge  `json:"edges"`
}

func FormatWorkflowState(state *WorkflowState) string {
	if state == nil || len(state.Blocks) == 0 {
		return "The workflow is currently empty. Start by adding a trigger block."
	}

	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("The workflow has %d blocks:\n\n", len(state.Blocks)))

	sorted := make([]WorkflowBlock, len(state.Blocks))
	copy(sorted, state.Blocks)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Name < sorted[j].Name
	})

	for _, b := range sorted {
		sb.WriteString(fmt.Sprintf("- **%s** (`%s`) [id: `%s`]", b.Name, b.Type, b.ID))
		if len(b.SubBlocks) > 0 {
			sb.WriteString("\n  Key settings:\n")
			for key, val := range b.SubBlocks {
				if key == "name" || key == "label" || key == "id" {
					continue
				}
				sb.WriteString(fmt.Sprintf("    - %s: %v\n", key, val))
			}
		}
		sb.WriteString("\n")
	}

	if len(state.Edges) > 0 {
		sb.WriteString(fmt.Sprintf("\nConnections (%d):\n", len(state.Edges)))
		for _, e := range state.Edges {
			srcBlock := findBlock(state.Blocks, e.Source)
			tgtBlock := findBlock(state.Blocks, e.Target)
			sb.WriteString(fmt.Sprintf("- %s → %s\n", formatBlockRef(srcBlock, e.Source), formatBlockRef(tgtBlock, e.Target)))
		}
	}

	return sb.String()
}

func findBlock(blocks []WorkflowBlock, id string) *WorkflowBlock {
	for i := range blocks {
		if blocks[i].ID == id {
			return &blocks[i]
		}
	}
	return nil
}

func formatBlockRef(block *WorkflowBlock, id string) string {
	if block != nil {
		return fmt.Sprintf("%s (%s)", block.Name, id)
	}
	return id
}
