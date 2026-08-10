# copilot-prompt-engineering Specification

## Purpose
TBD - created by archiving change open-source-copilot-backend. Update Purpose after archive.
## Requirements
### Requirement: System prompt includes block catalog

The copilot backend SHALL automatically generate a block catalog section in the system prompt listing all available block types with their descriptions, key subBlocks, and output fields.

#### Scenario: Block catalog in build mode
- **WHEN** mode is `build`
- **THEN** the system prompt SHALL include a "Available Blocks" section listing each block type, its description, required configuration fields, and typical output fields

#### Scenario: Block catalog omitted in ask mode
- **WHEN** mode is `ask`
- **THEN** the system prompt SHALL omit the block catalog and instruct the LLM to answer conversationally

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

### Requirement: System prompt includes workspace context

The copilot backend SHALL include workspace VFS (files and directories), tables, and environment variables in the system prompt when provided.

#### Scenario: VFS tree in context
- **WHEN** the request includes a `vfs` object with files and directories
- **THEN** the system prompt SHALL include a file tree representation showing the workspace structure

#### Scenario: Workspace tables in context
- **WHEN** the request includes workspace table schemas
- **THEN** the system prompt SHALL include table names and column definitions

### Requirement: System prompt instructs LLM on edit_workflow usage

The copilot backend SHALL include precise instructions on how to use the `edit_workflow` tool, including operation types, ID conventions, and connection patterns. The instructions SHALL conform to the Sim engine's actual operation contract: only `add`, `edit`, and `delete` operation types SHALL be advertised; block configuration SHALL use `subBlocks` (which the translator renames to `inputs`); and connections SHALL be documented as a handle-keyed map nested inside the source block's `block` object.

#### Scenario: edit_workflow instructions

- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL explain the `add`, `edit`, and `delete` operation types, describe the `connections` format as a handle-keyed map nested inside the block object (e.g. `"connections": {"source": "targetId"}`), instruct the LLM to use descriptive block IDs, and note that operations execute atomically

#### Scenario: edit_workflow constraints

- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL include constraints: a workflow MUST have exactly one trigger block, block names MUST be unique, some blocks are single-instance (e.g., Response), and every operation item MUST include an `op` field

#### Scenario: edit_workflow worked example

- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL include a worked example showing two blocks added and connected in a single atomic call, with `connections` nested inside the first block's `block` object using the handle-keyed map format

#### Scenario: Non-existent operation types are not advertised

- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL NOT advertise `add_edge` or `delete_edge` as operation types, because the Sim schema does not accept them; connections SHALL be expressed via the `connections` field inside a block operation instead

### Requirement: System prompt is configurable

The copilot backend SHALL load the system prompt from a configurable file or environment variable, allowing operators to customize prompt behavior without code changes.

#### Scenario: Default prompt used
- **WHEN** no custom prompt is configured
- **THEN** the copilot SHALL use the built-in default system prompt template

#### Scenario: Custom prompt loaded from file
- **WHEN** `COPILOT_PROMPT_PATH` environment variable points to a valid file
- **THEN** the copilot SHALL load the system prompt template from that file instead of the built-in default

#### Scenario: Template variables substituted
- **WHEN** the system prompt template contains `{{block_catalog}}`, `{{workflow_state}}`, `{{vfs_tree}}`, or `{{mode}}`
- **THEN** the copilot SHALL replace each variable with its runtime value before sending to the LLM

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

