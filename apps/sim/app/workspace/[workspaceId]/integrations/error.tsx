'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function IntegrationsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载集成'
      description='加载集成时出错,请重试。'
      loggerName='IntegrationsError'
    />
  )
}
