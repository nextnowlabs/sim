'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function ScheduledTasksError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载定时任务'
      description='加载定时任务时出错,请重试。'
      loggerName='ScheduledTasksError'
    />
  )
}
