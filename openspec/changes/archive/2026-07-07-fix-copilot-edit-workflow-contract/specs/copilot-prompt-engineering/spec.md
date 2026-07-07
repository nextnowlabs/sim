## MODIFIED Requirements

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
