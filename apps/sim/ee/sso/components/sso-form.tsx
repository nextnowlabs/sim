'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@sim/logger'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { client } from '@/lib/auth/auth-client'
import { env, isFalsy } from '@/lib/core/config/env'
import { validateCallbackUrl } from '@/lib/core/security/input-validation'
import { AuthSubmitButton } from '@/app/(auth)/components'

const logger = createLogger('SSOForm')

interface SSOFormProps {
  providerId: string
}

export default function SSOForm({ providerId }: SSOFormProps) {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [callbackUrl, setCallbackUrl] = useState('/workspace')
  const initiatedRef = useRef(false)

  useEffect(() => {
    if (!searchParams) return

    const callback = searchParams.get('callbackUrl')
    if (callback) {
      if (validateCallbackUrl(callback)) {
        setCallbackUrl(callback)
      } else {
        logger.warn('Invalid callback URL detected and blocked:', { url: callback })
      }
    }

    const errorParam = searchParams.get('error')
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        account_not_found:
          'No account found. Please contact your administrator to set up SSO access.',
        sso_failed: 'SSO authentication failed. Please try again.',
        invalid_provider: 'SSO provider not configured correctly.',
      }
      setError(errorMessages[errorParam] || 'SSO authentication failed. Please try again.')
      setIsLoading(false)
      return
    }

    if (!initiatedRef.current) {
      initiatedRef.current = true
      initiateSSO(callback || '/workspace')
    }
  }, [searchParams])

  const initiateSSO = useCallback(async (cbUrl: string) => {
    setIsLoading(true)
    setError(null)

    try {
      await client.signIn.sso({
        providerId,
        callbackURL: cbUrl,
        errorCallbackURL: `/sso?error=sso_failed&callbackUrl=${encodeURIComponent(cbUrl)}`,
      })
    } catch (err) {
      logger.error('SSO sign-in failed', { error: err, providerId })
      let errorMessage = 'SSO sign-in failed. Please try again.'
      if (err instanceof Error) {
        if (err.message.includes('NO_PROVIDER_FOUND')) {
          errorMessage = 'SSO provider not found. Please check your configuration.'
        } else if (err.message.includes('network')) {
          errorMessage = 'Network error. Please check your connection and try again.'
        } else if (err.message.includes('rate limit')) {
          errorMessage = 'Too many requests. Please wait a moment before trying again.'
        } else if (err.message.includes('SSO_DISABLED')) {
          errorMessage = 'SSO authentication is disabled. Please use another sign-in method.'
        } else {
          errorMessage = err.message
        }
      }
      setError(errorMessage)
      setIsLoading(false)
      initiatedRef.current = false
    }
  }, [providerId])

  return (
    <>
      <div className='space-y-1 text-center'>
        <h1
          className={
            'text-balance text-[40px] text-[var(--text-primary)] leading-[110%] tracking-[-0.02em]'
          }
        >
          {error ? 'SSO sign-in failed' : 'Signing you in…'}
        </h1>
        <p
          className={
            'text-[color-mix(in_srgb,var(--text-muted)_60%,transparent)] text-lg leading-[125%] tracking-[0.02em]'
          }
        >
          {error
            ? error
            : 'Redirecting to your identity provider…'}
        </p>
      </div>

      {error && (
        <div className='mt-8'>
          <AuthSubmitButton loadingLabel='Redirecting…' type='button' onClick={() => initiateSSO(callbackUrl)}>
            Try again
          </AuthSubmitButton>
        </div>
      )}

      {!isFalsy(env.NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED) && (
        <div className='pt-6 text-center font-light text-base'>
          <span className='font-normal'>Want to use a different method? </span>
          <Link
            href={`/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}
            className='font-medium text-[var(--text-primary)] underline-offset-4 transition hover:underline'
          >
            Sign in with email
          </Link>
        </div>
      )}
    </>
  )
}
