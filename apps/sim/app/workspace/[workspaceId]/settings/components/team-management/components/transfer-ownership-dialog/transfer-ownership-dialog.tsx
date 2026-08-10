'use client'

import { useMemo, useState } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Banner,
  ChipConfirmModal,
  ChipInput,
  cn,
  Search,
  Skeleton,
} from '@sim/emcn'
import { getUserColor } from '@/lib/workspaces/colors'
import type { RosterMember } from '@/hooks/queries/organization'

interface TransferOwnershipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: RosterMember[]
  isLoadingMembers: boolean
  currentUserId: string
  isSubmitting: boolean
  error?: Error | null
  portalError?: string | null
  hasPaidSubscription: boolean
  isOpeningBillingPortal: boolean
  onConfirm: (newOwnerUserId: string) => Promise<void>
  onOpenBillingPortal: () => void
}

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  members,
  isLoadingMembers,
  currentUserId,
  isSubmitting,
  error,
  portalError,
  hasPaidSubscription,
  isOpeningBillingPortal,
  onConfirm,
  onOpenBillingPortal,
}: TransferOwnershipDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const others = members.filter(
      (m) => m.userId !== currentUserId && m.role !== 'owner' && m.role !== 'external'
    )
    others.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return a.name.localeCompare(b.name)
    })
    if (!search.trim()) return others
    const q = search.trim().toLowerCase()
    return others.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    )
  }, [members, currentUserId, search])

  const hasCandidates = members.some(
    (m) => m.userId !== currentUserId && m.role !== 'owner' && m.role !== 'external'
  )

  const handleClose = (next: boolean) => {
    if (!next) {
      setSearch('')
      setSelectedUserId(null)
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    if (!selectedUserId) return
    await onConfirm(selectedUserId)
  }

  return (
    <ChipConfirmModal
      open={open}
      onOpenChange={handleClose}
      srTitle='退出组织'
      title='退出组织'
      confirm={{
        label: '转让并退出',
        onClick: handleConfirm,
        pending: isSubmitting,
        pendingLabel: '转让中...',
        disabled: !selectedUserId || !hasCandidates || isLoadingMembers,
      }}
    >
      <div className='flex flex-col gap-4'>
        {isLoadingMembers ? (
          <div className='space-y-3'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-4 w-1/2' />
            <div className='space-y-2 pt-2'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          </div>
        ) : !hasCandidates ? (
          <p className='px-2 text-[var(--text-secondary)] text-sm'>
            你是此组织中唯一的成员。退出前请先邀请另一位管理员。
          </p>
        ) : (
          <div className='space-y-3'>
            <p className='px-2 text-[var(--text-secondary)] text-sm'>
              作为所有者,退出前需要先将组织移交出去。选择一位成员成为新的所有者。他将继承计费访问权限、席位管理和所有仅所有者拥有的权限。你将失去对此组织所有共享工作区的访问权限。
            </p>

            {hasPaidSubscription && (
              <Banner
                variant='default'
                className='rounded-md px-3 py-2'
                textClassName='text-[var(--text-primary)]'
                actionLabel={isOpeningBillingPortal ? '打开中...' : '打开 Stripe 计费门户'}
                actionDisabled={isOpeningBillingPortal}
                onAction={onOpenBillingPortal}
                text={
                  <>
                    <span className='block font-medium'>你的支付方式仍保留在此组织</span>
                    <span className='block text-[var(--text-secondary)]'>
                      后续扣款仍会使用你添加的卡片。退出前,请打开 Stripe 计费门户将其移除。
                    </span>
                  </>
                }
              />
            )}

            {portalError && <p className='px-2 text-[var(--text-error)] text-sm'>{portalError}</p>}

            <ChipInput
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='搜索成员...'
            />

            <div className='max-h-[280px] overflow-y-auto rounded-md border border-[var(--border-1)]'>
              {candidates.length === 0 ? (
                <div className='px-3 py-4 text-center text-[var(--text-muted)] text-small'>
                  没有匹配 "{search}" 的成员
                </div>
              ) : (
                <ul className='divide-y divide-[var(--border-1)]'>
                  {candidates.map((m) => {
                    const isSelected = selectedUserId === m.userId
                    return (
                      <li key={m.userId}>
                        <button
                          type='button'
                          onClick={() => setSelectedUserId(m.userId)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                            isSelected
                              ? 'bg-[var(--surface-active)]'
                              : 'hover-hover:bg-[var(--surface-hover)]'
                          )}
                        >
                          <Avatar className='size-8 shrink-0'>
                            {m.image && <AvatarImage src={m.image} alt={m.name} />}
                            <AvatarFallback
                              style={{ background: getUserColor(m.userId || m.email) }}
                              className='border-0 text-white'
                            >
                              {m.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2'>
                              <span className='truncate font-medium text-[var(--text-primary)] text-small'>
                                {m.name}
                              </span>
                              {m.role === 'admin' && (
                                <Badge variant='gray-secondary' size='sm'>
                                  管理员
                                </Badge>
                              )}
                            </div>
                            <div className='truncate text-[var(--text-muted)] text-caption'>
                              {m.email}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className='px-2 text-[var(--text-error)] text-sm'>
            {error instanceof Error && error.message ? error.message : String(error)}
          </p>
        )}
      </div>
    </ChipConfirmModal>
  )
}
