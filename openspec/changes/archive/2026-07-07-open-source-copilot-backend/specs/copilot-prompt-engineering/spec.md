## ADDED Requirements

### Requirement: System prompt includes block catalog

The copilot backend SHALL automatically generate a block catalog section in the system prompt listing all available block types with their descriptions, key subBlocks, and output fields.

#### Scenario: Block catalog in build mode
- **WHEN** mode is `build`
- **THEN** the system prompt SHALL include a "Available Blocks" section listing each block type, its description, required configuration fields, and typical output fields

#### Scenario: Block catalog omitted in ask mode
- **WHEN** mode is `ask`
- **THEN** the system prompt SHALL omit the block catalog and instruct the LLM to answer conversationally

### Requirement: System prompt includes current workflow state

When a `workflowId` is provided, the copilot backend SHALL include the current workflow state (blocks, edges, loops, parallels) in the system prompt.

#### Scenario: Workflow-scoped chat
- **WHEN** the request includes a `workflowId` and a workflow state is available
- **THEN** the system prompt SHALL include the current blocks with their IDs, types, names, and key subBlock values, plus the edge connections between them

#### Scenario: Empty workflow
- **WHEN** the workflow has no blocks
- **THEN** the system prompt SHALL indicate that the workflow is empty and the LLM should start by adding a trigger block

### Requirement: System prompt includes workspace context

The copilot backend SHALL include workspace VFS (files and directories), tables, and environment variables in the system prompt when provided.

#### Scenario: VFS tree in context
- **WHEN** the request includes a `vfs` object with files and directories
- **THEN** the system prompt SHALL include a file tree representation showing the workspace structure

#### Scenario: Workspace tables in context
- **WHEN** the request includes workspace table schemas
- **THEN** the system prompt SHALL include table names and column definitions

### Requirement: System prompt instructs LLM on edit_workflow usage

The copilot backend SHALL include precise instructions on how to use the `edit_workflow` tool, including operation types, ID conventions, and common patterns.

#### Scenario: edit_workflow instructions
- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL explain each operation type (`add`, `edit`, `delete`), describe the `connections` format, ID conventions (use descriptive IDs), and note that operations execute atomically

#### Scenario: edit_workflow constraints
- **WHEN** mode is `build` and `edit_workflow` is available
- **THEN** the system prompt SHALL include constraints: a workflow MUST have exactly one trigger block, block names MUST be unique, some blocks are single-instance (e.g., Response)

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
