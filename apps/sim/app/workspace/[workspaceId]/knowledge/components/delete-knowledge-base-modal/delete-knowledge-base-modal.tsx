'use client'

import { memo } from 'react'
import { ChipConfirmModal } from '@sim/emcn'

interface DeleteKnowledgeBaseModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean
  /**
   * Callback when modal should close
   */
  onClose: () => void
  /**
   * Callback when delete is confirmed
   */
  onConfirm: () => void
  /**
   * Whether the delete operation is in progress
   */
  isDeleting: boolean
  /**
   * Name of the knowledge base being deleted
   */
  knowledgeBaseName?: string
}

/**
 * Delete confirmation modal for knowledge base items.
 * Displays a warning message and confirmation buttons.
 */
export const DeleteKnowledgeBaseModal = memo(function DeleteKnowledgeBaseModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  knowledgeBaseName,
}: DeleteKnowledgeBaseModalProps) {
  return (
    <ChipConfirmModal
      open={isOpen}
      onOpenChange={onClose}
      srTitle='删除知识库'
      title='删除知识库'
      text={
        knowledgeBaseName
          ? [
              '确定要删除 ',
              { text: knowledgeBaseName, bold: true },
              ' 吗?',
              {
                text: '所有关联的文档、分块和向量数据都将被移除。',
                error: true,
              },
              ' 你可以在设置中的"最近删除"里恢复它。',
            ]
          : [
              '确定要删除此知识库吗?',
              {
                text: '所有关联的文档、分块和向量数据都将被移除。',
                error: true,
              },
              ' 你可以在设置中的"最近删除"里恢复它。',
            ]
      }
      confirm={{
        label: '删除',
        onClick: onConfirm,
        pending: isDeleting,
        pendingLabel: '删除中…',
      }}
    />
  )
})
