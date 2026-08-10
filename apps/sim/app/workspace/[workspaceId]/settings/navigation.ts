import {
  ClipboardList,
  Database,
  HexSimple,
  Key,
  KeySquare,
  Lock,
  LogIn,
  Mail,
  Palette,
  Send,
  Server,
  Settings,
  ShieldCheck,
  TerminalWindow,
  TrashOutline,
  Upload,
  User,
  Users,
  Wrench,
} from '@sim/emcn'
import { McpIcon } from '@/components/icons'
import { getEnv, isTruthy } from '@/lib/core/config/env'

export type SettingsSection =
  | 'general'
  | 'secrets'
  | 'credential-sets'
  | 'access-control'
  | 'audit-logs'
  | 'apikeys'
  | 'byok'
  | 'billing'
  | 'teammates'
  | 'organization'
  | 'sso'
  | 'whitelabeling'
  | 'copilot'
  | 'mcp'
  | 'custom-tools'
  | 'workflow-mcp-servers'
  | 'inbox'
  | 'admin'
  | 'data-retention'
  | 'data-drains'
  | 'mothership'
  | 'recently-deleted'

export type NavigationSection =
  | 'account'
  | 'subscription'
  | 'tools'
  | 'system'
  | 'enterprise'
  | 'superuser'

export interface NavigationItem {
  id: SettingsSection
  label: string
  /** One-line summary shown as the page subtitle under the title. */
  description: string
  icon: React.ComponentType<{ className?: string }>
  section: NavigationSection
  hideWhenBillingDisabled?: boolean
  requiresTeam?: boolean
  requiresEnterprise?: boolean
  requiresMax?: boolean
  requiresHosted?: boolean
  selfHostedOverride?: boolean
  requiresSuperUser?: boolean
  requiresAdminRole?: boolean
  /** Show in the sidebar even when the user lacks the required plan, with an upgrade badge. */
  showWhenLocked?: boolean
  /** Hide for enterprise plans, which manage billing out-of-band. */
  hideForEnterprise?: boolean
  externalUrl?: string
  /** Absolute docs URL surfaced as a "Docs" link in the page header. */
  docsLink?: string
}

const isCredentialSetsEnabled = isTruthy(getEnv('NEXT_PUBLIC_CREDENTIAL_SETS_ENABLED'))
const isAccessControlEnabled = isTruthy(getEnv('NEXT_PUBLIC_ACCESS_CONTROL_ENABLED'))
const isInboxEnabled = isTruthy(getEnv('NEXT_PUBLIC_INBOX_ENABLED'))
const isWhitelabelingEnabled = isTruthy(getEnv('NEXT_PUBLIC_WHITELABELING_ENABLED'))
const isAuditLogsEnabled = isTruthy(getEnv('NEXT_PUBLIC_AUDIT_LOGS_ENABLED'))
const isDataRetentionEnabled = isTruthy(getEnv('NEXT_PUBLIC_DATA_RETENTION_ENABLED'))
const isDataDrainsEnabled = isTruthy(getEnv('NEXT_PUBLIC_DATA_DRAINS_ENABLED'))
const isOrganizationsEnabled = isTruthy(getEnv('NEXT_PUBLIC_ORGANIZATIONS_ENABLED'))

export const isBillingEnabled = isTruthy(getEnv('NEXT_PUBLIC_BILLING_ENABLED'))
export { isCredentialSetsEnabled }

export const sectionConfig: { key: NavigationSection; title: string }[] = [
  { key: 'account', title: '账户' },
  { key: 'tools', title: '工具' },
  { key: 'subscription', title: '订阅' },
  { key: 'system', title: '系统' },
  { key: 'enterprise', title: '企业' },
  { key: 'superuser', title: '超级用户' },
]

