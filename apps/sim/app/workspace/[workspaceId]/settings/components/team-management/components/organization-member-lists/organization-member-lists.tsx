'use client'

import { useMemo, useState } from 'react'
import { ChipDropdown, ChipInput, Search, toast } from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/predicates'
import { getErrorMessage } from '@sim/utils/errors'
import {
  type OrgRole,
  type PermissionType,
  RoleLockTooltip,
  workspaceRoleLockReason,
} from '@/components/permissions'
import type {
  OrganizationRoster,
  RosterMember,
  RosterPendingInvitation,
  RosterWorkspaceAccess,
} from '@/lib/api/contracts/organization'
import type { Member } from '@/lib/workspaces/organization'
import {
  MemberRow,
  MemberSection,
} from '@/app/workspace/[workspaceId]/settings/components/member-list'
import {
  type RowAction,
  RowActionsMenu,
} from '@/app/workspace/[workspaceId]/settings/components/row-actions-menu'
import {
  ManageCreditsModal,
  type ManageCreditsTarget,
} from '@/app/workspace/[workspaceId]/settings/components/team-management/components/manage-credits-modal'
import {
  useRemoveWorkspaceMember,
  useUpdateWorkspacePermissions,
} from '@/hooks/queries/invitations'
import {
  useCancelInvitation,
  useResendInvitation,
  useUpdateInvitation,
  useUpdateOrganizationMemberRole,
} from '@/hooks/queries/organization'

const logger = createLogger('OrganizationMemberLists')

const ORG_ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '成员' },
] as const

const WORKSPACE_ROLE_OPTIONS = [
  { value: 'read', label: '只读' },
  { value: 'write', label: '编辑' },
  { value: 'admin', label: '管理员' },
] as const

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  member: '成员',
  owner: '所有者',
  external: '外部',
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role
}

function formatJoinedDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN')
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text)
}

function buildActionsMenu(actions: RowAction[]) {
  return <RowActionsMenu label='成员操作' actions={actions} />
}

interface OrganizationMemberListsProps {
  organizationId: string
  roster: OrganizationRoster | null | undefined
  isLoadingRoster: boolean
  currentUserId: string
  onRemoveMember: (member: Member) => void
  onTransferOwnership?: () => void
}

/**
 * Renders the organization roster as Teammates-style sections: an org-level
 * "Members" section followed by one section per workspace, each listing that
 * workspace's members and pending grants. A single search box filters every
 * section; sections with no matches collapse while a search is active.
 */
