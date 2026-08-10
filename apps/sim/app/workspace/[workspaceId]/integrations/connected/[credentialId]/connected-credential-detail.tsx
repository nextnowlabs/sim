'use client'

import { type ComponentType, useCallback, useMemo, useState } from 'react'
import {
  Chip,
  ChipConfirmModal,
  ChipCopyInput,
  ChipInput,
  ChipLink,
  ChipTextarea,
  Send,
  toast,
} from '@sim/emcn'
import { ArrowLeft } from '@sim/emcn/icons'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { useRouter } from 'next/navigation'
import { writeOAuthReturnContext } from '@/lib/credentials/client-state'
import { INTEGRATIONS, resolveOAuthServiceForIntegration } from '@/lib/integrations'
import { getServiceConfigByProviderId } from '@/lib/oauth'
import {
  AddPeopleModal,
  CredentialDetailHeading,
  CredentialDetailLayout,
  CredentialMembersSection,
  DetailSection,
  UnsavedChangesModal,
  useCredentialDetailForm,
} from '@/app/workspace/[workspaceId]/components/credential-detail'
import { IntegrationTile } from '@/app/workspace/[workspaceId]/integrations/components/integrations-showcase'
import {
  useCreateCredentialDraft,
  useDeleteWorkspaceCredential,
  useWorkspaceCredentials,
  type WorkspaceCredential,
} from '@/hooks/queries/credentials'
import {
  useConnectOAuthService,
  useDisconnectOAuthService,
  useOAuthConnections,
} from '@/hooks/queries/oauth/oauth-connections'
import { useOAuthReturnRouter } from '@/hooks/use-oauth-return'

const logger = createLogger('ConnectedCredentialDetail')

interface ConnectedCredentialDetailProps {
  workspaceId: string
  credentialId: string
}

