'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  ChipDropdown,
  type ChipDropdownOption,
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { useSession } from '@/lib/auth/auth-client'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import type { PermissionType } from '@/lib/workspaces/permissions/utils'
import { useInviteMember } from '@/hooks/queries/organization'

const logger = createLogger('OrganizationInviteModal')

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'write', label: '编辑' },
  { value: 'read', label: '只读' },
] as const

const EMPTY_EMAILS: string[] = []

interface OrganizationInviteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  /** Workspaces the inviter can grant access to. */
  workspaces: Array<{ id: string; name: string }>
  /** Emails of external collaborators (rejected — they cannot join the organization). */
  externalEmails?: string[]
  /**
   * Non-member emails with a pending invitation (rejected as duplicates).
   * Member emails are always allowed — they receive workspace invitations for
   * the selected workspaces they aren't in yet, deduped per workspace by the
   * server — so the parent excludes them from this list.
   */
  pendingEmails?: string[]
}

/**
 * Organization-level invite modal: enter emails, pick one or more workspaces to
 * grant access to, choose a role applied to every selected workspace, and send
 * through the organization invite path. Emails of existing organization
 * members are accepted — the server sends them workspace-only invitations for
 * the selected workspaces they don't already have access to.
 */
export function OrganizationInviteModal({
  open,
  onOpenChange,
  organizationId,
  workspaces,
  externalEmails = EMPTY_EMAILS,
  pendingEmails = EMPTY_EMAILS,
}: OrganizationInviteModalProps) {
  const [emails, setEmails] = useState<string[]>([])
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([])
  const [inviteRole, setInviteRole] = useState<PermissionType>('write')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: session } = useSession()
  const inviteMember = useInviteMember()
  const isSubmitting = inviteMember.isPending

  const workspaceOptions = useMemo<ChipDropdownOption[]>(
    () => workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name })),
    [workspaces]
  )

  const externalEmailSet = useMemo(
    () => new Set(externalEmails.map((email) => email.toLowerCase())),
    [externalEmails]
  )

  const pendingEmailSet = useMemo(
    () => new Set(pendingEmails.map((email) => email.toLowerCase())),
    [pendingEmails]
  )

  const validateEmail = useCallback(
    (email: string): string | null => {
      const formatResult = quickValidateEmail(email)
      if (!formatResult.isValid) {
        return formatResult.reason ?? '邮箱格式无效'
      }
      if (session?.user?.email && session.user.email.toLowerCase() === email) {
        return '不能邀请自己'
      }
      if (externalEmailSet.has(email)) {
        return `${email} 属于另一个组织,无法邀请。请在“团队成员”页面向其发送独立工作区邀请。`
      }
      if (pendingEmailSet.has(email)) {
        return `${email} 已有待接受的邀请`
      }
      return null
    },
    [session?.user?.email, externalEmailSet, pendingEmailSet]
  )

  const handleEmailsChange = useCallback((next: string[]) => {
    setEmails(next)
    setErrorMessage(null)
  }, [])

  const handleSend = useCallback(() => {
    setErrorMessage(null)
    if (emails.length === 0 || selectedWorkspaceIds.length === 0 || !organizationId) return

    const workspaceInvitations = selectedWorkspaceIds.map((workspaceId) => ({
      workspaceId,
      permission: inviteRole as 'admin' | 'write' | 'read',
    }))

    inviteMember.mutate(
      { emails, orgId: organizationId, workspaceInvitations },
      {
        onSuccess: (result) => {
          const summary =
            'data' in result && result.data && typeof result.data === 'object'
              ? (result.data as {
                  invitationsSent?: number
                  directlyAddedCount?: number
                  failedInvitations?: Array<{ email: string; error: string }>
                })
              : null
          const addedCount = summary?.directlyAddedCount ?? 0
          const sentCount = summary?.invitationsSent ?? 0
          const failed = summary?.failedInvitations ?? []

          // Surface partial successes even when some addresses fail.
          const parts: string[] = []
          if (addedCount > 0) {
            parts.push(`${addedCount} 位成员已添加`)
          }
          if (sentCount > 0) {
            parts.push(`${sentCount} 封邀请已发送`)
          }
          if (parts.length > 0) {
            toast.success(parts.join(' · '))
          }

          if (failed.length > 0) {
            // Keep only the failed addresses (workspaces stay selected) for retry.
            setEmails(failed.map((entry) => entry.email))
            setErrorMessage(
              failed.length === 1
                ? failed[0].error
                : `${failed.length} 封邀请发送失败。${failed[0].error}`
            )
            return
          }

          setEmails([])
          setSelectedWorkspaceIds([])
          onOpenChange(false)
        },
        onError: (error) => {
          logger.error('Failed to invite members', { error })
          setErrorMessage(error.message || '发生意外错误,请重试。')
        },
      }
    )
  }, [emails, selectedWorkspaceIds, organizationId, inviteRole, inviteMember, onOpenChange])

  const resetState = useCallback(() => {
    setEmails([])
    setSelectedWorkspaceIds([])
    setInviteRole('write')
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
    isSubmitting || emails.length === 0 || selectedWorkspaceIds.length === 0 || !organizationId

  return (
    <ChipModal open={open} onOpenChange={handleOpenChange} srTitle='邀请团队成员加入组织'>
      <ChipModalHeader onClose={() => handleOpenChange(false)}>邀请团队成员</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='emails'
          title='邮箱'
          value={emails}
          onChange={handleEmailsChange}
          validate={validateEmail}
          error={errorMessage}
          placeholder='输入邮箱'
          disabled={isSubmitting}
        />
        <ChipModalField type='custom' title='工作区'>
          <ChipDropdown
            multiple
            value={selectedWorkspaceIds}
            onChange={setSelectedWorkspaceIds}
            options={workspaceOptions}
            allLabel='选择工作区'
            showAllOption={false}
            searchable
            searchPlaceholder='搜索工作区...'
            fullWidth
            flush
            disabled={isSubmitting || workspaceOptions.length === 0}
          />
        </ChipModalField>
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
        primaryAction={{
          label: isSubmitting ? '发送中...' : '发送邀请',
          onClick: handleSend,
          disabled: isSendDisabled,
        }}
      />
    </ChipModal>
  )
}
