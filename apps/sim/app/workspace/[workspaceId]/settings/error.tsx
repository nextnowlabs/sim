'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/app/workspace/[workspaceId]/components'

export default function SettingsError({ error, reset }: ErrorBoundaryProps) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title='无法加载设置'
      description='加载设置时出错,请重试。'
      loggerName='SettingsError'
    />
  )
}
