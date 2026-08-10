import { Badge, Chip, cn } from '@sim/emcn'
import { useParams, useRouter } from 'next/navigation'
import { checkEnterprisePlan } from '@/lib/billing/subscriptions/utils'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'

type Subscription = {
  id: string
  plan: string
  status: string
  referenceId: string
  cancelAtPeriodEnd?: boolean
  periodEnd?: number | Date
  trialEnd?: number | Date
}

interface TeamSeatsOverviewProps {
  subscriptionData: Subscription | null
  isLoadingSubscription: boolean
  totalSeats: number
  /** Seats consumed by actual members. Pending invites are not counted here. */
  usedSeats: number
  /** Outstanding invites that have not been accepted yet (do not consume a seat). */
  pendingSeats?: number
  isSelfHostedOrgEnabled?: boolean
}

export function TeamSeatsOverview({
  subscriptionData,
  isLoadingSubscription,
  totalSeats,
  usedSeats,
  pendingSeats = 0,
  isSelfHostedOrgEnabled = false,
}: TeamSeatsOverviewProps) {
  const router = useRouter()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params?.workspaceId

  if (isLoadingSubscription) {
    return null
  }

  if (!subscriptionData) {
    return (
      <SettingsSection label='席位'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex min-w-0 flex-col'>
            <span className='text-[var(--text-body)] text-small'>
              {isSelfHostedOrgEnabled ? '自托管组织' : '没有有效的 Team 订阅'}
            </span>
            <span className='text-[var(--text-muted)] text-small'>
              {isSelfHostedOrgEnabled
                ? '你的自托管实例已启用组织管理功能。'
                : '购买 Team 套餐,邀请团队成员加入此组织。'}
            </span>
          </div>
          {!isSelfHostedOrgEnabled && (
            <Chip
              variant='primary'
              flush
              onClick={() => {
                if (workspaceId) {
                  router.push(`/workspace/${workspaceId}/settings/billing`)
                }
              }}
              disabled={!workspaceId}
            >
              查看套餐
            </Chip>
          )}
        </div>
      </SettingsSection>
    )
  }

  const isEnterprise = checkEnterprisePlan(subscriptionData)
  const isSeatDataPending = !isEnterprise && totalSeats === 0
  const isOverLimit = totalSeats > 0 && usedSeats > totalSeats
  const pillCount = Math.max(totalSeats, usedSeats, 1)

  if (isSeatDataPending) {
    return null
  }

  const pendingBadge =
    pendingSeats > 0 ? (
      <Badge variant='gray-secondary' size='sm'>
        {pendingSeats} 待接受
      </Badge>
    ) : null

  /**
   * Team plans have no fixed seat cap — the seat count is reconciled to the
   * member count, so a used/total ratio (and its meter) is always 100% and
   * carries no information. Show a plain seat count instead, and reserve the
   * cap meter for Enterprise, where seats are a fixed allotment.
   */
  if (!isEnterprise) {
    return (
      <SettingsSection label='席位'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-[var(--text-body)] text-small tabular-nums'>
            {usedSeats} 个席位
          </span>
          {pendingBadge}
        </div>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection label='席位'>
      <div className='flex flex-col gap-2.5'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-[var(--text-body)] text-small tabular-nums'>
            已用 {usedSeats} / 共 {totalSeats}
          </span>
          <div className='flex items-center gap-1.5'>
            {pendingBadge}
            {isOverLimit && (
              <Badge variant='amber' size='sm'>
                超出上限
              </Badge>
            )}
          </div>
        </div>

        <div className='flex items-center gap-1'>
          {Array.from({ length: pillCount }).map((_, i) => {
            const isFilled = i < usedSeats
            const isOverage = i >= totalSeats
            return (
              <div
                key={i}
                className={cn(
                  'h-[6px] flex-1 rounded-full transition-colors',
                  isOverage
                    ? 'bg-[var(--badge-amber-text)]'
                    : isFilled
                      ? 'bg-[var(--indicator-seat-filled)]'
                      : 'bg-[var(--border)]'
                )}
              />
            )
          })}
        </div>

        <p className='text-[var(--text-muted)] text-small'>
          {isOverLimit
            ? '你的团队成员数超过了席位数量。请联系支持团队调整你的 Enterprise 席位数量。'
            : '如需调整 Enterprise 席位,请联系支持团队。'}
        </p>
      </div>
    </SettingsSection>
  )
}
