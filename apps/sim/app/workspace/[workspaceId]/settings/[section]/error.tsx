'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function SettingsSectionError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='出了点问题'
      description='发生了意外错误。请重试或刷新页面。'
      loggerName='SettingsSectionError'
    />
  )
}