export const allNavigationItems: NavigationItem[] = [
  {
    id: 'general',
    label: '常规',
    description: '管理你的个人资料、外观和偏好。',
    icon: Settings,
    section: 'account',
  },
  {
    id: 'access-control',
    label: '访问控制',
    description: '管理整个组织的权限组。',
    icon: ShieldCheck,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    selfHostedOverride: isAccessControlEnabled,
    docsLink: 'https://docs.sim.ai/platform/enterprise/access-control',
  },
  {
    id: 'audit-logs',
    label: '审计日志',
    description: '查看整个组织的活动与变更记录。',
    icon: ClipboardList,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    selfHostedOverride: isAuditLogsEnabled,
    docsLink: 'https://docs.sim.ai/platform/enterprise/audit-logs',
  },
  {
    id: 'billing',
    label: '账单',
    description: '管理你的套餐、价格和发票。',
    icon: ClipboardList,
    section: 'subscription',
    hideWhenBillingDisabled: true,
  },
  {
    id: 'teammates',
    label: '团队成员',
    description: '管理此工作区的团队成员。',
    icon: User,
    section: 'subscription',
  },
  {
    id: 'organization',
    label: '组织',
    description: '管理组织的成员和席位。',
    icon: Users,
    section: 'subscription',
    hideWhenBillingDisabled: true,
    requiresHosted: true,
    requiresTeam: true,
    selfHostedOverride: isOrganizationsEnabled,
  },
  {
    id: 'secrets',
    label: '密钥',
    description: '为你的工作流存储环境变量。',
    icon: Key,
    section: 'account',
  },
  {
    id: 'custom-tools',
    label: '自定义工具',
    description: '为你的智能体创建和管理自定义工具。',
    icon: Wrench,
    section: 'tools',
  },
  {
    id: 'mcp',
    label: 'MCP 工具',
    description: '连接 MCP 服务器并在工作流中使用其工具。',
    icon: McpIcon,
    section: 'tools',
  },
  {
    id: 'apikeys',
    label: 'Sim API 密钥',
    description: '创建和管理 Sim API 的 API 密钥。',
    icon: TerminalWindow,
    section: 'system',
  },
  {
    id: 'workflow-mcp-servers',
    label: 'MCP 服务器',
    description: '将你的工作流作为 MCP 服务器上的工具暴露。',
    icon: Server,
    section: 'system',
  },
  {
    id: 'byok',
    label: 'BYOK',
    description: '自带模型提供商的 API 密钥。',
    icon: KeySquare,
    section: 'system',
    requiresHosted: true,
  },
  {
    id: 'copilot',
    label: '对话密钥',
    description: '管理驱动对话的模型提供商密钥。',
    icon: HexSimple,
    section: 'system',
    requiresHosted: true,
  },
  {
    id: 'inbox',
    label: 'Sim 邮件服务',
    description: '通过收到的邮件触发和处理工作流。',
    icon: Send,
    section: 'system',
    requiresMax: true,
    requiresHosted: true,
    selfHostedOverride: isInboxEnabled,
    showWhenLocked: true,
  },
  ...(isCredentialSetsEnabled
    ? [
        {
          id: 'credential-sets' as const,
          label: '邮件轮询',
          description: '在团队内共享邮件轮询凭据。',
          icon: Mail,
          section: 'system' as const,
        },
      ]
    : []),
  {
    id: 'recently-deleted',
    label: '最近删除',
    description: '恢复过去 30 天内删除的项目。',
    icon: TrashOutline,
    section: 'system',
  },
  {
    id: 'sso',
    label: '单点登录',
    description: '为你的组织配置单点登录。',
    icon: LogIn,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    docsLink: 'https://docs.sim.ai/platform/enterprise/sso',
  },
  {
    id: 'data-retention',
    label: '数据保留',
    description: '控制数据保留窗口和 PII 脱敏。未设置覆盖的工作区继承组织默认值。',
    icon: Database,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    selfHostedOverride: isDataRetentionEnabled,
    docsLink: 'https://docs.sim.ai/platform/enterprise/data-retention',
  },
  {
    id: 'data-drains',
    label: '数据导出',
    description: '将你的日志和事件流式传输到外部目标。',
    icon: Upload,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    selfHostedOverride: isDataDrainsEnabled,
    docsLink: 'https://docs.sim.ai/platform/enterprise/data-drains',
  },
  {
    id: 'whitelabeling',
    label: '品牌定制',
    description: '自定义你的工作区品牌和外观。',
    icon: Palette,
    section: 'enterprise',
    requiresHosted: true,
    requiresEnterprise: true,
    selfHostedOverride: isWhitelabelingEnabled,
    docsLink: 'https://docs.sim.ai/platform/enterprise/whitelabeling',
  },
  {
    id: 'admin',
    label: '管理员',
    description: '超级用户管理与工作区工具。',
    icon: Lock,
    section: 'superuser',
    requiresAdminRole: true,
  },
  {
    id: 'mothership',
    label: 'Mothership',
    description: 'Sim 内部运营与许可证管理。',
    icon: Server,
    section: 'superuser',
    requiresAdminRole: true,
  },
]

/**
 * Title + description for a settings section, the single source of truth used by
 * `SettingsPanel` to render the page header. Falls back to `null` for sections
 * that are gated off (callers render no title in that case).
 */
export function getSettingsSectionMeta(
  section: SettingsSection
): { label: string; description: string; docsLink?: string } | null {
  const item = allNavigationItems.find((navItem) => navItem.id === section)
  return item ? { label: item.label, description: item.description, docsLink: item.docsLink } : null
}
