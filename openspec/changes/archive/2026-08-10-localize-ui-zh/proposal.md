## Why

界面全部为英文,英语基础较差的用户无法理解界面,难以创建基础工作流。目标用户群以中文为主,需要将界面汉化,且不需要支持国际化(无多语言切换,直接替换为中文)。

## What Changes

- 将应用 UI 文案(JSX 文本、placeholder、title、aria-label、tooltip、toast 消息等)直接替换为中文,不引入 i18n 框架
- 按"创建基础工作流"主路径优先排序:工作区首页(对话/列表)→ 编辑器工具栏与块菜单 → 编辑器配置面板 → 设置/日志/知识库等其余页面
- 将日期/时间格式化层从 en-US 硬编码改为 zh-CN(`Intl.DateTimeFormat`、`packages/utils/src/formatting.ts`)
- 根布局 `lang='en'` 改为 `lang='zh-CN'`
- 建立并维护术语表(block→节点、chat→对话、agent→智能体、skill→技能、workflow→工作流等),实施过程遵守术语表
- 保留不译:品牌名(Sim、Slack、Gmail)、技术名词(Webhook、OAuth、API、JSON)、模型名(GPT-4o)、所有逻辑值(block type、operation id、请求参数、对象键、store action 名)、LLM 生成内容

### 明确不在本次范围

- 块/工具/触发器定义的描述文案(`blocks/blocks/**`、`tools/**` 中的 `name`/`description`/`longDescription`),因部分描述会注入 LLM function-calling schema,翻译会改变模型行为,需另行决策
- API 错误消息(契约校验错误、鉴权错误等,影响 toast 展示),留待后续变更
- 落地页、博客内容(14 篇 mdx)、邮件模板——属于内容翻译而非 UI 翻译
- 不引入 i18n 框架、不做语言切换

## Capabilities

### New Capabilities

- `ui-zh-localization`: 应用界面文案(工作区首页、工作流编辑器主路径、设置/日志/知识库等)从英文硬编码替换为中文,不引入 i18n
- `zh-locale-formatting`: 日期/时间格式化与页面语言标识从 en-US 切换为 zh-CN

### Modified Capabilities

<!-- 无既有 spec 变更 -->

## Impact

- 影响的代码面:`apps/sim/app/workspace/**`(工作区主界面)、`apps/sim/components/**`、`apps/sim/app/(landing)/**` 之外的所有 UI 组件
- `packages/utils/src/formatting.ts`(共享包,消费者均在 apps/sim 内,改为 zh-CN 安全)
- 根布局 `apps/sim/app/layout.tsx` 的 `lang` 属性
- 9 处散落的 `Intl.DateTimeFormat('en-US')` 调用
- 约 105 处 `toLocale*` 调用需排查(部分默认 locale 跟随运行环境)
- 测试:无 UI 文案断言(全仓无 getByText/findByText),字符串改动不破坏现有测试;17 个 API 错误消息断言属于③范围,不在本次变更
- 风险:与未汉化的 API 错误消息并存的中英混杂期;编辑器内部分字符串同时充当逻辑值(如 menu 项 title),需逐处判断
