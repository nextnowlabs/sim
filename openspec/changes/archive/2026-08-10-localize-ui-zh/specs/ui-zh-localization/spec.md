## ADDED Requirements

### Requirement: 界面文案为中文

应用界面中所有用户可见文案(JSX 文本、placeholder、title、aria-label、tooltip、toast 展示值、对话框标题等)MUST 使用简体中文,无需语言切换或翻译键层。

#### Scenario: 工作区首页为中文
- **WHEN** 用户访问工作区首页
- **THEN** 界面文案(新建对话、运行工作流、保存、语音输入、添加附件等)显示为中文

#### Scenario: 编辑器主路径为中文
- **WHEN** 用户打开工作流编辑器并使用工具栏、节点菜单、画布菜单、命令列表
- **THEN** 相关文案(运行、保存、发布、锁定、解锁、启用、禁用、变量、触发器等)显示为中文

#### Scenario: 逻辑值不被替换
- **WHEN** 实施翻译时遇到作为逻辑值的字符串(block type、operation id、请求参数、对象键、store action 名)
- **THEN** 该字符串保持英文原样,仅用户可见的相邻展示文案(label、title)被翻译

#### Scenario: 品牌与技术名词保留
- **WHEN** 文案中出现品牌名(Sim、Slack、Gmail)或技术名词(Webhook、OAuth、API、JSON)或模型名(GPT-4o)
- **THEN** 这些名词保留英文原样

### Requirement: 术语表一致性

界面翻译 MUST 遵守术语表(design.md 附录),同一英文术语在不同界面 MUST 使用同一中文译法。

#### Scenario: 术语统一
- **WHEN** 界面多处出现 "Block"、"Chat"、"Agent"、"Skill" 等术语
- **THEN** 各处均分别译为"节点"、"对话"、"智能体"、"技能",不使用其他译法

#### Scenario: 新术语补充
- **WHEN** 实施过程中发现术语表中未收录的界面术语
- **THEN** 该术语的译法被记录补充进术语表,并保持一致使用

### Requirement: 日期时间格式化使用 zh-CN

日期/时间格式化 MUST 使用 zh-CN locale,不依赖运行环境默认。

#### Scenario: 共享格式化工具输出中文格式
- **WHEN** 界面调用 `@sim/utils/formatting` 的格式化函数(日期、时间、相对时间、时长)
- **THEN** 输出符合 zh-CN locale 的格式(如 2026年8月10日),不使用 en-US 格式

#### Scenario: 散落 Intl 调用统一
- **WHEN** 代码中显式调用 `Intl.DateTimeFormat('en-US')` 或显式 en-US 的 `toLocale*`
- **THEN** 改为 zh-CN

### Requirement: 页面语言标识为 zh-CN

HTML 根元素的 `lang` 属性 MUST 为 `zh-CN`。

#### Scenario: 根布局语言标识
- **WHEN** 浏览器加载任意应用页面
- **THEN** `<html>` 的 `lang` 属性为 `zh-CN`

### Requirement: 不引入 i18n 基础设施

本次变更 MUST NOT 引入 i18n 框架(next-intl、react-i18next 等)、翻译键系统或语言切换机制。

#### Scenario: 无 i18n 依赖
- **WHEN** 检查变更后的代码
- **THEN** 无新增 i18n 相关依赖、无翻译 key 文件、无语言切换 UI

### Requirement: 不使用脚本批量替换

翻译实施 MUST 由实施者逐条判断并修改用户可见字符串,禁止使用 sed/perl/正则等脚本批量替换。

#### Scenario: 翻译不误伤逻辑值
- **WHEN** 实施者对含逻辑值的对象(如 `{ label: 'Send Message', id: 'send' }`)进行翻译
- **THEN** 仅 label 被翻译,id 保持原样
