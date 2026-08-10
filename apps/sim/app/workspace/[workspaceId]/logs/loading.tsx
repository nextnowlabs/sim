'use client'

import { Library, RefreshCw } from '@sim/emcn'
import { Download } from '@sim/emcn/icons'
import {
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const COLUMNS = [
  { id: 'workflow', header: '工作流' },
  { id: 'date', header: '日期' },
  { id: 'status', header: '状态' },
  { id: 'cost', header: '成本' },
  { id: 'trigger', header: '触发器' },
  { id: 'duration', header: '时长' },
]

const ACTIONS: ChromeActionSpec[] = [
  { text: '导出', icon: Download },
  { text: '刷新', icon: RefreshCw },
  { text: '日志', active: true },
  { text: '仪表盘' },
]

export default function LogsLoading() {
  return (
    <ResourceChromeFallback
      icon={Library}
      title='日志'
      columns={COLUMNS}
      actions={ACTIONS}
      searchPlaceholder='搜索日志…'
      hasSort
      hasFilter
    />
  )
}
