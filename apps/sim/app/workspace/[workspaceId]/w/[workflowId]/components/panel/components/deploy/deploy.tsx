'use client'

import { useState } from 'react'
import { Button, Tooltip } from '@sim/emcn'
import { DeployModal } from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/components/deploy-modal/deploy-modal'
import {
  useChangeDetection,
  useDeployment,
  useDeployReadiness,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks'
import { useCurrentWorkflow } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-current-workflow'
import { useDeployedWorkflowState, useDeploymentInfo } from '@/hooks/queries/deployments'
import type { WorkspaceUserPermissions } from '@/hooks/use-user-permissions'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

interface DeployProps {
  activeWorkflowId: string | null
  userPermissions: WorkspaceUserPermissions
  className?: string
  disabled?: boolean
}

export function Deploy({
  activeWorkflowId,
  userPermissions,
  className,
  disabled = false,
}: DeployProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const hydrationPhase = useWorkflowRegistry((state) => state.hydration.phase)
  const isRegistryLoading = hydrationPhase === 'idle' || hydrationPhase === 'state-loading'
  const { hasBlocks } = useCurrentWorkflow()

  const { data: deploymentInfo } = useDeploymentInfo(activeWorkflowId, {
    enabled: !isRegistryLoading,
  })
  const isDeployed = deploymentInfo?.isDeployed ?? false

  const isDeployedStateEnabled = Boolean(activeWorkflowId) && isDeployed && !isRegistryLoading
  const {
    data: deployedStateData,
    isLoading: isLoadingDeployedState,
    isFetching: isFetchingDeployedState,
  } = useDeployedWorkflowState(activeWorkflowId, { enabled: isDeployedStateEnabled })
  const deployedState = isDeployedStateEnabled ? (deployedStateData ?? null) : null
  const deployReadiness = useDeployReadiness(activeWorkflowId)

  const { changeDetected, isChangeDetectionSettling } = useChangeDetection({
    workflowId: activeWorkflowId,
    deployedState,
    isLoadingDeployedState: isLoadingDeployedState || isFetchingDeployedState,
  })
  const isDeploymentSettling = isChangeDetectionSettling || deployReadiness.isSyncing

  const { isDeploying, handleDeployClick } = useDeployment({
    workflowId: activeWorkflowId,
    isDeployed,
    deployReadiness,
  })

  const isEmpty = !hasBlocks()
  const canDeploy = userPermissions.canAdmin
  const isDisabled =
    disabled ||
    isDeploying ||
    !canDeploy ||
    isEmpty ||
    (!isDeployed && deployReadiness.isBlocked && !deployReadiness.isSyncing)

  const onDeployClick = async () => {
    if (disabled || !canDeploy || !activeWorkflowId) return

    if (isDeploymentSettling) {
      setIsModalOpen(true)
      return
    }

    const result = await handleDeployClick()
    if (result.shouldOpenModal) {
      setIsModalOpen(true)
    }
  }

  const getTooltipText = () => {
    if (isEmpty) {
      return '无法部署空工作流'
    }
    if (!canDeploy) {
      return '需要管理员权限'
    }
    if (disabled) {
      return '工作流已锁定'
    }
    if (isDeploying) {
      return '部署中…'
    }
    if (isChangeDetectionSettling) {
      return '同步部署状态中…'
    }
    if (deployReadiness.isBlocked && !isDeployed) {
      return deployReadiness.tooltip
    }
    if (changeDetected) {
      return '更新部署'
    }
    if (isDeployed) {
      return '已部署'
    }
    return '部署工作流'
  }

  const getButtonLabel = () => {
    if (changeDetected) {
      return '更新'
    }
    if (isDeployed) {
      return '在线'
    }
    return '部署'
  }

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span>
            <Button
              className='h-[30px] gap-1.5 px-2.5'
              variant={
                isRegistryLoading ? 'active' : changeDetected || !isDeployed ? 'tertiary' : 'active'
              }
              onClick={onDeployClick}
              disabled={isRegistryLoading || isDisabled}
            >
              {getButtonLabel()}
            </Button>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>{getTooltipText()}</Tooltip.Content>
      </Tooltip.Root>

      <DeployModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        workflowId={activeWorkflowId}
        isDeployed={isDeployed}
        needsRedeployment={changeDetected}
        deployedState={deployedState}
        isLoadingDeployedState={isLoadingDeployedState || isFetchingDeployedState}
        deployReadiness={deployReadiness}
        isDeploymentSettling={isDeploymentSettling}
      />
    </>
  )
}
