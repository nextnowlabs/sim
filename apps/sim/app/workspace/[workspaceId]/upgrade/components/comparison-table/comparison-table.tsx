'use client'
import { chipVariants, cn } from '@sim/emcn'
import { SlackIcon } from '@/components/icons'
import { BillingPeriodToggle } from '@/app/workspace/[workspaceId]/upgrade/components/billing-period-toggle/billing-period-toggle'
import {
  type CellValue,
  COMPARISON_SECTIONS,
  PLAN_COLUMNS,
  type PlanName,
} from '@/app/workspace/[workspaceId]/upgrade/components/comparison-table/comparison-data'

/** Maps a cell-icon identifier to its brand icon component. */
const CELL_ICONS = { slack: SlackIcon } as const

/**
 * zh-CN labels for section titles in {@link COMPARISON_SECTIONS}. The shared
 * data file stays English for the public landing pricing page.
 */
const SECTION_TITLES: Record<string, string> = {
  'Credits & pricing': '积分与定价',
  'Workspaces & teams': '工作区与团队',
  'Rate limits (runs/min)': '速率限制(运行/分钟)',
  'Execution timeouts': '执行超时',
  'Storage & data': '存储与数据',
  Features: '功能',
} as const

/** zh-CN labels for row labels in {@link COMPARISON_SECTIONS}. */
const ROW_LABELS: Record<string, string> = {
  'Monthly credits': '每月积分',
  'Daily refresh': '每日刷新',
  Workspaces: '工作区',
  'Invite teammates': '邀请团队成员',
  'Sync executions': '同步执行',
  'Async executions': '异步执行',
  'API endpoint': 'API 端点',
  'Sync timeout': '同步超时',
  'Async timeout': '异步超时',
  'File storage': '文件存储',
  'Max tables': '最大表格数',
  'Max rows per table': '每张表最大行数',
  'Log retention': '日志保留',
  'Sim Mailer (Inbox)': 'Sim Mailer(收件箱)',
  'KB Live Sync': '知识库实时同步',
  'Slack Connect': 'Slack Connect',
  'Access Control': '访问控制',
  SSO: 'SSO',
  'SOC2 Compliance': 'SOC2 合规',
  'Self Hosting': '自托管',
  'Dedicated Support': '专属支持',
} as const

/** zh-CN labels for shared static cell values (units and plan-agnostic words). */
const VALUE_LABELS: Record<string, string> = {
  Unlimited: '无限',
  Custom: '自定义',
  '5 min': '5 分钟',
  '50 min': '50 分钟',
  '90 min': '90 分钟',
  '30 days': '30 天',
} as const

/** Resolve a display label from the shared English data, falling back to the raw value. */
function zhLabel(map: Record<string, string>, value: string): string {
  return map[value] ?? value
}

/**
 * Localize a cell value at render time: `true`/`false` render as icons/dashes,
 * object values as brand icons, and strings are mapped through {@link VALUE_LABELS}.
 */
function localizeValue(value: CellValue): CellValue {
  return typeof value === 'string' ? (VALUE_LABELS[value] ?? value) : value
}

/**
 * Resolved CTA for a plan column, mirroring the upgrade-page plan cards so the
 * table and cards stay in lockstep (same label, variant, and disabled state).
 */
export interface ComparisonPlanCta {
  label: string
  variant: 'primary' | 'border-shadow'
  onClick: () => void
  disabled?: boolean
}

/**
 * Props for {@link ComparisonTable}.
 */
export interface ComparisonTableProps {
  /**
   * Resolved Pro price string, e.g. `"$29"`.
   * Sourced from the page-level `proPrice` derived from `useUpgradeState`.
   */
  proPrice: string
  /**
   * Resolved Max price string, e.g. `"$79"`.
   * Sourced from the page-level `maxPrice` derived from `useUpgradeState`.
   */
  maxPrice: string
  /**
   * Whether annual billing is currently selected.
   * Shared with the page-level {@link BillingPeriodToggle} via a single state source.
   */
  isAnnual: boolean
  /**
   * Invoked when the in-table billing toggle changes.
   * Should point to the same setter as the page-level toggle.
   */
  onIsAnnualChange: (isAnnual: boolean) => void
  /**
   * Resolved CTA per plan column, mirroring the upgrade-page plan cards. Plans
   * without an entry (e.g. Free) render no button.
   */
  ctas: Partial<Record<PlanName, ComparisonPlanCta>>
}

/**
 * Inline check icon — matches the card-level `CheckIcon` shape.
 */
