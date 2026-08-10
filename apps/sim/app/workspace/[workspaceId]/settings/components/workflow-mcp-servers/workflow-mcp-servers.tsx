'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ChipConfirmModal,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipModalTabs,
  ChipSelect,
  Code,
  type ComboboxOption,
  Label,
} from '@sim/emcn'
import { ArrowLeft } from '@sim/emcn/icons'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { Check, Clipboard, Plus, Server } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { useUserPermissionsContext } from '@/app/workspace/[workspaceId]/providers/workspace-permissions-provider'
import { CreateApiKeyModal } from '@/app/workspace/[workspaceId]/settings/components/api-keys/components'
import { RowActionsMenu } from '@/app/workspace/[workspaceId]/settings/components/row-actions-menu'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'
import type { SettingsAction } from '@/app/workspace/[workspaceId]/settings/components/settings-header/settings-header'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { CreateWorkflowMcpServerModal } from '@/app/workspace/[workspaceId]/settings/components/workflow-mcp-servers/components'
import { useApiKeys } from '@/hooks/queries/api-keys'
import { useCreateMcpServer } from '@/hooks/queries/mcp'
import {
  useAddWorkflowMcpTool,
  useDeleteWorkflowMcpServer,
  useDeleteWorkflowMcpTool,
  useDeployedWorkflows,
  useUpdateWorkflowMcpServer,
  useUpdateWorkflowMcpTool,
  useWorkflowMcpServer,
  useWorkflowMcpServers,
  type WorkflowMcpServer,
  type WorkflowMcpTool,
} from '@/hooks/queries/workflow-mcp-servers'
import { useWorkspaceSettings } from '@/hooks/queries/workspace'

const logger = createLogger('WorkflowMcpServers')

interface ServerDetailViewProps {
  workspaceId: string
  serverId: string
  onBack: () => void
}

type McpClientType = 'sim' | 'cursor' | 'claude-code' | 'claude-desktop' | 'vscode'

