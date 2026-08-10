'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  ButtonGroup,
  ButtonGroupItem,
  Chip,
  ChipConfirmModal,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  type FileInputOptions,
  TagInput,
  type TagItem,
} from '@sim/emcn'
import { ArrowLeft } from '@sim/emcn/icons'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/predicates'
import { Plus } from 'lucide-react'
import { GmailIcon, OutlookIcon } from '@/components/icons'
import { useSession } from '@/lib/auth/auth-client'
import { getSubscriptionAccessState } from '@/lib/billing/client'
import { getProviderDisplayName, type PollingProvider } from '@/lib/credential-sets/providers'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import { getUserColor } from '@/lib/workspaces/colors'
import { getUserRole } from '@/lib/workspaces/organization'
import { RowActionsMenu } from '@/app/workspace/[workspaceId]/settings/components/row-actions-menu'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { SettingsResourceRow } from '@/app/workspace/[workspaceId]/settings/components/settings-resource-row'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import {
  type CredentialSet,
  useAcceptCredentialSetInvitation,
  useCancelCredentialSetInvitation,
  useCreateCredentialSet,
  useCreateCredentialSetInvitation,
  useCredentialSetInvitations,
  useCredentialSetInvitationsDetail,
  useCredentialSetMembers,
  useCredentialSetMemberships,
  useCredentialSets,
  useDeleteCredentialSet,
  useLeaveCredentialSet,
  useRemoveCredentialSetMember,
  useResendCredentialSetInvitation,
} from '@/hooks/queries/credential-sets'
import { useOrganizations } from '@/hooks/queries/organization'
import { useSubscriptionData } from '@/hooks/queries/subscription'

const logger = createLogger('EmailPolling')

function getProviderIcon(providerId: string | null) {
  if (providerId === 'outlook') return <OutlookIcon className='size-4' />
  return <GmailIcon className='size-4' />
}

