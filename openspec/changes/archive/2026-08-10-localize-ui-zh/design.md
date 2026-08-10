## Context

应用(Next.js,`apps/sim`)全部界面文案为硬编码英文,无任何 i18n 基础设施(无 next-intl/react-i18next、无 locales 目录、无 `useTranslations`)。目标用户以中文为主,需要界面汉化且不做多语言切换。

当前状态:

- 工作区主界面在 `apps/sim/app/workspace/[workspaceId]/`(home 对话页、`w/[workflowId]` 编辑器 96 个组件)
- 日期/时间格式化集中在共享包 `packages/utils/src/formatting.ts`(硬编码 `en-US`),另有 9 处散落 `Intl.DateTimeFormat('en-US')` 与约 105 处 `toLocale*` 调用
- 根布局 `apps/sim/app/layout.tsx` 为 `<html lang='en'>`
- 全仓测试无 UI 文案断言(getByText/findByText 零使用),字符串替换不破坏测试

## Goals / Non-Goals

**Goals:**

- 应用 UI 文案全部替换为中文(主路径优先:首页 → 编辑器工具栏/节点菜单 → 配置面板 → 设置/日志/知识库等)
- 日期/时间格式化与 `lang` 标识切换为 zh-CN
- 建立术语表并贯穿实施,保证术语翻译一致
- 零脚本、零 i18n 框架,逐条人工(智能体)翻译,避免误替换程序内逻辑值

**Non-Goals:**

- 不引入 i18n 框架、不做语言切换
- 不翻译块/工具/触发器定义的描述文案(会注入 LLM function-calling schema,另行决策)
- 不翻译 API 错误消息(留待后续变更)
- 不翻译落地页、博客、邮件内容

## Decisions

### D1: 直接替换硬编码字符串,不引入 i18n 层

字符串就地替换为中文。理由:需求明确为单语言;引入 i18n 需要为数千字符串建 key 文件、改造全部组件,成本高且无收益。替代方案(react-i18next / next-intl)被否决。

### D2: 智能体逐条翻译,禁止脚本批量替换

仅编辑 JSX 文本、placeholder、title、aria-label、tooltip、toast 展示值等**用户可见**字符串。判定标准:字符串最终去处是"用户眼睛"才改。逻辑值(block type `'slack'`、operation id `'send'`、请求参数、对象键、store action 名)一律不动。`{ label: 'Send Message', id: 'send' }` 只改 label。避免 sed/perl/正则批量替换导致的误替换。

### D3: 术语表驱动翻译

术语表(v1)作为实施约束,存于本变更的 `design.md` 附录。核心词:Workflow→工作流、Block→节点、Chat→对话、Agent→智能体、Skill→技能、Trigger→触发器、Integration→集成、Variable→变量、Canvas→画布、Workspace→工作区。保留不译:品牌名(Sim、Slack、Gmail)、技术词(Webhook、OAuth、API、JSON)、模型名。实施中发现的新术语持续补充进术语表。

### D4: 切片顺序按用户主路径

每次实施切片可独立合并:

1. 工作区首页(对话/资源列表/新建入口)
2. 编辑器外壳:action-bar、block-menu、canvas-menu、command-list、variables
3. 编辑器配置面板:panel/components/editor(节点配置 sub-block 等)
4. 设置/日志/知识库/表格等其余页面
5. 格式化层:formatting.ts、散落 Intl 调用、根 layout lang

### D5: 格式化层统一 zh-CN

`packages/utils/src/formatting.ts` 硬编码 locale 改为 `zh-CN`(消费者均在 apps/sim 内,无外部影响);9 处散落 `Intl.DateTimeFormat('en-US')` 同步改;根 layout `lang='en'` → `lang='zh-CN'`。`toLocale*` 调用逐处排查,显式指定 en-US 的改为 zh-CN,跟随环境默认的确认服务器/客户端 locale 行为一致后处理。

## Risks / Trade-offs

- [中英混杂期] → 本次不译 API 错误消息,运行失败时 toast 仍为英文;与"基础用户能创建基础工作流"目标不冲突,留待后续变更
- [字符串同时是逻辑值] → 逐条读上下文判断,遵守 D2 判定标准;重点检查 menu 项 title、block-menu 的 'Lock'/'Unlock' 等可能同时用作 store action 参数的字符串
- [共享包改动影响面] → formatting.ts 消费者均在 apps/sim 内,已确认;改前 grep 复核
- [大量机械改动引入打字错误/不一致] → 术语表 + 每批后 tsc/lint 验证;人工抽审主路径
- [浏览器/服务器 locale 不一致导致日期显示错位] → 显式传 locale,不依赖环境默认

