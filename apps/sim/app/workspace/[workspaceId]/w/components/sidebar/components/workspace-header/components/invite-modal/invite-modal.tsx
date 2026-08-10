'use client'

import { useCallback, useState } from 'react'
import {
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { useParams } from 'next/navigation'
import { useSession } from '@/lib/auth/auth-client'
import { isEnterprise } from '@/lib/billing/plan-helpers'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import type { PermissionType } from '@/lib/workspaces/permissions/utils'
import { useWorkspacePermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { isBillingEnabled } from '@/app/workspace/[workspaceId]/settings/navigation'
import { useBatchSendWorkspaceInvitations } from '@/hooks/queries/invitations'
import { useOrganizationBilling } from '@/hooks/queries/organization'

const logger = createLogger('InviteModal')

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'write', label: '编辑' },
  { value: 'read', label: '只读' },
] as const

interface InviteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceName?: string
  inviteDisabledReason?: string | null
  organizationId?: string | null
}

export function InviteModal({
  open,
  onOpenChange,
  workspaceName,
  inviteDisabledReason = null,
  organizationId = null,
}: InviteModalProps) {
  const [emails, setEmails] = useState<string[]>([])
  const [inviteRole, setInviteRole] = useState<PermissionType>('admin')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const params = useParams()
  const workspaceId = params.workspaceId as string

  const { data: session } = useSession()
  const { workspacePermissions, userPermissions: userPerms } = useWorkspacePermissionsContext()

  const { data: organizationBillingData } = useOrganizationBilling(organizationId ?? '', {
    enabled: open && isBillingEnabled,
  })

  const batchSendInvitations = useBatchSendWorkspaceInvitations()

  const canInviteMembers = userPerms.canAdmin && !inviteDisabledReason
  const isSubmitting = batchSendInvitations.isPending

  const totalSeats = organizationBillingData?.data?.totalSeats ?? 0
  const usedSeats = organizationBillingData?.data?.usedSeats ?? 0
  const availableSeats = Math.max(0, totalSeats - usedSeats)
  // Only Enterprise plans have a fixed seat cap that gates invites. Team/Pro
  // seats are provisioned automatically when an invitee accepts.
  const isEnterpriseOrg = isEnterprise(organizationBillingData?.data?.subscriptionPlan)
  const hasSeatData = !!organizationId && isEnterpriseOrg && totalSeats > 0
  const exceedsSeatCapacity = hasSeatData && userPerms.canAdmin && emails.length > availableSeats
  const seatLimitReason = exceedsSeatCapacity
    ? `仅剩 ${availableSeats} 个内部席位。外部工作区邀请不需要席位。`
    : null

  const validateEmail = useCallback(
    (email: string): string | null => {
      const formatResult = quickValidateEmail(email)
      if (!formatResult.isValid) {
        return formatResult.reason ?? '邮箱格式无效'
      }
      if (workspacePermissions?.users?.some((user) => user.email === email)) {
        return `${email} 已是该工作区的成员`
      }
      if (session?.user?.email && session.user.email.toLowerCase() === email) {
        return '不能邀请自己'
      }
      return null
    },
    [workspacePermissions?.users, session?.user?.email]
  )

  const handleEmailsChange = useCallback((next: string[]) => {
    setEmails(next)
    setErrorMessage(null)
  }, [])

  const handleSendInvites = useCallback(() => {
    setErrorMessage(null)
    if (!canInviteMembers || emails.length === 0 || !workspaceId) return

    const invitations = emails.map((email) => ({ email, permission: inviteRole }))

    batchSendInvitations.mutate(
      { workspaceId, organizationId, invitations },
      {
        onSuccess: (result) => {
          const parts: string[] = []
          if (result.added.length > 0) {
            parts.push(`${result.added.length} 位成员已添加`)
          }
          if (result.successful.length > 0) {
            parts.push(`${result.successful.length} 封邀请已发送`)
          }
          if (parts.length > 0) {
            toast.success(parts.join(' · '))
          }

          if (result.failed.length > 0) {
            // Keep the failed addresses in the field with the error for retry.
            setEmails(result.failed.map((f) => f.email))
            setErrorMessage(
              result.failed.length === 1
                ? result.failed[0].error
                : `${result.failed.length} 封邀请发送失败。${result.failed[0].error}`
            )
            return
          }

          setEmails([])
          onOpenChange(false)
        },
        onError: (error) => {
          logger.error('Error inviting teammates:', error)
          setErrorMessage(error.message || '发生意外错误,请重试。')
        },
      }
    )
  }, [
    canInviteMembers,
    emails,
    workspaceId,
    organizationId,
    inviteRole,
    batchSendInvitations,
    onOpenChange,
  ])

  const resetState = useCallback(() => {
    setEmails([])
    setInviteRole('admin')
    setErrorMessage(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState()
      onOpenChange(next)
    },
    [onOpenChange, resetState]
  )

  const isSendDisabled =
    !canInviteMembers || isSubmitting || !workspaceId || emails.length === 0 || exceedsSeatCapacity

  const fieldHint = inviteDisabledReason ?? seatLimitReason

  return (
    <ChipModal
      open={open}
      onOpenChange={handleOpenChange}
      srTitle={`邀请团队成员加入${workspaceName || '工作区'}`}
    >
      <ChipModalHeader onClose={() => handleOpenChange(false)}>邀请团队成员</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='emails'
          title='邮箱'
          value={emails}
          onChange={handleEmailsChange}
          validate={validateEmail}
          error={errorMessage}
          hint={fieldHint}
          placeholder={
            !canInviteMembers ? inviteDisabledReason || '只有管理员可以邀请新成员' : '输入邮箱'
          }
          disabled={isSubmitting || !canInviteMembers}
        />
        <ChipModalField
          type='dropdown'
          title='邀请为'
          options={ROLE_OPTIONS}
          value={inviteRole}
          placeholder='选择角色'
          align='start'
          onChange={(role) => setInviteRole(role as PermissionType)}
        />
      </ChipModalBody>
      <ChipModalFooter
        onCancel={() => handleOpenChange(false)}
        cancelDisabled={isSubmitting}
        primaryAction={{
          label: isSubmitting ? '发送中...' : '发送邀请',
          onClick: handleSendInvites,
          disabled: isSendDisabled,
        }}
      />
    </ChipModal>
  )
}
