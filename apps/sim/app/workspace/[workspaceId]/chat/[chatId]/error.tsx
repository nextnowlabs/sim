'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function ChatError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载对话'
      description='加载对话时出错,请重试。'
      loggerName='ChatError'
    />
  )
}
