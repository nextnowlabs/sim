'use client'

import { useState } from 'react'
import { Chip, ChipCopyInput, ChipLink, Send } from '@sim/emcn'
import { ArrowLeft, Key } from '@sim/emcn/icons'
import {
  AddPeopleModal,
  CredentialDetailHeading,
  CredentialDetailLayout,
  CredentialMembersSection,
  DetailIconTile,
  DetailSection,
  UnsavedChangesModal,
  useUnsavedChangesGuard,
} from '@/app/workspace/[workspaceId]/components/credential-detail'
import { SecretValueField } from '@/app/workspace/[workspaceId]/settings/components/secrets/components/secret-value-field'
import { useSecretValue } from '@/app/workspace/[workspaceId]/settings/components/secrets/hooks/use-secret-value'
import { useWorkspaceCredential } from '@/hooks/queries/credentials'

interface SecretDetailProps {
  workspaceId: string
  credentialId: string
}

export function SecretDetail({ workspaceId, credentialId }: SecretDetailProps) {
  const secretsHref = `/workspace/${workspaceId}/settings/secrets`

  const { data: credential = null, isPending } = useWorkspaceCredential(credentialId)
  const isAdmin = credential?.role === 'admin'
  const isPersonal = credential?.type === 'env_personal'

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const valueField = useSecretValue({ workspaceId, credential })
  const guard = useUnsavedChangesGuard({ isDirty: valueField.isDirty, backHref: secretsHref })

  const back = (
    <ChipLink href={secretsHref} onClick={guard.handleBackClick} leftIcon={ArrowLeft}>
      密钥
    </ChipLink>
  )

  const canEditValue = valueField.canEdit && !valueField.isConflicted

  const actions =
    credential && ((isAdmin && !isPersonal) || canEditValue) ? (
      <>
        {isAdmin && !isPersonal && (
          <Chip leftIcon={Send} onClick={() => setIsShareModalOpen(true)}>
            分享
          </Chip>
        )}
        {canEditValue && (
          <Chip onClick={valueField.save} disabled={!valueField.isDirty || valueField.isSaving}>
            {valueField.isSaving ? '保存中…' : '保存'}
          </Chip>
        )}
      </>
    ) : null

  if (isPending && !credential) {
    return (
      <CredentialDetailLayout back={back} actions={actions}>
        <p className='py-12 text-center text-[var(--text-muted)] text-sm'>加载中…</p>
      </CredentialDetailLayout>
    )
  }

  if (!credential) {
    return (
      <CredentialDetailLayout back={back} actions={actions}>
        <p className='py-12 text-center text-[var(--text-muted)] text-sm'>未找到密钥。</p>
      </CredentialDetailLayout>
    )
  }

  return (
    <>
      <CredentialDetailLayout back={back} actions={actions}>
        <CredentialDetailHeading
          leading={<DetailIconTile icon={Key} />}
          title={credential.envKey || credential.displayName}
          subtitle={
            isPersonal
              ? valueField.isConflicted
                ? '已被工作区变量覆盖'
                : '个人密钥'
              : '工作区密钥'
          }
        />

        <DetailSection title='键'>
          <ChipCopyInput value={credential.envKey || ''} copyLabel='复制键' />
        </DetailSection>

        <DetailSection title='值'>
          <SecretValueField
            value={valueField.value}
            onChange={valueField.setValue}
            canEdit={valueField.canEdit}
            unmasked={valueField.isConflicted}
            readOnly={valueField.isConflicted}
            placeholder='输入值'
          />
        </DetailSection>

        {!isPersonal && <CredentialMembersSection credentialId={credential.id} isAdmin={isAdmin} />}
      </CredentialDetailLayout>

      {!isPersonal && (
        <AddPeopleModal
          credentialId={credential.id}
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
        />
      )}

      <UnsavedChangesModal
        open={guard.showUnsavedAlert}
        onOpenChange={guard.setShowUnsavedAlert}
        onDiscard={guard.confirmDiscard}
      />
    </>
  )
}