export function OrganizationMemberLists({
  organizationId,
  roster,
  isLoadingRoster,
  currentUserId,
  onRemoveMember,
  onTransferOwnership,
}: OrganizationMemberListsProps) {
  const [query, setQuery] = useState('')
  const [creditsTarget, setCreditsTarget] = useState<ManageCreditsTarget | null>(null)

  const updateMemberRole = useUpdateOrganizationMemberRole()
  const updateInvitation = useUpdateInvitation()
  const updatePermissions = useUpdateWorkspacePermissions()
  const removeWorkspaceMember = useRemoveWorkspaceMember()
  const cancelInvitation = useCancelInvitation()
  const resendInvitation = useResendInvitation()

  const members = useMemo(() => roster?.members ?? [], [roster])
  const pendingInvitations = useMemo(() => roster?.pendingInvitations ?? [], [roster])
  const workspaces = useMemo(() => roster?.workspaces ?? [], [roster])

  const q = query.trim().toLowerCase()
  const matches = (name: string, email: string) =>
    !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q)

  const isActiveSearch = q.length > 0

  const renderOrgMemberRow = (member: RosterMember) => {
    const isSelf = member.userId === currentUserId
    const isOwner = member.role === 'owner'
    const isExternal = member.role === 'external'
    const editable = !isSelf && !isOwner && !isExternal
    const canRemove = !isSelf && !isOwner

    return (
      <MemberRow
        key={`org-member-${member.memberId}`}
        name={member.name}
        email={member.email}
        image={member.image}
        status={`已加入 ${formatJoinedDate(member.createdAt)}`}
        roleControl={
          editable ? (
            <ChipDropdown
              value={member.role}
              onChange={(role) =>
                updateMemberRole
                  .mutateAsync({
                    orgId: organizationId,
                    userId: member.userId,
                    role: role as OrgRole,
                  })
                  .catch((error) => logger.error('Failed to update member role', { error }))
              }
              options={ORG_ROLE_OPTIONS}
              matchTriggerWidth={false}
              disabled={updateMemberRole.isPending}
            />
          ) : (
            <ChipDropdown
              value={member.role}
              options={[{ value: member.role, label: roleLabel(member.role) }]}
              matchTriggerWidth={false}
              disabled
            />
          )
        }
        menu={buildActionsMenu([
          { label: '复制邮箱', onSelect: () => copyToClipboard(member.email) },
          ...(!isOwner
            ? [
                {
                  label: '管理积分',
                  onSelect: () =>
                    setCreditsTarget({
                      userId: member.userId,
                      name: member.name,
                      email: member.email,
                    }),
                },
              ]
            : []),
          ...(canRemove
            ? [
                {
                  label: '移除',
                  destructive: true,
                  onSelect: () =>
                    onRemoveMember({
                      id: member.memberId,
                      role: member.role,
                      user: {
                        id: member.userId,
                        name: member.name,
                        email: member.email,
                        image: member.image,
                      },
                    }),
                },
              ]
            : []),
          ...(isSelf && isOwner && onTransferOwnership
            ? [{ label: '转让所有权', onSelect: () => onTransferOwnership() }]
            : []),
          ...(isSelf && !isOwner
            ? [
                {
                  label: '退出组织',
                  destructive: true,
                  onSelect: () =>
                    onRemoveMember({
                      id: member.memberId,
                      role: member.role,
                      user: {
                        id: member.userId,
                        name: member.name,
                        email: member.email,
                        image: member.image,
                      },
                    }),
                },
              ]
            : []),
        ])}
      />
    )
  }

  const renderInviteRow = (
    invitation: RosterPendingInvitation,
    keyPrefix: string,
    roleControl: React.ReactNode
  ) => (
    <MemberRow
      key={`${keyPrefix}-${invitation.id}`}
      name={invitation.inviteeName ?? invitation.email}
      email={invitation.email}
      image={invitation.inviteeImage}
      status='邀请待接受'
      roleControl={roleControl}
      menu={buildActionsMenu([
        { label: '复制邮箱', onSelect: () => copyToClipboard(invitation.email) },
        {
          label: '重新发送邀请',
          onSelect: () =>
            resendInvitation
              .mutateAsync({ invitationId: invitation.id, orgId: organizationId })
              .catch((error) => logger.error('Failed to resend invitation', { error })),
        },
        {
          label: '撤销邀请',
          destructive: true,
          onSelect: () =>
            cancelInvitation
              .mutateAsync({ invitationId: invitation.id, orgId: organizationId })
              .catch((error) => logger.error('Failed to revoke invitation', { error })),
        },
      ])}
    />
  )

  const renderOrgInviteRow = (invitation: RosterPendingInvitation) => {
    const isExternal = invitation.membershipIntent === 'external'
    const roleControl = isExternal ? (
      <ChipDropdown
        value='external'
        options={[{ value: 'external', label: '外部' }]}
        matchTriggerWidth={false}
        disabled
      />
    ) : (
      <ChipDropdown
        value={invitation.role === 'admin' ? 'admin' : 'member'}
        onChange={(role) =>
          updateInvitation
            .mutateAsync({
              orgId: organizationId,
              invitationId: invitation.id,
              role: role as OrgRole,
            })
            .catch((error) => logger.error('Failed to update invitation role', { error }))
        }
        options={ORG_ROLE_OPTIONS}
        matchTriggerWidth={false}
        disabled={updateInvitation.isPending}
      />
    )
    return renderInviteRow(invitation, 'org-invite', roleControl)
  }

  const renderWorkspaceMemberRow = (
    member: RosterMember,
    workspaceId: string,
    access: RosterWorkspaceAccess
  ) => {
    const rowUserIsOrgAdmin = isOrgAdminRole(member.role)
    const isSelf = member.userId === currentUserId
    const wouldDemoteSelf = isSelf && access.permission === 'admin'
    const disabled = rowUserIsOrgAdmin || wouldDemoteSelf || updatePermissions.isPending
    const lockReason = rowUserIsOrgAdmin ? workspaceRoleLockReason('org-admin') : null
    const canRemoveFromWorkspace = !rowUserIsOrgAdmin && !isSelf

    return (
      <MemberRow
        key={`ws-${workspaceId}-member-${member.memberId}`}
        name={member.name}
        email={member.email}
        image={member.image}
        status={`已加入 ${formatJoinedDate(member.createdAt)}`}
        roleControl={
          <RoleLockTooltip reason={lockReason}>
            <ChipDropdown
              value={access.permission}
              onChange={(permission) =>
                updatePermissions
                  .mutateAsync({
                    workspaceId,
                    organizationId,
                    updates: [{ userId: member.userId, permissions: permission as PermissionType }],
                  })
                  .catch((error) =>
                    logger.error('Failed to update workspace permission', { error })
                  )
              }
              options={WORKSPACE_ROLE_OPTIONS}
              matchTriggerWidth={false}
              disabled={disabled}
            />
          </RoleLockTooltip>
        }
        menu={buildActionsMenu([
          { label: '复制邮箱', onSelect: () => copyToClipboard(member.email) },
          ...(canRemoveFromWorkspace
            ? [
                {
                  label: '从工作区移除',
                  destructive: true,
                  onSelect: () =>
                    removeWorkspaceMember
                      .mutateAsync({ userId: member.userId, workspaceId, organizationId })
                      .catch((error) => {
                        logger.error('Failed to remove workspace member', { error })
                        toast.error('无法移除成员', {
                          description: getErrorMessage(error, '请稍后再试。'),
                        })
                      }),
                },
              ]
            : []),
        ])}
      />
    )
  }

  const renderWorkspaceInviteRow = (
    invitation: RosterPendingInvitation,
    workspaceId: string,
    access: RosterWorkspaceAccess
  ) => {
    const roleControl = (
      <ChipDropdown
        value={access.permission}
        onChange={(permission) =>
          updateInvitation
            .mutateAsync({
              orgId: organizationId,
              invitationId: invitation.id,
              grants: [{ workspaceId, permission: permission as PermissionType }],
            })
            .catch((error) => logger.error('Failed to update invitation grant', { error }))
        }
        options={WORKSPACE_ROLE_OPTIONS}
        matchTriggerWidth={false}
        disabled={updateInvitation.isPending}
      />
    )
    return renderInviteRow(invitation, `ws-${workspaceId}-invite`, roleControl)
  }

  const filteredOrgMembers = members.filter((m) => matches(m.name, m.email))
  const orgPending = pendingInvitations.filter((inv) => inv.kind === 'organization')
  const filteredOrgPending = orgPending.filter((inv) =>
    matches(inv.inviteeName ?? inv.email, inv.email)
  )
  const orgRowCount = members.length + orgPending.length
  const hasOrgMatches = filteredOrgMembers.length + filteredOrgPending.length > 0
  const showMembersSection = !isActiveSearch || hasOrgMatches

  /**
   * Group each workspace's members and pending invites once per roster change.
   * This is O(workspaces × members) and independent of the search query, so
   * hoisting it out of render keeps keystroke filtering cheap on large orgs.
   */
  const workspaceGroups = useMemo(
    () =>
      workspaces.map((workspace) => {
        const workspaceMembers = members
          .map((member) => ({
            member,
            access: member.workspaces.find((w) => w.workspaceId === workspace.id),
          }))
          .filter((entry): entry is { member: RosterMember; access: RosterWorkspaceAccess } =>
            Boolean(entry.access)
          )
        const workspaceInvites = pendingInvitations
          .map((invitation) => ({
            invitation,
            access: invitation.workspaces.find((w) => w.workspaceId === workspace.id),
          }))
          .filter(
            (
              entry
            ): entry is { invitation: RosterPendingInvitation; access: RosterWorkspaceAccess } =>
              Boolean(entry.access)
          )
        return { workspace, workspaceMembers, workspaceInvites }
      }),
    [workspaces, members, pendingInvitations]
  )

  return (
    <>
      <div className='flex items-center gap-2'>
        <ChipInput
          icon={Search}
          placeholder='搜索成员...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='flex-1'
        />
      </div>

      {showMembersSection && (
        <MemberSection
          label={`成员 (${orgRowCount})`}
          isEmpty={!isLoadingRoster && filteredOrgMembers.length + filteredOrgPending.length === 0}
          emptyText={isActiveSearch ? `没有匹配 “${query}” 的成员` : '还没有成员'}
        >
          {filteredOrgMembers.map(renderOrgMemberRow)}
          {filteredOrgPending.map(renderOrgInviteRow)}
        </MemberSection>
      )}

      {workspaceGroups.map(({ workspace, workspaceMembers, workspaceInvites }) => {
        const visibleMembers = workspaceMembers.filter(({ member }) =>
          matches(member.name, member.email)
        )
        const visibleInvites = workspaceInvites.filter(({ invitation }) =>
          matches(invitation.inviteeName ?? invitation.email, invitation.email)
        )
        const totalCount = workspaceMembers.length + workspaceInvites.length
        const hasMatches = visibleMembers.length + visibleInvites.length > 0

        if (isActiveSearch && !hasMatches) return null

        return (
          <MemberSection
            key={`workspace-${workspace.id}`}
            label={`${workspace.name} (${totalCount})`}
            isEmpty={visibleMembers.length + visibleInvites.length === 0}
            emptyText={isActiveSearch ? `没有匹配 “${query}” 的成员` : '此工作区中还没有成员'}
          >
            {visibleMembers.map(({ member, access }) =>
              renderWorkspaceMemberRow(member, workspace.id, access)
            )}
            {visibleInvites.map(({ invitation, access }) =>
              renderWorkspaceInviteRow(invitation, workspace.id, access)
            )}
          </MemberSection>
        )
      })}

      <ManageCreditsModal
        key={creditsTarget?.userId ?? 'none'}
        open={creditsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCreditsTarget(null)
        }}
        organizationId={organizationId}
        member={creditsTarget}
      />
    </>
  )
}
