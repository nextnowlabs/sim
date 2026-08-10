'use client'

import {
  ChipConfirmModal,
  ChipModal,
  ChipModalBody,
  ChipModalFooter,
  ChipModalHeader,
} from '@sim/emcn'
import { Calendar } from '@sim/emcn/icons'
import type { ScheduledTask } from '@/app/workspace/[workspaceId]/scheduled-tasks/utils/schedule-events'

interface TaskDeleteDialogProps {
  /** The task targeted for deletion, or `null` to keep the dialog closed. */
  task: ScheduledTask | null
  onClose: () => void
  /** Delete just the targeted occurrence of a recurring task. */
  onDeleteOccurrence: (task: ScheduledTask) => void
  /** Delete a one-time task, or the entire recurring series. */
  onDeleteSeries: (task: ScheduledTask) => void
}

/**
 * Deletion confirmation for a scheduled task. A one-time task takes a single
 * confirm; a recurring task offers the calendar-app choice between deleting
 * this occurrence and deleting the whole series.
 */
export function TaskDeleteDialog({
  task,
  onClose,
  onDeleteOccurrence,
  onDeleteSeries,
}: TaskDeleteDialogProps) {
  if (task && !task.recurring) {
    return (
      <ChipConfirmModal
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title='删除定时任务'
        text='此任务将从日历中移除且不再运行。'
        confirm={{
          label: '删除',
          onClick: () => {
            onDeleteSeries(task)
            onClose()
          },
        }}
      />
    )
  }

  return (
    <ChipModal
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      size='sm'
      srTitle='删除重复任务'
    >
      {task && (
        <>
          <ChipModalHeader icon={Calendar} onClose={onClose}>
            删除重复任务
          </ChipModalHeader>
          <ChipModalBody>
            <p className='px-2 text-[var(--text-body)] text-sm'>
              这是一个重复任务。仅删除此实例,还是删除整个系列?
            </p>
          </ChipModalBody>
          <ChipModalFooter
            onCancel={onClose}
            secondaryActions={[
              {
                label: '仅此任务',
                variant: 'destructive',
                onClick: () => {
                  onDeleteOccurrence(task)
                  onClose()
                },
              },
            ]}
            primaryAction={{
              label: '全部任务',
              variant: 'destructive',
              onClick: () => {
                onDeleteSeries(task)
                onClose()
              },
            }}
          />
        </>
      )}
    </ChipModal>
  )
}
