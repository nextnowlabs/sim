'use client'

import { Chip } from '@sim/emcn'
import { ArrowRight } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useUserPermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import {
  InboxEnableToggle,
  InboxSettingsTab,
  InboxTaskList,
} from '@/app/workspace/[workspaceId]/settings/components/inbox/components'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { useInboxConfig } from '@/hooks/queries/inbox'

export function Inbox() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string

  const { data: config, isLoading } = useInboxConfig(workspaceId)
  const { canAdmin } = useUserPermissionsContext()

  if (isLoading) {
    return null
  }

  if (!config?.entitled) {
    if (config?.enabled && canAdmin) {
      return (
        <SettingsPanel>
          <InboxEnableToggle />
        </SettingsPanel>
      )
    }
    return (
      <div className='flex h-full flex-col bg-[var(--bg)]'>
        <div className='min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable_both-edges]'>
          <div className='mx-auto flex max-w-[48rem] flex-col gap-4.5 pt-6 pb-6'>
            <div className='flex flex-col items-center justify-center gap-4 py-20'>
              <div className='text-center'>
                <h3 className='font-medium text-[16px] text-[var(--text-primary)]'>
                  Sim 邮件服务需要有效的 Max 套餐
                </h3>
                <p className='mt-1.5 text-[14px] text-[var(--text-muted)]'>
                  升级到 Max 并确保账单处于活跃状态,即可通过邮件接收任务,让 Sim 替你工作。
                </p>
              </div>
              <Chip
                variant='primary'
                rightIcon={ArrowRight}
                onClick={() => router.push(`/workspace/${workspaceId}/settings/billing`)}
              >
                升级到 Max
              </Chip>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsPanel>
      <InboxEnableToggle />

      {config?.enabled && (
        <>
          <InboxSettingsTab />

          <SettingsSection label='收件箱'>
            <p className='mb-3 text-[12px] text-[var(--text-muted)]'>此工作区收到的邮件任务。</p>
            <InboxTaskList />
          </SettingsSection>
        </>
      )}
    </SettingsPanel>
  )
}
