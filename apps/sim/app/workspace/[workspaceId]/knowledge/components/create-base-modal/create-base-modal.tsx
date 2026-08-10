'use client'

import { memo, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Checkbox,
  ChipCombobox,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipTextarea,
  type ComboboxOption,
  cn,
  Loader,
  toast,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { X } from 'lucide-react'
import { useParams } from 'next/navigation'
import { type FieldErrors, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { StrategyOptions } from '@/lib/chunkers/types'
import { KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH } from '@/lib/knowledge/constants'
import { formatFileSize, validateKnowledgeBaseFile } from '@/lib/uploads/utils/file-utils'
import { ACCEPT_ATTRIBUTE } from '@/lib/uploads/utils/validation'
import { useKnowledgeUpload } from '@/app/workspace/[workspaceId]/knowledge/hooks/use-knowledge-upload'
import { useCreateKnowledgeBase, useDeleteKnowledgeBase } from '@/hooks/queries/kb/knowledge'

const logger = createLogger('CreateBaseModal')

interface CreateBaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动(根据内容检测)' },
  { value: 'text', label: '文本(按单词边界拆分)' },
  { value: 'recursive', label: '递归(可配置分隔符)' },
  { value: 'sentence', label: '句子' },
  { value: 'token', label: 'Token(固定大小)' },
  { value: 'regex', label: '正则(自定义模式)' },
] as const

const STRATEGY_COMBOBOX_OPTIONS: ComboboxOption[] = STRATEGY_OPTIONS.map((o) => ({
  label: o.label,
  value: o.value,
}))

const FormSchema = z
  .object({
    name: z
      .string()
      .min(1, '名称不能为空')
      .max(100, '名称不能超过 100 个字符')
      .refine((value) => value.trim().length > 0, '名称不能为空'),
    description: z
      .string()
      .max(
        KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH,
        `描述不能超过 ${KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH} 个字符`
      )
      .optional(),
    minChunkSize: z
      .number()
      .min(1, '最小分块大小至少为 1 个字符')
      .max(2000, '最小分块大小不能超过 2000 个字符'),
    maxChunkSize: z
      .number()
      .min(100, '最大分块大小至少为 100 tokens')
      .max(4000, '最大分块大小不能超过 4000 tokens'),
    overlapSize: z
      .number()
      .min(0, 'Overlap must be non-negative')
      .max(500, 'Overlap must be less than 500 tokens'),
    strategy: z.enum(['auto', 'text', 'regex', 'recursive', 'sentence', 'token']).default('auto'),
    regexPattern: z.string().optional(),
    regexStrictBoundaries: z.boolean().default(false),
    customSeparators: z.string().optional(),
  })
  .refine(
    (data) => {
      const maxChunkSizeInChars = data.maxChunkSize * 4
      return data.minChunkSize < maxChunkSizeInChars
    },
    {
      message: 'Min chunk size (characters) must be less than max chunk size (tokens × 4)',
      path: ['minChunkSize'],
    }
  )
  .refine(
    (data) => {
      return data.overlapSize < data.maxChunkSize
    },
    {
      message: '重叠大小必须小于最大分块大小',
      path: ['overlapSize'],
    }
  )
  .refine(
    (data) => {
      if (data.strategy === 'regex' && !data.regexPattern?.trim()) {
        return false
      }
      return true
    },
    {
      message: '使用正则策略时必须提供正则模式',
      path: ['regexPattern'],
    }
  )

type FormInputValues = z.input<typeof FormSchema>
type FormValues = z.output<typeof FormSchema>

interface SubmitStatus {
  type: 'success' | 'error'
  message: string
}

export const CreateBaseModal = memo(function CreateBaseModal({
  open,
  onOpenChange,
}: CreateBaseModalProps) {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const createKnowledgeBaseMutation = useCreateKnowledgeBase(workspaceId)
  const deleteKnowledgeBaseMutation = useDeleteKnowledgeBase(workspaceId)

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)

  const { uploadFiles, isUploading, uploadProgress, uploadError, clearError } = useKnowledgeUpload({
    workspaceId,
  })

  const handleClose = (open: boolean) => {
    if (!open) {
      clearError()
    }
    onOpenChange(open)
  }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormInputValues, unknown, FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      description: '',
      minChunkSize: 100,
      maxChunkSize: 1024,
      overlapSize: 200,
      strategy: 'auto',
      regexPattern: '',
      regexStrictBoundaries: false,
      customSeparators: '',
    },
    mode: 'onSubmit',
  })

  const nameValue = watch('name')
  const strategyValue = watch('strategy')
  const regexStrictBoundariesValue = watch('regexStrictBoundaries')

  useEffect(() => {
    if (open) {
      setSubmitStatus(null)
      setFileError(null)
      setFiles([])
      reset({
        name: '',
        description: '',
        minChunkSize: 100,
        maxChunkSize: 1024,
        overlapSize: 200,
        strategy: 'auto',
        regexPattern: '',
        regexStrictBoundaries: false,
        customSeparators: '',
      })
    }
  }, [open, reset])

  const processFiles = (selectedFiles: File[]) => {
    setFileError(null)

    if (!selectedFiles || selectedFiles.length === 0) return

    try {
      const newFiles: File[] = []
      let hasError = false

      for (const file of selectedFiles) {
        const validationError = validateKnowledgeBaseFile(file)
        if (validationError) {
          setFileError(validationError)
          hasError = true
          continue
        }

        newFiles.push(file)
      }

      if (!hasError && newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles])
      }
    } catch (error) {
      logger.error('Error processing files:', error)
      setFileError('An error occurred while processing files. Please try again.')
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const isSubmitting =
    createKnowledgeBaseMutation.isPending || deleteKnowledgeBaseMutation.isPending || isUploading

  const onInvalid = (formErrors: FieldErrors<FormInputValues>) => {
    const firstMessage = Object.values(formErrors).find(
      (fieldError) => typeof fieldError?.message === 'string'
    )?.message
    toast.error(
      typeof firstMessage === 'string' ? firstMessage : '请修复高亮的字段'
    )
  }

  const onSubmit = async (data: FormValues) => {
    setSubmitStatus(null)

    try {
      const strategyOptions: StrategyOptions | undefined =
        data.strategy === 'regex' && data.regexPattern
          ? {
              pattern: data.regexPattern,
              ...(data.regexStrictBoundaries && { strictBoundaries: true }),
            }
          : data.strategy === 'recursive' && data.customSeparators?.trim()
            ? {
                separators: data.customSeparators
                  .split(',')
                  .map((s) => s.trim().replace(/\\n/g, '\n').replace(/\\t/g, '\t')),
              }
            : undefined

      const newKnowledgeBase = await createKnowledgeBaseMutation.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        workspaceId: workspaceId,
        chunkingConfig: {
          maxSize: data.maxChunkSize,
          minSize: data.minChunkSize,
          overlap: data.overlapSize,
          ...(data.strategy !== 'auto' && { strategy: data.strategy }),
          ...(strategyOptions && { strategyOptions }),
        },
      })

      if (files.length > 0) {
        try {
          const uploadedFiles = await uploadFiles(files, newKnowledgeBase.id, {
            recipe: 'default',
          })

          logger.info(`Successfully uploaded ${uploadedFiles.length} files`)
          logger.info(`Started processing ${uploadedFiles.length} documents in the background`)
        } catch (uploadError) {
          logger.error('File upload failed, deleting knowledge base:', uploadError)
          try {
            await deleteKnowledgeBaseMutation.mutateAsync({
              knowledgeBaseId: newKnowledgeBase.id,
            })
            logger.info(`Deleted orphaned knowledge base: ${newKnowledgeBase.id}`)
          } catch (deleteError) {
            logger.error('Failed to delete orphaned knowledge base:', deleteError)
          }
          throw uploadError
        }
      }

      setFiles([])

      handleClose(false)
    } catch (error) {
      logger.error('Error creating knowledge base:', error)
      setSubmitStatus({
        type: 'error',
        message: getErrorMessage(error, '发生未知错误'),
      })
    }
  }

  return (
    <ChipModal open={open} onOpenChange={handleClose} srTitle='创建知识库' size='lg'>
      <ChipModalHeader onClose={() => handleClose(false)}>创建知识库</ChipModalHeader>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className='flex min-h-0 flex-1 flex-col'>
        <button type='submit' hidden disabled={isSubmitting || !nameValue?.trim()} />
        <ChipModalBody>
          <input
            type='text'
            name='fakeusernameremembered'
            autoComplete='username'
            className='-left-[9999px] pointer-events-none absolute opacity-0'
            tabIndex={-1}
            readOnly
          />

          <ChipModalField type='custom' title='名称'>
            <ChipInput
              placeholder='输入知识库名称'
              {...register('name')}
              error={Boolean(errors.name)}
              autoComplete='off'
              autoCorrect='off'
              autoCapitalize='off'
              data-lpignore='true'
              data-form-type='other'
            />
          </ChipModalField>

          <ChipModalField type='custom' title='描述' error={errors.description?.message}>
            <ChipTextarea
              placeholder='描述此知识库(可选)'
              rows={4}
              {...register('description')}
              error={Boolean(errors.description)}
            />
          </ChipModalField>

          <div className='flex gap-3'>
            <ChipModalField type='custom' title='最小分块大小(字符)' className='flex-1'>
              <ChipInput
                type='number'
                min={1}
                max={2000}
                step={1}
                placeholder='100'
                {...register('minChunkSize', { valueAsNumber: true })}
                error={Boolean(errors.minChunkSize)}
                autoComplete='off'
                data-form-type='other'
              />
            </ChipModalField>

            <ChipModalField type='custom' title='最大分块大小(tokens)' className='flex-1'>
              <ChipInput
                type='number'
                min={100}
                max={4000}
                step={1}
                placeholder='1024'
                {...register('maxChunkSize', { valueAsNumber: true })}
                error={Boolean(errors.maxChunkSize)}
                autoComplete='off'
                data-form-type='other'
              />
            </ChipModalField>
          </div>

          <ChipModalField
            type='custom'
            title='重叠(tokens)'
            hint='1 token ≈ 4 characters. Max chunk size and overlap are in tokens.'
          >
            <ChipInput
              type='number'
              min={0}
              max={500}
              step={1}
              placeholder='200'
              {...register('overlapSize', { valueAsNumber: true })}
              error={Boolean(errors.overlapSize)}
              autoComplete='off'
              data-form-type='other'
            />
          </ChipModalField>

          <ChipModalField
            type='custom'
            title='分块策略'
            hint='Auto detects the best strategy based on file content type.'
          >
            <ChipCombobox
              options={STRATEGY_COMBOBOX_OPTIONS}
              value={strategyValue}
              onChange={(value) => setValue('strategy', value as FormValues['strategy'])}
              dropdownWidth='trigger'
              align='start'
            />
          </ChipModalField>

          {strategyValue === 'regex' && (
            <>
              <ChipModalField
                type='custom'
                title='正则模式'
                error={errors.regexPattern?.message}
                hint='Text will be split at each match of this regex pattern.'
              >
                <ChipInput
                  placeholder='e.g. \\n\\n or (?<=\\})\\s*(?=\\{)'
                  {...register('regexPattern')}
                  error={Boolean(errors.regexPattern)}
                  autoComplete='off'
                  data-form-type='other'
                />
              </ChipModalField>

              <ChipModalField
                type='custom'
                title='分块边界'
                hint='Preserve boundaries exactly. Recommended when each match is a discrete record (e.g. one QA pair per chunk).'
              >
                <label
                  htmlFor='regexStrictBoundaries'
                  className='flex cursor-pointer items-center gap-2'
                >
                  <Checkbox
                    id='regexStrictBoundaries'
                    checked={regexStrictBoundariesValue}
                    onCheckedChange={(checked) =>
                      setValue('regexStrictBoundaries', checked === true)
                    }
                  />
                  <span className='text-[var(--text-primary)] text-sm'>
                    Each match is its own chunk (don&apos;t merge)
                  </span>
                </label>
              </ChipModalField>
            </>
          )}

          {strategyValue === 'recursive' && (
            <ChipModalField
              type='custom'
              title='自定义分隔符(可选)'
              hint='Comma-separated list of delimiters in priority order. Leave empty for default separators.'
            >
              <ChipInput
                placeholder='e.g. \n\n, \n, . ,  '
                {...register('customSeparators')}
                autoComplete='off'
                data-form-type='other'
              />
            </ChipModalField>
          )}

          <ChipModalField
            type='file'
            title='上传文档'
            accept={ACCEPT_ATTRIBUTE}
            multiple
            onChange={processFiles}
            description='PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, MD, PPT, PPTX, HTML, JSONL (max 100MB each)'
            error={fileError}
          />

          {files.length > 0 && (
            <ChipModalField type='custom' title='Selected Files'>
              <div className='space-y-2'>
                {files.map((file, index) => {
                  const fileStatus = uploadProgress.fileStatuses?.[index]
                  const isFailed = fileStatus?.status === 'failed'
                  const isProcessing = fileStatus?.status === 'uploading'

                  return (
                    <div
                      key={`${file.name}-${file.size}`}
                      className={cn(
                        'flex items-center gap-2 rounded-sm border p-2',
                        isFailed && 'border-[var(--text-error)]'
                      )}
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-caption',
                          isFailed && 'text-[var(--text-error)]'
                        )}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <span className='flex-shrink-0 text-[var(--text-muted)] text-xs'>
                        {formatFileSize(file.size)}
                      </span>
                      <div className='flex flex-shrink-0 items-center gap-1'>
                        {isProcessing ? (
                          <Loader className='size-4 text-[var(--text-muted)]' animate />
                        ) : (
                          <Button
                            type='button'
                            variant='ghost'
                            className='size-4 p-0'
                            onClick={() => removeFile(index)}
                            disabled={isUploading}
                          >
                            <X className='size-3.5' />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChipModalField>
          )}

          <ChipModalError>{uploadError?.message || submitStatus?.message}</ChipModalError>
        </ChipModalBody>

        <ChipModalFooter
          onCancel={() => handleClose(false)}
          cancelDisabled={isSubmitting}
          primaryAction={{
            label: isSubmitting
              ? isUploading
                ? uploadProgress.stage === 'uploading'
                  ? `上传中 ${uploadProgress.filesCompleted}/${uploadProgress.totalFiles}…`
                  : uploadProgress.stage === 'processing'
                    ? '处理中…'
                    : '创建中…'
                : '创建中…'
              : '创建',
            onClick: handleSubmit(onSubmit, onInvalid),
            disabled: isSubmitting || !nameValue?.trim(),
          }}
        />
      </form>
    </ChipModal>
  )
})
