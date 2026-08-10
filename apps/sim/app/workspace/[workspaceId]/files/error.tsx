'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function FilesError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载文件'
      description='加载文件时出错,请重试。'
      loggerName='FilesError'
    />
  )
}
