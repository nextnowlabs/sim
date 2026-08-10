'use client'

import { useCallback, useState } from 'react'
import {
  Badge,
  Chip,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  Tooltip,
} from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { Check, Clipboard, Pencil, Plus, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import {
  useAddInboxSender,
  useInboxConfig,
  useInboxSenders,
  useRemoveInboxSender,
  useUpdateInboxAddress,
} from '@/hooks/queries/inbox'

export function InboxSettingsTab() {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const { data: config } = useInboxConfig(workspaceId)
  const { data: sendersData, isLoading: sendersLoading } = useInboxSenders(workspaceId)
  const updateAddress = useUpdateInboxAddress()
  const addSender = useAddInboxSender()
  const removeSender = useRemoveInboxSender()

  const [isAddSenderOpen, setIsAddSenderOpen] = useState(false)
  const [newSenderEmail, setNewSenderEmail] = useState('')
  const [newSenderLabel, setNewSenderLabel] = useState('')
  const [addSenderError, setAddSenderError] = useState<string | null>(null)

  const [isEditAddressOpen, setIsEditAddressOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [editAddressError, setEditAddressError] = useState<string | null>(null)

  const [removeSenderError, setRemoveSenderError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)

  const handleCopyAddress = useCallback(() => {
    if (config?.address) {
      navigator.clipboard.writeText(config.address)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    }
  }, [config?.address])

  const handleEditAddress = useCallback(async () => {
    if (!newUsername.trim()) return
    setEditAddressError(null)
    try {
      await updateAddress.mutateAsync({ workspaceId, username: newUsername.trim() })
      setIsEditAddressOpen(false)
      setNewUsername('')
    } catch (error) {
      setEditAddressError(getErrorMessage(error, '更新地址失败'))
    }
  }, [workspaceId, newUsername, updateAddress.mutateAsync])

  const handleAddSender = useCallback(async () => {
    if (!newSenderEmail.trim()) return
    setAddSenderError(null)
    try {
      await addSender.mutateAsync({
        workspaceId,
        email: newSenderEmail.trim(),
        label: newSenderLabel.trim() || undefined,
      })
      setIsAddSenderOpen(false)
      setNewSenderEmail('')
      setNewSenderLabel('')
    } catch (error) {
      setAddSenderError(getErrorMessage(error, '添加发送者失败'))
    }
  }, [workspaceId, newSenderEmail, newSenderLabel, addSender.mutateAsync])

  const handleRemoveSender = useCallback(
    async (senderId: string) => {
      setRemoveSenderError(null)
      try {
        await removeSender.mutateAsync({ workspaceId, senderId })
      } catch (error) {
        setRemoveSenderError(getErrorMessage(error, '移除发送者失败'))
      }
    },
    [workspaceId, removeSender.mutateAsync]
  )

  return (
    <>
      <div className='flex flex-col gap-7'>
        {config?.address && (
          <SettingsSection label='Sim 邮箱'>
            <div className='flex flex-col gap-1.5'>
              <div className='flex items-center justify-between'>
                <p className='text-[12px] text-[var(--text-muted)]'>
                  向此地址发送邮件即可创建任务。
                </p>
                <div className='flex items-center gap-1.5'>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type='button'
                        onClick={handleCopyAddress}
                        className='-my-1 flex size-5 items-center justify-center'
                        aria-label='复制地址'
                      >
                        {copiedAddress ? (
                          <Check className='size-[14px] text-[var(--text-success)]' />
                        ) : (
                          <Clipboard className='size-[14px] text-[var(--text-icon)]' />
                        )}
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content side='top'>
                      <p>{copiedAddress ? '已复制!' : '复制'}</p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type='button'
                        onClick={() => {
                          setNewUsername('')
                          setEditAddressError(null)
                          setIsEditAddressOpen(true)
                        }}
                        className='-my-1 flex size-5 items-center justify-center'
                        aria-label='编辑地址'
                      >
                        <Pencil className='size-[14px] text-[var(--text-icon)]' />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content side='top'>
                      <p>编辑</p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </div>
              </div>
              <ChipInput
                value={config.address}
                readOnly
                inputClassName='cursor-default font-mono text-small'
              />
            </div>
          </SettingsSection>
        )}

        <SettingsSection label='允许的发送者'>
          <div className='flex flex-col gap-1.5'>
            <p className='text-[12px] text-[var(--text-muted)]'>
              只有来自这些地址的邮件才能创建任务。
            </p>

            <div className='mt-1 flex flex-col gap-[1px] overflow-hidden rounded-lg border border-[var(--border)]'>
              {sendersLoading ? null : (
                <>
                  {sendersData?.workspaceMembers.map((member) => (
                    <div
                      key={member.email}
                      className='flex items-center justify-between border-[var(--border)] border-b px-3 py-2.5 last:border-b-0'
                    >
                      <div className='flex items-center gap-2'>
                        <span className='text-[14px] text-[var(--text-body)]'>{member.email}</span>
                        <Badge variant='gray' className='text-xs'>
                          成员
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {sendersData?.senders.map((sender) => (
                    <div
                      key={sender.id}
                      className='flex items-center justify-between border-[var(--border)] border-b px-3 py-2.5 last:border-b-0'
                    >
                      <div className='flex items-center gap-2'>
                        <span className='text-[14px] text-[var(--text-body)]'>{sender.email}</span>
                        {sender.label && (
                          <span className='text-[12px] text-[var(--text-muted)]'>
                            ({sender.label})
                          </span>
                        )}
                      </div>
                      <Chip
                        flush
                        leftIcon={Trash2}
                        aria-label='移除发送者'
                        onClick={() => handleRemoveSender(sender.id)}
                      />
                    </div>
                  ))}

                  {sendersData?.workspaceMembers.length === 0 &&
                    sendersData?.senders.length === 0 && (
                      <div className='px-3 py-2.5 text-[12px] text-[var(--text-muted)]'>
                        尚未配置允许的发送者。
                      </div>
                    )}
                </>
              )}
            </div>

            {removeSenderError && (
              <p className='px-3 text-[12px] text-[var(--text-error)] leading-tight'>
                {removeSenderError}
              </p>
            )}

            <Chip
              className='mt-1 w-fit'
              leftIcon={Plus}
              onClick={() => {
                setNewSenderEmail('')
                setNewSenderLabel('')
                setAddSenderError(null)
                setIsAddSenderOpen(true)
              }}
            >
              添加发送者
            </Chip>
          </div>
        </SettingsSection>
      </div>

      <ChipModal
        open={isAddSenderOpen}
        onOpenChange={setIsAddSenderOpen}
        srTitle='添加允许的发送者'
      >
        <ChipModalHeader onClose={() => setIsAddSenderOpen(false)}>
          添加允许的发送者
        </ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='email'
            title='邮件地址'
            value={newSenderEmail}
            onChange={(v) => {
              setNewSenderEmail(v)
              if (addSenderError) setAddSenderError(null)
            }}
            required
            placeholder='user@example.com'
          />
          <ChipModalField
            type='input'
            title='标签'
            value={newSenderLabel}
            onChange={setNewSenderLabel}
            placeholder='例如:市场部的 John'
          />
          <ChipModalError>{addSenderError}</ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setIsAddSenderOpen(false)}
          primaryAction={{
            label: '添加',
            onClick: handleAddSender,
            disabled: !newSenderEmail.trim() || addSender.isPending,
          }}
        />
      </ChipModal>

      <ChipModal
        open={isEditAddressOpen}
        onOpenChange={setIsEditAddressOpen}
        srTitle='修改邮件地址'
      >
        <ChipModalHeader onClose={() => setIsEditAddressOpen(false)}>修改邮件地址</ChipModalHeader>
        <ChipModalBody>
          <p className='px-2 text-[var(--text-secondary)] text-sm'>
            修改邮件地址将创建一个新的收件箱。{' '}
            <span className='font-medium text-[var(--text-primary)]'>
              旧地址将立即停止接收邮件。
            </span>
          </p>
          <ChipModalField
            type='input'
            title='新邮件前缀'
            value={newUsername}
            onChange={(value) => {
              setNewUsername(value)
              if (editAddressError) setEditAddressError(null)
            }}
            onSubmit={handleEditAddress}
            placeholder='例如:new-acme'
            error={editAddressError}
          />
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setIsEditAddressOpen(false)}
          cancelDisabled={updateAddress.isPending}
          primaryAction={{
            label: updateAddress.isPending ? '更新中...' : '修改地址',
            onClick: handleEditAddress,
            disabled: !newUsername.trim() || updateAddress.isPending,
            variant: 'destructive',
          }}
        />
      </ChipModal>
    </>
  )
}
