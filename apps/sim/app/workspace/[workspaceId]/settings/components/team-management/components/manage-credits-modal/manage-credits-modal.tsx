'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  Info,
} from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import {
  useOrganizationMemberUsageLimit,
  useUpdateOrganizationMemberUsageLimit,
} from '@/hooks/queries/organization'

export interface ManageCreditsTarget {
  userId: string
  name: string
  email: string
}

interface ManageCreditsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  member: ManageCreditsTarget | null
}

/**
 * Modal for viewing a member's credits used in the organization's workspaces and
 * setting their per-member credit limit. "Credits used" is a read-only chip;
 * "Credit limit" is editable (blank = no limit). Hosted-only feature — surfaced
 * only from the Organization tab, which already requires hosted + Team plan.
 */
export function ManageCreditsModal({
  open,
  onOpenChange,
  organizationId,
  member,
}: ManageCreditsModalProps) {
  const userId = member?.userId
  const { data, isLoading } = useOrganizationMemberUsageLimit(organizationId, userId, open)
  const updateLimit = useUpdateOrganizationMemberUsageLimit()

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Seed the draft from server data only until the admin starts typing, so a
  // background refetch (window focus, post-save invalidation) can't clobber an
  // in-progress edit. Reset when the modal closes.
  const hasEditedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      hasEditedRef.current = false
      return
    }
    if (data && !hasEditedRef.current) {
      setDraft(data.creditLimit === null ? '' : String(data.creditLimit))
      setError(null)
    }
  }, [open, data])

  const trimmed = draft.trim()
  const parsedLimit = trimmed === '' ? null : Number(trimmed)
  const isValid =
    trimmed === '' || (parsedLimit !== null && Number.isInteger(parsedLimit) && parsedLimit >= 0)
  const currentLimit = data?.creditLimit ?? null
  const isDirty = parsedLimit !== currentLimit
  const isSaving = updateLimit.isPending

  const creditsUsed = data ? data.creditsUsed.toLocaleString() : '—'
  const creditsUsedTitle = data
    ? `本${data.billingInterval === 'year' ? '年' : '月'}已用积分`
    : '已用积分'

  const handleSave = () => {
    if (!userId) return
    if (!isValid) {
      setError('请输入整数积分,或留空表示不设上限。')
      return
    }
    setError(null)
    updateLimit.mutate(
      { orgId: organizationId, userId, creditLimit: parsedLimit },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(getErrorMessage(err, '更新积分上限失败')),
      }
    )
  }

  return (
    <ChipModal open={open} onOpenChange={onOpenChange} srTitle='管理积分'>
      <ChipModalHeader onClose={() => onOpenChange(false)}>
        {member ? `管理积分 — ${member.name || member.email}` : '管理积分'}
      </ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='copy'
          title={creditsUsedTitle}
          value={isLoading ? '加载中…' : creditsUsed}
          copyLabel='复制已用积分'
        />
        <ChipModalField
          type='input'
          inputType='number'
          title={
            <span className='inline-flex items-center gap-1.5'>
              积分上限
              <Info side='top'>
                {
                  '以积分计 — Sim 的用量单位(1,000 积分 = $5)。限制该成员在本组织各工作区每个计费周期内的用量。'
                }
              </Info>
            </span>
          }
          value={draft}
          onChange={(value) => {
            hasEditedRef.current = true
            setDraft(value)
          }}
          placeholder='不设上限'
          hint='留空表示不设上限。'
          disabled={isLoading || isSaving}
        />
        <ChipModalError>{error}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={() => onOpenChange(false)}
        cancelDisabled={isSaving}
        primaryAction={{
          label: isSaving ? '保存中…' : '保存',
          onClick: handleSave,
          disabled: !isValid || !isDirty || isSaving || isLoading,
        }}
      />
    </ChipModal>
  )
}
