'use client'

import { useCallback, useState } from 'react'
import {
  ChipConfirmModal,
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  Switch,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { useParams } from 'next/navigation'
import { useInboxConfig, useToggleInbox } from '@/hooks/queries/inbox'

const logger = createLogger('InboxEnableToggle')

export function InboxEnableToggle() {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const { data: config } = useInboxConfig(workspaceId)
  const toggleInbox = useToggleInbox()

  const [isEnableOpen, setIsEnableOpen] = useState(false)
  const [isDisableOpen, setIsDisableOpen] = useState(false)
  const [enableUsername, setEnableUsername] = useState('')

  const handleToggle = useCallback(async (checked: boolean) => {
    if (checked) {
      setIsEnableOpen(true)
      return
    }
    setIsDisableOpen(true)
  }, [])

  const handleDisable = useCallback(async () => {
    try {
      await toggleInbox.mutateAsync({ workspaceId, enabled: false })
      setIsDisableOpen(false)
    } catch (error) {
      logger.error('Failed to disable inbox', { error })
    }
  }, [workspaceId, toggleInbox.mutateAsync])

  const handleEnable = useCallback(async () => {
    try {
      await toggleInbox.mutateAsync({
        workspaceId,
        enabled: true,
        username: enableUsername.trim() || undefined,
      })
      setIsEnableOpen(false)
      setEnableUsername('')
    } catch (error) {
      logger.error('Failed to enable inbox', { error })
    }
  }, [workspaceId, enableUsername, toggleInbox.mutateAsync])

  return (
    <>
      <div className='flex items-center justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-[13px] text-[var(--text-primary)]'>启用邮件收件箱</span>
          <span className='text-[12px] text-[var(--text-muted)]'>允许此工作区通过邮件接收任务</span>
        </div>
        <Switch
          checked={config?.enabled ?? false}
          onCheckedChange={handleToggle}
          disabled={toggleInbox.isPending}
        />
      </div>

      <ChipModal open={isEnableOpen} onOpenChange={setIsEnableOpen} srTitle='启用邮件收件箱'>
        <ChipModalHeader onClose={() => setIsEnableOpen(false)}>启用邮件收件箱</ChipModalHeader>
        <ChipModalBody>
          <p className='px-2 text-[var(--text-secondary)] text-sm'>
            系统将为此工作区创建一个邮件地址。允许的发送者列表中的任何人向该地址发送邮件即可
            创建任务。
          </p>
          <ChipModalField
            type='input'
            title='邮件前缀'
            value={enableUsername}
            onChange={setEnableUsername}
            placeholder='可选 — 留空将自动生成'
          />
          <p className='px-2 text-[var(--text-muted)] text-sm'>留空则使用自动生成的地址。</p>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setIsEnableOpen(false)}
          primaryAction={{
            label: '启用',
            onClick: handleEnable,
            disabled: toggleInbox.isPending,
          }}
        />
      </ChipModal>

      <ChipConfirmModal
        open={isDisableOpen}
        onOpenChange={setIsDisableOpen}
        srTitle='禁用邮件收件箱'
        title='禁用邮件收件箱'
        text={[
          '确定要禁用收件箱',
          config?.address && ' ',
          config?.address && { text: config.address, bold: true },
          '吗?禁用后发送到该地址的邮件将不会被接收。此操作无法撤销。',
        ]}
        confirm={{
          label: '禁用收件箱',
          onClick: handleDisable,
          pending: toggleInbox.isPending,
          pendingLabel: '禁用中...',
        }}
      >
        <p className='px-2 text-[var(--text-secondary)] text-sm'>
          你现有的对话和任务历史将得到保留。
        </p>
      </ChipConfirmModal>
    </>
  )
}
