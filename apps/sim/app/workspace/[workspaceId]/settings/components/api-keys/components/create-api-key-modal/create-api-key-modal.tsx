'use client'

import { useState } from 'react'
import {
  ButtonGroup,
  ButtonGroupItem,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  SecretReveal,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { type ApiKey, useCreateApiKey } from '@/hooks/queries/api-keys'

const logger = createLogger('CreateApiKeyModal')

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  existingKeyNames?: string[]
  allowPersonalApiKeys?: boolean
  canManageWorkspaceKeys?: boolean
  defaultKeyType?: 'personal' | 'workspace'
  source?: 'settings' | 'deploy_modal'
  onKeyCreated?: (key: ApiKey) => void
}

const EMPTY_KEY_NAMES: string[] = []

/**
 * Reusable modal for creating API keys.
 * Used in both the API keys settings page and the deploy modal.
 */
export function CreateApiKeyModal({
  open,
  onOpenChange,
  workspaceId,
  existingKeyNames = EMPTY_KEY_NAMES,
  allowPersonalApiKeys = true,
  canManageWorkspaceKeys = false,
  defaultKeyType = 'personal',
  source = 'settings',
  onKeyCreated,
}: CreateApiKeyModalProps) {
  const [keyName, setKeyName] = useState('')
  const [keyType, setKeyType] = useState<'personal' | 'workspace'>(defaultKeyType)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<ApiKey | null>(null)
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const createApiKeyMutation = useCreateApiKey()

  const handleCreateKey = async () => {
    const trimmedName = keyName.trim()
    if (!trimmedName) return

    const isDuplicate = existingKeyNames.some(
      (name) => name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (isDuplicate) {
      setCreateError(
        keyType === 'workspace'
          ? `名为"${trimmedName}"的工作区 API 密钥已存在,请选择其他名称。`
          : `名为"${trimmedName}"的个人 API 密钥已存在,请选择其他名称。`
      )
      return
    }

    setCreateError(null)
    try {
      const data = await createApiKeyMutation.mutateAsync({
        workspaceId,
        name: trimmedName,
        keyType,
        source,
      })

      setNewKey(data.key)
      setShowNewKeyDialog(true)
      setKeyName('')
      setKeyType(defaultKeyType)
      setCreateError(null)
      onOpenChange(false)
      onKeyCreated?.(data.key)
    } catch (error: unknown) {
      logger.error('API key creation failed:', { error })
      const errorMessage = getErrorMessage(error, '创建 API 密钥失败,请重试。')
      if (errorMessage.toLowerCase().includes('already exists')) {
        setCreateError(errorMessage)
      } else {
        setCreateError('创建 API 密钥失败,请检查网络连接后重试。')
      }
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setKeyName('')
    setKeyType(defaultKeyType)
    setCreateError(null)
  }

  return (
    <>
      {/* Create API Key Dialog */}
      <ChipModal open={open} onOpenChange={onOpenChange} srTitle='创建新的 API 密钥'>
        <ChipModalHeader onClose={handleClose}>创建新的 API 密钥</ChipModalHeader>
        <ChipModalBody>
          {canManageWorkspaceKeys && (
            <ChipModalField type='custom' title='API 密钥类型'>
              <ButtonGroup
                value={keyType}
                onValueChange={(value) => {
                  setKeyType(value as 'personal' | 'workspace')
                  if (createError) setCreateError(null)
                }}
              >
                <ButtonGroupItem value='personal' disabled={!allowPersonalApiKeys}>
                  个人
                </ButtonGroupItem>
                <ButtonGroupItem value='workspace'>工作区</ButtonGroupItem>
              </ButtonGroup>
            </ChipModalField>
          )}
          <ChipModalField
            type='input'
            title='为你的 API 密钥输入一个便于日后识别的名称。'
            value={keyName}
            onChange={(value) => {
              setKeyName(value)
              if (createError) setCreateError(null)
            }}
            placeholder='例如:开发环境、生产环境'
            autoComplete='off'
            required
          />
          {/* Hidden decoy fields to prevent browser autofill */}
          <input
            type='text'
            name='fakeusernameremembered'
            autoComplete='username'
            aria-hidden='true'
            style={{
              position: 'absolute',
              left: '-9999px',
              opacity: 0,
              pointerEvents: 'none',
            }}
            tabIndex={-1}
            readOnly
          />
          <ChipModalError>{createError}</ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={handleClose}
          primaryAction={{
            label: createApiKeyMutation.isPending ? '创建中...' : '创建',
            onClick: handleCreateKey,
            disabled:
              !keyName.trim() ||
              createApiKeyMutation.isPending ||
              (keyType === 'workspace' && !canManageWorkspaceKeys),
          }}
        />
      </ChipModal>

      {/* New API Key Dialog - shows the created key */}
      <ChipModal
        open={showNewKeyDialog}
        onOpenChange={(dialogOpen: boolean) => {
          setShowNewKeyDialog(dialogOpen)
          if (!dialogOpen) {
            setNewKey(null)
          }
        }}
        srTitle='你的 API 密钥已创建'
      >
        <ChipModalHeader onClose={() => setShowNewKeyDialog(false)}>
          你的 API 密钥已创建
        </ChipModalHeader>
        <ChipModalBody>
          <ChipModalField type='custom' title='请立即复制——之后将不再显示'>
            {newKey && <SecretReveal value={newKey.key} />}
          </ChipModalField>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setShowNewKeyDialog(false)}
          primaryAction={{ label: '完成', onClick: () => setShowNewKeyDialog(false) }}
        />
      </ChipModal>
    </>
  )
}