function ServerDetailView({ workspaceId, serverId, onBack }: ServerDetailViewProps) {
  const { data, isLoading, error } = useWorkflowMcpServer(workspaceId, serverId)
  const { data: deployedWorkflows = [], isLoading: isLoadingWorkflows } =
    useDeployedWorkflows(workspaceId)
  const deleteToolMutation = useDeleteWorkflowMcpTool()
  const addToolMutation = useAddWorkflowMcpTool()
  const updateToolMutation = useUpdateWorkflowMcpTool()
  const updateServerMutation = useUpdateWorkflowMcpServer()

  const { data: apiKeysData } = useApiKeys(workspaceId)
  const { data: workspaceSettingsData } = useWorkspaceSettings(workspaceId)
  const userPermissions = useUserPermissionsContext()
  const [showCreateApiKeyModal, setShowCreateApiKeyModal] = useState(false)

  const existingKeyNames = [
    ...(apiKeysData?.workspaceKeys ?? []),
    ...(apiKeysData?.personalKeys ?? []),
  ].map((k) => k.name)
  const allowPersonalApiKeys =
    workspaceSettingsData?.settings?.workspace?.allowPersonalApiKeys ?? true
  const canManageWorkspaceKeys = userPermissions.canAdmin
  const defaultKeyType = allowPersonalApiKeys ? 'personal' : 'workspace'

  const addToWorkspaceMutation = useCreateMcpServer()
  const [addedToWorkspace, setAddedToWorkspace] = useState(false)
  const addedToWorkspaceTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (addedToWorkspaceTimerRef.current) {
        clearTimeout(addedToWorkspaceTimerRef.current)
      }
    }
  }, [])

  const [copiedConfig, setCopiedConfig] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<McpClientType>('cursor')
  const [toolToDelete, setToolToDelete] = useState<WorkflowMcpTool | null>(null)
  const [toolToView, setToolToView] = useState<WorkflowMcpTool | null>(null)
  const [editingDescription, setEditingDescription] = useState<string>('')
  const [editingParameterDescriptions, setEditingParameterDescriptions] = useState<
    Record<string, string>
  >({})
  const [showAddWorkflow, setShowAddWorkflow] = useState(false)
  const [showEditServer, setShowEditServer] = useState(false)
  const [editServerName, setEditServerName] = useState('')
  const [editServerDescription, setEditServerDescription] = useState('')
  const [editServerIsPublic, setEditServerIsPublic] = useState(false)
  const [activeServerTab, setActiveServerTab] = useState<'workflows' | 'details'>('details')

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)

  const mcpServerUrl = `${getBaseUrl()}/api/mcp/serve/${serverId}`

  const handleOpenToolEdit = (tool: WorkflowMcpTool) => {
    setToolToView(tool)
    setEditingDescription(tool.toolDescription || '')
    const schema = tool.parameterSchema as
      | { properties?: Record<string, { type?: string; description?: string }> }
      | undefined
    const properties = schema?.properties
    if (properties) {
      const descriptions: Record<string, string> = {}
      for (const [name, prop] of Object.entries(properties)) {
        descriptions[name] = prop.description || ''
      }
      setEditingParameterDescriptions(descriptions)
    } else {
      setEditingParameterDescriptions({})
    }
  }

  const handleDeleteTool = async () => {
    if (!toolToDelete) return
    try {
      await deleteToolMutation.mutateAsync({
        workspaceId,
        serverId,
        toolId: toolToDelete.id,
      })
      setToolToDelete(null)
    } catch (err) {
      logger.error('Failed to delete tool:', err)
    }
  }

  const handleAddWorkflow = async () => {
    if (!selectedWorkflowId) return
    try {
      await addToolMutation.mutateAsync({
        workspaceId,
        serverId,
        workflowId: selectedWorkflowId,
      })
      setShowAddWorkflow(false)
      setSelectedWorkflowId(null)
      setActiveServerTab('workflows')
    } catch (err) {
      logger.error('Failed to add workflow:', err)
    }
  }

  const handleSaveToolEdit = async () => {
    if (!toolToView) return
    try {
      const currentSchema = toolToView.parameterSchema as Record<string, unknown>
      const currentProperties = (currentSchema?.properties || {}) as Record<
        string,
        { type?: string; description?: string }
      >
      const updatedProperties: Record<string, { type?: string; description?: string }> = {}

      for (const [name, prop] of Object.entries(currentProperties)) {
        updatedProperties[name] = {
          ...prop,
          description: editingParameterDescriptions[name]?.trim() || undefined,
        }
      }

      const updatedSchema = {
        ...currentSchema,
        properties: updatedProperties,
      }

      await updateToolMutation.mutateAsync({
        workspaceId,
        serverId,
        toolId: toolToView.id,
        toolDescription: editingDescription.trim(),
        parameterSchema: updatedSchema,
      })
      setToolToView(null)
      setEditingDescription('')
      setEditingParameterDescriptions({})
    } catch (err) {
      logger.error('Failed to update tool:', err)
    }
  }

  const isSaveToolDisabled = (() => {
    if (updateToolMutation.isPending) return true
    if (!toolToView) return true

    const descriptionChanged = editingDescription.trim() !== (toolToView.toolDescription || '')

    const schema = toolToView.parameterSchema as
      | { properties?: Record<string, { type?: string; description?: string }> }
      | undefined
    const properties = schema?.properties || {}
    const paramDescriptionsChanged = Object.keys(properties).some((name) => {
      const original = properties[name]?.description || ''
      const edited = editingParameterDescriptions[name]?.trim() || ''
      return original !== edited
    })

    return !descriptionChanged && !paramDescriptionsChanged
  })()

  const tools = useMemo(() => data?.tools ?? [], [data?.tools])

  const availableWorkflows = useMemo(() => {
    const existingWorkflowIds = new Set(tools.map((t) => t.workflowId))
    return deployedWorkflows.filter((w) => !existingWorkflowIds.has(w.id))
  }, [deployedWorkflows, tools])
  const canAddWorkflow = availableWorkflows.length > 0
  const showAddDisabledTooltip = !canAddWorkflow && deployedWorkflows.length > 0

  const workflowOptions: ComboboxOption[] = useMemo(() => {
    return availableWorkflows.map((w) => ({
      label: w.name,
      value: w.id,
    }))
  }, [availableWorkflows])

  const selectedWorkflow = useMemo(() => {
    return availableWorkflows.find((w) => w.id === selectedWorkflowId)
  }, [availableWorkflows, selectedWorkflowId])

  const getConfigSnippet = useCallback(
    (client: McpClientType, isPublic: boolean, serverName: string): string => {
      const safeName = serverName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')

      if (client === 'sim') {
        return ''
      }

      if (client === 'claude-code') {
        if (isPublic) {
          return `claude mcp add "${safeName}" --url "${mcpServerUrl}"`
        }
        return `claude mcp add "${safeName}" --url "${mcpServerUrl}" --header "X-API-Key:$SIM_API_KEY"`
      }

      if (client === 'cursor') {
        const cursorConfig = isPublic
          ? { url: mcpServerUrl }
          : { url: mcpServerUrl, headers: { 'X-API-Key': '$SIM_API_KEY' } }

        return JSON.stringify({ mcpServers: { [safeName]: cursorConfig } }, null, 2)
      }

      const mcpRemoteArgs = isPublic
        ? ['-y', 'mcp-remote', mcpServerUrl]
        : ['-y', 'mcp-remote', mcpServerUrl, '--header', 'X-API-Key:$SIM_API_KEY']

      const baseServerConfig = {
        command: 'npx',
        args: mcpRemoteArgs,
      }

      if (client === 'vscode') {
        return JSON.stringify(
          {
            servers: {
              [safeName]: {
                type: 'stdio',
                ...baseServerConfig,
              },
            },
          },
          null,
          2
        )
      }

      return JSON.stringify(
        {
          mcpServers: {
            [safeName]: baseServerConfig,
          },
        },
        null,
        2
      )
    },
    [mcpServerUrl]
  )

  const handleCopyConfig = useCallback(
    (isPublic: boolean, serverName: string) => {
      const snippet = getConfigSnippet(activeConfigTab, isPublic, serverName)
      navigator.clipboard.writeText(snippet)
      setCopiedConfig(true)
      setTimeout(() => setCopiedConfig(false), 2000)
    },
    [activeConfigTab, getConfigSnippet]
  )

  const handleOpenEditServer = useCallback(() => {
    if (data?.server) {
      setEditServerName(data.server.name)
      setEditServerDescription(data.server.description || '')
      setEditServerIsPublic(data.server.isPublic)
      setShowEditServer(true)
    }
  }, [data?.server])

  const handleSaveServerEdit = async () => {
    if (!editServerName.trim()) return
    try {
      await updateServerMutation.mutateAsync({
        workspaceId,
        serverId,
        name: editServerName.trim(),
        description: editServerDescription.trim() || undefined,
        isPublic: editServerIsPublic,
      })
      setShowEditServer(false)
    } catch (err) {
      logger.error('Failed to update server:', err)
    }
  }

  const getCursorInstallUrl = useCallback(
    (isPublic: boolean, serverName: string): string => {
      const safeName = serverName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')

      const config = isPublic
        ? { url: mcpServerUrl }
        : { url: mcpServerUrl, headers: { 'X-API-Key': '$SIM_API_KEY' } }

      const base64Config = btoa(JSON.stringify(config))
      return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(safeName)}&config=${encodeURIComponent(base64Config)}`
    },
    [mcpServerUrl]
  )

  if (isLoading) {
    return <SettingsPanel back={{ text: 'MCP 服务器', icon: ArrowLeft, onSelect: onBack }} />
  }

  if (error || !data) {
    return (
      <SettingsPanel back={{ text: 'MCP 服务器', icon: ArrowLeft, onSelect: onBack }}>
        <div className='flex min-h-0 flex-1 items-center justify-center'>
          <p className='text-[var(--text-error)] text-xs leading-tight'>加载服务器详情失败</p>
        </div>
      </SettingsPanel>
    )
  }

  const { server } = data

  return (
    <>
      <SettingsPanel
        back={{ text: 'MCP 服务器', icon: ArrowLeft, onSelect: onBack }}
        title={server.name}
        actions={[
          { text: '编辑服务器', onSelect: handleOpenEditServer },
          {
            text: '添加工作流',
            icon: Plus,
            variant: 'primary',
            onSelect: () => setShowAddWorkflow(true),
            disabled: !canAddWorkflow,
            tooltip: showAddDisabledTooltip ? '所有已发布的工作流都已添加到此服务器。' : undefined,
          },
        ]}
      >
        <div className='flex min-h-0 flex-1 flex-col'>
          <ChipModalTabs
            tabs={[
              { value: 'details', label: '详情' },
              { value: 'workflows', label: '工作流' },
            ]}
            value={activeServerTab}
            onChange={(value) => setActiveServerTab(value as 'workflows' | 'details')}
          />

          <div className='min-h-[300px] pt-4'>
            {activeServerTab === 'workflows' && (
              <div className='flex flex-col gap-4.5'>
                <span className='font-medium text-[var(--text-primary)] text-sm'>工作流</span>

                {tools.length === 0 ? (
                  <p className='text-[var(--text-muted)] text-sm'>
                    尚未添加工作流。点击"添加工作流"添加已发布的工作流。
                  </p>
                ) : (
                  <div className='flex flex-col gap-2'>
                    {tools.map((tool) => (
                      <div key={tool.id} className='flex items-center justify-between gap-3'>
                        <div className='flex min-w-0 flex-col justify-center gap-[1px]'>
                          <span className='text-[14px] text-[var(--text-body)]'>
                            {tool.toolName}
                          </span>
                          <p className='truncate text-[12px] text-[var(--text-muted)]'>
                            {tool.toolDescription || '暂无描述'}
                          </p>
                        </div>
                        <div className='flex flex-shrink-0 items-center gap-1'>
                          <RowActionsMenu
                            label='工具操作'
                            actions={[
                              { label: '编辑', onSelect: () => handleOpenToolEdit(tool) },
                              {
                                label: '移除',
                                destructive: true,
                                disabled: deleteToolMutation.isPending,
                                onSelect: () => setToolToDelete(tool),
                              },
                            ]}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {deployedWorkflows.length === 0 && !isLoadingWorkflows && (
                  <p className='mt-1 text-[var(--text-muted)] text-xs'>
                    请先发布工作流，再将其添加到此服务器。
                  </p>
                )}
              </div>
            )}

            {activeServerTab === 'details' && (
              <div className='flex flex-col gap-4.5'>
                <div className='grid grid-cols-[1fr_1fr_1fr] gap-x-6 gap-y-3.5'>
                  <div className='flex flex-col gap-1'>
                    <span className='font-medium text-[var(--text-primary)] text-sm'>
                      服务器名称
                    </span>
                    <p className='text-[var(--text-secondary)] text-base'>{server.name}</p>
                  </div>
                  <div className='flex flex-col gap-1'>
                    <span className='font-medium text-[var(--text-primary)] text-sm'>传输方式</span>
                    <p className='text-[var(--text-secondary)] text-base'>Streamable-HTTP</p>
                  </div>
                  <div className='flex flex-col gap-1'>
                    <span className='font-medium text-[var(--text-primary)] text-sm'>访问权限</span>
                    <p className='text-[var(--text-secondary)] text-base'>
                      {server.isPublic ? '公开' : 'API 密钥'}
                    </p>
                  </div>
                </div>

                {server.description?.trim() && (
                  <div className='flex flex-col gap-1'>
                    <span className='font-medium text-[var(--text-primary)] text-sm'>描述</span>
                    <p className='text-[var(--text-secondary)] text-base'>{server.description}</p>
                  </div>
                )}

                <div className='flex flex-col gap-1'>
                  <span className='font-medium text-[var(--text-primary)] text-sm'>URL</span>
                  <p className='break-all text-[var(--text-secondary)] text-base'>{mcpServerUrl}</p>
                </div>

                <div>
                  <div className='mb-[6.5px] flex items-center justify-between'>
                    <span className='block pl-0.5 font-medium text-[var(--text-primary)] text-sm'>
                      MCP 客户端
                    </span>
                  </div>
                  <ButtonGroup
                    value={activeConfigTab}
                    onValueChange={(v) => setActiveConfigTab(v as McpClientType)}
                  >
                    <ButtonGroupItem value='cursor'>Cursor</ButtonGroupItem>
                    <ButtonGroupItem value='claude-code'>Claude Code</ButtonGroupItem>
                    <ButtonGroupItem value='claude-desktop'>Claude Desktop</ButtonGroupItem>
                    <ButtonGroupItem value='vscode'>VS Code</ButtonGroupItem>
                    <ButtonGroupItem value='sim'>Sim</ButtonGroupItem>
                  </ButtonGroup>
                </div>

                {activeConfigTab === 'sim' ? (
                  <div className='rounded-lg border border-[var(--border-1)] p-4'>
                    <div className='flex flex-col gap-3'>
                      <p className='text-[var(--text-secondary)] text-small'>
                        将此 MCP 服务器添加到你的工作区，即可通过 MCP
                        节点在其他工作流中使用它的工具。
                      </p>
                      <Button
                        variant='primary'
                        className='self-start'
                        disabled={addToWorkspaceMutation.isPending || addedToWorkspace}
                        onClick={async () => {
                          try {
                            const headers: Record<string, string> = server.isPublic
                              ? {}
                              : { 'X-API-Key': '{{SIM_API_KEY}}' }
                            await addToWorkspaceMutation.mutateAsync({
                              workspaceId,
                              config: {
                                name: server.name,
                                transport: 'streamable-http',
                                url: mcpServerUrl,
                                timeout: 30000,
                                headers,
                                enabled: true,
                              },
                            })
                            setAddedToWorkspace(true)
                            addedToWorkspaceTimerRef.current = setTimeout(
                              () => setAddedToWorkspace(false),
                              3000
                            )
                          } catch (err) {
                            logger.error('Failed to add server to workspace:', err)
                          }
                        }}
                      >
                        {addToWorkspaceMutation.isPending ? (
                          '添加中…'
                        ) : addedToWorkspace ? (
                          <>
                            <Check className='mr-1.5 size-[14px]' />
                            已添加到工作区
                          </>
                        ) : (
                          <>
                            <Server className='mr-1.5 size-[14px]' />
                            添加到工作区
                          </>
                        )}
                      </Button>
                      {addToWorkspaceMutation.isError && (
                        <p className='text-[var(--text-error)] text-xs'>
                          {addToWorkspaceMutation.error?.message || '添加服务器失败'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className='mb-[6.5px] flex items-center justify-between'>
                      <span className='block pl-0.5 font-medium text-[var(--text-primary)] text-sm'>
                        配置
                      </span>
                      <Button
                        variant='ghost'
                        onClick={() => handleCopyConfig(server.isPublic, server.name)}
                        className='!p-1.5 -my-1.5'
                      >
                        {copiedConfig ? (
                          <Check className='size-[14px]' />
                        ) : (
                          <Clipboard className='size-[14px]' />
                        )}
                      </Button>
                    </div>
                    <div className='relative'>
                      <Code.Viewer
                        code={getConfigSnippet(activeConfigTab, server.isPublic, server.name)}
                        language={activeConfigTab === 'claude-code' ? 'javascript' : 'json'}
                        wrapText
                        className='!min-h-0 rounded-sm border border-[var(--border-1)]'
                      />
                      {activeConfigTab === 'cursor' && (
                        <a
                          href={getCursorInstallUrl(server.isPublic, server.name)}
                          className='absolute top-1.5 right-2 inline-flex rounded-md bg-[var(--surface-5)] ring-1 ring-[var(--border-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]'
                        >
                          <img
                            src='https://cursor.com/deeplink/mcp-install-dark.svg'
                            alt='添加到 Cursor'
                            className='h-[26px] rounded-md align-middle'
                          />
                        </a>
                      )}
                    </div>
                    {!server.isPublic && (
                      <p className='mt-2 text-[var(--text-muted)] text-xs'>
                        将 $SIM_API_KEY 替换为你的 API 密钥，或{' '}
                        <button
                          type='button'
                          onClick={() => setShowCreateApiKeyModal(true)}
                          className='underline hover-hover:text-[var(--text-secondary)]'
                        >
                          立即创建
                        </button>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SettingsPanel>

      <ChipConfirmModal
        open={!!toolToDelete}
        onOpenChange={(open) => !open && setToolToDelete(null)}
        srTitle='移除工作流'
        title='移除工作流'
        text={[
          '确定要从该服务器移除 ',
          { text: toolToDelete?.toolName ?? '此工作流', bold: true },
          ' 吗？该工作流仍保持已发布状态，之后可以重新添加。',
        ]}
        confirm={{
          label: '移除',
          onClick: handleDeleteTool,
          pending: deleteToolMutation.isPending,
          pendingLabel: '移除中…',
        }}
      />

      <ChipModal
        open={!!toolToView}
        onOpenChange={(open) => {
          if (!open) {
            setToolToView(null)
            setEditingDescription('')
            setEditingParameterDescriptions({})
          }
        }}
        srTitle={toolToView?.toolName ?? '编辑工具'}
      >
        <ChipModalHeader onClose={() => setToolToView(null)}>
          {toolToView?.toolName}
        </ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='textarea'
            title='描述'
            value={editingDescription}
            onChange={setEditingDescription}
            placeholder='描述这个工具的作用…'
            minHeight={80}
          />

          <ChipModalField type='custom' title='参数'>
            {(() => {
              const schema = toolToView?.parameterSchema as
                | { properties?: Record<string, { type?: string; description?: string }> }
                | undefined
              const properties = schema?.properties
              const hasParams = properties && Object.keys(properties).length > 0
              return hasParams ? (
                <div className='flex flex-col gap-2'>
                  {Object.entries(properties).map(([name, prop]) => (
                    <div
                      key={name}
                      className='overflow-hidden rounded-sm border border-[var(--border-1)]'
                    >
                      <div className='flex items-center justify-between bg-[var(--surface-4)] px-2.5 py-[5px]'>
                        <div className='flex min-w-0 flex-1 items-center gap-2'>
                          <span className='block truncate font-medium text-[var(--text-tertiary)] text-base'>
                            {name}
                          </span>
                          <Badge variant='type' size='sm'>
                            {prop.type || 'any'}
                          </Badge>
                        </div>
                      </div>
                      <div className='rounded-b-[4px] border-[var(--border-1)] border-t bg-[var(--surface-2)] px-2.5 pt-1.5 pb-2.5'>
                        <div className='flex flex-col gap-1.5'>
                          <Label className='text-sm'>描述</Label>
                          <ChipInput
                            value={editingParameterDescriptions[name] || ''}
                            onChange={(e) =>
                              setEditingParameterDescriptions((prev) => ({
                                ...prev,
                                [name]: e.target.value,
                              }))
                            }
                            placeholder={`请输入 ${name} 的描述`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='text-[var(--text-muted)] text-sm'>此工作流未配置输入参数。</p>
              )
            })()}
          </ChipModalField>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setToolToView(null)}
          primaryAction={{
            label: updateToolMutation.isPending ? '保存中…' : '保存',
            onClick: handleSaveToolEdit,
            disabled: isSaveToolDisabled,
          }}
        />
      </ChipModal>

      <ChipModal
        open={showAddWorkflow}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddWorkflow(false)
            setSelectedWorkflowId(null)
          }
        }}
        srTitle='添加工作流'
      >
        <ChipModalHeader
          onClose={() => {
            setShowAddWorkflow(false)
            setSelectedWorkflowId(null)
          }}
        >
          添加工作流
        </ChipModalHeader>
        <ChipModalBody>
          <p className='px-2 text-[var(--text-secondary)] text-sm'>
            选择要添加到此 MCP 服务器的已发布工作流。该工作流将作为一个工具提供。
          </p>
          <ChipModalField type='custom' title='选择工作流'>
            <ChipSelect
              options={workflowOptions}
              value={selectedWorkflowId || undefined}
              onChange={(value: string) => setSelectedWorkflowId(value)}
              placeholder='选择一个工作流…'
              searchable
              searchPlaceholder='搜索工作流…'
              disabled={addToolMutation.isPending}
              fullWidth
              dropdownWidth='trigger'
              align='start'
              displayLabel={selectedWorkflow?.name}
            />
          </ChipModalField>
          <ChipModalError>
            {addToolMutation.isError ? addToolMutation.error?.message || '添加工作流失败' : null}
          </ChipModalError>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => {
            setShowAddWorkflow(false)
            setSelectedWorkflowId(null)
          }}
          primaryAction={{
            label: addToolMutation.isPending ? '添加中…' : '添加工作流',
            onClick: handleAddWorkflow,
            disabled: !selectedWorkflowId || addToolMutation.isPending,
          }}
        />
      </ChipModal>

      <ChipModal
        open={showEditServer}
        onOpenChange={(open) => {
          if (!open) {
            setShowEditServer(false)
          }
        }}
        srTitle='编辑服务器'
      >
        <ChipModalHeader onClose={() => setShowEditServer(false)}>编辑服务器</ChipModalHeader>
        <ChipModalBody>
          <ChipModalField
            type='input'
            title='服务器名称'
            required
            value={editServerName}
            onChange={setEditServerName}
            placeholder='例如：我的 MCP 服务器'
          />
          <ChipModalField
            type='textarea'
            title='描述'
            value={editServerDescription}
            onChange={setEditServerDescription}
            placeholder='描述此 MCP 服务器的用途（可选）'
            minHeight={60}
          />
          <ChipModalField type='custom' title='访问权限'>
            <div className='flex flex-col gap-1.5'>
              <ButtonGroup
                value={editServerIsPublic ? 'public' : 'private'}
                onValueChange={(value) => setEditServerIsPublic(value === 'public')}
              >
                <ButtonGroupItem value='private'>API 密钥</ButtonGroupItem>
                <ButtonGroupItem value='public'>公开</ButtonGroupItem>
              </ButtonGroup>
              <p className='text-[var(--text-muted)] text-xs'>
                {editServerIsPublic
                  ? '任何拥有该 URL 的人都可以在无需认证的情况下调用此服务器'
                  : '请求必须在 X-API-Key 请求头中包含你的 Sim API 密钥'}
              </p>
            </div>
          </ChipModalField>
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => setShowEditServer(false)}
          primaryAction={{
            label: updateServerMutation.isPending ? '保存中…' : '保存',
            onClick: handleSaveServerEdit,
            disabled:
              !editServerName.trim() ||
              updateServerMutation.isPending ||
              (editServerName === server.name &&
                editServerDescription === (server.description || '') &&
                editServerIsPublic === server.isPublic),
          }}
        />
      </ChipModal>

      <CreateApiKeyModal
        open={showCreateApiKeyModal}
        onOpenChange={setShowCreateApiKeyModal}
        workspaceId={workspaceId}
        existingKeyNames={existingKeyNames}
        allowPersonalApiKeys={allowPersonalApiKeys}
        canManageWorkspaceKeys={canManageWorkspaceKeys}
        defaultKeyType={defaultKeyType}
      />
    </>
  )
}

/**
 * MCP Servers settings component.
 * Allows users to create and manage MCP servers that expose workflows as tools.
 */
export function WorkflowMcpServers() {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const searchParams = useSearchParams()

  const { data: servers = [], isLoading, error } = useWorkflowMcpServers(workspaceId)
  const { data: deployedWorkflows = [] } = useDeployedWorkflows(workspaceId)
  const deleteServerMutation = useDeleteWorkflowMcpServer()

  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(() =>
    searchParams.get('mcpServerId')
  )
  const [serverToDelete, setServerToDelete] = useState<WorkflowMcpServer | null>(null)
  const [deletingServers, setDeletingServers] = useState<Set<string>>(() => new Set())

  const filteredServers = useMemo(() => {
    if (!searchTerm.trim()) return servers
    const search = searchTerm.toLowerCase()
    return servers.filter((server) => server.name.toLowerCase().includes(search))
  }, [servers, searchTerm])

  const workflowOptions: ComboboxOption[] = useMemo(() => {
    return deployedWorkflows.map((w) => ({
      label: w.name,
      value: w.id,
    }))
  }, [deployedWorkflows])

  const handleDeleteServer = async () => {
    if (!serverToDelete) return

    setDeletingServers((prev) => new Set(prev).add(serverToDelete.id))
    setServerToDelete(null)

    try {
      await deleteServerMutation.mutateAsync({
        workspaceId,
        serverId: serverToDelete.id,
      })
    } catch (err) {
      logger.error('Failed to delete server:', err)
    } finally {
      setDeletingServers((prev) => {
        const next = new Set(prev)
        next.delete(serverToDelete.id)
        return next
      })
    }
  }

  const hasServers = servers.length > 0
  const showNoResults = searchTerm.trim() && filteredServers.length === 0 && hasServers

  if (selectedServerId) {
    return (
      <ServerDetailView
        workspaceId={workspaceId}
        serverId={selectedServerId}
        onBack={() => setSelectedServerId(null)}
      />
    )
  }

  const actions: SettingsAction[] = [
    {
      text: '添加服务器',
      icon: Plus,
      variant: 'primary',
      onSelect: () => setShowAddModal(true),
      disabled: isLoading,
    },
  ]

  return (
    <>
      <SettingsPanel
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: '搜索服务器…',
        }}
        actions={actions}
      >
        <div className='min-h-0 flex-1'>
          {error ? (
            <div className='flex h-full flex-col items-center justify-center gap-2'>
              <p className='text-[var(--text-error)] text-sm leading-tight'>
                {getErrorMessage(error, '加载 MCP 服务器失败')}
              </p>
            </div>
          ) : isLoading ? null : !hasServers ? (
            <SettingsEmptyState>点击上方"添加服务器"开始使用</SettingsEmptyState>
          ) : (
            <div className='flex flex-col gap-2'>
              {filteredServers.map((server) => {
                const count = server.toolCount || 0
                const toolsLabel = `${count} 个工具`
                const isDeleting = deletingServers.has(server.id)
                return (
                  <div key={server.id} className='flex items-center justify-between gap-3'>
                    <div className='flex min-w-0 flex-col justify-center gap-[1px]'>
                      <div className='flex items-center gap-1.5'>
                        <span className='max-w-[200px] truncate text-[14px] text-[var(--text-body)]'>
                          {server.name}
                        </span>
                        {server.isPublic && (
                          <Badge variant='outline' size='sm'>
                            公开
                          </Badge>
                        )}
                      </div>
                      <p className='truncate text-[12px] text-[var(--text-muted)]'>{toolsLabel}</p>
                    </div>
                    <div className='flex flex-shrink-0 items-center gap-1'>
                      <RowActionsMenu
                        label='服务器操作'
                        actions={[
                          { label: '详情', onSelect: () => setSelectedServerId(server.id) },
                          {
                            label: '删除',
                            destructive: true,
                            disabled: isDeleting,
                            onSelect: () => setServerToDelete(server),
                          },
                        ]}
                      />
                    </div>
                  </div>
                )
              })}
              {showNoResults && (
                <SettingsEmptyState variant='inline'>
                  未找到与"{searchTerm}"匹配的服务器
                </SettingsEmptyState>
              )}
            </div>
          )}
        </div>
      </SettingsPanel>

      <CreateWorkflowMcpServerModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        workspaceId={workspaceId}
        workflowOptions={workflowOptions}
      />

      <ChipConfirmModal
        open={!!serverToDelete}
        onOpenChange={(open) => !open && setServerToDelete(null)}
        srTitle='删除 MCP 服务器'
        title='删除 MCP 服务器'
        text={[
          '确定要删除 ',
          { text: serverToDelete?.name ?? '此服务器', bold: true },
          '？此操作无法撤销。',
        ]}
        confirm={{ label: '删除', onClick: handleDeleteServer }}
      />
    </>
  )
}
