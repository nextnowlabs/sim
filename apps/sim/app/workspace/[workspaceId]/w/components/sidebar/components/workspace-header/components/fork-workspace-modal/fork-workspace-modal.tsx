'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Chip,
  ChipConfirmModal,
  ChipCopyInput,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalFooter,
  type ChipModalFooterSlotAction,
  ChipModalHeader,
  ChipModalTabs,
  Tooltip,
  toast,
} from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { GetForkResourcesResponse } from '@/lib/api/contracts/workspace-fork'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { ForkActivityPanel } from '@/app/workspace/[workspaceId]/w/components/sidebar/components/workspace-header/components/fork-activity-panel/fork-activity-panel'
import {
  FileKindRow,
  ResourceKindRow,
} from '@/app/workspace/[workspaceId]/w/components/sidebar/components/workspace-header/components/fork-resource-picker/fork-resource-picker'
import {
  type ForkDirection,
  useForkResources,
  useForkWorkspace,
  useRollbackFork,
} from '@/hooks/queries/workspace-fork'

interface ForkWorkspaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceWorkspaceId: string
  sourceWorkspaceName: string
  /** The last sync into this workspace that can be undone (drives the rollback action). */
  undoableRun: { otherWorkspaceId: string; otherName: string; direction: ForkDirection } | null
  /** Whether the user is under their workspace cap; creating a fork is gated on this. */
  canFork: boolean
  /** Sends the user to upgrade (billing) when they try to fork at the cap. */
  onUpgrade: () => void
}

type ResourceKey = Exclude<keyof GetForkResourcesResponse, 'deployedWorkflowCount'>
type ResourceSelection = Record<ResourceKey, Set<string>>

const RESOURCE_KINDS: ReadonlyArray<{ key: ResourceKey; label: string }> = [
  { key: 'files', label: '文件' },
  { key: 'tables', label: '表格' },
  { key: 'knowledgeBases', label: '知识库' },
  { key: 'customTools', label: '自定义工具' },
  { key: 'skills', label: '技能' },
  { key: 'workflowMcpServers', label: '工作流 MCP 服务器' },
]

const emptySelection = (): ResourceSelection => ({
  files: new Set(),
  tables: new Set(),
  knowledgeBases: new Set(),
  customTools: new Set(),
  skills: new Set(),
  workflowMcpServers: new Set(),
})

const fullSelection = (data: GetForkResourcesResponse): ResourceSelection => {
  const selection = emptySelection()
  for (const kind of RESOURCE_KINDS) {
    selection[kind.key] = new Set((data[kind.key] ?? []).map((item) => item.id))
  }
  return selection
}

/**
 * Names and creates a fork of the current workspace, lets the user pick which
 * resources to copy (whole kinds or a specific subset), then navigates into the new
 * fork. Unselected resources leave the corresponding workflow subblocks empty.
 */
