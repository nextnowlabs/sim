'use client'

import { Plus } from '@sim/emcn'
import { Database } from '@sim/emcn/icons'
import { FileText } from 'lucide-react'
import {
  type BreadcrumbItem,
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const noop = () => {}

const COLUMNS = [
  { id: 'content', header: '内容' },
  { id: 'index', header: '索引', widthMultiplier: 0.6 },
  { id: 'tokens', header: 'Tokens', widthMultiplier: 0.6 },
  { id: 'status', header: '状态', widthMultiplier: 0.75 },
]

const ACTIONS: ChromeActionSpec[] = [{ text: '新建分块', icon: Plus, variant: 'primary' }]

const BREADCRUMBS: BreadcrumbItem[] = [
  { label: '知识库', icon: Database, onClick: noop },
  { label: '…', icon: Database },
  { label: '…', terminal: true },
]

export default function DocumentLoading() {
  return (
    <ResourceChromeFallback
      icon={FileText}
      breadcrumbs={BREADCRUMBS}
      columns={COLUMNS}
      actions={ACTIONS}
      searchPlaceholder='Search chunks...'
      hasSort
      hasFilter
    />
  )
}
