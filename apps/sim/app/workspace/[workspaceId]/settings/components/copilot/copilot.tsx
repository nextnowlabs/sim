'use client'

import { useMemo, useState } from 'react'
import {
  Chip,
  ChipConfirmModal,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  SecretReveal,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { formatDate } from '@sim/utils/formatting'
import { Plus } from 'lucide-react'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'
import type { SettingsAction } from '@/app/workspace/[workspaceId]/settings/components/settings-header/settings-header'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  type CopilotKey,
  useCopilotKeys,
  useDeleteCopilotKey,
  useGenerateCopilotKey,
} from '@/hooks/queries/copilot-keys'

const logger = createLogger('CopilotSettings')

/** Formats a key's last-used timestamp, falling back to "Never" when unset. */
function formatLastUsed(dateString?: string | null): string {
  if (!dateString) return '从未使用'
  return formatDate(new Date(dateString))
}

/**
 * Copilot Keys management component for handling API keys used with the Copilot feature.
 * Provides functionality to create, view, and delete copilot API keys.
 */
export function Copilot() {
  const { data: keys = [], isLoading } = useCopilotKeys()
  const generateKey = useGenerateCopilotKey()
  const deleteKeyMutation = useDeleteCopilotKey()

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const [deleteKey, setDeleteKey] = useState<CopilotKey | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const filteredKeys = useMemo(() => {
    if (!searchTerm.trim()) return keys
    const term = searchTerm.toLowerCase()
    return keys.filter(
      (key) =>
        key.name?.toLowerCase().includes(term) || key.displayKey?.toLowerCase().includes(term)
    )
  }, [keys, searchTerm])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return

    const trimmedName = newKeyName.trim()
    const isDuplicate = keys.some((k) => k.name === trimmedName)
    if (isDuplicate) {
      setCreateError(`名为"${trimmedName}"的对话 API 密钥已存在,请选择其他名称。`)
      return
    }

    setCreateError(null)
    try {
      const data = await generateKey.mutateAsync({ name: trimmedName })
      if (data?.key?.apiKey) {
        setNewKey(data.key.apiKey)
        setShowNewKeyDialog(true)
        setNewKeyName('')
        setCreateError(null)
        setIsCreateDialogOpen(false)
      }
    } catch (error) {
      logger.error('Failed to generate copilot API key', { error })
      setCreateError('创建 API 密钥失败,请检查网络连接后重试。')
    }
  }

  const handleDeleteKey = async () => {
    if (!deleteKey) return
    try {
      setShowDeleteDialog(false)
      const keyToDelete = deleteKey
      setDeleteKey(null)

      await deleteKeyMutation.mutateAsync({ keyId: keyToDelete.id })
    } catch (error) {
      logger.error('Failed to delete copilot API key', { error })
    }
  }

  const hasKeys = keys.length > 0
  const showEmptyState = !hasKeys
  const showNoResults = searchTerm.trim() && filteredKeys.length === 0 && keys.length > 0

  const actions: SettingsAction[] = [
    {
      text: '创建 API 密钥',
      icon: Plus,
      variant: 'primary',
      onSelect: () => {
        setIsCreateDialogOpen(true)
        setCreateError(null)
      },
      disabled: isLoading,
    },
  ]

  return (
    <>
      <SettingsPanel
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: '搜索 API 密钥...',
        }}
        actions={actions}
      >
        {isLoading ? null : showEmptyState ? (
          <SettingsEmptyState>点击上方"创建 API 密钥"以开始使用</SettingsEmptyState>
        ) : (
          <div className='flex flex-col gap-2'>
            {filteredKeys.map((key) => (
              <div key={key.id} className='flex items-center justify-between gap-3'>
                <div className='flex min-w-0 flex-col justify-center gap-[1px]'>
                  <div className='flex items-center gap-1.5'>
                    <span className='max-w-[280px] truncate text-[14px] text-[var(--text-body)]'>
                      {key.name || '未命名密钥'}
                    </span>
                    <span className='text-[var(--text-secondary)] text-sm'>
                      (上次使用:{formatLastUsed(key.lastUsed).toLowerCase()})
                    </span>
                  </div>
                  <p className='truncate text-[12px] text-[var(--text-muted)]'>{key.displayKey}</p>
                </div>
                <Chip
                  className='flex-shrink-0'
                  onClick={() => {
                    setDeleteKey(key)
                    setShowDeleteDialog(true)
                  }}
                >
                  删除
                </Chip>
              </div>
            ))}
            {showNoResults && (
              <SettingsEmptyState variant='inline'>
                未找到匹配"{searchTerm}"的 API 密钥
              </SettingsEmptyState>
            )}
          </div>
        )}
      </SettingsPanel>

      <ChipModal
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        srTitle='创建新的 API 密钥'
      >
        <ChipModalHeader onClose={() => setIsCreateDialogOpen(false)}>
          创建新的 API 密钥
        </ChipModalHeader>
        <ChipModalBody>
          <p className='px-2 text-[var(--text-secondary)] text-sm'>
            此密钥将允许访问对话功能。创建后请务必立即复制,之后将无法再次查看。
          </p>
          <ChipModalField
            type='input'
            title='密钥名称'
            value={newKeyName}
            onChange={(value) => {
              setNewKeyName(value)
              if (createError) setCreateError(null)
            }}
            placeholder='例如:开发环境、生产环境'
            required
          />
          <ChipModalError>{createError}</ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => {
            setIsCreateDialogOpen(false)
            setNewKeyName('')
            setCreateError(null)
          }}
          primaryAction={{
            label: generateKey.isPending ? '创建中...' : '创建',
            onClick: handleCreateKey,
            disabled: !newKeyName.trim() || generateKey.isPending,
          }}
        />
      </ChipModal>

      <ChipModal
        open={showNewKeyDialog}
        onOpenChange={(open) => {
          setShowNewKeyDialog(open)
          if (!open) {
            setNewKey(null)
          }
        }}
        srTitle='你的 API 密钥已创建'
      >
        <ChipModalHeader
          onClose={() => {
            setShowNewKeyDialog(false)
            setNewKey(null)
          }}
        >
          你的 API 密钥已创建
        </ChipModalHeader>
        <ChipModalBody>
          <ChipModalField type='custom' title='请立即复制——之后将不再显示'>
            {newKey && <SecretReveal value={newKey} />}
          </ChipModalField>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => {
            setShowNewKeyDialog(false)
            setNewKey(null)
          }}
          primaryAction={{
            label: '完成',
            onClick: () => {
              setShowNewKeyDialog(false)
              setNewKey(null)
            },
          }}
        />
      </ChipModal>

      <ChipConfirmModal
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDialog(false)
            setDeleteKey(null)
          }
        }}
        srTitle='删除 API 密钥'
        title='删除 API 密钥'
        text={[
          '删除 ',
          { text: deleteKey?.name || '未命名密钥', bold: true },
          ' ',
          { text: '将立即撤销使用它的所有集成的访问权限。', error: true },
          ' 此操作无法撤销。',
        ]}
        confirm={{
          label: '删除',
          onClick: handleDeleteKey,
          pending: deleteKeyMutation.isPending,
          pendingLabel: '删除中...',
        }}
      />
    </>
  )
}