export function ForkWorkspaceModal({
  open,
  onOpenChange,
  sourceWorkspaceId,
  sourceWorkspaceName,
  undoableRun,
  canFork,
  onUpgrade,
}: ForkWorkspaceModalProps) {
  const router = useRouter()
  const forkWorkspace = useForkWorkspace()
  const rollback = useRollbackFork()
  const resources = useForkResources(sourceWorkspaceId, open)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<ResourceSelection>(emptySelection)
  const [defaulted, setDefaulted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'config' | 'activity'>('config')
  const [forkedWorkspace, setForkedWorkspace] = useState<{ id: string; name: string } | null>(null)
  const [confirmRollbackOpen, setConfirmRollbackOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setName(`${sourceWorkspaceName} (fork)`)
      setSelected(emptySelection())
      setDefaulted(false)
      setError(null)
      setActiveTab('config')
      setForkedWorkspace(null)
      setConfirmRollbackOpen(false)
    }
  }, [open, sourceWorkspaceName])

  useEffect(() => {
    if (!open || !resources.data || defaulted) return
    setDefaulted(true)
    setSelected(fullSelection(resources.data))
  }, [open, resources.data, defaulted])

  const isForking = forkWorkspace.isPending

  const availableKinds = useMemo(
    () => RESOURCE_KINDS.filter((kind) => (resources.data?.[kind.key].length ?? 0) > 0),
    [resources.data]
  )

  const hasDeselection = useMemo(
    () =>
      defaulted &&
      availableKinds.some(
        (kind) => selected[kind.key].size < (resources.data?.[kind.key]?.length ?? 0)
      ),
    [defaulted, availableKinds, selected, resources.data]
  )

  // A fork always produces a usable workspace: deployed workflows are copied, and
  // when the source has none, create-fork seeds a blank starter workflow (plus any
  // selected resources). So forking is never blocked - we just set expectations when
  // there are no deployed workflows to carry over.
  const noDeployedWorkflows =
    Boolean(resources.data) && (resources.data?.deployedWorkflowCount ?? 0) === 0

  const handleSubmit = () => {
    // At a workspace cap, creating a fork is the only gated action - send the user to
    // upgrade rather than blocking the whole modal (rollback / Activity stay reachable).
    if (!canFork) {
      onUpgrade()
      return
    }
    const trimmed = name.trim()
    // Block until the resources query resolves: building `copy` from an unloaded `resources.data`
    // would send an empty selection and silently clear every reference in the fork. The Fork
    // action is disabled in this state too; this is the defense-in-depth guard.
    if (!trimmed || isForking || !resources.data) return
    setError(null)
    const copy = Object.fromEntries(
      RESOURCE_KINDS.map((kind) => [kind.key, Array.from(selected[kind.key])])
    )
    forkWorkspace.mutate(
      { workspaceId: sourceWorkspaceId, body: { name: trimmed, copy } },
      {
        onSuccess: (result) => {
          toast.success(`已创建副本 "${result.workspace.name}"`)
          setForkedWorkspace({ id: result.workspace.id, name: result.workspace.name })
          setActiveTab('activity')
        },
        onError: (err) => setError(err.message || '创建副本失败'),
      }
    )
  }

  const openFork = () => {
    if (!forkedWorkspace) return
    onOpenChange(false)
    router.push(`/workspace/${forkedWorkspace.id}/w`)
  }

  // Rollback undoes the last sync INTO this workspace, restoring each affected workflow
  // to its prior deployed version. Lives in the Activity tab's footer.
  const runRollback = async () => {
    if (!undoableRun) return
    try {
      await rollback.mutateAsync({
        workspaceId: sourceWorkspaceId,
        body: { otherWorkspaceId: undoableRun.otherWorkspaceId },
      })
      toast.success(`已撤销来自 "${undoableRun.otherName}" 的同步`)
      setConfirmRollbackOpen(false)
      setActiveTab('activity')
    } catch (err) {
      toast.error(getErrorMessage(err, '撤销失败'))
    }
  }

  const rollbackDisabled = rollback.isPending || !undoableRun
  const rollbackTooltip = undoableRun
    ? `该工作区的上次同步(来自 ${undoableRun.otherName})可以撤销 — 将恢复每个工作流之前的已发布版本。`
    : '暂无可回滚的同步。'
  const rollbackChip = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className={rollbackDisabled ? 'inline-flex cursor-not-allowed' : 'inline-flex'}>
          <Chip
            variant='destructive'
            flush
            onClick={() => setConfirmRollbackOpen(true)}
            disabled={rollbackDisabled}
            className={rollbackDisabled ? 'pointer-events-none' : undefined}
          >
            回滚
          </Chip>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content>{rollbackTooltip}</Tooltip.Content>
    </Tooltip.Root>
  )
  const rollbackAction: ChipModalFooterSlotAction[] =
    activeTab === 'activity' && undoableRun ? [{ custom: rollbackChip }] : []

  return (
    <>
      <ChipModal open={open} onOpenChange={onOpenChange} srTitle='管理副本'>
        <ChipModalHeader onClose={() => onOpenChange(false)}>管理副本</ChipModalHeader>
        <ChipModalBody>
          <ChipModalTabs
            tabs={[
              { value: 'config', label: '创建副本' },
              { value: 'activity', label: '活动' },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as 'config' | 'activity')}
            className='mx-2'
          />
          {activeTab === 'activity' ? (
            <ForkActivityPanel
              pending={isForking || rollback.isPending}
              pendingLabel={rollback.isPending ? '正在撤销上次同步…' : '正在创建副本…'}
              backgroundWorkspaceId={sourceWorkspaceId}
            />
          ) : (
            <>
              <div className='flex flex-col gap-7 px-2'>
                <SettingsSection label='副本来源'>
                  <ChipCopyInput value={sourceWorkspaceName} aria-label='副本来源' />
                </SettingsSection>

                <SettingsSection
                  label='名称'
                  headerAccessory={
                    <span className='text-[var(--text-error)]' title='必填'>
                      *
                    </span>
                  }
                >
                  <ChipInput
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        handleSubmit()
                      }
                    }}
                    placeholder='工作区名称'
                    maxLength={100}
                    autoComplete='off'
                    disabled={isForking}
                    aria-label='工作区名称'
                  />
                </SettingsSection>

                {availableKinds.length > 0 ? (
                  <SettingsSection label='复制资源'>
                    <div className='flex flex-col gap-2'>
                      {availableKinds.map((kind) =>
                        kind.key === 'files' ? (
                          <FileKindRow
                            key={kind.key}
                            label={kind.label}
                            files={resources.data?.files ?? []}
                            selected={selected.files}
                            onToggleAll={(selectAll) =>
                              setSelected((prev) => ({
                                ...prev,
                                files: selectAll
                                  ? new Set((resources.data?.files ?? []).map((item) => item.id))
                                  : new Set<string>(),
                              }))
                            }
                            onToggleItem={(id, checked) =>
                              setSelected((prev) => {
                                const next = new Set(prev.files)
                                if (checked) next.add(id)
                                else next.delete(id)
                                return { ...prev, files: next }
                              })
                            }
                            onToggleMany={(ids, checked) =>
                              setSelected((prev) => {
                                const next = new Set(prev.files)
                                for (const id of ids) {
                                  if (checked) next.add(id)
                                  else next.delete(id)
                                }
                                return { ...prev, files: next }
                              })
                            }
                            disabled={isForking}
                          />
                        ) : (
                          <ResourceKindRow
                            key={kind.key}
                            label={kind.label}
                            items={resources.data?.[kind.key] ?? []}
                            selected={selected[kind.key]}
                            onToggleMany={(ids, checked) =>
                              setSelected((prev) => {
                                const next = new Set(prev[kind.key])
                                for (const id of ids) {
                                  if (checked) next.add(id)
                                  else next.delete(id)
                                }
                                return { ...prev, [kind.key]: next }
                              })
                            }
                            onToggleItem={(id, checked) =>
                              setSelected((prev) => {
                                const next = new Set(prev[kind.key])
                                if (checked) next.add(id)
                                else next.delete(id)
                                return { ...prev, [kind.key]: next }
                              })
                            }
                            disabled={isForking}
                          />
                        )
                      )}
                      {hasDeselection ? (
                        <div className='flex items-start gap-1.5 text-[var(--text-secondary)] text-caption'>
                          <AlertTriangle className='mt-[1px] size-[14px] shrink-0' />
                          <span>部分资源未被选中 — 工作流中对它们的引用将在副本中被清除。</span>
                        </div>
                      ) : (
                        <p className='text-[var(--text-muted)] text-caption'>
                          工作流引用的所有资源都会被复制。取消选择某个资源以跳过它 —
                          其引用将被清除。
                        </p>
                      )}
                    </div>
                  </SettingsSection>
                ) : null}

                {noDeployedWorkflows ? (
                  <p className='text-[var(--text-muted)] text-caption'>
                    没有已发布的工作流可复制 — 副本将以一个空白工作流开始。
                  </p>
                ) : null}
              </div>
              <ChipModalError>{error ?? undefined}</ChipModalError>
            </>
          )}
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => onOpenChange(false)}
          cancelDisabled={isForking}
          secondaryActions={rollbackAction.length > 0 ? rollbackAction : undefined}
          primaryAction={
            activeTab === 'activity'
              ? forkedWorkspace
                ? { label: '打开副本', onClick: openFork }
                : { label: '完成', onClick: () => onOpenChange(false) }
              : {
                  label: isForking ? '创建副本中...' : '创建副本',
                  onClick: handleSubmit,
                  // At the cap the button stays clickable (no name needed) so it can route to
                  // upgrade. Otherwise it needs a name AND the resources query loaded - forking
                  // before `resources.data` arrives would clear every reference (P1-C).
                  disabled: isForking || (canFork && (!name.trim() || !resources.data)),
                  disabledTooltip:
                    canFork && name.trim() && !resources.data ? '正在加载工作区资源…' : undefined,
                }
          }
        />
      </ChipModal>

      <ChipConfirmModal
        open={confirmRollbackOpen}
        onOpenChange={setConfirmRollbackOpen}
        srTitle='撤销上次同步'
        title='撤销上次同步'
        text={[
          '这将把每个受影响的工作流恢复到其 ',
          { text: '之前的已发布版本', bold: true },
          '，并移除同步创建的工作流。是否继续？',
        ]}
        confirm={{
          label: '回滚',
          onClick: () => void runRollback(),
          pending: rollback.isPending,
          pendingLabel: '回滚中...',
        }}
      >
        <div className='flex items-start gap-1.5 px-2 text-[var(--text-secondary)] text-caption'>
          <AlertTriangle className='mt-[1px] size-[14px] shrink-0' />
          <span>
            同步期间复制到该工作区的资源可能会保留 —
            回滚会恢复工作流的旧版本，但不会移除已复制的资源。
          </span>
        </div>
      </ChipConfirmModal>
    </>
  )
}
