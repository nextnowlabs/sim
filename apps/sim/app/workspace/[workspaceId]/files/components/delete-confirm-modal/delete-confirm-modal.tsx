'use client'

import { memo } from 'react'
import { ChipConfirmModal } from '@sim/emcn'

interface DeleteConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName?: string
  fileCount: number
  folderCount: number
  onDelete: () => void
  isPending: boolean
}

export const DeleteConfirmModal = memo(function DeleteConfirmModal({
  open,
  onOpenChange,
  fileName,
  fileCount,
  folderCount,
  onDelete,
  isPending,
}: DeleteConfirmModalProps) {
  const totalCount = fileCount + folderCount
  const hasFolders = folderCount > 0
  const title = totalCount > 1 ? '删除项目' : hasFolders ? '删除文件夹' : '删除文件'
  const consequence = hasFolders
    ? totalCount > 1
      ? '这也将删除所选文件夹内的文件和文件夹。'
      : '这也将删除所选文件夹内的内容。'
    : totalCount > 1
      ? '你可以在设置中的"最近删除"里恢复它们。'
      : '你可以在设置中的"最近删除"里恢复它。'

  return (
    <ChipConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      srTitle={title}
      title={title}
      text={[
        '确定要删除 ',
        fileName
          ? { text: fileName, bold: true }
          : `${totalCount} 个项目`,
        `? ${consequence}`,
      ]}
      confirm={{
        label: '删除',
        onClick: onDelete,
        pending: isPending,
        pendingLabel: '删除中…',
      }}
    />
  )
})
