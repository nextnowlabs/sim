'use client'

import { useState } from 'react'
import { ChipConfirmModal, type ChipConfirmTextSegment, ChipModalField } from '@sim/emcn'

interface DeleteModalProps {
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
   * Type of item being deleted
   * - 'mixed' is used when both workflows and folders are selected
   */
  itemType: 'workflow' | 'folder' | 'workspace' | 'mixed' | 'task'
  /**
   * Name(s) of the item(s) being deleted (optional, for display)
   * Can be a single name or an array of names for multiple items
   */
  itemName?: string | string[]
}

/**
 * Reusable delete confirmation modal for workflow, folder, and workspace items.
 * Displays a warning message and confirmation buttons.
 *
 * @param props - Component props
 * @returns Delete confirmation modal
 */
export function DeleteModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  itemType,
  itemName,
}: DeleteModalProps) {
  const [confirmationText, setConfirmationText] = useState('')
  const [prevIsOpen, setPrevIsOpen] = useState(false)

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setConfirmationText('')
    }
  }

  const isMultiple = Array.isArray(itemName) && itemName.length > 1
  const isSingle = !isMultiple

  const displayNames = Array.isArray(itemName) ? itemName : itemName ? [itemName] : []

  const isWorkspace = itemType === 'workspace'
  const workspaceName = isWorkspace && displayNames.length > 0 ? displayNames[0] : ''
  const isConfirmed = !isWorkspace || confirmationText === workspaceName

  let title = ''
  if (itemType === 'workflow') {
    title = isMultiple ? '删除工作流' : '删除工作流'
  } else if (itemType === 'folder') {
    title = isMultiple ? '删除文件夹' : '删除文件夹'
  } else if (itemType === 'task') {
    title = isMultiple ? '删除对话' : '删除对话'
  } else if (itemType === 'mixed') {
    title = '删除所选项目'
  } else {
    title = '删除工作区'
  }

  const restorableTypes = new Set<string>(['workflow', 'folder', 'mixed'])

  const buildDescriptionSegments = (): ChipConfirmTextSegment[] => {
    if (itemType === 'workflow') {
      const warning = {
        text: '所有关联的节点、执行记录和配置都将被移除。',
        error: true,
      }
      if (isMultiple) {
        return ['确定要删除 ', { text: displayNames.join(', '), bold: true }, ' 吗？', warning]
      }
      if (isSingle && displayNames.length > 0) {
        return ['确定要删除 ', { text: displayNames[0], bold: true }, ' 吗？', warning]
      }
      return ['确定要删除此工作流吗？', warning]
    }

    if (itemType === 'folder') {
      if (isMultiple) {
        return [
          '确定要删除 ',
          { text: displayNames.join(', '), bold: true },
          '? ',
          {
            text: '这些文件夹中的所有工作流和内容都将被归档。',
            error: true,
          },
        ]
      }
      const warning = {
        text: '所有关联的工作流和内容都将被归档。',
        error: true,
      }
      if (isSingle && displayNames.length > 0) {
        return ['确定要删除 ', { text: displayNames[0], bold: true }, ' 吗？', warning]
      }
      return ['确定要删除此文件夹吗？', warning]
    }

    if (itemType === 'task') {
      const warning = {
        text: '这将永久删除所有对话历史记录。',
        error: true,
      }
      if (isMultiple) {
        return [
          '确定要删除 ',
          { text: `${displayNames.length} 个对话`, bold: true },
          ' 吗？',
          warning,
        ]
      }
      if (isSingle && displayNames.length > 0) {
        return ['确定要删除 ', { text: displayNames[0], bold: true }, ' 吗？', warning]
      }
      return ['确定要删除此对话吗？', warning]
    }

    if (itemType === 'mixed') {
      const warning = {
        text: '所有选中的工作流和文件夹(包括其内容)都将被归档。',
        error: true,
      }
      if (displayNames.length > 0) {
        return ['确定要删除 ', { text: displayNames.join(', '), bold: true }, ' 吗？', warning]
      }
      return ['确定要删除选中的项目吗？', warning]
    }

    const workspaceWarning = {
      text: '这将永久删除所有关联的工作流、表格、文件、日志和知识库。',
      error: true,
    }
    if (isSingle && displayNames.length > 0) {
      return ['确定要删除 ', { text: displayNames[0], bold: true }, '? ', workspaceWarning]
    }
    return ['确定要删除此工作区吗？', workspaceWarning]
  }

  const handleClose = () => {
    setConfirmationText('')
    onClose()
  }

  return (
    <ChipConfirmModal
      open={isOpen}
      onOpenChange={handleClose}
      srTitle={title}
      title={title}
      text={[
        ...buildDescriptionSegments(),
        ' ',
        restorableTypes.has(itemType)
          ? '你可以稍后在设置中的“最近删除”里恢复它。'
          : '此操作无法撤销。',
      ]}
      confirm={{
        label: '删除',
        onClick: onConfirm,
        pending: isDeleting,
        pendingLabel: '删除中...',
        disabled: !isConfirmed,
      }}
    >
      {isWorkspace && workspaceName && (
        <ChipModalField
          type='input'
          title={
            <span>
              输入&nbsp;
              <span className='font-medium text-[var(--text-primary)]'>{workspaceName}</span>
              &nbsp;以确认
            </span>
          }
          value={confirmationText}
          onChange={setConfirmationText}
          placeholder={workspaceName}
        />
      )}
    </ChipConfirmModal>
  )
}
