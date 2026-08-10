import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isBillingEnabled } from '@/lib/core/config/env-flags'
import { getQueryClient } from '@/app/_shell/providers/get-query-client'
import type { SettingsSection } from '@/app/workspace/[workspaceId]/settings/navigation'
import { prefetchGeneralSettings, prefetchSubscriptionData, prefetchUserProfile } from './prefetch'
import { SettingsPage } from './settings'

/**
 * Legacy settings sections that moved to top-level workspace routes.
 * Old bookmarks and emails deep-link here; without the redirect the
 * section renderer has no matching branch and shows an empty panel.
 */
const SETTINGS_REDIRECTS: Record<string, (workspaceId: string) => string> = {
  integrations: (id) => `/workspace/${id}/integrations`,
  skills: (id) => `/workspace/${id}/skills`,
}

const SECTION_TITLES: Record<string, string> = {
  general: '常规',
  secrets: '密钥',
  'access-control': '访问控制',
  'audit-logs': '审计日志',
  apikeys: 'Sim API 密钥',
  byok: 'BYOK',
  subscription: '订阅',
  billing: '账单',
  teammates: '团队成员',
  team: '团队',
  sso: '单点登录',
  whitelabeling: '品牌定制',
  copilot: '对话密钥',
  mcp: 'MCP 工具',
  'custom-tools': '自定义工具',
  'workflow-mcp-servers': 'MCP 服务器',
  'credential-sets': '邮件轮询',
  'data-retention': '数据保留',
  'recently-deleted': '最近删除',
  debug: '调试',
} as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}): Promise<Metadata> {
  const { section } = await params
  return { title: SECTION_TITLES[section] ?? '设置' }
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; section: string }>
}) {
  const { workspaceId, section } = await params

  const redirectTo = SETTINGS_REDIRECTS[section]
  if (redirectTo) redirect(redirectTo(workspaceId))

  const queryClient = getQueryClient()

  void prefetchGeneralSettings(queryClient)
  void prefetchUserProfile(queryClient)
  if (isBillingEnabled) void prefetchSubscriptionData(queryClient)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={null}>
        <SettingsPage section={section as SettingsSection} />
      </Suspense>
    </HydrationBoundary>
  )
}
