'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function SkillsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载技能'
      description='加载技能时出错,请重试。'
      loggerName='SkillsError'
    />
  )
}
