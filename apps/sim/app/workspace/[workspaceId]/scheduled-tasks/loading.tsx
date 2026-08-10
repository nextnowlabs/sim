'use client'

import { Calendar, Plus } from '@sim/emcn/icons'
import {
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const ACTIONS: ChromeActionSpec[] = [{ text: '新建定时任务', icon: Plus, variant: 'primary' }]

/**
 * Route-segment fallback: the page renders a calendar, not a table, so this
 * paints only the header chrome (no table columns / search / sort / filter).
 * The empty calendar then mounts and its tasks load in.
 */
export default function ScheduledTasksLoading() {
  return <ResourceChromeFallback icon={Calendar} title='定时任务' actions={ACTIONS} />
}
