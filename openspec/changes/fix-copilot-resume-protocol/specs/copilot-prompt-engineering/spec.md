## MODIFIED Requirements

### Requirement: System prompt includes current workflow state

When the request carries a `workflowId`, the copilot backend SHALL give the LLM access to the current workflow state. Because Sim transmits the live state only as a VFS pointer (`current_workflow` context item → `workflows/<name>/state.json`), the system prompt SHALL render the request's `context` items (including the workflow pointer) and SHALL instruct the LLM to read the pointer with the `read` tool before issuing `edit_workflow` operations against an existing workflow.

#### Scenario: Workflow-scoped chat
- **WHEN** the request includes a `workflowId` and a `current_workflow` context pointer
- **THEN** the system prompt SHALL render the context items and instruct the LLM to call `read("workflows/<name>/state.json")` to obtain the current blocks, IDs, types, names, subBlock values, and edge connections before editing

#### Scenario: Empty workflow
- **WHEN** the workflow has no blocks
- **THEN** the system prompt SHALL indicate that the workflow is empty and the LLM should start by adding a trigger block

#### Scenario: Conversation context is rendered
- **WHEN** the request includes `context` items (e.g. `past_chat`, `current_workflow`, `blocks`, `knowledge`)
- **THEN** the copilot SHALL render each item (tag, type, content) into the system prompt within a bounded size budget, so multi-message conversations retain memory

## ADDED Requirements

### Requirement: System prompt instructs LLM on workflow creation

The copilot backend SHALL instruct the LLM on the workflow creation flow: call `create_workflow` first (when no workflow is open), then use `edit_workflow` to populate it, and read the current state before editing an existing workflow.

#### Scenario: Workspace chat creates a workflow
- **WHEN** the user asks to create a new workflow and no `workflowId` is in context
- **THEN** the system prompt SHALL direct the LLM to call `create_workflow` (obtaining the new workflow ID from the result) before issuing `edit_workflow` calls

#### Scenario: Read-before-edit
- **WHEN** the LLM intends to modify an existing workflow whose state is not yet in context
- **THEN** the system prompt SHALL direct the LLM to call `read` on the workflow's `state.json` pointer (from the `current_workflow` context item) before issuing `edit_workflow` operations, to avoid guessing block IDs

#### Scenario: Confirm before creating
- **WHEN** the user's request is ambiguous about creating a workflow
- **THEN** the system prompt SHALL direct the LLM to confirm intent before calling `create_workflow`