export function CredentialSets() {
  const { data: session } = useSession()
  const { data: organizationsData } = useOrganizations()
  const { data: subscriptionData } = useSubscriptionData()

  const activeOrganization = organizationsData?.activeOrganization
  const subscriptionAccess = getSubscriptionAccessState(subscriptionData?.data)
  const hasTeamPlan = subscriptionAccess.hasUsableTeamAccess
  const userRole = getUserRole(activeOrganization, session?.user?.email)
  const isAdmin = isOrgAdminRole(userRole)
  const canManageCredentialSets = hasTeamPlan && isAdmin && !!activeOrganization?.id

  const { data: memberships = [], isPending: membershipsLoading } = useCredentialSetMemberships()
  const { data: invitations = [], isPending: invitationsLoading } = useCredentialSetInvitations()
  const { data: ownedSets = [], isPending: ownedSetsLoading } = useCredentialSets(
    activeOrganization?.id,
    canManageCredentialSets
  )

  const acceptInvitation = useAcceptCredentialSetInvitation()
  const createCredentialSet = useCreateCredentialSet()
  const createInvitation = useCreateCredentialSetInvitation()

  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingSet, setViewingSet] = useState<CredentialSet | null>(null)
  const [newSetName, setNewSetName] = useState('')
  const [newSetDescription, setNewSetDescription] = useState('')
  const [newSetProvider, setNewSetProvider] = useState<PollingProvider>('google-email')
  const [createError, setCreateError] = useState<string | null>(null)
  const [emailItems, setEmailItems] = useState<TagItem[]>([])
  const [emailError, setEmailError] = useState<string | null>(null)
  const [leavingMembership, setLeavingMembership] = useState<{
    credentialSetId: string
    name: string
  } | null>(null)

  const { data: members = [], isPending: membersLoading } = useCredentialSetMembers(viewingSet?.id)
  const { data: pendingInvitations = [], isPending: pendingInvitationsLoading } =
    useCredentialSetInvitationsDetail(viewingSet?.id)
  const removeMember = useRemoveCredentialSetMember()
  const leaveCredentialSet = useLeaveCredentialSet()
  const deleteCredentialSet = useDeleteCredentialSet()
  const cancelInvitation = useCancelCredentialSetInvitation()
  const resendInvitation = useResendCredentialSetInvitation()

  const [deletingSet, setDeletingSet] = useState<{ id: string; name: string } | null>(null)
  const [deletingSetIds, setDeletingSetIds] = useState<Set<string>>(() => new Set())
  const [cancellingInvitations, setCancellingInvitations] = useState<Set<string>>(() => new Set())
  const [resendingInvitations, setResendingInvitations] = useState<Set<string>>(() => new Set())
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({})

  const addEmail = useCallback(
    (email: string) => {
      if (!email.trim()) return false

      const normalized = email.trim().toLowerCase()
      const validation = quickValidateEmail(normalized)
      const isValid = validation.isValid

      if (emailItems.some((item) => item.value === normalized)) {
        return false
      }

      const isPendingInvitation = pendingInvitations.some(
        (inv) => inv.email?.toLowerCase() === normalized
      )
      if (isPendingInvitation) {
        setEmailError(`${normalized} 已有待处理邀请`)
        return false
      }

      const isActiveMember = members.some(
        (m) => m.userEmail?.toLowerCase() === normalized && m.status === 'active'
      )
      if (isActiveMember) {
        setEmailError(`${normalized} 已是此轮询组的成员`)
        return false
      }

      setEmailItems((prev) => [
        ...prev,
        {
          value: normalized,
          isValid,
          error: isValid ? undefined : (validation.reason ?? '邮箱格式无效'),
        },
      ])

      if (isValid) {
        setEmailError(null)
      }

      return isValid
    },
    [emailItems, pendingInvitations, members]
  )

  const removeEmailItem = useCallback((_value: string, index: number, _isValid: boolean) => {
    setEmailItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const fileInputOptions: FileInputOptions = useMemo(
    () => ({
      enabled: true,
      accept: '.csv,.txt,text/csv,text/plain',
      extractValues: (text: string) => {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
        const matches = text.match(emailRegex) || []
        return [...new Set(matches.map((e) => e.toLowerCase()))]
      },
    }),
    []
  )

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!viewingSet) return
      try {
        await removeMember.mutateAsync({
          credentialSetId: viewingSet.id,
          memberId,
        })
      } catch (error) {
        logger.error('Failed to remove member', error)
      }
    },
    [viewingSet, removeMember]
  )

  const handleLeave = useCallback((credentialSetId: string, name: string) => {
    setLeavingMembership({ credentialSetId, name })
  }, [])

  const confirmLeave = useCallback(async () => {
    if (!leavingMembership) return
    try {
      await leaveCredentialSet.mutateAsync(leavingMembership.credentialSetId)
      setLeavingMembership(null)
    } catch (error) {
      logger.error('Failed to leave polling group', error)
    }
  }, [leavingMembership, leaveCredentialSet])

  const handleAcceptInvitation = useCallback(
    async (token: string) => {
      try {
        await acceptInvitation.mutateAsync(token)
      } catch (error) {
        logger.error('Failed to accept invitation', error)
      }
    },
    [acceptInvitation]
  )

  const handleCreateCredentialSet = useCallback(async () => {
    if (!newSetName.trim() || !activeOrganization?.id) return
    setCreateError(null)
    try {
      const result = await createCredentialSet.mutateAsync({
        organizationId: activeOrganization.id,
        name: newSetName.trim(),
        description: newSetDescription.trim() || undefined,
        providerId: newSetProvider,
      })
      setShowCreateModal(false)
      setNewSetName('')
      setNewSetDescription('')
      setNewSetProvider('google-email')

      if (result?.credentialSet) {
        setViewingSet(result.credentialSet)
      }
    } catch (error) {
      logger.error('Failed to create polling group', error)
      if (error instanceof Error) {
        setCreateError(error.message)
      } else {
        setCreateError('创建轮询组失败')
      }
    }
  }, [newSetName, newSetDescription, newSetProvider, activeOrganization?.id, createCredentialSet])

  const validEmails = useMemo(() => {
    const result: string[] = []
    for (const item of emailItems) {
      if (item.isValid) result.push(item.value)
    }
    return result
  }, [emailItems])

  const handleInviteMembers = useCallback(async () => {
    if (!viewingSet?.id) return

    if (validEmails.length === 0) return

    try {
      for (const email of validEmails) {
        await createInvitation.mutateAsync({
          credentialSetId: viewingSet.id,
          email,
        })
      }
      setEmailItems([])
      setEmailError(null)
    } catch (error) {
      logger.error('Failed to create invitations', error)
    }
  }, [viewingSet?.id, validEmails, createInvitation])

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false)
    setNewSetName('')
    setNewSetDescription('')
    setNewSetProvider('google-email')
    setCreateError(null)
  }, [])

  const handleBackToList = useCallback(() => {
    setViewingSet(null)
    setEmailItems([])
    setEmailError(null)
  }, [])

  const handleCancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!viewingSet?.id) return

      setCancellingInvitations((prev) => new Set([...prev, invitationId]))
      try {
        await cancelInvitation.mutateAsync({
          credentialSetId: viewingSet.id,
          invitationId,
        })
      } catch (error) {
        logger.error('Failed to cancel invitation', error)
      } finally {
        setCancellingInvitations((prev) => {
          const next = new Set(prev)
          next.delete(invitationId)
          return next
        })
      }
    },
    [viewingSet?.id, cancelInvitation]
  )

  const handleResendInvitation = useCallback(
    async (invitationId: string, email: string) => {
      if (!viewingSet?.id) return

      const secondsLeft = resendCooldowns[invitationId]
      if (secondsLeft && secondsLeft > 0) return

      setResendingInvitations((prev) => new Set([...prev, invitationId]))
      try {
        await resendInvitation.mutateAsync({
          credentialSetId: viewingSet.id,
          invitationId,
          email,
        })

        setResendCooldowns((prev) => ({ ...prev, [invitationId]: 60 }))
        const interval = setInterval(() => {
          setResendCooldowns((prev) => {
            const current = prev[invitationId]
            if (current === undefined) return prev
            if (current <= 1) {
              const next = { ...prev }
              delete next[invitationId]
              clearInterval(interval)
              return next
            }
            return { ...prev, [invitationId]: current - 1 }
          })
        }, 1000)
      } catch (error) {
        logger.error('Failed to resend invitation', error)
      } finally {
        setResendingInvitations((prev) => {
          const next = new Set(prev)
          next.delete(invitationId)
          return next
        })
      }
    },
    [viewingSet?.id, resendInvitation, resendCooldowns]
  )

  const handleDeleteClick = useCallback((set: CredentialSet) => {
    setDeletingSet({ id: set.id, name: set.name })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingSet || !activeOrganization?.id) return
    setDeletingSetIds((prev) => new Set(prev).add(deletingSet.id))
    try {
      await deleteCredentialSet.mutateAsync({
        credentialSetId: deletingSet.id,
        organizationId: activeOrganization.id,
      })
      setDeletingSet(null)
    } catch (error) {
      logger.error('Failed to delete polling group', error)
    } finally {
      setDeletingSetIds((prev) => {
        const next = new Set(prev)
        next.delete(deletingSet.id)
        return next
      })
    }
  }, [deletingSet, activeOrganization?.id, deleteCredentialSet])

  const activeMemberships = useMemo(
    () => memberships.filter((m) => m.status === 'active'),
    [memberships]
  )

  const filteredInvitations = useMemo(() => {
    if (!searchTerm.trim()) return invitations
    const searchLower = searchTerm.toLowerCase()
    return invitations.filter(
      (inv) =>
        inv.credentialSetName.toLowerCase().includes(searchLower) ||
        inv.organizationName.toLowerCase().includes(searchLower)
    )
  }, [invitations, searchTerm])

  const filteredMemberships = useMemo(() => {
    if (!searchTerm.trim()) return activeMemberships
    const searchLower = searchTerm.toLowerCase()
    return activeMemberships.filter(
      (m) =>
        m.credentialSetName.toLowerCase().includes(searchLower) ||
        m.organizationName.toLowerCase().includes(searchLower)
    )
  }, [activeMemberships, searchTerm])

  const filteredOwnedSets = useMemo(() => {
    if (!searchTerm.trim()) return ownedSets
    const searchLower = searchTerm.toLowerCase()
    return ownedSets.filter((set) => set.name.toLowerCase().includes(searchLower))
  }, [ownedSets, searchTerm])

  const hasNoContent =
    invitations.length === 0 && activeMemberships.length === 0 && ownedSets.length === 0
  const hasNoResults =
    searchTerm.trim() &&
    filteredInvitations.length === 0 &&
    filteredMemberships.length === 0 &&
    filteredOwnedSets.length === 0 &&
    !hasNoContent

  if (membershipsLoading || invitationsLoading) {
    return null
  }

  if (viewingSet) {
    const activeMembers = members.filter((m) => m.status === 'active')
    const totalCount = activeMembers.length + pendingInvitations.length

    return (
      <SettingsPanel
        back={{ text: '邮件轮询', icon: ArrowLeft, onSelect: handleBackToList }}
        title={viewingSet.name}
      >
        <div className='flex flex-col gap-7'>
          <SettingsSection label='详情'>
            <div className='flex items-center gap-4.5'>
              <div className='flex items-center gap-2'>
                <span className='font-medium text-[var(--text-primary)] text-sm'>轮询组名称</span>
                <span className='text-[var(--text-secondary)] text-sm'>{viewingSet.name}</span>
              </div>
              <div className='h-4 w-px bg-[var(--border)]' />
              <div className='flex items-center gap-2'>
                <span className='font-medium text-[var(--text-primary)] text-sm'>提供方</span>
                <div className='flex items-center gap-1.5'>
                  {getProviderIcon(viewingSet.providerId)}
                  <span className='text-[var(--text-secondary)] text-sm'>
                    {getProviderDisplayName(viewingSet.providerId as PollingProvider)}
                  </span>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection label='邀请'>
            <div className='flex flex-col gap-1'>
              <div className='flex items-center gap-2'>
                <TagInput
                  items={emailItems}
                  onAdd={(value) => addEmail(value)}
                  onRemove={removeEmailItem}
                  placeholder='输入邮箱地址'
                  placeholderWithTags='添加其他邮箱'
                  disabled={createInvitation.isPending}
                  fileInputOptions={fileInputOptions}
                  className='flex-1'
                />
                <Chip
                  onClick={handleInviteMembers}
                  disabled={createInvitation.isPending || validEmails.length === 0}
                >
                  {createInvitation.isPending ? '发送中…' : '邀请'}
                </Chip>
              </div>
              {emailError && <p className='text-[var(--text-error)] text-small'>{emailError}</p>}
            </div>
          </SettingsSection>

          <SettingsSection label='成员'>
            {membersLoading || pendingInvitationsLoading ? null : totalCount === 0 ? (
              <p className='text-[var(--text-muted)] text-sm'>暂无成员。请在上方发送邀请。</p>
            ) : (
              <div className='flex flex-col gap-4.5'>
                {activeMembers.map((member) => {
                  const name = member.userName || '未知'
                  const avatarInitial = name.charAt(0).toUpperCase()

                  return (
                    <div key={member.id} className='flex items-center justify-between'>
                      <div className='flex flex-1 items-center gap-3'>
                        <Avatar size='md'>
                          {member.userImage && <AvatarImage src={member.userImage} alt={name} />}
                          <AvatarFallback
                            style={{
                              background: getUserColor(member.userId || member.userEmail || ''),
                            }}
                            className='border-0 text-white'
                          >
                            {avatarInitial}
                          </AvatarFallback>
                        </Avatar>

                        <div className='min-w-0'>
                          <div className='flex items-center gap-2'>
                            <span className='truncate font-medium text-[14px] text-[var(--text-primary)]'>
                              {name}
                            </span>
                            {member.credentials.length === 0 && (
                              <Badge variant='red' size='sm'>
                                未连接
                              </Badge>
                            )}
                          </div>
                          <div className='truncate text-[var(--text-muted)] text-small'>
                            {member.userEmail}
                          </div>
                        </div>
                      </div>

                      <div className='ml-4 flex items-center gap-1'>
                        <RowActionsMenu
                          label='成员操作'
                          actions={[
                            {
                              label: '移除',
                              destructive: true,
                              disabled: removeMember.isPending,
                              onSelect: () => handleRemoveMember(member.id),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  )
                })}

                {pendingInvitations.map((invitation) => {
                  const email = invitation.email || '未知'
                  const emailPrefix = email.split('@')[0]
                  const avatarInitial = emailPrefix.charAt(0).toUpperCase()

                  return (
                    <div key={invitation.id} className='flex items-center justify-between'>
                      <div className='flex flex-1 items-center gap-3'>
                        <Avatar size='md'>
                          <AvatarFallback
                            style={{ background: getUserColor(email) }}
                            className='border-0 text-white'
                          >
                            {avatarInitial}
                          </AvatarFallback>
                        </Avatar>

                        <div className='min-w-0'>
                          <div className='flex items-center gap-2'>
                            <span className='truncate font-medium text-[14px] text-[var(--text-primary)]'>
                              {emailPrefix}
                            </span>
                            <Badge variant='gray-secondary' size='sm'>
                              待处理
                            </Badge>
                          </div>
                          <div className='truncate text-[var(--text-muted)] text-small'>
                            {email}
                          </div>
                        </div>
                      </div>

                      <div className='ml-4 flex items-center gap-1'>
                        <RowActionsMenu
                          label='邀请操作'
                          actions={[
                            {
                              label: resendingInvitations.has(invitation.id)
                                ? '发送中…'
                                : resendCooldowns[invitation.id]
                                  ? `重新发送 (${resendCooldowns[invitation.id]}s)`
                                  : '重新发送',
                              disabled:
                                resendingInvitations.has(invitation.id) ||
                                (resendCooldowns[invitation.id] ?? 0) > 0,
                              onSelect: () => handleResendInvitation(invitation.id, email),
                            },
                            {
                              label: cancellingInvitations.has(invitation.id) ? '取消中…' : '取消',
                              destructive: true,
                              disabled: cancellingInvitations.has(invitation.id),
                              onSelect: () => handleCancelInvitation(invitation.id),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SettingsSection>
        </div>
      </SettingsPanel>
    )
  }

  return (
    <>
      <SettingsPanel
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: '搜索轮询组…',
        }}
        actions={
          canManageCredentialSets
            ? [
                {
                  text: '创建轮询组',
                  icon: Plus,
                  variant: 'primary',
                  onSelect: () => setShowCreateModal(true),
                },
              ]
            : undefined
        }
      >
        <div className='relative'>
          {hasNoContent && !canManageCredentialSets ? (
            <SettingsEmptyState>
              你还不是任何轮询组的成员。当有人邀请你时，它会显示在这里。
            </SettingsEmptyState>
          ) : hasNoResults ? (
            <SettingsEmptyState variant='inline'>
              未找到与"{searchTerm}"匹配的结果
            </SettingsEmptyState>
          ) : (
            <div className='flex flex-col gap-4.5'>
              {filteredInvitations.length > 0 && (
                <SettingsSection label='待处理邀请'>
                  <div className='flex flex-col gap-2'>
                    {filteredInvitations.map((invitation) => (
                      <SettingsResourceRow
                        key={invitation.invitationId}
                        icon={getProviderIcon(invitation.providerId)}
                        title={invitation.credentialSetName}
                        description={invitation.organizationName}
                        trailing={
                          <Chip
                            variant='primary'
                            onClick={() => handleAcceptInvitation(invitation.token)}
                            disabled={acceptInvitation.isPending}
                          >
                            {acceptInvitation.isPending ? '接受中…' : '接受'}
                          </Chip>
                        }
                      />
                    ))}
                  </div>
                </SettingsSection>
              )}

              {filteredMemberships.length > 0 && (
                <SettingsSection label='我的轮询组'>
                  <div className='flex flex-col gap-2'>
                    {filteredMemberships.map((membership) => (
                      <SettingsResourceRow
                        key={membership.membershipId}
                        icon={getProviderIcon(membership.providerId)}
                        title={membership.credentialSetName}
                        description={membership.organizationName}
                        trailing={
                          <Chip
                            onClick={() =>
                              handleLeave(membership.credentialSetId, membership.credentialSetName)
                            }
                            disabled={leaveCredentialSet.isPending}
                          >
                            退出
                          </Chip>
                        }
                      />
                    ))}
                  </div>
                </SettingsSection>
              )}

              {canManageCredentialSets &&
                (filteredOwnedSets.length > 0 ||
                  ownedSetsLoading ||
                  (!searchTerm.trim() && ownedSets.length === 0)) && (
                  <SettingsSection label='管理'>
                    {ownedSetsLoading ? null : !searchTerm.trim() && ownedSets.length === 0 ? (
                      <div className='text-[var(--text-muted)] text-sm'>尚未创建轮询组</div>
                    ) : (
                      <div className='flex flex-col gap-2'>
                        {filteredOwnedSets.map((set) => (
                          <SettingsResourceRow
                            key={set.id}
                            icon={getProviderIcon(set.providerId)}
                            title={set.name}
                            description={`${set.memberCount} 名成员`}
                            trailing={
                              <RowActionsMenu
                                label='轮询组操作'
                                actions={[
                                  { label: '详情', onSelect: () => setViewingSet(set) },
                                  {
                                    label: '删除',
                                    destructive: true,
                                    disabled: deletingSetIds.has(set.id),
                                    onSelect: () => handleDeleteClick(set),
                                  },
                                ]}
                              />
                            }
                          />
                        ))}
                      </div>
                    )}
                  </SettingsSection>
                )}
            </div>
          )}
        </div>
      </SettingsPanel>

      <ChipModal open={showCreateModal} onOpenChange={handleCloseCreateModal} srTitle='创建轮询组'>
        <ChipModalHeader onClose={handleCloseCreateModal}>创建轮询组</ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='input'
            title='名称'
            value={newSetName}
            onChange={(value) => {
              setNewSetName(value)
              if (createError) setCreateError(null)
            }}
            required
            placeholder='例如：营销团队'
          />
          <ChipModalField
            type='input'
            title='描述'
            value={newSetDescription}
            onChange={setNewSetDescription}
            placeholder='例如：为营销自动化轮询邮件'
          />
          <ChipModalField type='custom' title='邮箱提供方'>
            <ButtonGroup
              value={newSetProvider}
              onValueChange={(v) => setNewSetProvider(v as PollingProvider)}
            >
              <ButtonGroupItem value='google-email'>Gmail</ButtonGroupItem>
              <ButtonGroupItem value='outlook'>Outlook</ButtonGroupItem>
            </ButtonGroup>
            <p className='mt-1 text-[var(--text-muted)] text-small'>
              成员将连接他们的 {getProviderDisplayName(newSetProvider)} 账号
            </p>
          </ChipModalField>
          <ChipModalError>{createError}</ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={handleCloseCreateModal}
          primaryAction={{
            label: createCredentialSet.isPending ? '创建中…' : '创建',
            onClick: handleCreateCredentialSet,
            disabled: !newSetName.trim() || createCredentialSet.isPending,
          }}
        />
      </ChipModal>

      <ChipConfirmModal
        open={!!leavingMembership}
        onOpenChange={(open) => {
          if (!open) setLeavingMembership(null)
        }}
        srTitle='退出轮询组'
        title='退出轮询组'
        text={[
          '确定要退出 ',
          { text: leavingMembership?.name ?? '此轮询组', bold: true },
          '？使用此轮询组的工作流将不再轮询你的邮箱账号。',
        ]}
        confirm={{
          label: '退出',
          onClick: confirmLeave,
          pending: leaveCredentialSet.isPending,
          pendingLabel: '退出中…',
        }}
      />

      <ChipConfirmModal
        open={!!deletingSet}
        onOpenChange={(open) => {
          if (!open) setDeletingSet(null)
        }}
        srTitle='删除轮询组'
        title='删除轮询组'
        text={[
          '确定要删除 ',
          { text: deletingSet?.name ?? '此轮询组', bold: true },
          '？此操作无法撤销。',
        ]}
        confirm={{
          label: '删除',
          onClick: confirmDelete,
          pending: deleteCredentialSet.isPending,
          pendingLabel: '删除中…',
        }}
      />
    </>
  )
}
