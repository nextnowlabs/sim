'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChipDropdown, Plus, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { debounce, useQueryState } from 'nuqs'
import {
  RoleLockTooltip,
  type WorkspaceRoleSource,
  workspaceRoleLockReason,
} from '@/components/permissions'
import type { WorkspacePermission } from '@/lib/api/contracts/workspaces'
import { buildUpgradeHref } from '@/lib/billing/upgrade-reasons'
import {
  MemberRow,
  MemberSection,
} from '@/app/workspace/[workspaceId]/settings/components/member-list'
import { RowActionsMenu } from '@/app/workspace/[workspaceId]/settings/components/row-actions-menu'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  teammatesSearchParam,
  teammatesUrlKeys,
} from '@/app/workspace/[workspaceId]/settings/components/teammates/search-params'
import { isBillingEnabled } from '@/app/workspace/[workspaceId]/settings/navigation'
import { InviteModal } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/workspace-header/components/invite-modal'
import {
  useCancelWorkspaceInvitation,
  usePendingInvitations,
  useRemoveWorkspaceMember,
  useResendWorkspaceInvitation,
  useUpdateWorkspacePermissions,
} from '@/hooks/queries/invitations'
import { prefetchUpgradeBillingData } from '@/hooks/queries/subscription'
import {
  prefetchWorkspaceSettings,
  useWorkspacePermissionsQuery,
  useWorkspacesQuery,
} from '@/hooks/queries/workspace'
import { usePermissionConfig } from '@/hooks/use-permission-config'

const ROLE_OPTIONS = [
  { value: 'read', label: '只读' },
  { value: 'write', label: '编辑' },
  { value: 'admin', label: '管理员' },
] as const

interface Teammate {
  key: string
  email: string
  name: string
  image: string | null
  role: WorkspacePermission
  status: string
  isPending: boolean
  userId?: string
  invitationId?: string
  token?: string
  roleSource?: WorkspaceRoleSource
}

function formatJoinedDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN')
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text)
}

function buildInviteLink(invitationId: string, token: string) {
  return `${window.location.origin}/invite/${invitationId}?token=${token}`
}

