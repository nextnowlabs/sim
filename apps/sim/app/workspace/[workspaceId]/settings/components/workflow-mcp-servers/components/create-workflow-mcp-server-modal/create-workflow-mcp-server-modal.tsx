'use client'

import { useCallback, useState } from 'react'
import {
  ButtonGroup,
  ButtonGroupItem,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipSelect,
  type ComboboxOption,
} from '@sim/emcn'
import { createLogger } from '@sim/logger'
import { useCreateWorkflowMcpServer } from '@/hooks/queries/workflow-mcp-servers'

const logger = createLogger('CreateWorkflowMcpServerModal')

const INITIAL_FORM_DATA: { name: string; description: string; isPublic: boolean } = {
  name: '',
  description: '',
  isPublic: false,
}

interface CreateWorkflowMcpServerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workflowOptions?: ComboboxOption[]
}

export function CreateWorkflowMcpServerModal({
  open,
  onOpenChange,
  workspaceId,
  workflowOptions,
}: CreateWorkflowMcpServerModalProps) {
  const createServerMutation = useCreateWorkflowMcpServer()

  const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA })
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<string[]>([])

  const isFormValid = formData.name.trim().length > 0

  const [prevOpen, setPrevOpen] = useState(false)
  if (open && !prevOpen) {
    setFormData({ ...INITIAL_FORM_DATA })
    setSelectedWorkflowIds([])
  }
  if (open !== prevOpen) {
    setPrevOpen(open)
  }

  const handleCreateServer = useCallback(async () => {
    if (!formData.name.trim()) return

    try {
      await createServerMutation.mutateAsync({
        workspaceId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isPublic: formData.isPublic,
        workflowIds: selectedWorkflowIds.length > 0 ? selectedWorkflowIds : undefined,
      })
      onOpenChange(false)
    } catch (err) {
      logger.error('Failed to create server:', err)
    }
  }, [formData, selectedWorkflowIds, workspaceId, onOpenChange, createServerMutation.mutateAsync])

  const showWorkflows = workflowOptions !== undefined

  return (
    <ChipModal open={open} onOpenChange={onOpenChange} srTitle='添加新 MCP 服务器'>
      <ChipModalHeader onClose={() => onOpenChange(false)}>添加新 MCP 服务器</ChipModalHeader>
      <ChipModalBody>
        <ChipModalField
          type='input'
          title='服务器名称'
          value={formData.name}
          onChange={(value) => setFormData({ ...formData, name: value })}
          required
          placeholder='例如：我的 MCP 服务器'
        />
        <ChipModalField
          type='textarea'
          title='描述'
          value={formData.description}
          onChange={(value) => setFormData({ ...formData, description: value })}
          placeholder='描述此 MCP 服务器的用途（可选）'
        />
        {showWorkflows && (
          <ChipModalField type='custom' title='工作流'>
            <ChipSelect
              options={workflowOptions ?? []}
              multiSelect
              multiSelectValues={selectedWorkflowIds}
              onMultiSelectChange={setSelectedWorkflowIds}
              placeholder='选择工作流…'
              searchable
              searchPlaceholder='搜索工作流…'
              disabled={createServerMutation.isPending}
              fullWidth
              dropdownWidth='trigger'
              align='start'
              displayLabel={
                selectedWorkflowIds.length > 0
                  ? `${selectedWorkflowIds.length} 个工作流已选择`
                  : undefined
              }
            />
          </ChipModalField>
        )}
        <ChipModalField type='custom' title='访问权限'>
          <div className='flex items-center gap-3'>
            <ButtonGroup
              value={formData.isPublic ? 'public' : 'private'}
              onValueChange={(value) => setFormData({ ...formData, isPublic: value === 'public' })}
            >
              <ButtonGroupItem value='private'>API 密钥</ButtonGroupItem>
              <ButtonGroupItem value='public'>公开</ButtonGroupItem>
            </ButtonGroup>
            {formData.isPublic && (
              <span className='text-[var(--text-muted)] text-xs'>无需认证</span>
            )}
          </div>
        </ChipModalField>
        <ChipModalError>{createServerMutation.error?.message}</ChipModalError>
      </ChipModalBody>
      <ChipModalFooter
        onCancel={() => onOpenChange(false)}
        primaryAction={{
          label: createServerMutation.isPending ? '添加中…' : '添加服务器',
          onClick: handleCreateServer,
          disabled: !isFormValid || createServerMutation.isPending,
        }}
      />
    </ChipModal>
  )
}
