'use client'

import { ChipConfirmModal } from '@sim/emcn'
import type { ChunkData } from '@/lib/knowledge/types'
import { useDeleteChunk } from '@/hooks/queries/kb/knowledge'

interface DeleteChunkModalProps {
  chunk: ChunkData | null
  knowledgeBaseId: string
  documentId: string
  isOpen: boolean
  onClose: () => void
}

export function DeleteChunkModal({
  chunk,
  knowledgeBaseId,
  documentId,
  isOpen,
  onClose,
}: DeleteChunkModalProps) {
  const { mutate: deleteChunk, isPending: isDeleting } = useDeleteChunk()

  const handleDeleteChunk = () => {
    if (!chunk || isDeleting) return

    deleteChunk({ knowledgeBaseId, documentId, chunkId: chunk.id }, { onSuccess: onClose })
  }

  if (!chunk) return null

  return (
    <ChipConfirmModal
      open={isOpen}
      onOpenChange={onClose}
      srTitle='删除分块'
      title='删除分块'
      text='确定要删除此分块吗?此操作无法撤销。'
      confirm={{
        label: '删除',
        onClick: handleDeleteChunk,
        pending: isDeleting,
        pendingLabel: '删除中…',
      }}
    />
  )
}
