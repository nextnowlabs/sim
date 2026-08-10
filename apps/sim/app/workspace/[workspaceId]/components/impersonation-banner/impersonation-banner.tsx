'use client'

import { useState } from 'react'
import { Banner } from '@sim/emcn'
import { useSession } from '@/lib/auth/auth-client'
import { useStopImpersonating } from '@/hooks/queries/admin-users'

function getImpersonationBannerText(userLabel: string, userEmail?: string) {
  return `正在模拟 ${userLabel}${userEmail ? ` (${userEmail})` : ''}。在切换回原账号前,更改将作用于该账号。`
}

export function ImpersonationBanner() {
  const { data: session, isPending } = useSession()
  const stopImpersonating = useStopImpersonating()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const userLabel = session?.user?.name || '该用户'
  const userEmail = session?.user?.email

  if (isPending || !session?.session?.impersonatedBy) {
    return null
  }

  return (
    <Banner
      variant='destructive'
      text={getImpersonationBannerText(userLabel, userEmail)}
      textClassName='text-red-700 dark:text-red-300'
      actionLabel={
        stopImpersonating.isPending || isRedirecting ? '正在返回…' : '停止模拟'
      }
      actionVariant='destructive'
      actionDisabled={stopImpersonating.isPending || isRedirecting}
      onAction={() =>
        stopImpersonating.mutate(undefined, {
          onError: () => {
            setIsRedirecting(false)
          },
          onSuccess: () => {
            setIsRedirecting(true)
            window.location.assign('/workspace')
          },
        })
      }
    />
  )
}