export function ConnectedCredentialDetail({
  workspaceId,
  credentialId,
}: ConnectedCredentialDetailProps) {
  const router = useRouter()
  const integrationsHref = `/workspace/${workspaceId}/integrations`

  useOAuthReturnRouter()

  const { data: credentials = [], isPending: credentialsLoading } = useWorkspaceCredentials({
    workspaceId,
    enabled: Boolean(workspaceId),
  })

  const { data: oauthConnections = [] } = useOAuthConnections()
  const connectOAuthService = useConnectOAuthService()
  const disconnectOAuthService = useDisconnectOAuthService()
  const createDraft = useCreateCredentialDraft()
  const deleteCredential = useDeleteWorkspaceCredential()

  const credential = useMemo<WorkspaceCredential | null>(
    () => credentials.find((c) => c.id === credentialId) ?? null,
    [credentials, credentialId]
  )

  const isAdmin = credential?.role === 'admin'

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const form = useCredentialDetailForm({ credential, isAdmin, backHref: integrationsHref })

  const oauthServiceNameByProviderId = useMemo(
    () => new Map(oauthConnections.map((service) => [service.providerId, service.name])),
    [oauthConnections]
  )
  const resolveProviderLabel = useCallback(
    (providerId?: string | null): string => {
      if (!providerId) return ''
      return oauthServiceNameByProviderId.get(providerId) || providerId
    },
    [oauthServiceNameByProviderId]
  )

  const serviceConfig = useMemo(() => {
    if (!credential?.providerId) return null
    return getServiceConfigByProviderId(credential.providerId)
  }, [credential])

  /**
   * Resolve the integration block type from the credential's OAuth service so
   * the header tile can render with the same brand background used by the rows
   * on the integrations list page. Several integrations can share one service
   * (e.g. Jira and Jira Service Management); the one named after the service
   * is preferred since it is the service's canonical integration.
   */
  const integrationBlockType = useMemo(() => {
    if (!serviceConfig) return ''
    const candidates = INTEGRATIONS.filter(
      (i) => resolveOAuthServiceForIntegration(i)?.providerId === serviceConfig.providerId
    )
    const serviceName = serviceConfig.name.toLowerCase()
    const canonical = candidates.find((i) => i.name.toLowerCase() === serviceName)
    return (canonical ?? candidates[0])?.type ?? ''
  }, [serviceConfig])

  const handleReconnectOAuth = async () => {
    if (!credential || credential.type !== 'oauth' || !credential.providerId || !workspaceId) return
    try {
      await createDraft.mutateAsync({
        workspaceId,
        providerId: credential.providerId,
        displayName: credential.displayName,
        description: credential.description || undefined,
        credentialId: credential.id,
      })

      const oauthPreCount = credentials.filter(
        (c) => c.type === 'oauth' && c.providerId === credential.providerId
      ).length
      writeOAuthReturnContext({
        origin: 'integrations',
        displayName: credential.displayName,
        providerId: credential.providerId,
        preCount: oauthPreCount,
        workspaceId,
        reconnect: true,
        requestedAt: Date.now(),
      })

      await connectOAuthService.mutateAsync({
        providerId: credential.providerId,
        callbackURL: window.location.href,
      })
    } catch (error: unknown) {
      toast.error('无法开始重新连接', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
      logger.error('Failed to reconnect OAuth credential', error)
    }
  }

  const handleConfirmDelete = async () => {
    if (!credential) return
    try {
      if (credential.type === 'service_account') {
        await deleteCredential.mutateAsync(credential.id)
      } else {
        if (!credential.accountId || !credential.providerId) {
          toast.error('无法断开连接', {
            description: '缺少账号信息。请先重新连接此凭据。',
          })
          return
        }
        await disconnectOAuthService.mutateAsync({
          provider: credential.providerId.split('-')[0] || credential.providerId,
          providerId: credential.providerId,
          serviceId: credential.providerId,
          accountId: credential.accountId,
        })
        window.dispatchEvent(
          new CustomEvent('oauth-credentials-updated', {
            detail: { providerId: credential.providerId, workspaceId },
          })
        )
      }
      setShowDeleteConfirmDialog(false)
      router.push(integrationsHref)
    } catch (error) {
      toast.error('断开连接失败', {
        description: getErrorMessage(error, '请稍后重试。'),
      })
      logger.error('Failed to disconnect integration', error)
    }
  }

  const back = (
    <ChipLink href={integrationsHref} onClick={form.handleBackClick} leftIcon={ArrowLeft}>
      集成
    </ChipLink>
  )

  const actions =
    credential && isAdmin ? (
      <>
        {serviceConfig?.authType !== 'service_account' && (
          <Chip
            onClick={handleReconnectOAuth}
            disabled={connectOAuthService.isPending}
            leftIcon={serviceConfig?.icon}
          >
            重新连接
          </Chip>
        )}
        <Chip leftIcon={Send} onClick={() => setIsShareModalOpen(true)}>
          共享
        </Chip>
        <Chip
          onClick={() => setShowDeleteConfirmDialog(true)}
          disabled={disconnectOAuthService.isPending || deleteCredential.isPending}
        >
          断开连接
        </Chip>
        <Chip onClick={form.save} disabled={!form.isDirty || form.isSaving}>
          {form.isSaving ? '保存中…' : '保存'}
        </Chip>
      </>
    ) : null

  if (credentialsLoading && !credential) {
    return (
      <CredentialDetailLayout back={back} actions={actions}>
        <p className='py-12 text-center text-[var(--text-muted)] text-sm'>加载中…</p>
      </CredentialDetailLayout>
    )
  }

  if (!credential) {
    return (
      <CredentialDetailLayout back={back} actions={actions}>
        <p className='py-12 text-center text-[var(--text-muted)] text-sm'>未找到凭据。</p>
      </CredentialDetailLayout>
    )
  }

  const serviceLabel =
    serviceConfig?.name || resolveProviderLabel(credential.providerId) || '未知服务'

  return (
    <>
      <CredentialDetailLayout back={back} actions={actions}>
        <CredentialDetailHeading
          leading={
            serviceConfig ? (
              <IntegrationTile
                blockType={integrationBlockType}
                icon={serviceConfig.icon as ComponentType<{ className?: string }>}
              />
            ) : (
              <div className='flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--border-1)] bg-[var(--bg)]'>
                <span className='font-medium text-[var(--text-tertiary)] text-small'>
                  {resolveProviderLabel(credential.providerId).slice(0, 1) || '?'}
                </span>
              </div>
            )
          }
          title={serviceLabel}
          subtitle={serviceConfig?.description || '已连接的服务'}
        />

        <DetailSection title='凭据 ID'>
          <ChipCopyInput id='credential-id' value={credential.id} copyLabel='复制凭据 ID' />
        </DetailSection>

        <DetailSection title='显示名称'>
          <ChipInput
            id='credential-display-name'
            value={form.displayNameDraft}
            onChange={(event) => form.setDisplayNameDraft(event.target.value)}
            autoComplete='off'
            data-lpignore='true'
            disabled={!isAdmin}
          />
        </DetailSection>

        <DetailSection title='描述'>
          <ChipTextarea
            id='credential-description'
            rows={4}
            value={form.descriptionDraft}
            onChange={(event) => form.setDescriptionDraft(event.target.value)}
            placeholder='添加描述…'
            maxLength={500}
            autoComplete='off'
            data-lpignore='true'
            disabled={!isAdmin}
          />
        </DetailSection>

        <CredentialMembersSection credentialId={credential.id} isAdmin={isAdmin} />
      </CredentialDetailLayout>

      <ChipConfirmModal
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
        srTitle='断开集成连接'
        title='断开集成连接'
        text={[
          '确定要断开 ',
          { text: credential.displayName, bold: true },
          ' 吗?此操作无法撤销。',
        ]}
        confirm={{
          label: '断开连接',
          onClick: handleConfirmDelete,
          pending: disconnectOAuthService.isPending || deleteCredential.isPending,
          pendingLabel: '断开中…',
        }}
      />

      <AddPeopleModal
        credentialId={credential.id}
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
      />

      <UnsavedChangesModal
        open={form.showUnsavedAlert}
        onOpenChange={form.setShowUnsavedAlert}
        onDiscard={form.confirmDiscard}
      />
    </>
  )
}