function CheckIcon() {
  return (
    <svg
      width='14'
      height='14'
      viewBox='0 0 14 14'
      fill='none'
      aria-hidden='true'
      className='size-[14px] flex-shrink-0'
    >
      <path
        d='M2.5 7L5.5 10L11.5 4'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

/**
 * Renders a single cell value: `true` → check icon, `false` → em-dash, string → text.
 */
function Cell({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <span className='flex justify-center text-[var(--text-primary)]'>
        <CheckIcon />
      </span>
    )
  }
  if (value === false) {
    return (
      <span className='flex select-none justify-center text-[var(--text-muted)] text-base'>—</span>
    )
  }
  if (typeof value === 'object') {
    const Icon = CELL_ICONS[value.icon]
    return (
      <span className='flex justify-center'>
        <Icon className='size-[14px] flex-shrink-0' />
      </span>
    )
  }
  return (
    <span className='block text-center text-[var(--text-primary)] text-small tabular-nums'>
      {value}
    </span>
  )
}

/**
 * Full plan-comparison table. Renders all sections from {@link COMPARISON_SECTIONS}
 * mapped over generically — no per-cell copy-paste. Prices for Pro and Max are
 * supplied as props so they stay in sync with the billing-period toggle in the
 * parent page.
 *
 * The top-left cell contains a "Compare plans" heading, a subtitle, and a
 * {@link BillingPeriodToggle} that shares state with the page-level toggle via
 * the `isAnnual` / `onIsAnnualChange` props.
 *
 * @example
 * ```tsx
 * <ComparisonTable
 *   proPrice={`$${proPrice}`}
 *   maxPrice={`$${maxPrice}`}
 *   isAnnual={state.isAnnual}
 *   onIsAnnualChange={state.setIsAnnual}
 *   ctas={{ Pro: proCta, Max: maxCta, Enterprise: enterpriseCta }}
 * />
 * ```
 */
export function ComparisonTable({
  proPrice,
  maxPrice,
  isAnnual,
  onIsAnnualChange,
  ctas,
}: ComparisonTableProps) {
  const runtimePrices: Partial<Record<PlanName, string>> = {
    Pro: proPrice,
    Max: maxPrice,
  }

  return (
    <div className='w-full overflow-x-auto rounded-xl border border-[var(--border-1)]'>
      {/* CSS grid: 1 label col + 4 equal plan cols */}
      <div className='grid min-w-[640px] grid-cols-[1fr_repeat(4,minmax(0,1fr))]'>
        {/* ── Column headers ── */}
        {/* Top-left cell: title, subtitle, and billing toggle */}
        <div className='flex h-full flex-col justify-between gap-3 border-[var(--border)] border-r bg-[var(--surface-1)] px-4 py-4'>
          <div className='flex flex-col gap-0.5'>
            <span className='font-medium text-[var(--text-primary)] text-base'>对比套餐</span>
            <span className='text-[var(--text-muted)] text-small'>找到适合你的套餐</span>
          </div>
          <BillingPeriodToggle
            isAnnual={isAnnual}
            onChange={onIsAnnualChange}
            annualLabel='按年'
            monthlyLabel='按月'
            ariaLabel='计费周期'
          />
        </div>

        {PLAN_COLUMNS.map((col) => {
          const price = runtimePrices[col.name] ?? col.staticPrice ?? ''
          const cta = ctas[col.name]

          return (
            <div
              key={col.name}
              className='flex flex-col items-center gap-1 bg-[var(--surface-2)] px-3 py-4 text-center'
            >
              <span className='font-medium text-[var(--text-primary)] text-base'>{col.name}</span>
              <span className='font-medium text-[var(--text-primary)] text-md tabular-nums'>
                {price}
              </span>
              {cta && (
                <button
                  type='button'
                  onClick={cta.onClick}
                  disabled={cta.disabled}
                  aria-label={`${cta.label} — ${col.name}`}
                  className={cn(
                    chipVariants({ variant: cta.variant, fullWidth: true, flush: true }),
                    'mt-2 w-full justify-center'
                  )}
                >
                  {cta.label}
                </button>
              )}
            </div>
          )
        })}

        {/* ── Sections ── */}
        {COMPARISON_SECTIONS.map((section, sectionIdx) => (
          <div key={section.title} className='contents'>
            {/* Section header row — split so the left-column separator stays continuous */}
            <div
              className={cn(
                'border-[var(--border)] border-r bg-[var(--surface-1)] px-4 py-2',
                sectionIdx > 0 && 'border-[var(--border-1)] border-t'
              )}
            >
              <span className='font-medium text-[var(--text-primary)] text-small'>
                {zhLabel(SECTION_TITLES, section.title)}
              </span>
            </div>
            <div
              className={cn(
                'col-span-4 bg-[var(--surface-2)]',
                sectionIdx > 0 && 'border-[var(--border-1)] border-t'
              )}
            />

            {/* Feature rows */}
            {section.rows.map((row, rowIdx) => (
              <div key={row.label} className='contents'>
                {/* Label */}
                <div
                  className={cn(
                    'flex items-center border-[var(--border)] border-r bg-[var(--surface-1)] px-4 py-2.5',
                    rowIdx < section.rows.length - 1 && 'border-[var(--border-1)] border-b'
                  )}
                >
                  <span className='text-[var(--text-body)] text-small'>
                    {zhLabel(ROW_LABELS, row.label)}
                  </span>
                </div>

                {/* Plan cells */}
                {row.values.map((value, colIdx) => (
                  <div
                    key={PLAN_COLUMNS[colIdx].name}
                    className={cn(
                      'flex items-center justify-center bg-[var(--surface-2)] px-3 py-2.5',
                      rowIdx < section.rows.length - 1 && 'border-[var(--border-1)] border-b'
                    )}
                  >
                    <Cell value={localizeValue(value)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
