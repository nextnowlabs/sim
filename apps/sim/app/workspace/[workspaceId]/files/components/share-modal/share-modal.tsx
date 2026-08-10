'use client'

import { useState } from 'react'
import {
  ButtonGroup,
  ButtonGroupItem,
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  TagInput,
  type TagItem,
} from '@sim/emcn'
import { Send } from '@sim/emcn/icons'
import { generateShortId } from '@sim/utils/id'
import { GeneratedPasswordInput } from '@/components/ui'
import type { ShareAuthType, ShareRecord } from '@/lib/api/contracts/public-shares'
import { getEnv, isTruthy } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import { useFileShare, useUpsertFileShare } from '@/hooks/queries/public-shares'
import { usePermissionConfig } from '@/hooks/use-permission-config'

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  fileId: string
  fileName: string
  /** Share state already known from the file row, used as the initial value to avoid flicker. */
  initialShare?: ShareRecord | null
}

type AccessMode = 'private' | ShareAuthType

const ACCESS_LABELS: Record<AccessMode, string> = {
  private: '私密',
  public: '公开',
  password: '密码',
  email: '邮箱',
  sso: 'SSO',
}

function savedMode(share: ShareRecord | null): AccessMode {
  if (!share?.isActive) return 'private'
  return share.authType
}

/** True when an entry is a valid email or an `@domain` pattern. */
function isValidEmailEntry(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('@') || quickValidateEmail(normalized).isValid
}

