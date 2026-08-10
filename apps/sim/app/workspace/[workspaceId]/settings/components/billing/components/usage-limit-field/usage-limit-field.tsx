'use client'

import { useEffect, useRef, useState } from 'react'
import { ChipInput, Info, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { ON_DEMAND_UNLIMITED } from '@/lib/billing/constants'
import { creditsToDollars, dollarsToCredits } from '@/lib/billing/credits/conversion'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { useUpdateOrganizationUsageLimit } from '@/hooks/queries/organization'
import { useUpdateUsageLimit } from '@/hooks/queries/subscription'
import { useDebounce } from '@/hooks/use-debounce'

/** Delay before a usage-limit edit is auto-saved once the user stops typing. */
const AUTOSAVE_DELAY_MS = 1000

/** Static help accessory for the usage-limit header; hoisted so it's a stable reference. */
const USAGE_LIMIT_INFO = (
  <Info side='top' className='text-[var(--text-muted)]'>
    {
      '每月最多可消耗的用量,以积分(credits)为单位——Sim 的用量单位(1,000 积分 = $5)。默认等于你套餐的包含用量,你也可以设置更高。'
    }
  </Info>
)

interface UsageLimitFieldProps {
  /** Current monthly usage limit, in dollars. */
  currentLimit: number
  /** Lowest limit the plan allows, in dollars. */
  minimumLimit: number
  /** Whether the viewer may edit the limit (org admins / solo paid users). */
  canEdit: boolean
  /** Routes the save to the user or organization mutation. */
  context: 'user' | 'organization'
  /** Required when {@link context} is `'organization'`. */
  organizationId?: string
}

/**
 * Editable monthly usage-limit field. Seeds from the resolved limit and
 * auto-saves a debounced, validated value to either the user or the
 * organization — matching the Subscription tab's edit logic. When the viewer
 * cannot edit (e.g. a non-admin team member) the resolved value is shown
 * read-only.
 */
export function UsageLimitField({
  currentLimit,
  minimumLimit,
  canEdit,
  context,
  organizationId,
}: UsageLimitFieldProps) {
  const { mutate: saveUserLimit } = useUpdateUsageLimit()
  const { mutate: saveOrgLimit } = useUpdateOrganizationUsageLimit()

  const [draft, setDraft] = useState('')
  const debouncedDraft = useDebounce(draft, AUTOSAVE_DELAY_MS)
  const syncedRef = useRef<number | null>(null)
  /**
   * Read the latest limit inside the auto-save effect WITHOUT making it a
   * dependency. If `currentLimit` were a dep, an external change (e.g. the
   * on-demand toggle optimistically bumping the limit) would re-run the effect
   * with a stale `debouncedDraft` and save the old value, clobbering the toggle.
   */
  const currentLimitRef = useRef(currentLimit)
  currentLimitRef.current = currentLimit

  useEffect(() => {
    if (currentLimit == null || syncedRef.current === currentLimit) return
    // Display in credits; the prop is dollars. Integer credits round-trip exactly
    // through creditsToDollars/dollarsToCredits, so the value never drifts. The
    // on-demand "uncapped" sentinel renders as a blank field (No Usage Limit
    // placeholder) rather than a meaningless giant credit number.
    const lastSyncedDraft =
      syncedRef.current == null || syncedRef.current >= ON_DEMAND_UNLIMITED
        ? ''
        : String(dollarsToCredits(syncedRef.current))
    const isClean = draft === '' || draft === lastSyncedDraft
    syncedRef.current = currentLimit
    if (isClean) {
      setDraft(currentLimit >= ON_DEMAND_UNLIMITED ? '' : String(dollarsToCredits(currentLimit)))
    }
  }, [currentLimit, draft])

  useEffect(() => {
    if (!canEdit) return
    const currentLimit = currentLimitRef.current
    if (currentLimit == null || debouncedDraft.trim() === '') return
    const parsedCredits = Number.parseFloat(debouncedDraft)
    if (Number.isNaN(parsedCredits)) {
      toast.error('用量上限必须是数字')
      return
    }
    if (parsedCredits === dollarsToCredits(currentLimit)) return
    const minimumCredits = dollarsToCredits(minimumLimit)
    if (parsedCredits < minimumCredits) {
      toast.error(`用量上限至少为 ${minimumCredits.toLocaleString()} 积分`)
      return
    }

    // Store dollars; the input is credits. Convert once at the boundary.
    const limitDollars = creditsToDollars(parsedCredits)
    const onError = (error: unknown) => {
      toast.error('更新用量上限失败', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
    }

    if (context === 'organization') {
      if (!organizationId) {
        toast.error('更新用量上限失败', {
          description: '组织账单上下文不可用,请刷新后重试。',
        })
        return
      }
      saveOrgLimit({ organizationId, limit: limitDollars }, { onError })
      return
    }

    saveUserLimit({ limit: limitDollars }, { onError })
  }, [debouncedDraft, minimumLimit, canEdit, context, organizationId, saveOrgLimit, saveUserLimit])

  return (
    <SettingsSection label='用量上限' headerAccessory={USAGE_LIMIT_INFO}>
      <ChipInput
        type='number'
        inputMode='numeric'
        min={dollarsToCredits(minimumLimit)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={
          currentLimit == null
            ? '输入每月用量上限'
            : currentLimit >= ON_DEMAND_UNLIMITED
              ? '无限用量'
              : String(dollarsToCredits(currentLimit))
        }
        disabled={!canEdit}
        inputClassName='[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
      />
    </SettingsSection>
  )
}
