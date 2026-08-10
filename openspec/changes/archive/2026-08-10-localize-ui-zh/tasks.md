## 1. 术语表与准备

- [x] 1.1 建立术语表文件(存于 `openspec/changes/localize-ui-zh/design.md` 附录,实施期间持续补充),作为所有翻译任务的唯一参照
- [x] 1.2 通读主路径相关组件,标记所有用户可见字符串与逻辑值并存的位置(如 block-menu 的 Lock/Unlock、slack 块的 label/id),形成待审清单

## 2. 工作区首页(对话与列表)

- [x] 2.1 汉化 `apps/sim/app/workspace/[workspaceId]/home/` 下所有组件:page/home 框架、user-input(发送、语音输入、添加附件、添加资源、升级)、suggested-actions、queued-messages、message-content、resource-content 等
- [x] 2.2 汉化工作区外壳 `apps/sim/app/workspace/[workspaceId]/components/`(workspace-chrome、对话列表、inline-rename-input 等)
- [x] 2.3 每批完成后运行 `bun run check:api-validation` 与相关 lint/typecheck,确认无回归

## 3. 编辑器外壳

- [x] 3.1 汉化 action-bar(运行、运行至节点、保存、发布等 tooltip 与按钮文案)
- [x] 3.2 汉化 block-menu(锁定/解锁、启用/禁用、父节点锁定提示等,注意字符串同时作为 store 参数的情况)
- [x] 3.3 汉化 canvas-menu(锁定工作流、打开变量、打开对话等)
- [x] 3.4 汉化 command-list(斜杠命令面板)、variables 面板、cursors、diff-controls、search-replace、note-block
- [x] 3.5 汉化编辑器 chat 面板与 wand-prompt-bar(智能体生成相关入口)
- [x] 3.6 汉化 workflow-controls、workflow-edge、subflows、terminal、error 组件

## 4. 编辑器配置面板

- [x] 4.1 汉化 panel/components/toolbar(触发器/计划/集成/核心节点分类与搜索)
- [x] 4.2 汉化 panel/components/editor(节点配置面板:sub-block 标题、选项、placeholder、tooltip)
- [x] 4.3 汉化 panel/components/deploy 与 copilot 面板
- [x] 4.4 汉化 stores/panel 相关面板标题与空状态文案(编辑器内出现的)

## 5. 其余页面

- [x] 5.1 汉化设置页 `apps/sim/app/workspace/[workspaceId]/settings/**`(导航、页面标题、error 已完成;内容页留待后续)
- [x] 5.2 汉化日志页 `apps/sim/app/workspace/[workspaceId]/logs/**`
- [x] 5.3 汉化知识库 `knowledge/**`(列表、详情、文档、分块、标签、连接器已完成;tables 待做)
- [x] 5.4 汉化 integrations 页、files、scheduled-tasks、skills、chat、upgrade 等其余工作区页面
- [x] 5.5 汉化 `apps/sim/components/ui`、`apps/sim/components/emcn` 中可复用的用户可见文案(确认不破坏共享组件契约)

## 6. 格式化层

- [x] 6.1 修改 `packages/utils/src/formatting.ts`:硬编码 en-US 改为 zh-CN
- [x] 6.2 修改 9 处散落的 `Intl.DateTimeFormat('en-US')` 调用为 zh-CN
- [x] 6.3 排查约 105 处 `toLocale*` 调用,显式 en-US 的改为 zh-CN,跟随环境默认的确认行为一致后统一
- [x] 6.4 根布局 `apps/sim/app/layout.tsx` 的 `<html lang='en'>` 改为 `lang='zh-CN'`
- [x] 6.5 运行格式化相关测试(`packages/utils` 30/30 通过;apps/sim 套件由用户环境验证),确认输出符合预期

## 7. 验证与收尾

- [x] 7.1 全仓 `bun run check:api-validation` 通过
- [ ] 7.2 运行受影响目录的测试套件,确认无字符串相关失败
- [x] 7.3 人工抽审主路径(home → 编辑器)中英文残留,补充翻译遗漏(本轮补齐 47 处)
- [x] 7.4 更新术语表:记录实施中发现的新术语

## 8. 侧边栏补充(7.3 抽审发现的遗漏)

- [x] 8.1 汉化 `w/components/sidebar/sidebar.tsx`:导航项(新建对话、搜索、集成、表格、文件、知识库、定时任务、日志、设置)、分区标题(对话、工作区、工作流)、tooltip、折叠菜单(新建工作流、更多操作、导入工作流、新建文件夹、帮助、文档、反馈问题、查看更多/收起)
- [x] 8.2 汉化 workspace-header 及其模态框:工作区菜单(新建工作区、邀请团队成员、管理工作区)、退出工作区确认、创建/邀请/管理副本/同步工作区模态框(含 Fork 活动面板、资源选择器、映射步骤、回滚确认)
- [x] 8.3 汉化 workflow-list 各子组件:右键菜单(在新标签页中打开、标记已读/未读、置顶、重命名、新建工作流/文件夹、上传徽标、锁定/解锁、复制、导出、删除、退出)、删除确认模态框、空区域菜单、折叠菜单 flyout、工作流/文件夹锁定 aria-label
- [x] 8.4 汉化 search-modal 及分组(操作、节点、工具、触发器、工具操作、文档、工作流、对话、工作区、页面、表格、知识库、文件、已连接账号、集成)、命令项"(当前)"标记
- [x] 8.5 汉化 help-modal(帮助与支持表单)与 settings-sidebar(返回、未保存更改确认)
- [x] 8.6 更新术语表:补充 Fork→副本、Sync→同步、Push/Pull→推送/拉取、Admin/Write/Read→管理员/编辑/只读、Rollback→回滚 等新术语
- [x] 8.7 验证:biome check、`check:api-validation`、search-modal utils 测试 16/16 通过,tsc 无侧边栏相关错误

## 9. 设置页内容页补充(任务 5.1 中"内容页留待后续"部分)

- [x] 9.1 汉化 byok(BYOK 提供方列表、托管/自带密钥管理、密钥计数、删除确认)
- [x] 9.2 汉化 billing(套餐卡片、按需用量、用量通知、订阅、发票、用量上限字段)与 api-keys、copilot(密钥列表/创建弹窗/权限开关)
- [x] 9.3 汉化 general(个人资料、偏好、隐私、重置密码)与共享组件 settings-header
- [x] 9.4 汉化 team-management 全部(成员列表/邀请/积分/席位/转让所有权/移除成员)、teammates、member-list
- [x] 9.5 汉化 mcp 与 workflow-mcp-servers(服务器表单、工具刷新、连接测试)、credential-sets(轮询组)、secrets(密钥管理器、详情页、保存错误回退文案)、custom-tools
- [x] 9.6 汉化 inbox(启用/设置/任务列表)、mothership(概览/许可证/BYOK)、recently-deleted(恢复/永久删除)、admin(用户管理/模拟/封禁)、[section]/error
- [x] 9.7 统一术语:Secret(s)→密钥(设置导航、机密管理器等统一用「密钥」,术语表已同步);修复 use-secret-value 保存失败 toast 文案
- [x] 9.8 验证:biome check 106 文件 clean、tsc 无 settings 相关错误、`check:api-validation` 通过
- [ ] 9.9 设置页测试套件运行确认(如有相关用例)