export function ShareModal({
  open,
  onOpenChange,
  workspaceId,
  fileId,
  fileName,
  initialShare,
}: ShareModalProps) {
  const { data: share, isFetched } = useFileShare(workspaceId, fileId, { enabled: open })
  const { config: permissionConfig } = usePermissionConfig()
  const upsertShare = useUpsertFileShare()

  const saved = share ?? initialShare ?? null
  const savedAccessMode = savedMode(saved)

  // Reserve a token on open (one per mount — the modal remounts each open) so the
  // link can be shown and copied before the first save; it's persisted on save.
  // Only used once we've confirmed no share row exists yet, so a copied link
  // always matches what gets stored.
  const [pendingToken] = useState(() => generateShortId())
  const noExistingShare = isFetched && !share && !initialShare
  const shareUrl = saved?.url ?? (noExistingShare ? `${getBaseUrl()}/f/${pendingToken}` : null)

  // `null` until the user changes the selector, so the control always reflects the
  // authoritative saved state (which may resolve after mount via useFileShare).
  const [draftMode, setDraftMode] = useState<AccessMode | null>(null)
  const [draftPassword, setDraftPassword] = useState('')
  const [draftEmails, setDraftEmails] = useState<string[] | null>(null)
  const effectiveMode = draftMode ?? savedAccessMode
  const effectiveActive = effectiveMode !== 'private'
  const effectiveEmails = draftEmails ?? saved?.allowedEmails ?? []

  // Org access-control may restrict which auth modes are allowed (`null` = all).
  // The route is the source of truth; this just hides disallowed options.
  const allowedAuthTypes = permissionConfig.allowedFileShareAuthTypes
  const isAuthTypeAllowed = (mode: ShareAuthType) =>
    allowedAuthTypes === null || allowedAuthTypes.includes(mode)

  const ssoEnabled = isTruthy(getEnv('NEXT_PUBLIC_SSO_ENABLED')) || savedAccessMode === 'sso'
  const candidateAuthTypes: ShareAuthType[] = [
    'public',
    'password',
    'email',
    ...(ssoEnabled ? (['sso'] as const) : []),
  ]
  // Keep the saved mode visible even if newly disallowed, so the current state shows.
  const accessModes: AccessMode[] = [
    'private',
    ...candidateAuthTypes.filter((mode) => isAuthTypeAllowed(mode) || mode === savedAccessMode),
  ]

  // The selected mode is blocked when org policy disables public sharing entirely
  // (enabling a new share) or when the chosen auth mode isn't allowed.
  const modeDisallowed = effectiveMode !== 'private' && !isAuthTypeAllowed(effectiveMode)
  const enableBlockedByPolicy =
    (permissionConfig.disablePublicFileSharing && !saved?.isActive) || modeDisallowed

  // A password share needs a secret: either one already stored or a freshly typed one.
  const passwordMissing =
    effectiveMode === 'password' && !saved?.hasPassword && draftPassword.trim().length === 0
  // Email/SSO shares need at least one allowed email/domain.
  const emailsMissing =
    (effectiveMode === 'email' || effectiveMode === 'sso') && effectiveEmails.length === 0

  const emailsDirty =
    draftEmails !== null &&
    JSON.stringify(draftEmails) !== JSON.stringify(saved?.allowedEmails ?? [])
  const isDirty =
    (draftMode !== null && draftMode !== savedAccessMode) ||
    (effectiveMode === 'password' && draftPassword.length > 0) ||
    ((effectiveMode === 'email' || effectiveMode === 'sso') && emailsDirty)

  const resetDraft = () => {
    setDraftMode(null)
    setDraftPassword('')
    setDraftEmails(null)
  }

  const handleClose = () => {
    resetDraft()
    onOpenChange(false)
  }

  const handleSave = () => {
    // Persist the reserved token only when creating the row; existing shares keep
    // their own token (the server ignores this on conflict).
    const base = { workspaceId, fileId, token: saved ? undefined : pendingToken }
    const vars =
      effectiveMode === 'private'
        ? { ...base, isActive: false as const }
        : effectiveMode === 'password'
          ? {
              ...base,
              isActive: true as const,
              authType: 'password' as const,
              password: draftPassword.trim() || undefined,
            }
          : effectiveMode === 'email' || effectiveMode === 'sso'
            ? {
                ...base,
                isActive: true as const,
                authType: effectiveMode,
                allowedEmails: effectiveEmails,
              }
            : { ...base, isActive: true as const, authType: 'public' as const }

    upsertShare.mutate(vars, {
      onSuccess: () => {
        resetDraft()
        onOpenChange(false)
      },
    })
  }

  const addEmail = (value: string): boolean => {
    const normalized = value.trim().toLowerCase()
    if (!normalized || effectiveEmails.includes(normalized) || !isValidEmailEntry(normalized)) {
      return false
    }
    setDraftEmails([...effectiveEmails, normalized])
    return true
  }

  const removeEmail = (_value: string, index: number) => {
    setDraftEmails(effectiveEmails.filter((_, i) => i !== index))
  }

  const accessHint = (() => {
    if (modeDisallowed) return '此共享方式已被管理员禁用。'
    if (enableBlockedByPolicy)
      return '此工作区的公开共享已被管理员禁用。'
    if (effectiveMode === 'private') return '只有工作区成员可以访问此文件。'
    if (effectiveMode === 'password')
      return '任何拥有链接和密码的人都可以查看并下载此文件。'
    if (effectiveMode === 'email')
      return '只有允许的邮箱在输入一次性验证码后才能访问此文件。'
    if (effectiveMode === 'sso')
      return '只有通过 SSO 登录的允许邮箱才能访问此文件。'
    return isDirty
      ? '保存后,任何拥有链接的人都可以访问此文件。'
      : '任何拥有链接的人都可以查看并下载此文件。'
  })()

  const emailItems: TagItem[] = effectiveEmails.map((value) => ({ value, isValid: true }))

  return (
    <ChipModal open={open} onOpenChange={handleClose} size='sm' srTitle={`共享 ${fileName}`}>
      <ChipModalHeader icon={Send} onClose={handleClose}>
        共享文件
      </ChipModalHeader>
      <ChipModalBody>
        <ChipModalField type='custom' title='访问权限' hint={accessHint}>
          <ButtonGroup
            value={effectiveMode}
            onValueChange={(value) => setDraftMode(value as AccessMode)}
            aria-label='文件访问'
          >
            {accessModes.map((mode) => (
              <ButtonGroupItem key={mode} value={mode}>
                {ACCESS_LABELS[mode]}
              </ButtonGroupItem>
            ))}
          </ButtonGroup>
        </ChipModalField>
        {effectiveMode === 'password' ? (
          <ChipModalField
            type='custom'
            title='密码'
            hint={
              saved?.hasPassword
                ? '留空以保留当前密码。'
                : '任何拥有链接的人都必须输入此密码。'
            }
          >
            <GeneratedPasswordInput
              value={draftPassword}
              onChange={setDraftPassword}
              placeholder={saved?.hasPassword ? '••••••••' : '输入密码'}
            />
          </ChipModalField>
        ) : null}
        {effectiveMode === 'email' || effectiveMode === 'sso' ? (
          <ChipModalField
            type='custom'
            title='允许的邮箱'
            hint='添加特定邮箱或整个域名(@example.com)。'
          >
            <TagInput
              items={emailItems}
              onAdd={addEmail}
              onRemove={removeEmail}
              placeholder='输入邮箱或域名'
              placeholderWithTags='添加邮箱'
            />
          </ChipModalField>
        ) : null}
        {effectiveMode !== 'private' && shareUrl ? (
          <ChipModalField type='copy' title='链接' value={shareUrl} copyLabel='复制链接' />
        ) : null}
      </ChipModalBody>
      <ChipModalFooter
        onCancel={handleClose}
        primaryAction={{
          label: upsertShare.isPending ? '保存中…' : '保存',
          onClick: handleSave,
          disabled:
            !isDirty ||
            upsertShare.isPending ||
            passwordMissing ||
            emailsMissing ||
            (effectiveActive && enableBlockedByPolicy),
        }}
      />
    </ChipModal>
  )
}
