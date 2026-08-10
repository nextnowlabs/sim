'use client'
import {
  ArrowRight,
  Badge,
  Chip,
  ChipLink,
  Credit,
  chipVariants,
  cn,
  Switch,
  Tooltip,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { isOrgAdminRole } from '@sim/platform-authz/predicates'
import { getErrorMessage } from '@sim/utils/errors'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useSession, useSubscription } from '@/lib/auth/auth-client'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { CREDIT_MULTIPLIER } from '@/lib/billing/credits/conversion'
import {
  getCoveredUsage,
  getIsOnDemandActive,
  getOnDemandOffLimit,
  isOnDemandOffDisabled,
} from '@/lib/billing/on-demand'
import {
  getDisplayPlanName,
  getPlanTierCredits,
  getPlanTierDollars,
  isEnterprise,
  isFree,
  isPaid,
  isPro,
  isTeam,
} from '@/lib/billing/plan-helpers'
import {
  getEffectiveSeats,
  hasPaidSubscriptionStatus,
  hasUsableSubscriptionAccess,
} from '@/lib/billing/subscriptions/utils'
import { buildUpgradeHref } from '@/lib/billing/upgrade-reasons'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { UsageLimitField } from '@/app/workspace/[workspaceId]/settings/components/billing/components/usage-limit-field/usage-limit-field'
import { getSubscriptionPermissions } from '@/app/workspace/[workspaceId]/settings/components/billing/subscription-permissions'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import {
  useBillingUsageNotifications,
  useUpdateGeneralSetting,
} from '@/hooks/queries/general-settings'
import {
  useOrganizationBilling,
  useOrganizations,
  useUpdateOrganizationUsageLimit,
} from '@/hooks/queries/organization'
import {
  prefetchUpgradeBillingData,
  useInvoices,
  useOpenBillingPortal,
  useSubscriptionData,
  useUpdateUsageLimit,
  useUsageLimitData,
} from '@/hooks/queries/subscription'
import { prefetchWorkspaceSettings, useWorkspaceSettings } from '@/hooks/queries/workspace'

const logger = createLogger('Billing')

type InvoiceStatusBadge = { variant: 'green' | 'amber' | 'red' | 'gray'; label: string }

const INVOICE_STATUS_BADGES: Record<string, InvoiceStatusBadge> = {
  paid: { variant: 'green', label: '已支付' },
  open: { variant: 'amber', label: '待支付' },
  uncollectible: { variant: 'red', label: '无法收回' },
  void: { variant: 'gray', label: '已作废' },
}

/** Resolve a Stripe invoice status to its badge presentation. */
function getInvoiceStatusBadge(status: string | null): InvoiceStatusBadge {
  return INVOICE_STATUS_BADGES[status ?? ''] ?? { variant: 'gray', label: status ?? '未知' }
}

/** Format a Unix-seconds timestamp as a short human-readable date. */
function formatInvoiceDate(createdSeconds: number): string {
  return new Date(createdSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Cached currency formatters, keyed by upper-cased ISO currency code. */
const invoiceAmountFormatters = new Map<string, Intl.NumberFormat>()

/** Resolve (and memoize) an `Intl.NumberFormat` for a currency code. */
function getInvoiceAmountFormatter(currency: string): Intl.NumberFormat {
  const code = currency.toUpperCase()
  let formatter = invoiceAmountFormatters.get(code)
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: code })
    invoiceAmountFormatters.set(code, formatter)
  }
  return formatter
}

/** Format a minor-unit (e.g. cents) amount as a localized currency string. */
function formatInvoiceAmount(amountMinor: number, currency: string): string {
  return getInvoiceAmountFormatter(currency).format(amountMinor / 100)
}

