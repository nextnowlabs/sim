# zh-locale-formatting Specification

## Purpose
TBD - created by archiving change localize-ui-zh. Update Purpose after archive.
## Requirements
### Requirement: 格式化函数使用 zh-CN locale

`packages/utils/src/formatting.ts` 中的格式化函数(`formatDateTime`、`formatDate`、`formatTime`、`formatRelativeTime`、`formatDuration` 等)内部使用的 locale MUST 为 `zh-CN`,替代现有硬编码的 `en-US`。

#### Scenario: 共享格式化函数输出中文
- **WHEN** 任意组件调用 `@sim/utils/formatting` 中的日期/时间函数
- **THEN** 输出符合 zh-CN locale(如"2026年8月10日"、"周一"),不再使用 en-US 格式
