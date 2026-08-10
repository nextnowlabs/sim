import { ChipConfirmModal } from '@sim/emcn'

interface RemoveMemberDialogProps {
  open: boolean
  memberName: string
  isSelfRemoval?: boolean
  isExternalRemoval?: boolean
  isSubmitting?: boolean
  error?: Error | null
  onOpenChange: (open: boolean) => void
  onConfirmRemove: () => Promise<void>
  onCancel: () => void
}

export function RemoveMemberDialog({
  open,
  memberName,
  error,
  onOpenChange,
  onConfirmRemove,
  onCancel,
  isSelfRemoval = false,
  isExternalRemoval = false,
  isSubmitting = false,
}: RemoveMemberDialogProps) {
  const title = isSelfRemoval ? '退出组织' : isExternalRemoval ? '移除外部成员' : '移除团队成员'

  const errorMessage =
    error instanceof Error && error.message ? error.message : error ? String(error) : null

  return (
    <ChipConfirmModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
        onOpenChange(next)
      }}
      srTitle={title}
      title={title}
      text={
        isSelfRemoval
          ? '确定要退出此组织吗?你将失去对所有团队资源的访问权限。此操作无法撤销。'
          : isExternalRemoval
            ? [
                '确定要将 ',
                { text: memberName, bold: true },
                ' 从所有组织工作区中移除吗?其工作区访问权限和工作区凭据访问权限将被撤销。此操作无法撤销。',
              ]
            : ['确定要将 ', { text: memberName, bold: true }, ' 从团队中移除吗?此操作无法撤销。']
      }
      confirm={{
        label: isSelfRemoval ? '退出组织' : '移除',
        onClick: () => onConfirmRemove(),
        pending: isSubmitting,
      }}
    >
      {errorMessage ? (
        <p role='alert' className='mt-1 px-2 text-[var(--text-error)] text-caption'>
          {errorMessage}
        </p>
      ) : null}
    </ChipConfirmModal>
  )
}
