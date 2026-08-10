'use client'

import { Button, Combobox, Input } from '@sim/emcn'
import type { WorkflowSearchReplacementOption } from '@/lib/workflows/search-replace/types'

interface ReplacementControlsProps {
  replacement: string
  compatibleResourceOptions: WorkflowSearchReplacementOption[]
  usesResourceReplacement: boolean
  eligibleCount: number
  disabled?: boolean
  isApplying?: boolean
  canReplaceActive: boolean
  canReplaceAll: boolean
  onReplacementChange: (replacement: string) => void
  onReplaceActive: () => void
  onReplaceAll: () => void
}

export function ReplacementControls({
  replacement,
  compatibleResourceOptions,
  usesResourceReplacement,
  eligibleCount,
  disabled,
  isApplying,
  canReplaceActive,
  canReplaceAll,
  onReplacementChange,
  onReplaceActive,
  onReplaceAll,
}: ReplacementControlsProps) {
  return (
    <div className='space-y-2'>
      {usesResourceReplacement ? (
        <Combobox
          options={compatibleResourceOptions.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          value={replacement}
          onChange={onReplacementChange}
          placeholder='选择替换资源…'
          searchable
          searchPlaceholder='搜索资源…'
          emptyMessage='没有可用的有效替换项'
          disabled={disabled || compatibleResourceOptions.length === 0}
        />
      ) : (
        <Input
          value={replacement}
          placeholder='替换为'
          disabled={disabled}
          onChange={(event) => onReplacementChange(event.target.value)}
        />
      )}

      <div className='flex items-center justify-between gap-2'>
        <span className='text-[var(--text-muted)] text-xs'>
          {eligibleCount} 处可替换匹配
        </span>
        <div className='flex gap-1.5'>
          <Button
            className='h-8 px-2 text-xs'
            variant='default'
            disabled={disabled || isApplying || !canReplaceActive}
            onClick={onReplaceActive}
          >
            替换
          </Button>
          <Button
            className='h-8 px-2 text-xs'
            variant='active'
            disabled={disabled || isApplying || !canReplaceAll}
            onClick={onReplaceAll}
          >
            {isApplying ? '替换中…' : '全部替换'}
          </Button>
        </div>
      </div>
    </div>
  )
}
