'use client'

import type { ReactNode } from 'react'
import { ChipSwitch, ChipTag } from '@sim/emcn'
import { ANNUAL_DISCOUNT_RATE } from '@/lib/billing/constants'

/**
 * Props for {@link BillingPeriodToggle}.
 */
export interface BillingPeriodToggleProps {
  /** Whether the annual billing period is currently selected. */
  isAnnual: boolean
  /** Invoked with the next selection when a segment is clicked. */
  onChange: (isAnnual: boolean) => void
  /** Optional additional classes merged onto the container. */
  className?: string
  /** Label for the annual segment. Defaults to English for shared/landing usage. */
  annualLabel?: ReactNode
  /** Label for the monthly segment. Defaults to English for shared/landing usage. */
  monthlyLabel?: ReactNode
  /** Accessible name for the switch. Defaults to English for shared/landing usage. */
  ariaLabel?: string
}

/**
 * Discount label derived from the real billing constant so it stays in sync if
 * the rate changes (e.g. `0.15` renders as `-15%`).
 */
const DISCOUNT_LABEL = `-${Math.round(ANNUAL_DISCOUNT_RATE * 100)}%`

type Period = 'annual' | 'monthly'

/**
 * Annual / monthly billing-period segmented switch. Built on {@link ChipSwitch}
 * with an inline brand-tinted discount badge on the annual segment.
 */
export function BillingPeriodToggle({
  isAnnual,
  onChange,
  className,
  annualLabel = 'Annual',
  monthlyLabel = 'Monthly',
  ariaLabel = 'Billing period',
}: BillingPeriodToggleProps) {
  return (
    <ChipSwitch<Period>
      aria-label={ariaLabel}
      value={isAnnual ? 'annual' : 'monthly'}
      onChange={(next) => onChange(next === 'annual')}
      className={className}
      options={[
        {
          value: 'annual',
          label: (
            <>
              {annualLabel}
              <ChipTag variant='mono' className={isAnnual ? undefined : 'text-inherit'}>
                {DISCOUNT_LABEL}
              </ChipTag>
            </>
          ),
        },
        { value: 'monthly', label: monthlyLabel },
      ]}
    />
  )
}
