'use client'

import { useEffect, useState } from 'react'
import { Button, ChipInput, Tooltip } from '@sim/emcn'
import { Check, Clipboard, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { generatePassword } from '@/lib/core/security/encryption'

interface GeneratedPasswordInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  /** Show the Generate (random password) action. Off for consumer-facing entry forms. */
  showGenerate?: boolean
  required?: boolean
  autoComplete?: string
  error?: boolean
}

/**
 * Password field with reveal / copy / (optional) generate adornments, used by the
 * deploy-as-chat access controls and the file-share modal. Owns its show/copy UI
 * state; the caller owns the value.
 */
export function GeneratedPasswordInput({
  value,
  onChange,
  disabled = false,
  placeholder,
  showGenerate = true,
  required = false,
  autoComplete = 'new-password',
  error = false,
}: GeneratedPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  useEffect(() => {
    if (!copySuccess) return
    const timer = setTimeout(() => setCopySuccess(false), 2000)
    return () => clearTimeout(timer)
  }, [copySuccess])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(value)
    setCopySuccess(true)
  }

  return (
    <ChipInput
      type={showPassword ? 'text' : 'password'}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      autoComplete={autoComplete}
      error={error}
      endAdornment={
        <div className='flex items-center'>
          {showGenerate ? (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => onChange(generatePassword(24))}
                  disabled={disabled}
                  aria-label='生成密码'
                  className='!p-1.5'
                >
                  <RefreshCw className='size-3' />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <span>生成</span>
              </Tooltip.Content>
            </Tooltip.Root>
          ) : null}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                type='button'
                variant='ghost'
                onClick={copyToClipboard}
                disabled={!value || disabled}
                aria-label='复制密码'
                className='!p-1.5'
              >
                {copySuccess ? <Check className='size-3' /> : <Clipboard className='size-3' />}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <span>{copySuccess ? '已复制' : '复制'}</span>
            </Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Button
                type='button'
                variant='ghost'
                onClick={() => setShowPassword(!showPassword)}
                disabled={disabled}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className='!p-1.5'
              >
                {showPassword ? <EyeOff className='size-3' /> : <Eye className='size-3' />}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <span>{showPassword ? '隐藏' : '显示'}</span>
            </Tooltip.Content>
          </Tooltip.Root>
        </div>
      }
    />
  )
}