## 附录:术语表 v1

所有界面翻译必须遵守下表。实施中发现的新术语由实施者补充进本表并保持一致。

### 核心概念

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| Workflow | 工作流 | Block | 节点 |
| Trigger(s) | 触发器 | Schedule | 定时触发 |
| Subflow | 子流程 | Agent | 智能体 |
| Skill | 技能 | Chat | 对话 |
| Integration | 集成 | Tool | 工具 |
| Variable | 变量 | Canvas | 画布 |
| Workspace | 工作区 | Node | 节点 |

### 常用动词

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| Create | 创建 | Save | 保存 |
| Run / Run workflow | 运行 / 运行工作流 | Publish / Deploy | 发布 |
| Test | 测试 | Delete | 删除 |
| Rename | 重命名 | Duplicate | 复制 |
| Edit | 编辑 | Enable / Disable | 启用 / 禁用 |
| Lock / Unlock | 锁定 / 解锁 | Search | 搜索 |
| Filter | 筛选 | Add / Remove | 添加 / 移除 |
| Invite | 邀请 | Upgrade | 升级 |
| Settings | 设置 | Logs | 日志 |
| Export / Import | 导出 / 导入 | Expand / Collapse | 展开 / 折叠 |
| Loading | 加载中 | Home | 首页 |
| New chat | 新建对话 | Voice input | 语音输入 |
| Attach file | 添加附件 | Add resources | 添加资源 |
| Events that start a workflow | 触发工作流的事件 | Core Blocks | 核心节点 |
| Send | 发送 | Stop | 停止 |

### 保留不译

| 类别 | 示例 |
|---|---|
| 品牌名 | Sim、Slack、Gmail、Notion、Linear、GitHub 等 |
| 技术名词 | Webhook、OAuth、API、JSON、Markdown、HTTP(S)、Token |
| 模型名 | GPT-4o、Claude、Gemini 等 |
| 逻辑值 | block type('slack')、operation id('send')、请求参数、对象键、store action 名、CSS 类名 |

