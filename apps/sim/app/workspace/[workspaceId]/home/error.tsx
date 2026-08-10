'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function HomeError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载首页'
      description='加载工作区首页时出错,请重试。'
      loggerName='HomeError'
    />
  )
}
