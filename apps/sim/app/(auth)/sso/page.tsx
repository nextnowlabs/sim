import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { env } from '@/lib/core/config/env'
import { isSsoEnabled } from '@/lib/core/config/env-flags'
import SSOForm from '@/ee/sso/components/sso-form'

export const metadata: Metadata = {
  title: 'Single Sign-On',
}

export const dynamic = 'force-dynamic'

export default async function SSOPage() {
  if (!isSsoEnabled) {
    redirect('/login')
  }

  const providerId = env.SSO_PROVIDER_ID
  if (!providerId) {
    redirect('/login')
  }

  return (
    <Suspense fallback={null}>
      <SSOForm providerId={providerId} />
    </Suspense>
  )
}