### v1 增补(实施期间 5.4–7.3)

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| Scheduled task | 定时任务 | Credential | 凭据 |
| Service account | 服务账号 | API token | API 令牌 |
| Knowledge base | 知识库 | Chunk | 分块 |
| Table / rows | 表格 / 行 | Credits | 积分 |
| Plan | 套餐 | Billing period | 计费周期 |
| Annual / Monthly | 按年 / 按月 | Custom | 自定义 |
| Unlimited | 无限 | Currently/Scheduled | 待运行 |
| Runs / Ran / Failed(时间) | 运行时间 / 运行时间 / 失败时间 | Frequency | 频率 |
| Recurring | 重复 | End date | 结束日期 |
| Never ends / Ends on / Ends after | 永不结束 / 在指定日期结束 / 在指定次数后结束 | Sort | 排序 |
| Preview / Split | 预览 / 分屏 | Reset zoom | 重置缩放 |
| Zoom in / out | 放大 / 缩小 | Unsaved changes | 未保存的更改 |
| Discard changes | 放弃更改 | Recently Deleted | 最近删除 |
| Invite teammates | 邀请团队成员 | Rate limits | 速率限制 |
| Timeout | 超时 | Storage | 存储 |
| Drop to upload | 拖放即可上传 | Move here | 移动到此 |
| Share / Access | 共享 / 访问权限 | Allowed emails | 允许的邮箱 |
| Compare plans | 对比套餐 | Your plan | 你的套餐 |
| Current Plan | 当前套餐 | Downgrade plan | 降级套餐 |
| Talk to sales | 联系销售 | Get started | 开始使用 |
| Component Playground | 组件试验场 | Chat options | 对话选项 |
| Parent workflow | 父工作流 | Help & support | 帮助与支持 |
| Relative time | 刚刚 / N 分钟前 / N 小时前 / N 天前 | Date format | 2026年8月10日、上午/下午 |
| Plain text | 纯文本 | Heading | 标题 |
| Bulleted / Numbered / Checklist | 无序列表 / 有序列表 / 任务清单 | Quote / Code block | 引用 / 代码块 |
| Mentions | 提及 | Commands | 命令 |
| All selected / None selected | 已全部选择 / 未选择 | Selected N items | 已选择 N 项 |
| Fork / Forks(工作区副本) | 创建副本 / 副本 | Rollback | 回滚 |
| Sync workspace | 同步工作区 | Push / Pull | 推送 / 拉取 |
| Admin / Write / Read(角色) | 管理员 / 编辑 / 只读 | Folders | 文件夹 |
| Help & support | 帮助与支持 | Report an issue | 反馈问题 |
| Docs | 文档 | Copy link | 复制链接 |
| More actions | 更多操作 | See more / See less | 查看更多 / 收起 |
| API key(s) | API 密钥 | Usage limit | 用量上限 |
| No Usage Limit | 无限用量 | Billed annually / monthly | 按年计费 / 按月计费 |
| Payment method | 支付方式 | Invoice / Invoices | 发票 |
| Usage notifications | 用量通知 | Cancel subscription | 取消订阅 |
| Explore plans / View plans | 查看套餐 | Custom pricing | 自定义定价 |
| Restore | 恢复 | Access until | 访问有效期至 |
| On-demand usage | 按需用量 | Included usage | 包含的额度 |
| Organization | 组织 | Member(s) | 成员 |
| Owner | 所有者 | Role | 角色 |
| Transfer ownership | 转让所有权 | Resend invite | 重新发送邀请 |
| Revoke invite | 撤销邀请 | Copy invite link | 复制邀请链接 |
| Remove from workspace | 从工作区移除 | Team URL / Team Name | 团队 URL / 团队名称 |
| Joined / Invite pending | 已加入 / 邀请待接受 | Over limit | 超出上限 |
| Manage credits | 管理积分 | Credit limit | 积分上限 |
| Custom tools | 自定义工具 | MCP servers | MCP 服务器 |
| Server Name / Server URL | 服务器名称 / 服务器 URL | Transport | 传输方式 |
| Headers | 请求头 | Authentication | 认证 |
| Client ID / Client Secret | 客户端 ID / 客户端密钥 | Test Connection | 测试连接 |
| Connection success | 连接成功 | Refresh tools | 刷新工具 |
| Personal secret / Workspace secret | 个人密钥 / 工作区密钥 | Regenerate | 重新生成 |
| Rotate | 轮换 | Reveal / Hide | 显示 / 隐藏 |
| Credential sets(UI: 轮询组) | 凭据集(邮件轮询 UI 用「轮询组」) | Polling group | 轮询组 |
| Inbox | 收件箱 | Email prefix | 邮件前缀 |
| Allowed senders | 允许的发送者 | Sender | 发送者 |
| License | 许可证 | License key | 许可证密钥 |
| Superuser mode | 超级管理员模式 | Impersonate | 模拟用户 |
| Ban / Unban | 封禁 / 解封 | Profile / Preferences / Privacy | 个人资料 / 偏好设置 / 隐私 |
| Theme: System / Light / Dark | 主题:跟随系统 / 浅色 / 深色 | Snap to grid | 对齐网格 |
| Auto-connect on drop | 拖放时自动连接 | Sign out | 退出登录 |
| Reset Password | 重置密码 | Change profile picture | 更换头像 |
| Hosted / Self-hosted | 托管 / 自托管 | Enrichment | 数据丰富 |
| Email finder / verification | 邮箱查找 / 验证 | Web scraping / crawling | 网页抓取 / 爬取 |
| Deep research | 深度研究 | Provision | 配置 / 开通 |

**实施中发现并处理的边界案例:**
- `TableRowLimitError` 消息含 `row limit` 标记,被 API 层 `ROW_WRITE_ERROR_PATTERNS` 子串匹配(逻辑值)→ 该错误消息保留英文(同时属于③ API 错误消息范围)
- `Intl.DateTimeFormat('en-US')` 中 2 处位于落地页(`/models`),保留英文;`en-CA` 的 formatToParts 数值提取调用不改(locale 无关)
- `BillingPeriodToggle`/`comparison-data`/`plan-view` 为落地页与工作区共享 → 共享层保留英文,工作区渲染层映射中文(`CTA_LABELS`、`SECTION_TITLES` 等)
- emcn 包与落地页共享 → 固定文案译为中文,新增 `ChipModalFooter.cancelLabel` 可选 prop,落地页传 `'Cancel'`
- slack-setup-wizard 中 "Create New App"/"Next"/"Create" 为 Slack 官网真实按钮名,保留英文
- 节点 error 输出端口标签(renderer `title='error'`)为注册表端口名,与编辑器一致保留英文