export function Teammates() {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''

  const [searchTerm, setSearchTerm] = useQueryState(teammatesSearchParam.key, {
    ...teammatesSearchParam.parser,
    ...teammatesUrlKeys,
    limitUrlUpdates: debounce(300),
  })
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  const { data: permissions, isPending: permissionsLoading } =
    useWorkspacePermissionsQuery(workspaceId)
  const { data: invitations } = usePendingInvitations(workspaceId)
  const { data: workspaces } = useWorkspacesQuery()

  const router = useRouter()
  const queryClient = useQueryClient()
  const { isInvitationsDisabled: isInvitationsDisabledByConfig } = usePermissionConfig()

  const resendInvitation = useResendWorkspaceInvitation()
  const cancelInvitation = useCancelWorkspaceInvitation()
  const removeMember = useRemoveWorkspaceMember()
  const updatePermissions = useUpdateWorkspacePermissions()

  const viewer = permissions?.viewer
  const canManage = Boolean(viewer?.isAdmin)

  const activeWorkspace = workspaces?.find((workspace) => workspace.id === workspaceId)
  const inviteDisabledReason = activeWorkspace?.inviteDisabledReason ?? null
  const isInvitationsDisabled = isInvitationsDisabledByConfig || inviteDisabledReason !== null

  const upgradeHref = buildUpgradeHref(workspaceId, 'seats')

  /**
   * Warm the Upgrade route bundle and the queries it gates on, so a gated
   * invite click lands on cached data instead of a loading state.
   */
  const prefetchUpgrade = useCallback(() => {
    router.prefetch(upgradeHref)
    prefetchUpgradeBillingData(queryClient)
    prefetchWorkspaceSettings(queryClient, workspaceId)
  }, [router, queryClient, upgradeHref, workspaceId])

  const handleInvite = () => {
    if (isInvitationsDisabled) {
      if (isBillingEnabled) router.push(upgradeHref)
      return
    }
    setIsInviteModalOpen(true)
  }

  const teammates = useMemo<Teammate[]>(() => {
    const members: Teammate[] = (permissions?.users ?? []).map((member) => ({
      key: member.userId,
      email: member.email,
      name: member.name ?? member.email,
      image: member.image,
      role: member.permissionType,
      status: `已加入 ${formatJoinedDate(member.joinedAt)}`,
      isPending: false,
      userId: member.userId,
      roleSource: member.roleSource,
    }))

    const pending: Teammate[] = (invitations ?? []).map((invitation) => ({
      key: invitation.invitationId ?? invitation.email,
      email: invitation.email,
      name: invitation.email,
      image: null,
      role: invitation.permissionType,
      status: '邀请待接受',
      isPending: true,
      invitationId: invitation.invitationId,
      token: invitation.token,
    }))

    return [...members, ...pending]
  }, [permissions, invitations])

  const filteredTeammates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return teammates
    return teammates.filter(
      (teammate) =>
        teammate.email.toLowerCase().includes(query) || teammate.name.toLowerCase().includes(query)
    )
  }, [teammates, searchTerm])

  const showNoResults = !permissionsLoading && filteredTeammates.length === 0

  const handleRoleChange = (teammate: Teammate, role: WorkspacePermission) => {
    if (!teammate.userId || role === teammate.role) return
    updatePermissions.mutate({
      workspaceId,
      updates: [{ userId: teammate.userId, permissions: role }],
    })
  }

  return (
    <>
      <SettingsPanel
        search={{
          value: searchTerm,
          onChange: (value) => void setSearchTerm(value),
          placeholder: '搜索团队成员...',
        }}
        actions={[
          {
            text: '邀请',
            icon: Plus,
            variant: 'primary',
            onSelect: handleInvite,
            tooltip: inviteDisabledReason ?? undefined,
            onPrefetch: isInvitationsDisabled ? prefetchUpgrade : undefined,
          },
        ]}
      >
        <MemberSection
          label={`团队成员 (${teammates.length})`}
          isEmpty={showNoResults}
          emptyText={searchTerm.trim() ? `没有匹配 “${searchTerm}” 的团队成员` : '还没有团队成员'}
        >
          {filteredTeammates.map((teammate) => (
            <MemberRow
              key={teammate.key}
              name={teammate.name}
              email={teammate.email}
              image={teammate.image}
              status={teammate.status}
              roleControl={(() => {
                const lockReason = teammate.isPending
                  ? null
                  : workspaceRoleLockReason(teammate.roleSource)
                return (
                  <RoleLockTooltip reason={lockReason}>
                    <ChipDropdown
                      value={teammate.role}
                      onChange={(role) => handleRoleChange(teammate, role as WorkspacePermission)}
                      options={ROLE_OPTIONS}
                      matchTriggerWidth={false}
                      disabled={
                        teammate.isPending ||
                        !canManage ||
                        teammate.userId === viewer?.userId ||
                        lockReason !== null
                      }
                    />
                  </RoleLockTooltip>
                )
              })()}
              menu={
                <RowActionsMenu
                  label='团队成员操作'
                  actions={[
                    {
                      label: '复制邮箱',
                      onSelect: () => copyToClipboard(teammate.email),
                    },
                    ...(canManage && teammate.isPending
                      ? [
                          {
                            label: '重新发送邀请',
                            onSelect: () => {
                              if (teammate.invitationId) {
                                resendInvitation.mutate({
                                  invitationId: teammate.invitationId,
                                  workspaceId,
                                })
                              }
                            },
                          },
                          {
                            label: '复制邀请链接',
                            onSelect: () => {
                              if (teammate.invitationId && teammate.token) {
                                copyToClipboard(
                                  buildInviteLink(teammate.invitationId, teammate.token)
                                )
                              }
                            },
                          },
                          {
                            label: '撤销邀请',
                            destructive: true,
                            onSelect: () => {
                              if (teammate.invitationId) {
                                cancelInvitation.mutate({
                                  invitationId: teammate.invitationId,
                                  workspaceId,
                                })
                              }
                            },
                          },
                        ]
                      : []),
                    ...(canManage && !teammate.isPending && teammate.userId !== viewer?.userId
                      ? [
                          {
                            label: '移除',
                            destructive: true,
                            onSelect: () => {
                              if (teammate.userId) {
                                removeMember.mutate(
                                  { userId: teammate.userId, workspaceId },
                                  {
                                    onError: (error) => {
                                      toast.error('无法移除团队成员', {
                                        description: getErrorMessage(error, '请稍后再试。'),
                                      })
                                    },
                                  }
                                )
                              }
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              }
            />
          ))}
        </MemberSection>
      </SettingsPanel>

      <InviteModal
        open={isInviteModalOpen}
        onOpenChange={setIsInviteModalOpen}
        workspaceName={activeWorkspace?.name ?? '工作区'}
        inviteDisabledReason={inviteDisabledReason}
        organizationId={activeWorkspace?.organizationId ?? null}
      />
    </>
  )
}
