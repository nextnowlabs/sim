'use client'

import { memo, useRef, useState } from 'react'
import {
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH } from '@/lib/knowledge/constants'
import type { ChunkingConfig } from '@/lib/knowledge/types'

const logger = createLogger('EditKnowledgeBaseModal')

interface EditKnowledgeBaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  knowledgeBaseId: string
  initialName: string
  initialDescription: string
  chunkingConfig?: ChunkingConfig
  onSave: (id: string, name: string, description: string) => Promise<void>
}

/**
 * Modal for editing knowledge base name and description
 */
export const EditKnowledgeBaseModal = memo(function EditKnowledgeBaseModal({
  open,
  onOpenChange,
  knowledgeBaseId,
  initialName,
  initialDescription,
  chunkingConfig,
  onSave,
}: EditKnowledgeBaseModalProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [nameError, setNameError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Seed the fields only on the closed → open transition (render-phase reset),
   * so a prop change while the modal is open never clobbers in-progress edits.
   */
  const prevOpenRef = useRef(open)
  if (prevOpenRef.current !== open) {
    prevOpenRef.current = open
    if (open) {
      setName(initialName)
      setDescription(initialDescription)
      setNameError(null)
      setDescriptionError(null)
      setError(null)
    }
  }

  const validate = (): string | null => {
    let firstError: string | null = null

    if (!name.trim()) {
      setNameError('名称不能为空')
      firstError ??= '名称不能为空'
    } else if (name.trim().length > 100) {
      setNameError('名称不能超过 100 个字符')
      firstError ??= '名称不能超过 100 个字符'
    } else {
      setNameError(null)
    }

    if (description.length > KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH) {
      const message = `描述不能超过 ${KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH} 个字符`
      setDescriptionError(message)
      firstError ??= message
    } else {
      setDescriptionError(null)
    }

    return firstError
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSave(knowledgeBaseId, name.trim(), description.trim())
      onOpenChange(false)
    } catch (err) {
      logger.error('Error updating knowledge base:', err)
      setError(getErrorMessage(err, '更新知识库失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid = name.trim().length > 0
  const isDirty = name !== initialName || description !== initialDescription

  return (
    <ChipModal open={open} onOpenChange={onOpenChange} srTitle='编辑知识库'>
      <ChipModalHeader onClose={() => onOpenChange(false)}>编辑知识库</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='input'
          title='名称'
          value={name}
          onChange={setName}
          placeholder='输入知识库名称'
          required
          error={nameError ?? undefined}
          autoComplete='off'
        />
        <ChipModalField
          type='textarea'
          title='描述'
          value={description}
          onChange={setDescription}
          placeholder='描述此知识库(可选)'
          rows={4}
          error={descriptionError ?? undefined}
        />
        {chunkingConfig && (
          <ChipModalField type='custom' title='分块配置'>
            <div className='grid grid-cols-3 gap-2'>
              <div className='rounded-sm border border-[var(--border-1)] bg-[var(--surface-2)] px-2.5 py-2'>
                <p className='text-[11px] text-[var(--text-tertiary)] leading-tight'>最大大小</p>
                <p className='font-medium text-[var(--text-primary)] text-sm'>
                  {chunkingConfig.maxSize.toLocaleString()}
                  <span className='ml-0.5 font-normal text-[11px] text-[var(--text-tertiary)]'>
                    tokens
                  </span>
                </p>
              </div>
              <div className='rounded-sm border border-[var(--border-1)] bg-[var(--surface-2)] px-2.5 py-2'>
                <p className='text-[11px] text-[var(--text-tertiary)] leading-tight'>最小大小</p>
                <p className='font-medium text-[var(--text-primary)] text-sm'>
                  {chunkingConfig.minSize.toLocaleString()}
                  <span className='ml-0.5 font-normal text-[11px] text-[var(--text-tertiary)]'>
                    字符
                  </span>
                </p>
              </div>
              <div className='rounded-sm border border-[var(--border-1)] bg-[var(--surface-2)] px-2.5 py-2'>
                <p className='text-[11px] text-[var(--text-tertiary)] leading-tight'>重叠</p>
                <p className='font-medium text-[var(--text-primary)] text-sm'>
                  {chunkingConfig.overlap.toLocaleString()}
                  <span className='ml-0.5 font-normal text-[11px] text-[var(--text-tertiary)]'>
                    tokens
                  </span>
                </p>
              </div>
            </div>
          </ChipModalField>
        )}
        <ChipModalError>{error}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={() => onOpenChange(false)}
        cancelDisabled={isSubmitting}
        primaryAction={{
          label: isSubmitting ? '保存中…' : '保存',
          onClick: handleSubmit,
          disabled: !isValid || !isDirty || isSubmitting,
        }}
      />
    </ChipModal>
  )
})
