'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChipConfirmModal,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  chipFieldSurfaceClass,
  cn,
} from '@sim/emcn'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import {
  useGenerateVersionDescription,
  useUpdateDeploymentVersion,
} from '@/hooks/queries/deployments'

const RichMarkdownField = dynamic(
  () =>
    import(
      '@/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/rich-markdown-field'
    ).then((m) => m.RichMarkdownField),
  {
    ssr: false,
    loading: () => <div className={cn('min-h-[240px]', chipFieldSurfaceClass)} />,
  }
)

/** A high cap that only guards against abuse — no visible counter; normal descriptions never reach it. */
const MAX_DESCRIPTION_LENGTH = 50_000

interface VersionDescriptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  version: number
  versionName: string
  currentDescription: string | null | undefined
}

export function VersionDescriptionModal({
  open,
  onOpenChange,
  workflowId,
  version,
  versionName,
  currentDescription,
}: VersionDescriptionModalProps) {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const initialDescriptionRef = useRef(currentDescription || '')
  const [description, setDescription] = useState(initialDescriptionRef.current)
  const [showUnsavedChangesAlert, setShowUnsavedChangesAlert] = useState(false)

  const updateMutation = useUpdateDeploymentVersion()
  const generateMutation = useGenerateVersionDescription()

  const hasChanges = description.trim() !== initialDescriptionRef.current.trim()
  const isGenerating = generateMutation.isPending
  const isTooLong = description.length > MAX_DESCRIPTION_LENGTH

  const handleCloseAttempt = () => {
    if (updateMutation.isPending || isGenerating) {
      return
    }
    if (hasChanges) {
      setShowUnsavedChangesAlert(true)
    } else {
      onOpenChange(false)
    }
  }

  const handleDiscardChanges = () => {
    setShowUnsavedChangesAlert(false)
    setDescription(initialDescriptionRef.current)
    onOpenChange(false)
  }

  const generateAbortRef = useRef<AbortController | null>(null)
  /**
   * Abort an in-flight generation if the modal unmounts mid-stream (e.g. the deploy modal closes), so
   * the SSE stream stops instead of running to completion against a gone component.
   */
  useEffect(() => () => generateAbortRef.current?.abort(), [])

  const handleGenerateDescription = () => {
    generateAbortRef.current?.abort()
    const controller = new AbortController()
    generateAbortRef.current = controller
    generateMutation.mutate({
      workflowId,
      version,
      signal: controller.signal,
      onStreamChunk: (accumulated) => {
        setDescription(accumulated)
      },
    })
  }

  const handleSave = () => {
    if (!workflowId || isTooLong) return

    updateMutation.mutate(
      {
        workflowId,
        version,
        description: description.trim() || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <>
      <ChipModal
        open={open}
        onOpenChange={(openState) => !openState && handleCloseAttempt()}
        srTitle='版本描述'
      >
        <ChipModalHeader onClose={() => handleCloseAttempt()}>版本描述</ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='custom'
            title={
              <span>
                {currentDescription ? '编辑' : '添加'}
                <span className='font-medium text-[var(--text-primary)]'>{versionName}</span>
                的描述
              </span>
            }
          >
            <RichMarkdownField
              value={description}
              onChange={setDescription}
              placeholder='描述此部署版本的更改…'
              minHeight={240}
              maxHeight={420}
              disabled={isGenerating}
              isStreaming={isGenerating}
              error={description.length > MAX_DESCRIPTION_LENGTH}
              workspaceId={workspaceId}
              disableTagging
            />
          </ChipModalField>
          <ChipModalError>
            {updateMutation.error?.message || generateMutation.error?.message}
          </ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={handleCloseAttempt}
          cancelDisabled={updateMutation.isPending || isGenerating}
          secondaryActions={[
            {
              label: isGenerating ? '生成中…' : '生成',
              onClick: handleGenerateDescription,
              disabled: isGenerating || updateMutation.isPending,
            },
          ]}
          primaryAction={{
            label: updateMutation.isPending ? '保存中…' : '保存',
            onClick: handleSave,
            disabled: updateMutation.isPending || isGenerating || !hasChanges || isTooLong,
          }}
        />
      </ChipModal>

      <ChipConfirmModal
        open={showUnsavedChangesAlert}
        onOpenChange={setShowUnsavedChangesAlert}
        srTitle='未保存的更改'
        title='未保存的更改'
        text='你有未保存的更改。确定要放弃它们吗?'
        dismissLabel='继续编辑'
        confirm={{
          label: '放弃更改',
          onClick: handleDiscardChanges,
        }}
      />
    </>
  )
}