export function Billing() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    data: subscriptionData,
    isLoading: isSubscriptionLoading,
    refetch: refetchSubscription,
  } = useSubscriptionData({
    includeOrg: true,
  })
  const { data: usageLimitResponse, isLoading: isUsageLimitLoading } = useUsageLimitData()
  const { data: workspaceData, isLoading: isWorkspaceLoading } = useWorkspaceSettings(workspaceId)

  const { data: orgsData } = useOrganizations()
  const activeOrgId = orgsData?.activeOrganization?.id
  const workspaceOrganizationId = workspaceData?.settings?.workspace?.organizationId ?? null
  const billingOrganizationId =
    workspaceOrganizationId ?? subscriptionData?.data?.organization?.id ?? activeOrgId ?? null

  const { data: organizationBillingData, isLoading: isOrgBillingLoading } = useOrganizationBilling(
    billingOrganizationId || ''
  )

  const updateUserLimit = useUpdateUsageLimit()
  const updateOrgLimit = useUpdateOrganizationUsageLimit()

  const billingUsageNotificationsEnabled = useBillingUsageNotifications()
  const updateGeneralSetting = useUpdateGeneralSetting()

  const { data: session } = useSession()
  const betterAuthSubscription = useSubscription()
  const openBillingPortal = useOpenBillingPortal()

  const upgradeHref = buildUpgradeHref(workspaceId)

  /**
   * Warm the Upgrade route bundle and the exact queries that page gates on, so
   * the click navigates into already-cached data instead of a loading state.
   */
  const prefetchUpgrade = () => {
    router.prefetch(upgradeHref)
    prefetchUpgradeBillingData(queryClient)
    prefetchWorkspaceSettings(queryClient, workspaceId)
  }

  const hasOrgScopedSubscription = Boolean(subscriptionData?.data?.isOrgScoped)
  const isLoading =
    isSubscriptionLoading ||
    isUsageLimitLoading ||
    isWorkspaceLoading ||
    (hasOrgScopedSubscription && isOrgBillingLoading)

  const subscription = {
    isFree: isFree(subscriptionData?.data?.plan),
    isPro: isPro(subscriptionData?.data?.plan),
    isTeam: isTeam(subscriptionData?.data?.plan),
    isEnterprise: isEnterprise(subscriptionData?.data?.plan),
    isPaid:
      isPaid(subscriptionData?.data?.plan) &&
      hasPaidSubscriptionStatus(subscriptionData?.data?.status),
    /**
     * True when the subscription is attached to an org (regardless of plan
     * name). Drives routing of usage-limit edits and whether we show pooled
     * or personal usage.
     */
    isOrgScoped: Boolean(subscriptionData?.data?.isOrgScoped),
    plan: subscriptionData?.data?.plan || 'free',
    status: subscriptionData?.data?.status || 'inactive',
    seats: getEffectiveSeats(subscriptionData?.data),
  }

  const usage = {
    current: subscriptionData?.data?.usage?.current || 0,
    limit: subscriptionData?.data?.usage?.limit || 0,
    percentUsed: subscriptionData?.data?.usage?.percentUsed || 0,
  }

  const usageLimitData = {
    currentLimit: usageLimitResponse?.data?.currentLimit || 0,
    minimumLimit: usageLimitResponse?.data?.minimumLimit || getPlanTierDollars(subscription.plan),
  }

  const isBlocked = Boolean(subscriptionData?.data?.billingBlocked)

  const userRole = subscriptionData?.data?.organization?.role ?? 'member'
  const isTeamAdmin = isOrgAdminRole(userRole)
  const shouldUseOrganizationBillingContext = subscription.isOrgScoped && isTeamAdmin

  const { data: invoicesData } = useInvoices({
    context: shouldUseOrganizationBillingContext ? 'organization' : 'user',
    organizationId: shouldUseOrganizationBillingContext
      ? (billingOrganizationId ?? undefined)
      : undefined,
    enabled: !subscription.isFree,
  })

  const planIncludedAmount =
    subscription.isOrgScoped && isTeamAdmin && organizationBillingData?.data
      ? organizationBillingData.data.minimumBillingAmount
      : getPlanTierCredits(subscription.plan) / CREDIT_MULTIPLIER

  const effectiveUsageLimit =
    subscription.isOrgScoped && isTeamAdmin && organizationBillingData?.data
      ? organizationBillingData.data.totalUsageLimit
      : usageLimitData.currentLimit || usage.limit

  const effectiveCurrentUsage =
    subscription.isOrgScoped && organizationBillingData?.data?.totalCurrentUsage != null
      ? organizationBillingData.data.totalCurrentUsage
      : usage.current

  /**
   * Goodwill credits are already baked into the usage limit by
   * `setUsageLimitForCredits` (limit = planBase + creditBalance). `covered` is
   * that same never-billed ceiling, so on-demand is "on" only when the limit is
   * raised above it — a credit grant alone must not read as on-demand.
   * `creditBalance` is the org's balance for org-scoped admins (resolved
   * server-side by `getCreditBalance`) and the user's balance otherwise.
   */
  const creditBalance = subscriptionData?.data?.creditBalance ?? 0
  const covered = getCoveredUsage(planIncludedAmount, creditBalance)

  const isOnDemandActive = getIsOnDemandActive({
    isPaid: subscription.isPaid,
    planIncludedAmount,
    effectiveUsageLimit,
    covered,
  })

  /**
   * When usage already sits above `covered`, turning on-demand off would re-cap
   * the limit at current usage and the switch would bounce straight back on
   * (see `getOnDemandOffLimit`). Disable it and explain why via tooltip instead
   * of accepting a no-op click; it re-enables once usage drops back to/below
   * covered (e.g. the next billing reset).
   */
  const onDemandLockedOn = isOnDemandOffDisabled({
    isOnDemandActive,
    effectiveCurrentUsage,
    covered,
  })

  const permissions = getSubscriptionPermissions(
    {
      isFree: subscription.isFree,
      isPro: subscription.isPro,
      isTeam: subscription.isTeam,
      isEnterprise: subscription.isEnterprise,
      isPaid: subscription.isPaid,
      isOrgScoped: subscription.isOrgScoped,
      plan: subscription.plan || 'free',
      status: subscription.status || 'inactive',
    },
    { isTeamAdmin, userRole: userRole || 'member' }
  )

  const hasUsablePaidAccess = subscription.isPaid
    ? hasUsableSubscriptionAccess(subscription.status, isBlocked)
    : false

  const isTogglingOnDemand = updateUserLimit.isPending || updateOrgLimit.isPending

  const handleToggleOnDemand = async () => {
    if (!permissions.canEditUsageLimit) {
      toast.error('无法更改按需用量', {
        description: '只有组织管理员才能更改按需用量。',
      })
      return
    }

    try {
      if (shouldUseOrganizationBillingContext && !billingOrganizationId) {
        throw new Error('组织账单上下文不可用,请刷新后重试。')
      }

      const nextLimit = isOnDemandActive
        ? getOnDemandOffLimit(effectiveCurrentUsage, covered)
        : ON_DEMAND_UNLIMITED

      if (shouldUseOrganizationBillingContext) {
        await updateOrgLimit.mutateAsync({
          organizationId: billingOrganizationId!,
          limit: nextLimit,
        })
      } else {
        await updateUserLimit.mutateAsync({ limit: nextLimit })
      }
    } catch (error) {
      logger.error('Failed to toggle on-demand billing', { error })
      toast.error('更新按需用量失败', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
    }
  }

  const handleOpenBillingPortal = () => {
    if (!permissions.canEditUsageLimit) {
      toast.error('无法管理支付方式', {
        description: '只有组织管理员才能管理账单。',
      })
      return
    }
    const portalWindow = window.open('', '_blank')
    const context = subscription.isOrgScoped ? 'organization' : 'user'
    if (context === 'organization' && !billingOrganizationId) {
      portalWindow?.close()
      toast.error('账单服务不可用', {
        description: '组织账单上下文不可用,请刷新后重试。',
      })
      return
    }
    openBillingPortal.mutate(
      {
        context,
        organizationId: billingOrganizationId ?? undefined,
        returnUrl: window.location.href,
      },
      {
        onSuccess: (data) => {
          if (portalWindow) portalWindow.location.href = data.url
          else window.location.href = data.url
        },
        onError: (error) => {
          portalWindow?.close()
          logger.error('Failed to open billing portal', { error })
          toast.error('无法打开账单门户', {
            description: getErrorMessage(error, '请稍后重试。'),
          })
        },
      }
    )
  }

  const handleCancelSubscription = async () => {
    if (!permissions.canEditUsageLimit) {
      toast.error('无法取消订阅', {
        description: '只有组织管理员才能取消订阅。',
      })
      return
    }
    if (!betterAuthSubscription.cancel) return
    try {
      if (subscription.isOrgScoped && !billingOrganizationId) {
        throw new Error('组织账单上下文不可用,请刷新后重试。')
      }
      const referenceId = subscription.isOrgScoped ? billingOrganizationId : session?.user?.id
      const returnUrl = getBaseUrl() + window.location.pathname
      await betterAuthSubscription.cancel({ returnUrl, referenceId: referenceId || '' })
    } catch (error) {
      logger.error('Failed to cancel subscription', { error })
      toast.error('取消订阅失败', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
    }
  }

  const handleRestoreSubscription = async () => {
    if (!permissions.canEditUsageLimit) {
      toast.error('无法恢复订阅', {
        description: '只有组织管理员才能恢复订阅。',
      })
      return
    }
    if (!betterAuthSubscription.restore) return
    try {
      if (subscription.isOrgScoped && !billingOrganizationId) {
        throw new Error('组织账单上下文不可用,请刷新后重试。')
      }
      const referenceId = subscription.isOrgScoped ? billingOrganizationId : session?.user?.id
      await betterAuthSubscription.restore({ referenceId: referenceId || '' })
      await refetchSubscription()
    } catch (error) {
      logger.error('Failed to restore subscription', { error })
      toast.error('恢复订阅失败', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
    }
  }

  if (isLoading) return null
  if (!subscriptionData?.data) return null

  const plan = subscription.plan
  const planName = getDisplayPlanName(plan)
  const billingPeriod = subscriptionData.data.billingInterval === 'year' ? '按年计费' : '按月计费'
  const priceText = subscription.isEnterprise
    ? '自定义定价'
    : `$${getPlanTierDollars(plan)} 每用户/月,${billingPeriod}`

  const periodEnd = subscriptionData.data.periodEnd ?? null
  const isCancelledAtPeriodEnd = subscriptionData.data.cancelAtPeriodEnd === true

  const invoices = (invoicesData?.invoices ?? []).map((invoice) => ({
    id: invoice.id,
    date: formatInvoiceDate(invoice.created),
    amount: formatInvoiceAmount(invoice.total, invoice.currency),
    badge: getInvoiceStatusBadge(invoice.status),
    url: invoice.hostedInvoiceUrl ?? invoice.invoicePdf,
  }))

  const canManageBilling = permissions.canEditUsageLimit
  const showUsageLimit = !subscription.isFree && !subscription.isEnterprise
  const showOnDemand = hasUsablePaidAccess && !subscription.isEnterprise

  const usageLimitCurrent =
    subscription.isOrgScoped && isTeamAdmin && organizationBillingData?.data
      ? organizationBillingData.data.totalUsageLimit
      : usageLimitData.currentLimit || usage.limit

  const usageLimitMinimum =
    subscription.isOrgScoped && isTeamAdmin && organizationBillingData?.data
      ? organizationBillingData.data.minimumBillingAmount
      : usageLimitData.minimumLimit

  return (
    <SettingsPanel>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2.5'>
          <div className='size-9 flex-shrink-0'>
            <div className='flex size-full items-center justify-center rounded-xl border border-[var(--border-1)] bg-[var(--bg)]'>
              <Credit className='size-5 text-[var(--text-icon)]' />
            </div>
          </div>
          <div className='flex min-w-0 flex-col'>
            <span className='truncate text-[14px] text-[var(--text-body)]'>{planName} 套餐</span>
            <span className='truncate text-[12px] text-[var(--text-muted)]'>{priceText}</span>
          </div>
        </div>
        {!subscription.isEnterprise &&
          (canManageBilling ? (
            <ChipLink
              href={upgradeHref}
              variant='border-shadow'
              flush
              onMouseEnter={prefetchUpgrade}
              onFocus={prefetchUpgrade}
            >
              查看套餐
            </ChipLink>
          ) : (
            <Chip variant='border-shadow' flush disabled>
              查看套餐
            </Chip>
          ))}
      </div>

      {showUsageLimit && (
        <UsageLimitField
          currentLimit={usageLimitCurrent}
          minimumLimit={usageLimitMinimum}
          canEdit={permissions.canEditUsageLimit}
          context={shouldUseOrganizationBillingContext ? 'organization' : 'user'}
          organizationId={
            shouldUseOrganizationBillingContext ? (billingOrganizationId ?? undefined) : undefined
          }
        />
      )}

      {showOnDemand && (
        <SettingsSection label='启用按需用量'>
          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-body)] text-small'>允许用量超过包含的额度</span>
            {onDemandLockedOn ? (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className='inline-flex'>
                    <Switch checked disabled onCheckedChange={handleToggleOnDemand} />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content className='max-w-[260px]'>
                  <p>
                    {
                      '你的用量已超过套餐包含额度,暂时无法关闭按需用量。当用量降至该额度以下时会自动关闭——最迟在计费周期重置时。'
                    }
                  </p>
                </Tooltip.Content>
              </Tooltip.Root>
            ) : (
              <Switch
                checked={isOnDemandActive}
                disabled={isTogglingOnDemand || !canManageBilling}
                onCheckedChange={handleToggleOnDemand}
              />
            )}
          </div>
        </SettingsSection>
      )}

      {!subscription.isFree && !subscription.isEnterprise && (
        <SettingsSection label='用量通知'>
          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-body)] text-small'>
              当用量达到 80% 时向我发送邮件
            </span>
            <Switch
              checked={!!billingUsageNotificationsEnabled}
              disabled={updateGeneralSetting.isPending}
              onCheckedChange={(value: boolean) => {
                if (value !== billingUsageNotificationsEnabled) {
                  updateGeneralSetting.mutate({
                    key: 'billingUsageNotificationsEnabled',
                    value,
                  })
                }
              }}
            />
          </div>
        </SettingsSection>
      )}

      {(subscription.isPaid || subscription.isEnterprise) && (
        <SettingsSection label='订阅'>
          <div className='flex flex-col gap-4'>
            {periodEnd && (
              <div className='flex items-center justify-between'>
                <span className='text-[var(--text-body)] text-small'>
                  {isCancelledAtPeriodEnd ? '访问有效期至' : '下次计费日期'}
                </span>
                <span className='text-[var(--text-muted)] text-small'>
                  {new Date(periodEnd).toLocaleDateString()}
                </span>
              </div>
            )}

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-body)] text-small'>支付方式</span>
              <Chip
                flush
                disabled={!canManageBilling || openBillingPortal.isPending}
                onClick={handleOpenBillingPortal}
              >
                在 Stripe 中管理
              </Chip>
            </div>

            {!subscription.isEnterprise && (
              <div className='flex items-center justify-between'>
                <span className='text-[var(--text-body)] text-small'>
                  {isCancelledAtPeriodEnd ? '订阅已取消' : '取消订阅'}
                </span>
                {isCancelledAtPeriodEnd ? (
                  <Chip
                    variant='primary'
                    flush
                    disabled={!canManageBilling}
                    onClick={handleRestoreSubscription}
                  >
                    恢复
                  </Chip>
                ) : (
                  <Chip
                    variant='destructive'
                    flush
                    disabled={!canManageBilling}
                    onClick={handleCancelSubscription}
                  >
                    取消
                  </Chip>
                )}
              </div>
            )}
          </div>
        </SettingsSection>
      )}

      {!subscription.isFree && invoices.length > 0 && (
        <SettingsSection label='发票'>
          <div className='-mx-2 flex flex-col gap-y-0.5'>
            {invoices.map((invoice) => {
              const rowClassName =
                'flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors'
              const rowContent = (
                <>
                  <span className='min-w-0 flex-1 truncate text-[14px] text-[var(--text-body)]'>
                    {invoice.date}
                  </span>
                  <Badge variant={invoice.badge.variant} size='sm'>
                    {invoice.badge.label}
                  </Badge>
                  <span className='flex-shrink-0 text-[12px] text-[var(--text-muted)]'>
                    {invoice.amount}
                  </span>
                  <ArrowRight className='size-4 flex-shrink-0 text-[var(--text-icon)]' />
                </>
              )

              return invoice.url ? (
                <a
                  key={invoice.id}
                  href={invoice.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={cn(rowClassName, 'hover-hover:bg-[var(--surface-active)]')}
                >
                  {rowContent}
                </a>
              ) : (
                <div key={invoice.id} className={cn(rowClassName, 'cursor-default')}>
                  {rowContent}
                </div>
              )
            })}

            {invoicesData?.hasMore && (
              <button
                type='button'
                onClick={handleOpenBillingPortal}
                disabled={openBillingPortal.isPending || !canManageBilling}
                aria-label='查看全部发票'
                className={cn(
                  chipVariants({ fullWidth: true }),
                  'text-[var(--text-muted)] text-small'
                )}
              >
                查看全部
              </button>
            )}
          </div>
        </SettingsSection>
      )}
    </SettingsPanel>
  )
}
