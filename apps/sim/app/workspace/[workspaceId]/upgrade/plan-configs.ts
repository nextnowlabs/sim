/**
 * Config for a plan's top-level credit stats.
 * When `credits` is omitted the credits/refresh block is not rendered.
 */
export interface PlanCredits {
  /** Formatted credits string, e.g. `"6,000 credits/mo"`. */
  credits: string
  /** Formatted daily-refresh string, e.g. `"+50/day refresh"`. */
  refresh: string
}

export const PRO_PLAN_CREDITS: PlanCredits = {
  credits: '每月 6,000 积分',
  refresh: '每天 +50 刷新',
}

export const MAX_PLAN_CREDITS: PlanCredits = {
  credits: '每月 25,000 积分',
  refresh: '每天 +200 刷新',
}

export const ENTERPRISE_PLAN_CREDITS: PlanCredits = {
  credits: '自定义',
  refresh: '自定义',
}

export const PRO_PLAN_FEATURES: readonly string[] = [
  '邀请团队成员',
  '将工作流部署为 API',
  '更长的运行超时',
  '更多存储与表格',
]

export const MAX_PLAN_FEATURES: readonly string[] = [
  '邀请团队成员',
  'Sim Mailer 与知识库实时同步',
  '最高速率限制',
  '更大存储与表格',
]

export const ENTERPRISE_PLAN_FEATURES: readonly string[] = [
  '自定义限制与基础设施',
  'SSO 与 SOC2 合规',
  '访问控制与自托管',
  '专属支持',
]
