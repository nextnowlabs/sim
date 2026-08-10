'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { useWorkspacePermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import {
  useUpsertWorkspaceCredentialMember,
  useWorkspaceCredentialMembers,
  type WorkspaceCredentialRole,
} from '@/hooks/queries/credentials'
import { ROLE_OPTIONS } from '../roles'
import { partitionSettledFailures, resolveAddEmail } from '../sharing'

const logger = createLogger('AddPeopleModal')

interface AddPeopleModalProps {
  credentialId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shared "Add people" modal: grants existing workspace members access to a
 * credential with a chosen role. Emails are validated against the workspace
 * roster and current membership; each add is an idempotent upsert and partial
 * failures keep only the people that still need adding.
 */
export function AddPeopleModal({ credentialId, open, onOpenChange }: AddPeopleModalProps) {
  const { workspacePermissions } = useWorkspacePermissionsContext()
  const { data: members = [] } = useWorkspaceCredentialMembers(credentialId)
  const upsertMember = useUpsertWorkspaceCredentialMember()

  const [emailsToAdd, setEmailsToAdd] = useState<string[]>([])
  const [roleToAdd, setRoleToAdd] = useState<WorkspaceCredentialRole>('member')
  const [isAdding, setIsAdding] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const workspaceUserIdByEmail = useMemo(
    () =>
      new Map(
        (workspacePermissions?.users ?? []).map((user) => [user.email.toLowerCase(), user.userId])
      ),
    [workspacePermissions?.users]
  )

  const existingMemberEmails = useMemo(
    () =>
      new Set(
        members
          .filter((member) => member.status === 'active')
          .map((member) => (member.userEmail ?? '').toLowerCase())
          .filter(Boolean)
      ),
    [members]
  )

  const validateAddEmail = useCallback(
    (email: string): string | null => {
      const result = resolveAddEmail(email, { workspaceUserIdByEmail, existingMemberEmails })
      return 'error' in result ? result.error : null
    },
    [workspaceUserIdByEmail, existingMemberEmails]
  )

  const handleClose = useCallback(() => {
    setEmailsToAdd([])
    setRoleToAdd('member')
    setSubmitError(null)
    onOpenChange(false)
  }, [onOpenChange])

  const handleAddPeople = useCallback(async () => {
    if (emailsToAdd.length === 0 || isAdding) return
    setSubmitError(null)
    const targets = emailsToAdd
      .map((email) => {
        const result = resolveAddEmail(email, { workspaceUserIdByEmail, existingMemberEmails })
        return 'userId' in result ? { email, userId: result.userId } : null
      })
      .filter((target): target is { email: string; userId: string } => target !== null)
    if (targets.length === 0) return

    setIsAdding(true)
    try {
      const results = await Promise.allSettled(
        targets.map((target) =>
          upsertMember.mutateAsync({ credentialId, userId: target.userId, role: roleToAdd })
        )
      )
      const failures = partitionSettledFailures(targets, results)
      if (failures.length === 0) {
        handleClose()
        return
      }
      setEmailsToAdd(failures.map((target) => target.email))
      const firstError = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      )
      logger.error('Failed to add some credential members', firstError?.reason)
      const reason = getErrorMessage(firstError?.reason, '请稍后再试。')
      setSubmitError(
        failures.length === targets.length
          ? `无法添加成员。${reason}`
          : `无法添加 ${failures.length} / ${targets.length} 位成员。${reason}`
      )
    } finally {
      setIsAdding(false)
    }
  }, [
    credentialId,
    emailsToAdd,
    isAdding,
    workspaceUserIdByEmail,
    existingMemberEmails,
    roleToAdd,
    upsertMember,
    handleClose,
  ])

  return (
    <ChipModal
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      srTitle='添加成员'
    >
      <ChipModalHeader onClose={handleClose}>添加成员</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='emails'
          title='邮箱'
          value={emailsToAdd}
          onChange={setEmailsToAdd}
          validate={validateAddEmail}
          placeholder='输入邮箱'
          disabled={isAdding}
        />
        <ChipModalField
          type='dropdown'
          title='角色'
          options={ROLE_OPTIONS}
          value={roleToAdd}
          placeholder='选择角色'
          align='start'
          onChange={(role) => setRoleToAdd(role as WorkspaceCredentialRole)}
          disabled={isAdding}
        />
        <ChipModalError>{submitError}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={handleClose}
        primaryAction={{
          label: isAdding ? '添加中…' : '添加',
          onClick: handleAddPeople,
          disabled: emailsToAdd.length === 0 || isAdding,
        }}
      />
    </ChipModal>
  )
}
