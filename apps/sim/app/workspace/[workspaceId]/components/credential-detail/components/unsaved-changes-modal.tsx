import { ChipConfirmModal } from '@sim/emcn'

interface UnsavedChangesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Confirmed discard: abandon edits and continue (navigate away / close). */
  onDiscard: () => void
}

/**
 * Confirmation shown when leaving a surface with unsaved edits. Shared by the
 * credential detail surfaces and the secrets list so the copy and affordances
 * stay identical.
 */
export function UnsavedChangesModal({ open, onOpenChange, onDiscard }: UnsavedChangesModalProps) {
  return (
    <ChipConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      srTitle='未保存的更改'
      title='未保存的更改'
      text='你有未保存的更改。确定要放弃它们吗?'
      dismissLabel='继续编辑'
      confirm={{ label: '放弃更改', onClick: onDiscard }}
    />
  )
}
