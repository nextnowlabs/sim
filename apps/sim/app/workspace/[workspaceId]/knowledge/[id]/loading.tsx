'use client'

import { Plus } from '@sim/emcn'
import { Database } from '@sim/emcn/icons'
import {
  type BreadcrumbItem,
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const noop = () => {}

const COLUMNS = [
  { id: 'name', header: '名称', widthMultiplier: 0.8 },
  { id: 'size', header: '大小', widthMultiplier: 0.75 },
  { id: 'tokens', header: 'Tokens', widthMultiplier: 0.75 },
  { id: 'chunks', header: '分块数', widthMultiplier: 0.75 },
  { id: 'uploaded', header: '上传时间' },
  { id: 'status', header: '状态', widthMultiplier: 0.75 },
  { id: 'tags', header: '标签' },
]

const ACTIONS: ChromeActionSpec[] = [
  { text: '新建连接器', icon: Plus },
  { text: '新建文档', icon: Plus, variant: 'primary' },
]

const BREADCRUMBS: BreadcrumbItem[] = [
  { label: '知识库', icon: Database, onClick: noop },
  { label: '…', icon: Database, terminal: true },
]

export default function KnowledgeBaseLoading() {
  return (
    <ResourceChromeFallback
      icon={Database}
      breadcrumbs={BREADCRUMBS}
      columns={COLUMNS}
      actions={ACTIONS}
      searchPlaceholder='Search documents...'
      hasSort
      hasFilter
    />
  )
}
