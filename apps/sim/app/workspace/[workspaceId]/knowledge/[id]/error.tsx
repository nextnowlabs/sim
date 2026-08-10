'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function KnowledgeBaseError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载知识库'
      description='加载此知识库时出错,请重试。'
      loggerName='KnowledgeBaseError'
    />
  )
}
